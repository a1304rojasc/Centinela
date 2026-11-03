"""
La línea de comandos de Centinela. Une las cuatro fases.

    python -m centinela generar                 # Fase 1: crea logs/auth.log
    python -m centinela intentos                # Fase 1: tabla de intentos
    python -m centinela detectar                # Fase 2: incidentes
    python -m centinela reporte                 # Fase 3: CSV + gráficos + reporte.md
    python -m centinela bloquear                # Fase 4: lista negra + script
    python -m centinela todo                    # 2 + 3 + 4 de una vez

argparse lee los argumentos que escribes y genera la ayuda (-h) sola.
Cada subcomando tiene su propia función "cmd_...".
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta

from centinela import detector, generador, lista_negra, parser, reporte

LOG_POR_DEFECTO = "logs/auth.log"


# --- utilidades -----------------------------------------------------------------

def _reglas(args) -> list[detector.Regla]:
    return [
        detector.Regla("rafaga", args.umbral, timedelta(seconds=args.ventana)),
        detector.Regla("sostenido", args.umbral_sostenido, timedelta(seconds=args.ventana_sostenida)),
    ]


def _leer(args) -> list[parser.Intento]:
    try:
        return parser.leer_log(args.log, args.anio)
    except FileNotFoundError:
        sys.exit(f"No encuentro '{args.log}'. Puedes crear uno de ejemplo con:  python -m centinela generar")


def _imprimir_incidentes(incidentes: list[detector.Incidente]) -> None:
    if not incidentes:
        print("Sin incidentes: ninguna IP superó las reglas.")
        return
    print(f"{len(incidentes)} incidentes en {len(detector.ips_atacantes(incidentes))} IPs:\n")
    for inc in incidentes:
        marca = "!!" if inc.comprometido else "  "
        print(f"{marca} {inc.ip:<16} {inc.describir()}")
    comprometidas = sorted({i.ip for i in incidentes if i.comprometido})
    if comprometidas:
        print(f"\n!! COMPROMISO probable desde: {', '.join(comprometidas)}. "
              "Revisa esas sesiones y cambia las contraseñas afectadas.")


# --- subcomandos ----------------------------------------------------------------

def cmd_generar(args) -> int:
    inicio = datetime.strptime(args.inicio, "%Y-%m-%d")
    n = generador.escribir_log(args.salida, inicio=inicio, dias=args.dias, semilla=args.semilla, formato=args.formato)
    print(f"Generadas {n} líneas en {args.salida}")
    return 0


def cmd_intentos(args) -> int:
    intentos = [i for i in _leer(args) if not args.ip or i.ip == args.ip]
    print(f"{'FECHA':<20}{'IP':<17}{'USUARIO':<12}RESULTADO")
    print("-" * 58)
    for i in intentos:
        print(f"{i.momento:%Y-%m-%d %H:%M:%S} {i.ip:<17}{i.usuario:<12}{i.resultado}")
    fallos = sum(not i.exito for i in intentos)
    print("-" * 58)
    print(f"Total: {len(intentos)}  |  Exitosos: {len(intentos) - fallos}  |  Fallidos: {fallos}")
    return 0


def cmd_detectar(args) -> int:
    _imprimir_incidentes(detector.detectar(_leer(args), _reglas(args)))
    return 0


def cmd_reporte(args) -> int:
    intentos = _leer(args)
    incidentes = detector.detectar(intentos, _reglas(args))
    rutas = reporte.generar_reporte(intentos, incidentes, args.carpeta)
    print(f"Reporte en {args.carpeta}/:")
    for ruta in rutas.values():
        print(f"  · {ruta}")
    return 0


def cmd_bloquear(args, incidentes=None) -> int:
    if incidentes is None:
        incidentes = detector.detectar(_leer(args), _reglas(args))
    blanca = ([] if args.sin_redes_privadas else list(lista_negra.LISTA_BLANCA_POR_DEFECTO)) + args.permitir
    nuevas, total = lista_negra.actualizar(args.lista, incidentes, blanca)
    lista_negra.escribir_script(args.script, total)
    print(f"Lista negra: {len(nuevas)} IPs nuevas, {len(total)} en total -> {args.lista}")
    for ip in nuevas:
        print(f"  + {ip}")
    print(f"Script de firewall -> {args.script}  (revísalo y ejecútalo con: sudo sh {args.script})")
    return 0


def cmd_todo(args) -> int:
    intentos = _leer(args)
    incidentes = detector.detectar(intentos, _reglas(args))
    print(f"Analizados {len(intentos)} intentos de login de {args.log}\n")
    _imprimir_incidentes(incidentes)
    print()
    # SEGURIDAD: primero la lista negra y después el reporte. Si el reporte
    # fallara (por ejemplo, por un dato raro en un gráfico), el bloqueo ya
    # estaría hecho: un fallo en la parte "bonita" no debe frenar la defensa.
    resultado = cmd_bloquear(args, incidentes)
    try:
        reporte.generar_reporte(intentos, incidentes, args.carpeta)
        print(f"Reporte con gráficos -> {args.carpeta}/reporte.md")
    except Exception as error:  # noqa: BLE001 - lo mostramos y seguimos
        print(f"AVISO: no se pudo generar el reporte ({type(error).__name__}: {error})", file=sys.stderr)
        return 1
    return resultado


# --- argumentos -----------------------------------------------------------------

def construir_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="centinela", description="Detector de fuerza bruta en logs de SSH.")
    sub = ap.add_subparsers(dest="comando", required=True)

    g = sub.add_parser("generar", help="crea un log SSH de ejemplo")
    g.add_argument("--salida", default=LOG_POR_DEFECTO)
    g.add_argument("--inicio", default="2026-11-02", help="primer día (AAAA-MM-DD)")
    g.add_argument("--dias", type=int, default=1)
    g.add_argument("--semilla", type=int, default=42)
    g.add_argument("--formato", choices=["syslog", "iso"], default="syslog")
    g.set_defaults(funcion=cmd_generar)

    # Opciones compartidas por los comandos que leen un log.
    comun = argparse.ArgumentParser(add_help=False)
    comun.add_argument("log", nargs="?", default=LOG_POR_DEFECTO, help=f"archivo de log (por defecto {LOG_POR_DEFECTO})")
    comun.add_argument("--anio", type=int, default=None, help="año del log en formato clásico (por defecto, el actual)")
    reglas = argparse.ArgumentParser(add_help=False)
    reglas.add_argument("--umbral", type=int, default=5, help="fallos para la regla de ráfaga (5)")
    reglas.add_argument("--ventana", type=int, default=60, help="segundos de la regla de ráfaga (60)")
    reglas.add_argument("--umbral-sostenido", type=int, default=20, help="fallos para la regla sostenida (20)")
    reglas.add_argument("--ventana-sostenida", type=int, default=3600, help="segundos de la regla sostenida (3600)")
    salida = argparse.ArgumentParser(add_help=False)
    salida.add_argument("--carpeta", default="reportes", help="carpeta del reporte")
    bloqueo = argparse.ArgumentParser(add_help=False)
    bloqueo.add_argument("--lista", default="lista_negra.txt")
    bloqueo.add_argument("--script", default="bloquear.sh")
    bloqueo.add_argument("--permitir", action="append", default=[], metavar="RED",
                         help="IP o red que nunca se bloquea, p. ej. 203.0.113.0/24 (repetible)")
    bloqueo.add_argument("--sin-redes-privadas", action="store_true",
                         help="permite bloquear también redes privadas (10.x, 192.168.x...)")

    i = sub.add_parser("intentos", parents=[comun], help="lista los intentos de login")
    i.add_argument("--ip", help="mostrar solo esta IP")
    i.set_defaults(funcion=cmd_intentos)
    sub.add_parser("detectar", parents=[comun, reglas], help="busca ataques de fuerza bruta").set_defaults(funcion=cmd_detectar)
    sub.add_parser("reporte", parents=[comun, reglas, salida], help="CSV, gráficos y reporte.md").set_defaults(funcion=cmd_reporte)
    sub.add_parser("bloquear", parents=[comun, reglas, bloqueo], help="actualiza la lista negra").set_defaults(funcion=cmd_bloquear)
    sub.add_parser("todo", parents=[comun, reglas, salida, bloqueo], help="detectar + reporte + bloquear").set_defaults(funcion=cmd_todo)
    return ap


def main(argv: list[str] | None = None) -> int:
    args = construir_parser().parse_args(argv)
    return args.funcion(args)
