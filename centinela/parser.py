"""
Fase 1 · Parser: convierte las líneas del log en datos con estructura.

Cada intento de login se convierte en un objeto `Intento` con:
    momento (datetime), ip, usuario, exito (True/False), metodo,
    usuario_valido (False si sshd dijo "invalid user") y puerto.

Se reconocen los dos formatos de fecha habituales en auth.log:
    clásico:  Nov  2 03:12:05 srv-web01 sshd[4242]: Failed password for root from 1.2.3.4 port 5 ssh2
    ISO:      2026-11-02T03:12:05.123+00:00 srv-web01 sshd[4242]: Accepted publickey for ana from ...

Todo lo demás (CRON, sudo, "Invalid user ...", cierres de sesión) es ruido y
se ignora. "Invalid user X" se ignora a propósito: va siempre seguido de
"Failed password for invalid user X", y si contáramos las dos, cada intento
contaría doble.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator

# re.VERBOSE permite escribir el patrón en varias líneas con comentarios.
# En este modo los espacios normales se ignoran: para un espacio de verdad
# se escribe "\s" o "\ " (barra + espacio).
PATRON = re.compile(
    r"""
    ^(?:                                              # la fecha: uno de dos formatos
        (?P<fecha_syslog>[A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})        # Nov  2 03:12:05
      | (?P<fecha_iso>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)  # 2026-11-02T03:12:05...
    )
    \s(?P<host>\S+)                                   # nombre del servidor
    \ssshd\[\d+\]:                                    # sshd[4242]:
    \s(?P<resultado>Accepted|Failed)                  # la palabra clave
    \s(?P<metodo>password|publickey|keyboard-interactive/pam)
    \sfor
    \s(?P<invalido>invalid\ user\ )?                  # aparece si el usuario no existe
    (?P<usuario>\S+)
    \sfrom
    \s(?P<ip>\d{1,3}(?:\.\d{1,3}){3})                 # IPv4 (se valida después)
    \sport\s(?P<puerto>\d+)
    """,
    re.VERBOSE,
)


@dataclass(frozen=True)
class Intento:
    """Un intento de login. 'frozen' lo hace inmutable (más seguro)."""

    momento: datetime
    ip: str
    usuario: str
    exito: bool
    metodo: str = "password"
    usuario_valido: bool = True
    puerto: int = 0
    host: str = ""

    @property
    def resultado(self) -> str:
        return "EXITOSO" if self.exito else "FALLIDO"


def _ip_valida(texto: str) -> bool:
    """La regex acepta '999.1.1.1'; el módulo ipaddress sabe que no existe."""
    try:
        ipaddress.IPv4Address(texto)
        return True
    except ValueError:
        return False


def _fecha(coincidencia: re.Match, anio: int) -> datetime:
    """Convierte el texto de la fecha en un datetime.

    El formato clásico no lleva año, así que hay que dárselo. En el ISO,
    si viene zona horaria se descarta y nos quedamos con la hora tal cual
    (así todos los momentos se pueden comparar entre sí).
    """
    if coincidencia.group("fecha_syslog"):
        # "Nov  2 03:12:05" -> split() quita los espacios dobles.
        texto = " ".join(coincidencia.group("fecha_syslog").split())
        return datetime.strptime(f"{anio} {texto}", "%Y %b %d %H:%M:%S")
    iso = coincidencia.group("fecha_iso").replace("Z", "+00:00")
    return datetime.fromisoformat(iso).replace(tzinfo=None)


def analizar_linea(linea: str, anio: int | None = None) -> Intento | None:
    """Devuelve un Intento si la línea es un login (aceptado o fallido), o None."""
    coincidencia = PATRON.search(linea)
    if coincidencia is None or not _ip_valida(coincidencia.group("ip")):
        return None
    return Intento(
        momento=_fecha(coincidencia, anio or datetime.now().year),
        ip=coincidencia.group("ip"),
        usuario=coincidencia.group("usuario"),
        exito=coincidencia.group("resultado") == "Accepted",
        metodo=coincidencia.group("metodo"),
        usuario_valido=coincidencia.group("invalido") is None,
        puerto=int(coincidencia.group("puerto")),
        host=coincidencia.group("host"),
    )


def analizar_lineas(lineas: Iterable[str], anio: int | None = None) -> Iterator[Intento]:
    """Recorre muchas líneas y va entregando (yield) los intentos.

    Con el formato clásico, si el mes "retrocede" (de Dec a Jan) el log ha
    cruzado un fin de año, y sumamos 1 al año para que las fechas sigan en orden.
    """
    anio = anio or datetime.now().year
    mes_anterior = None
    for linea in lineas:
        intento = analizar_linea(linea, anio)
        if intento is None:
            continue
        if mes_anterior is not None and intento.momento.month < mes_anterior and not linea[:4].isdigit():
            anio += 1
            intento = analizar_linea(linea, anio)
        mes_anterior = intento.momento.month
        yield intento


def leer_log(ruta: str | Path, anio: int | None = None) -> list[Intento]:
    """Lee un archivo completo. errors='replace' evita caerse con bytes raros."""
    with open(ruta, encoding="utf-8", errors="replace") as archivo:
        return list(analizar_lineas(archivo, anio))
