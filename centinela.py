"""
centinela.py — Fase 1: leer un log de SSH y extraer cada intento de login.

Para cada intento obtenemos 4 datos:
    fecha, ip, usuario y resultado (EXITOSO o FALLIDO).

Uso:
    python centinela.py                 # usa logs/auth.log
    python centinela.py otro/archivo.log
"""

import re    # 're' = regular expressions (expresiones regulares)
import sys   # 'sys' nos da acceso a los argumentos de la línea de comandos

# ---------------------------------------------------------------------------
# 1. La expresión regular
# ---------------------------------------------------------------------------
# Las líneas que nos interesan tienen esta forma:
#
#   Nov  2 03:12:05 srv-web01 sshd[4242]: Failed password for root from 185.220.101.47 port 51234 ssh2
#   Nov  2 14:41:10 srv-web01 sshd[4242]: Failed password for invalid user oracle from 45.134.26.89 port 40112 ssh2
#   Nov  2 09:03:44 srv-web01 sshd[4242]: Accepted password for maria from 192.168.1.15 port 52000 ssh2
#   Nov  2 09:05:01 srv-web01 sshd[4242]: Accepted publickey for deploy from 10.0.0.50 port 41000 ssh2: ED25519 ...
#
# re.VERBOSE nos deja escribir el patrón en varias líneas y con comentarios
# (los espacios normales se ignoran; por eso usamos \s o [ ] cuando
# queremos un espacio de verdad).
#
# (?P<nombre> ... ) es un "grupo con nombre": guarda lo que encaje dentro
# para poder recuperarlo después como coincidencia.group("nombre").

PATRON_SSH = re.compile(
    r"""
    ^                                   # inicio de la línea
    (?P<fecha>
        [A-Z][a-z]{2}                   # mes: 'Nov' (mayúscula + 2 minúsculas)
        \s+\d{1,2}                      # uno o más espacios + día: ' 2' o '12'
        \s\d{2}:\d{2}:\d{2}             # hora: '03:12:05'
    )
    \s\S+                               # nombre del servidor (\S+ = sin espacios)
    \s sshd\[\d+\]:                     # 'sshd[4242]:'  (\[ escapa el corchete)
    \s (?P<resultado>Accepted|Failed)   # la palabra clave: Accepted o Failed
    \s (?:password|publickey)           # método; (?: ) agrupa SIN guardar
    \s for
    \s (?:invalid[ ]user[ ])?           # opcional (?): 'invalid user ' si no existe
    (?P<usuario>\S+)                    # el usuario: cualquier cosa sin espacios
    \s from
    \s (?P<ip>\d{1,3}(?:\.\d{1,3}){3})  # IPv4: 1-3 dígitos y 3 veces '.dígitos'
    \s port \s \d+                      # 'port 51234' (lo leemos pero no lo guardamos)
    """,
    re.VERBOSE,
)

# Traducimos la palabra de sshd a algo más claro en español.
TRADUCCION_RESULTADO = {"Accepted": "EXITOSO", "Failed": "FALLIDO"}


# ---------------------------------------------------------------------------
# 2. Funciones
# ---------------------------------------------------------------------------

def analizar_linea(linea):
    """Intenta extraer un intento de login de UNA línea.

    Devuelve un diccionario con fecha, ip, usuario y resultado,
    o None si la línea no es un intento de login (ruido).
    """
    coincidencia = PATRON_SSH.search(linea)
    if coincidencia is None:
        return None  # la línea no encaja con el patrón: la ignoramos

    return {
        "fecha": coincidencia.group("fecha"),
        "ip": coincidencia.group("ip"),
        "usuario": coincidencia.group("usuario"),
        "resultado": TRADUCCION_RESULTADO[coincidencia.group("resultado")],
    }


def leer_log(ruta):
    """Lee el archivo completo y devuelve una lista con todos los intentos."""
    intentos = []
    # 'with' abre el archivo y lo cierra solo al terminar, aunque haya errores.
    # errors="replace" evita que el programa se caiga si hay bytes raros.
    with open(ruta, encoding="utf-8", errors="replace") as archivo:
        for linea in archivo:  # recorremos el archivo línea a línea
            intento = analizar_linea(linea)
            if intento is not None:
                intentos.append(intento)
    return intentos


def mostrar_intentos(intentos):
    """Imprime los intentos como una tabla alineada."""
    # :<17 significa "alinea a la izquierda ocupando 17 caracteres".
    print(f"{'FECHA':<17}{'IP':<17}{'USUARIO':<12}RESULTADO")
    print("-" * 56)
    for i in intentos:
        print(f"{i['fecha']:<17}{i['ip']:<17}{i['usuario']:<12}{i['resultado']}")


# ---------------------------------------------------------------------------
# 3. Programa principal
# ---------------------------------------------------------------------------

def main():
    # sys.argv es la lista de palabras que escribiste al ejecutar el script.
    # sys.argv[0] es el nombre del script; sys.argv[1] sería el archivo.
    ruta = sys.argv[1] if len(sys.argv) > 1 else "logs/auth.log"

    try:
        intentos = leer_log(ruta)
    except FileNotFoundError:
        print(f"No encuentro el archivo '{ruta}'. ¿Ejecutaste generar_logs.py?")
        sys.exit(1)

    mostrar_intentos(intentos)

    fallidos = sum(1 for i in intentos if i["resultado"] == "FALLIDO")
    print("-" * 56)
    print(f"Total de intentos: {len(intentos)}  |  "
          f"Exitosos: {len(intentos) - fallidos}  |  Fallidos: {fallidos}")


# Este 'if' hace que main() solo se ejecute cuando lanzas el archivo
# directamente (python centinela.py), y no cuando otro script lo importa.
if __name__ == "__main__":
    main()
