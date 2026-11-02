"""
generar_logs.py — Crea un archivo de logs SSH de ejemplo para Centinela.

Imita el formato de /var/log/auth.log de un servidor Ubuntu/Debian.
Mezcla tres tipos de actividad:
  1. Usuarios legítimos que entran (y a veces se equivocan de contraseña).
  2. Dos IPs atacantes que hacen fuerza bruta (muchos intentos en poco tiempo).
  3. "Ruido": líneas del sistema que NO son intentos de login (CRON, sesiones,
     desconexiones...). Están ahí para que el parser aprenda a ignorarlas.

Uso:
    python generar_logs.py
"""

import random
from datetime import datetime, timedelta
from pathlib import Path

# Semilla fija: así el archivo generado es SIEMPRE el mismo.
# Si la cambias (o la quitas), obtendrás logs distintos cada vez.
random.seed(42)

ARCHIVO_SALIDA = Path("logs") / "auth.log"
TOTAL_LINEAS = 500
HOST = "srv-web01"
INICIO_DIA = datetime(2026, 11, 2, 0, 0, 0)

# --- Actores --------------------------------------------------------------

# Usuarios legítimos y la IP desde la que suelen conectarse.
USUARIOS_LEGITIMOS = {
    "maria": "192.168.1.15",
    "carlos": "192.168.1.22",
    "ana": "10.0.0.8",
    "deploy": "10.0.0.50",
    "backup": "192.168.1.100",
}

# Atacante 1: diccionario contra cuentas típicas (root, admin...).
ATACANTE_1 = "185.220.101.47"
# Atacante 2: prueba muchos nombres de usuario que no existen (enumeración).
ATACANTE_2 = "45.134.26.89"

USUARIOS_DICCIONARIO = ["root", "admin", "root", "ubuntu", "root", "test"]
USUARIOS_INVENTADOS = [
    "oracle", "postgres", "guest", "user", "ftpuser", "pi", "git",
    "support", "mysql", "tomcat", "jenkins", "nagios", "dev", "www",
]

# Escáneres casuales: IPs que prueban 1-3 veces y se van (ruido realista).
ESCANERES = ["103.152.18.4", "61.177.172.140", "218.92.0.112", "92.255.85.37"]


# --- Funciones auxiliares -------------------------------------------------

def pid():
    """Número de proceso aleatorio, como los que pone sshd entre corchetes."""
    return random.randint(1000, 65000)


def puerto():
    """Puerto de origen aleatorio del cliente."""
    return random.randint(30000, 65000)


def formatear(momento, mensaje):
    """Une fecha + host + mensaje con el formato clásico de syslog.

    syslog usa 'Nov  2 08:15:32': el día ocupa 2 caracteres y se rellena
    con un espacio a la izquierda (por eso hay dos espacios tras 'Nov').
    """
    fecha = f"{momento:%b} {momento.day:>2} {momento:%H:%M:%S}"
    return f"{fecha} {HOST} {mensaje}"


def login_ok(momento, usuario, ip, metodo="password"):
    """Devuelve las líneas que deja un login correcto."""
    p = pid()
    extra = " ssh2"
    if metodo == "publickey":
        extra = " ssh2: ED25519 SHA256:q3Xb8kR0vNfY2mZ1cWpLhT7sA9eD4gU6iJ5oK0lM2nE"
    return [
        (momento, f"sshd[{p}]: Accepted {metodo} for {usuario} from {ip} port {puerto()}{extra}"),
        (momento, f"sshd[{p}]: pam_unix(sshd:session): session opened for user {usuario}(uid=1001) by (uid=0)"),
    ]


def login_fallido(momento, usuario, ip, existe=True):
    """Devuelve las líneas que deja un login fallido.

    Si el usuario NO existe, sshd escribe primero 'Invalid user ...' y luego
    'Failed password for invalid user ...'. Solo la segunda es el intento.
    """
    p = pid()
    if existe:
        return [(momento, f"sshd[{p}]: Failed password for {usuario} from {ip} port {puerto()} ssh2")]
    port = puerto()
    return [
        (momento, f"sshd[{p}]: Invalid user {usuario} from {ip} port {port}"),
        (momento, f"sshd[{p}]: Failed password for invalid user {usuario} from {ip} port {port} ssh2"),
    ]


