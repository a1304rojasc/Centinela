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

Limitación conocida: como contamos por IP, un ataque repartido entre muchas
IPs (una botnet con 2-3 intentos por IP) no dispara ninguna regla.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
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
        for regla in reglas:
            for inicio, fin in _rachas(momentos, regla):
                dentro = [f for f in fallos if inicio <= f.momento <= fin]
                incidente = Incidente(ip, regla.nombre, inicio, fin, len(dentro), {f.usuario for f in dentro})
                # ¿Entró después de empezar el ataque? -> comprometido
                exitos = sorted((e for e in exitos_por_ip.get(ip, []) if e.momento >= inicio), key=lambda e: e.momento)
                if exitos:
                    incidente.comprometido = True
                    incidente.momento_exito = exitos[0].momento
                    incidente.usuario_exito = exitos[0].usuario
                incidentes.append(incidente)
    return sorted(_sin_duplicados(incidentes, [r.nombre for r in reglas]), key=lambda i: (i.inicio, i.ip, i.regla))


def _sin_duplicados(incidentes: list[Incidente], orden_reglas: list[str]) -> list[Incidente]:
    """Un ataque rápido cumple a la vez la regla de ráfaga y la sostenida.
    Para no contarlo dos veces, si dos incidentes de la misma IP se solapan
    en el tiempo, nos quedamos con el de la regla que va antes en la lista."""
    prioridad = {nombre: n for n, nombre in enumerate(orden_reglas)}
    elegidos: list[Incidente] = []
    for inc in sorted(incidentes, key=lambda i: prioridad[i.regla]):
        solapa = any(e.ip == inc.ip and e.inicio <= inc.fin and inc.inicio <= e.fin for e in elegidos)
        if not solapa:
            elegidos.append(inc)
    return elegidos


def ips_atacantes(incidentes: Iterable[Incidente]) -> set[str]:
    return {i.ip for i in incidentes}
