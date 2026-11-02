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

Importante: Centinela NO ejecuta el script. Bloquear tráfico en un servidor
es una acción delicada; lo revisa y lo lanza una persona:

    sudo sh bloquear.sh
"""

from __future__ import annotations

import ipaddress
from datetime import datetime
from pathlib import Path
from typing import Iterable

from centinela.detector import Incidente

# Redes privadas: por defecto no se bloquean (suelen ser tu propia red).
LISTA_BLANCA_POR_DEFECTO = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")


def _redes(texto_redes: Iterable[str]) -> list[ipaddress.IPv4Network]:
    """Convierte '10.0.0.0/8' o '1.2.3.4' en objetos de red (con validación)."""
    return [ipaddress.ip_network(r.strip(), strict=False) for r in texto_redes if r.strip()]


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
        if esta_permitida(inc.ip, lista_blanca):
            continue
        motivos.setdefault(inc.ip, []).append(inc.describir())
    return {ip: " | ".join(textos) for ip, textos in motivos.items()}


def cargar(ruta: str | Path) -> dict[str, str]:
    """Lee una lista negra existente. Formato de cada línea:

        185.220.101.47  # motivo
    Las líneas vacías o que empiezan por '#' se ignoran. Las IPs inválidas
    también (un archivo editado a mano puede tener errores).
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
        ip = ip.strip()
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            continue
        entradas[ip] = motivo.strip()
    return entradas


def _orden_ip(ip: str):
    return ipaddress.ip_address(ip)


def guardar(ruta: str | Path, entradas: dict[str, str]) -> None:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    lineas = [
        "# Lista negra de Centinela",
        f"# Actualizada: {datetime.now():%Y-%m-%d %H:%M:%S} · {len(entradas)} IPs",
        "# Formato: IP  # motivo",
    ]
    for ip in sorted(entradas, key=_orden_ip):
        lineas.append(f"{ip:<16} # {entradas[ip]}" if entradas[ip] else ip)
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")


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
    for ip in sorted(entradas, key=_orden_ip):
        ipaddress.ip_address(ip)  # por seguridad: nunca escribir algo que no sea una IP
        lineas.append(f"iptables -C INPUT -s {ip} -j DROP 2>/dev/null || iptables -I INPUT -s {ip} -j DROP")
    return "\n".join(lineas) + "\n"


def escribir_script(ruta: str | Path, entradas: Iterable[str]) -> None:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(script_firewall(entradas), encoding="utf-8")
