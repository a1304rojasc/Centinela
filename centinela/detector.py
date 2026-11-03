"""
Fase 2 · Detector de fuerza bruta por ventana deslizante de tiempo.

La idea: una persona se equivoca de contraseña 1, 2, quizá 4 veces. Un
programa de fuerza bruta falla decenas de veces en poco tiempo. Así que,
para cada IP, contamos cuántos FALLOS caen dentro de una ventana de tiempo
que va "deslizándose" sobre el log:

    fallos de una IP:  x  x x x x x    x
    ventana de 60 s:  [-----------]          <- si dentro hay >= umbral, ¡alerta!
                         [-----------]       <- la ventana avanza con cada fallo

Usamos dos reglas por defecto:
    * RÁFAGA:     5 fallos en 60 s    -> ataques rápidos.
    * SOSTENIDO: 20 fallos en 1 hora  -> ataques lentos ("low and slow") que
                                         esquivan la primera regla.

Las alertas de una misma IP y regla que se solapan se fusionan en un único
`Incidente` con su inicio, su fin y el número total de fallos. Y si un mismo
ataque cumple las dos reglas, se informa una sola vez (gana la primera regla).

Si una IP con incidente tiene además un login EXITOSO a partir del inicio
del ataque, el incidente se marca como COMPROMETIDO: probablemente el
atacante adivinó la contraseña. Es lo más urgente de revisar.

Las reglas anteriores cuentan por IP, así que un ataque repartido entre muchas
IPs (una botnet con 2-3 intentos por IP) no dispara ninguna. Para eso está
detectar_distribuidos(): agrupa los fallos por red /24 y avisa cuando muchas
IPs de la misma red fallan a la vez.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from ipaddress import ip_address, ip_network
from typing import Iterable

from centinela.parser import Intento


@dataclass(frozen=True)
class Regla:
    nombre: str
    umbral: int          # cuántos fallos...
    ventana: timedelta   # ...dentro de cuánto tiempo

    def __post_init__(self):
        if self.umbral < 1:
            raise ValueError("el umbral debe ser al menos 1")
        if self.ventana.total_seconds() <= 0:
            raise ValueError("la ventana debe durar más de 0 segundos")


REGLAS_POR_DEFECTO = (
    Regla("rafaga", 5, timedelta(seconds=60)),
    Regla("sostenido", 20, timedelta(hours=1)),
)


@dataclass
class Incidente:
    ip: str
    regla: str
    inicio: datetime
    fin: datetime
    fallos: int = 0
    usuarios: set[str] = field(default_factory=set)
    comprometido: bool = False
    momento_exito: datetime | None = None
    usuario_exito: str | None = None

    @property
    def duracion(self) -> timedelta:
        return self.fin - self.inicio

    def describir(self) -> str:
        """Una línea legible para la terminal o la lista negra."""
        texto = (f"{self.regla}: {self.fallos} fallos entre {self.inicio:%Y-%m-%d %H:%M:%S} "
                 f"y {self.fin:%H:%M:%S}, {len(self.usuarios)} usuarios probados")
        if self.comprometido:
            texto += f" · ¡ENTRÓ como '{self.usuario_exito}' a las {self.momento_exito:%H:%M:%S}!"
        return texto


def _rachas(momentos: list[datetime], regla: Regla) -> list[tuple[datetime, datetime]]:
    """Devuelve los tramos [inicio, fin] donde la regla se cumple.

    'momentos' son los fallos de UNA IP, ordenados. Usamos una deque (una
    lista con la que es rápido sacar elementos por la izquierda) que guarda
    los fallos de la ventana actual.
    """
    ventana: deque[datetime] = deque()
    tramos: list[list[datetime]] = []
    for t in momentos:
        ventana.append(t)
        # Sacamos por la izquierda los fallos que ya quedaron fuera de la ventana.
        while t - ventana[0] > regla.ventana:
            ventana.popleft()
        if len(ventana) >= regla.umbral:
            inicio = ventana[0]
            # Si este tramo toca el anterior, lo alargamos; si no, es uno nuevo.
            if tramos and inicio <= tramos[-1][1]:
                tramos[-1][1] = t
            else:
                tramos.append([inicio, t])
    return [(a, b) for a, b in tramos]


def detectar(intentos: Iterable[Intento], reglas: Iterable[Regla] = REGLAS_POR_DEFECTO) -> list[Incidente]:
    """Aplica todas las reglas a todos los intentos y devuelve los incidentes,
    ordenados por hora de inicio."""
    reglas = list(reglas)  # la recorremos varias veces
    fallos_por_ip: dict[str, list[Intento]] = defaultdict(list)
    exitos_por_ip: dict[str, list[Intento]] = defaultdict(list)
    for intento in intentos:
        (exitos_por_ip if intento.exito else fallos_por_ip)[intento.ip].append(intento)

    incidentes: list[Incidente] = []
    for ip, fallos in fallos_por_ip.items():
        fallos.sort(key=lambda i: i.momento)
        momentos = [f.momento for f in fallos]
        exitos = sorted(exitos_por_ip.get(ip, []), key=lambda e: e.momento)
        momentos_exito = [e.momento for e in exitos]
        candidatos: list[Incidente] = []
        for regla in reglas:
            for inicio, fin in _rachas(momentos, regla):
                # SEGURIDAD (rendimiento): en vez de recorrer TODOS los fallos de
                # la IP para cada incidente (coste cuadrático, que un atacante
                # puede provocar con miles de ráfagas cortas), buscamos el tramo
                # con búsqueda binaria (bisect) sobre la lista ordenada.
                dentro = fallos[bisect_left(momentos, inicio):bisect_right(momentos, fin)]
                incidente = Incidente(ip, regla.nombre, inicio, fin, len(dentro), {f.usuario for f in dentro})
                # ¿Entró después de empezar el ataque? -> comprometido
                n = bisect_left(momentos_exito, inicio)
                if n < len(exitos):
                    incidente.comprometido = True
                    incidente.momento_exito = exitos[n].momento
                    incidente.usuario_exito = exitos[n].usuario
                candidatos.append(incidente)
        incidentes.extend(_sin_duplicados(candidatos, [r.nombre for r in reglas]))
    return sorted(incidentes, key=lambda i: (i.inicio, i.ip, i.regla))


def _sin_duplicados(incidentes: list[Incidente], orden_reglas: list[str]) -> list[Incidente]:
    """Un ataque rápido cumple a la vez la regla de ráfaga y la sostenida.
    Para no contarlo dos veces, si dos incidentes de la misma IP se solapan
    en el tiempo, nos quedamos con el de la regla que va antes en la lista.

    'incidentes' son todos de UNA IP. Los elegidos nunca se solapan entre sí,
    así que, ordenados por inicio, también lo están por fin, y basta mirar el
    elegido que empieza justo antes del final del candidato (bisect).
    """
    prioridad = {nombre: n for n, nombre in enumerate(orden_reglas)}
    inicios: list[datetime] = []
    elegidos: list[Incidente] = []  # en el mismo orden que 'inicios'
    for inc in sorted(incidentes, key=lambda i: (prioridad[i.regla], i.inicio)):
        k = bisect_right(inicios, inc.fin) - 1
        if k >= 0 and elegidos[k].fin >= inc.inicio:
            continue  # se solapa con uno ya elegido de mayor prioridad
        pos = bisect_right(inicios, inc.inicio)
        inicios.insert(pos, inc.inicio)
        elegidos.insert(pos, inc)
    return elegidos


def ips_atacantes(incidentes: Iterable[Incidente]) -> set[str]:
    return {i.ip for i in incidentes}


def _red24(ip: str) -> str | None:
    """'5.188.62.17' -> '5.188.62.0/24'. None para IPv6 o redes privadas:
    en una red interna muchos equipos comparten /24 y los errores normales
    de los usuarios darían falsos positivos."""
    try:
        direccion = ip_address(ip)
    except ValueError:
        return None
    if direccion.version != 4 or direccion.is_private:
        return None
    return str(ip_network(f"{direccion}/24", strict=False))


def detectar_distribuidos(intentos: Iterable[Intento], umbral: int = 15,
                          ventana: timedelta = timedelta(minutes=30),
                          min_ips: int = 5) -> list[Incidente]:
    """Ataques repartidos entre muchas IPs de la misma red /24.

    Salta cuando una red acumula al menos 'umbral' fallos dentro de 'ventana'
    y esos fallos vienen de al menos 'min_ips' IPs distintas. En el incidente,
    'ip' es la red (p. ej. '5.188.62.0/24') y 'regla' es 'distribuido'.
    """
    regla = Regla("distribuido", umbral, ventana)
    por_red: dict[str, list[Intento]] = defaultdict(list)
    for intento in intentos:
        if not intento.exito and (red := _red24(intento.ip)):
            por_red[red].append(intento)

    incidentes: list[Incidente] = []
    for red, fallos in por_red.items():
        fallos.sort(key=lambda i: i.momento)
        momentos = [f.momento for f in fallos]
        for inicio, fin in _rachas(momentos, regla):
            dentro = fallos[bisect_left(momentos, inicio):bisect_right(momentos, fin)]
            if len({f.ip for f in dentro}) >= min_ips:
                incidentes.append(Incidente(red, regla.nombre, inicio, fin, len(dentro), {f.usuario for f in dentro}))
    return sorted(incidentes, key=lambda i: i.inicio)
