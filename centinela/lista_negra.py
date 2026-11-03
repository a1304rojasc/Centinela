"""
Fase 4 · Lista negra automática.

A partir de los incidentes del detector:
  1. Decide qué IPs bloquear, respetando una LISTA BLANCA de redes que nunca
     se bloquean (tu oficina, tu VPN...). Sin esto, un compañero que se
     equivoca muchas veces podría dejarte fuera de tu propio servidor.
  2. Guarda la lista en un archivo de texto, una IP por línea con el motivo
     como comentario. Si el archivo ya existía, se FUSIONA: nunca se pierden
     IPs anteriores ni se duplican.
  3. Escribe un script de shell con las órdenes de firewall (iptables).

SEGURIDAD — este módulo escribe un script que alguien ejecutará como root,
así que nada que venga de fuera se copia tal cual:
  * Solo se aceptan IPv4 y se escribe su forma normalizada (str(IPv4Address)),
    nunca el texto original. Ojo: ipaddress acepta IPv6 con "zona"
    ("fe80::1%;reboot;") y ese texto llegaría intacto al script.
  * lista_negra.txt y bloquear.sh se escriben de forma atómica (archivo
    temporal + reemplazo) y con permisos 600: solo su dueño puede leerlos
    o modificarlos antes de que root los ejecute.

Importante: Centinela NO ejecuta el script. Bloquear tráfico en un servidor
es una acción delicada; lo revisa y lo lanza una persona:

    sudo sh bloquear.sh
"""

from __future__ import annotations

import ipaddress
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Iterable

from centinela.detector import Incidente

# Redes privadas: por defecto no se bloquean (suelen ser tu propia red).
LISTA_BLANCA_POR_DEFECTO = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")


def _redes(texto_redes: Iterable[str]) -> list[ipaddress.IPv4Network]:
    """Convierte '10.0.0.0/8' o '1.2.3.4' en objetos de red (con validación)."""
    return [ipaddress.ip_network(r.strip(), strict=False) for r in texto_redes if r.strip()]


def ipv4_normalizada(texto: str) -> str:
    """Devuelve la IPv4 en forma canónica o lanza ValueError.

    Es la única puerta por la que una IP llega a la lista y al script.
    """
    return str(ipaddress.IPv4Address(texto.strip()))


def _escribir_privado(ruta: Path, texto: str) -> None:
    """Escribe el archivo de golpe y con permisos 600 (solo su dueño).

    Se escribe primero un temporal en la misma carpeta y luego se reemplaza
    el original con os.replace, que es atómico: nunca queda un archivo a
    medias si el programa se corta, ni hay un momento en que otro usuario
    pueda colar su propio contenido.
    """
    ruta.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporal = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as archivo:
            archivo.write(texto)
        os.chmod(temporal, 0o600)
        os.replace(temporal, ruta)
    except BaseException:
        os.unlink(temporal)
        raise


def esta_permitida(ip: str, lista_blanca: Iterable[str]) -> bool:
    direccion = ipaddress.ip_address(ip)
    return any(direccion in red for red in _redes(lista_blanca))


def ips_a_bloquear(incidentes: Iterable[Incidente],
                   lista_blanca: Iterable[str] = LISTA_BLANCA_POR_DEFECTO) -> dict[str, str]:
    """Devuelve {ip: motivo} con las IPs que hay que bloquear.

    Si una IP tiene varios incidentes, el motivo los junta. Los comprometidos
    van primero en el motivo porque son los más graves.
    """
    lista_blanca = list(lista_blanca)
    motivos: dict[str, list[str]] = {}
    for inc in sorted(incidentes, key=lambda i: (not i.comprometido, i.inicio)):
        try:
            ip = ipv4_normalizada(inc.ip)
        except ValueError:
            continue
        if esta_permitida(ip, lista_blanca):
            continue
        motivos.setdefault(ip, []).append(inc.describir())
    return {ip: " | ".join(textos) for ip, textos in motivos.items()}


def cargar(ruta: str | Path) -> dict[str, str]:
    """Lee una lista negra existente. Formato de cada línea:

        185.220.101.47  # motivo
    Las líneas vacías o que empiezan por '#' se ignoran. Lo que no sea una
    IPv4 válida también (un archivo editado a mano puede tener errores, o
    alguien puede haberlo manipulado).
    """
    ruta = Path(ruta)
    entradas: dict[str, str] = {}
    if not ruta.exists():
        return entradas
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        ip, _, motivo = linea.partition("#")
        try:
            ip = ipv4_normalizada(ip)
        except ValueError:
            continue
        entradas[ip] = motivo.strip()
    return entradas


def _orden_ip(ip: str):
    return ipaddress.IPv4Address(ip)


def guardar(ruta: str | Path, entradas: dict[str, str]) -> None:
    ruta = Path(ruta)
    lineas = [
        "# Lista negra de Centinela",
        f"# Actualizada: {datetime.now():%Y-%m-%d %H:%M:%S} · {len(entradas)} IPs",
        "# Formato: IP  # motivo",
    ]
    for ip in sorted(entradas, key=_orden_ip):
        # El motivo incluye nombres de usuario del atacante: lo dejamos en una
        # sola línea para que no pueda "inventar" líneas nuevas en el archivo.
        motivo = " ".join(entradas[ip].split())
        lineas.append(f"{ipv4_normalizada(ip):<16} # {motivo}" if motivo else ipv4_normalizada(ip))
    _escribir_privado(ruta, "\n".join(lineas) + "\n")


def actualizar(ruta: str | Path, incidentes: Iterable[Incidente],
               lista_blanca: Iterable[str] = LISTA_BLANCA_POR_DEFECTO) -> tuple[list[str], dict[str, str]]:
    """Fusiona las IPs nuevas con las del archivo y lo guarda.

    Devuelve (ips_nuevas, lista_completa). Las IPs que ya estaban conservan su
    motivo original.
    """
    existentes = cargar(ruta)
    nuevas = {ip: motivo for ip, motivo in ips_a_bloquear(incidentes, lista_blanca).items() if ip not in existentes}
    total = {**existentes, **nuevas}
    guardar(ruta, total)
    return sorted(nuevas, key=_orden_ip), total


def script_firewall(entradas: Iterable[str]) -> str:
    """Texto de un script sh con una regla iptables por IP.

    'iptables -C' comprueba si la regla ya existe; solo si no existe ('||')
    se inserta con '-I'. Así el script se puede ejecutar varias veces sin
    duplicar reglas (es "idempotente").
    """
    lineas = [
        "#!/bin/sh",
        "# Generado por Centinela. REVÍSALO antes de ejecutarlo:  sudo sh bloquear.sh",
        "set -e",
    ]
    # ipv4_normalizada lanza ValueError con cualquier cosa que no sea una IPv4,
    # y lo que se escribe es SU resultado, nunca el texto recibido.
    ips = sorted({ipv4_normalizada(texto) for texto in entradas}, key=_orden_ip)
    for ip in ips:
        lineas.append(f"iptables -C INPUT -s {ip} -j DROP 2>/dev/null || iptables -I INPUT -s {ip} -j DROP")
    return "\n".join(lineas) + "\n"


def escribir_script(ruta: str | Path, entradas: Iterable[str]) -> None:
    _escribir_privado(Path(ruta), script_firewall(entradas))