def momento_aleatorio(desde_hora=0, hasta_hora=24):
    """Un instante aleatorio del día entre dos horas."""
    segundos = random.randint(desde_hora * 3600, hasta_hora * 3600 - 1)
    return INICIO_DIA + timedelta(seconds=segundos)


# --- Generación de eventos ------------------------------------------------

def generar_eventos():
    eventos = []  # lista de tuplas (momento, mensaje)

    # 1) Actividad legítima en horario laboral.
    for usuario, ip in USUARIOS_LEGITIMOS.items():
        for _ in range(random.randint(6, 10)):
            t = momento_aleatorio(7, 20)
            # A veces la persona se equivoca de contraseña antes de acertar.
            if random.random() < 0.2:
                eventos += login_fallido(t, usuario, ip)
                t += timedelta(seconds=random.randint(3, 15))
            metodo = "publickey" if usuario in ("deploy", "backup") else "password"
            eventos += login_ok(t, usuario, ip, metodo)

    # 2) Atacante 1: ráfaga de madrugada, ~1 intento cada 1-3 segundos.
    t = INICIO_DIA + timedelta(hours=3, minutes=12)
    for _ in range(110):
        t += timedelta(seconds=random.randint(1, 3))
        eventos += login_fallido(t, random.choice(USUARIOS_DICCIONARIO), ATACANTE_1)

    # 3) Atacante 2: enumeración de usuarios por la tarde.
    #    (Cada intento deja 2 líneas: 'Invalid user' + 'Failed password').
    t = INICIO_DIA + timedelta(hours=14, minutes=40)
    for _ in range(55):
        t += timedelta(seconds=random.randint(2, 6))
        eventos += login_fallido(t, random.choice(USUARIOS_INVENTADOS), ATACANTE_2, existe=False)
    # ...y al final acierta con una cuenta débil. ¡Esto es lo peligroso!
    t += timedelta(seconds=4)
    eventos += login_ok(t, "test", ATACANTE_2)

    # 4) Escáneres casuales.
    for ip in ESCANERES:
        t = momento_aleatorio()
        for _ in range(random.randint(1, 3)):
            t += timedelta(seconds=random.randint(1, 5))
            eventos += login_fallido(t, "root", ip)

    return eventos


def generar_ruido(cantidad):
    """Líneas que no son intentos de login (el parser debe ignorarlas)."""
    plantillas = [
        "CRON[{p}]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)",
        "CRON[{p}]: pam_unix(cron:session): session closed for user root",
        "sshd[{p}]: Received disconnect from {ip} port {port}:11: disconnected by user",
        "sshd[{p}]: pam_unix(sshd:session): session closed for user {u}",
        "systemd-logind[812]: New session {n} of user {u}.",
        "sudo:    {u} : TTY=pts/0 ; PWD=/home/{u} ; USER=root ; COMMAND=/usr/bin/apt update",
    ]
    ruido = []
    for _ in range(cantidad):
        u, ip = random.choice(list(USUARIOS_LEGITIMOS.items()))
        msg = random.choice(plantillas).format(
            p=pid(), ip=ip, port=puerto(), u=u, n=random.randint(100, 999)
        )
        ruido.append((momento_aleatorio(), msg))
    return ruido


def main():
    eventos = generar_eventos()
    # Rellenamos con ruido hasta llegar al total de líneas deseado.
    eventos += generar_ruido(max(0, TOTAL_LINEAS - len(eventos)))
    # Ordenamos por fecha, como en un log real.
    eventos.sort(key=lambda e: e[0])

    ARCHIVO_SALIDA.parent.mkdir(exist_ok=True)
    with open(ARCHIVO_SALIDA, "w", encoding="utf-8") as f:
        for momento, mensaje in eventos:
            f.write(formatear(momento, mensaje) + "\n")

    print(f"Generadas {len(eventos)} líneas en {ARCHIVO_SALIDA}")


if __name__ == "__main__":
    main()
