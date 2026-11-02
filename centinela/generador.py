"""
Fase 1 · Generador de logs SSH de ejemplo.

Fabrica un archivo parecido a /var/log/auth.log de un servidor Ubuntu/Debian
para poder practicar sin tocar un servidor real. Mezcla:

  * Usuarios legítimos que entran en horario laboral (y a veces se equivocan
    de contraseña una o dos veces, como cualquier persona).
  * Cuatro tipos de ataque, elegidos para poner a prueba al detector:
      - RÁFAGA:      un diccionario rápido contra root/admin (fácil de detectar).
      - ENUMERACIÓN: prueba nombres de usuario inventados y al final ENTRA con
                     una cuenta débil (el caso más grave: un compromiso).
      - LENTO:       un intento cada ~2 minutos durante horas ("low and slow"),
                     pensado para pasar por debajo de una regla de ráfaga.
      - BOTNET:      muchas IPs distintas con 2-3 intentos cada una. Un detector
                     que cuenta por IP NO lo ve (es una limitación conocida).
  * Escáneres casuales (1-3 intentos y se van).
  * Ruido: líneas de CRON, sudo, cierres de sesión... que no son logins.

Todo sale de un generador aleatorio con semilla fija: la misma semilla da
siempre el mismo log, lo que hace que los tests sean repetibles.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

HOST = "srv-web01"

# --- Actores --------------------------------------------------------------
# Usuario legítimo -> (IP desde la que trabaja, uid en el sistema)
USUARIOS_LEGITIMOS = {
    "maria": ("192.168.1.15", 1001),
    "carlos": ("192.168.1.22", 1002),
    "ana": ("10.0.0.8", 1003),
    "deploy": ("10.0.0.50", 1004),
    "backup": ("192.168.1.100", 1005),
}

# Las IPs atacantes se exportan para que los tests sepan qué esperar.
ATACANTE_RAFAGA = "185.220.101.47"
ATACANTE_ENUMERACION = "45.134.26.89"
ATACANTE_LENTO = "103.75.190.11"
BOTNET_PREFIJO = "5.188.62."  # 12 IPs: 5.188.62.10, .11, ...
ESCANERES = ["61.177.172.140", "218.92.0.112", "92.255.85.37", "141.98.11.23"]

DICCIONARIO = ["root", "admin", "root", "ubuntu", "root", "test", "user"]
USUARIOS_INVENTADOS = [
    "oracle", "postgres", "guest", "ftpuser", "pi", "git", "support",
    "mysql", "tomcat", "jenkins", "nagios", "dev", "www", "hadoop",
]


class _Fabrica:
    """Agrupa el estado de una generación: el azar y la lista de eventos.

    Cada evento es una tupla (momento, mensaje). Al final se ordenan por
    momento y se formatean como líneas de syslog.
    """

    def __init__(self, semilla: int):
        self.azar = random.Random(semilla)  # azar propio: no toca random global
        self.eventos: list[tuple[datetime, str]] = []

    # -- piezas pequeñas ---------------------------------------------------
    def pid(self) -> int:
        return self.azar.randint(1000, 65000)

    def puerto(self) -> int:
        return self.azar.randint(30000, 65000)

    def anadir(self, momento: datetime, mensaje: str) -> None:
        self.eventos.append((momento, mensaje))

    # -- lo que deja sshd en el log ------------------------------------------
    def login_ok(self, t: datetime, usuario: str, ip: str, uid: int = 1001, metodo: str = "password") -> None:
        p, port = self.pid(), self.puerto()
        cola = " ssh2"
        if metodo == "publickey":
            cola = " ssh2: ED25519 SHA256:q3Xb8kR0vNfY2mZ1cWpLhT7sA9eD4gU6iJ5oK0lM2nE"
        self.anadir(t, f"sshd[{p}]: Accepted {metodo} for {usuario} from {ip} port {port}{cola}")
        self.anadir(t, f"sshd[{p}]: pam_unix(sshd:session): session opened for user {usuario}(uid={uid}) by (uid=0)")
        self.anadir(t, f"systemd-logind[812]: New session {self.azar.randint(100, 999)} of user {usuario}.")
        # La sesión se cierra un rato después.
        fin = t + timedelta(minutes=self.azar.randint(5, 90))
        self.anadir(fin, f"sshd[{p}]: Received disconnect from {ip} port {port}:11: disconnected by user")
        self.anadir(fin, f"sshd[{p}]: pam_unix(sshd:session): session closed for user {usuario}")

    def login_fallido(self, t: datetime, usuario: str, ip: str, existe: bool = True) -> None:
        """Un intento fallido. Si el usuario no existe, sshd deja DOS líneas:
        'Invalid user ...' y 'Failed password for invalid user ...'.
        Solo la segunda cuenta como intento (el parser lo sabe)."""
        p, port = self.pid(), self.puerto()
        if not existe:
            self.anadir(t, f"sshd[{p}]: Invalid user {usuario} from {ip} port {port}")
            self.anadir(t, f"sshd[{p}]: Failed password for invalid user {usuario} from {ip} port {port} ssh2")
        else:
            self.anadir(t, f"sshd[{p}]: Failed password for {usuario} from {ip} port {port} ssh2")
        if self.azar.random() < 0.3:
            quien = usuario if existe else f"invalid user {usuario}"
            self.anadir(t + timedelta(seconds=1), f"sshd[{p}]: Connection closed by authenticating user {quien} {ip} port {port} [preauth]")

    # -- escenarios -------------------------------------------------------------
    def dia_normal(self, dia: datetime) -> None:
        """Actividad legítima + escáneres casuales de un día cualquiera."""
        for usuario, (ip, uid) in USUARIOS_LEGITIMOS.items():
            for _ in range(self.azar.randint(4, 7)):
                t = dia + timedelta(seconds=self.azar.randint(7 * 3600, 20 * 3600))
                metodo = "publickey" if usuario in ("deploy", "backup") else "password"
                # Quien entra con contraseña a veces se equivoca antes de acertar.
                errores = self.azar.choice([0, 0, 0, 1, 1, 2]) if metodo == "password" else 0
                for _ in range(errores):
                    self.login_fallido(t, usuario, ip)
                    t += timedelta(seconds=self.azar.randint(4, 15))
                self.login_ok(t, usuario, ip, uid, metodo)

        # Carlos, despistado: 4 fallos seguidos (por debajo del umbral de 5).
        t = dia + timedelta(hours=11, minutes=5)
        for _ in range(4):
            self.login_fallido(t, "carlos", USUARIOS_LEGITIMOS["carlos"][0])
            t += timedelta(seconds=self.azar.randint(6, 12))
        self.login_ok(t, "carlos", *USUARIOS_LEGITIMOS["carlos"])

        for ip in ESCANERES:
            t = dia + timedelta(seconds=self.azar.randint(0, 86399))
            for _ in range(self.azar.randint(1, 3)):
                t += timedelta(seconds=self.azar.randint(2, 20))
                self.login_fallido(t, "root", ip)

    def ataques(self, dia: datetime) -> None:
        """Los cuatro ataques del escenario, todos el mismo día."""
        # RÁFAGA: 110 intentos de madrugada, uno cada 1-3 segundos.
        t = dia + timedelta(hours=3, minutes=12)
        for _ in range(110):
            t += timedelta(seconds=self.azar.randint(1, 3))
            self.login_fallido(t, self.azar.choice(DICCIONARIO), ATACANTE_RAFAGA)

        # ENUMERACIÓN: 55 usuarios inventados... y al final entra con "test".
        t = dia + timedelta(hours=14, minutes=40)
        for _ in range(55):
            t += timedelta(seconds=self.azar.randint(2, 6))
            self.login_fallido(t, self.azar.choice(USUARIOS_INVENTADOS), ATACANTE_ENUMERACION, existe=False)
        self.login_ok(t + timedelta(seconds=5), "test", ATACANTE_ENUMERACION, uid=1010)

        # LENTO: 60 intentos separados 90-150 s (unas 2 horas en total).
        t = dia + timedelta(hours=20)
        for _ in range(60):
            t += timedelta(seconds=self.azar.randint(90, 150))
            self.login_fallido(t, self.azar.choice(["root", "admin"]), ATACANTE_LENTO)

        # BOTNET: 12 IPs, 2-3 intentos cada una, repartidos en 15 minutos.
        for n in range(12):
            ip = f"{BOTNET_PREFIJO}{10 + n}"
            for _ in range(self.azar.randint(2, 3)):
                t = dia + timedelta(hours=9, seconds=self.azar.randint(0, 900))
                self.login_fallido(t, "root", ip)

    def ruido(self, dia: datetime, cantidad: int) -> None:
        """Líneas del sistema que no son intentos de login."""
        plantillas = [
            "CRON[{p}]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)",
            "CRON[{p}]: pam_unix(cron:session): session closed for user root",
            "sudo:    {u} : TTY=pts/0 ; PWD=/home/{u} ; USER=root ; COMMAND=/usr/bin/apt update",
            "sudo: pam_unix(sudo:session): session opened for user root(uid=0) by {u}(uid=0)",
            "systemd[1]: Started Daily apt download activities.",
        ]
        for _ in range(cantidad):
            usuario = self.azar.choice(list(USUARIOS_LEGITIMOS))
            momento = dia + timedelta(seconds=self.azar.randint(0, 86399))
            self.anadir(momento, self.azar.choice(plantillas).format(p=self.pid(), u=usuario))


def formatear(momento: datetime, mensaje: str, formato: str = "syslog") -> str:
    """Une fecha + host + mensaje.

    * "syslog" (clásico):  'Nov  2 03:12:05 srv-web01 sshd[...]: ...'
      El día se rellena a 2 caracteres con un espacio, y NO hay año.
    * "iso" (rsyslog moderno): '2026-11-02T03:12:05.000000+00:00 srv-web01 ...'
    """
    if formato == "iso":
        fecha = momento.strftime("%Y-%m-%dT%H:%M:%S.%f") + "+00:00"
    else:
        fecha = f"{momento:%b} {momento.day:>2} {momento:%H:%M:%S}"
    return f"{fecha} {HOST} {mensaje}"


def generar_lineas(inicio: datetime = datetime(2026, 11, 2), dias: int = 1, semilla: int = 42,
                   formato: str = "syslog", ruido_por_dia: int = 180) -> list[str]:
    """Devuelve las líneas del log, ya ordenadas por fecha.

    Los ataques ocurren el primer día; los demás días solo hay tráfico normal.
    """
    if formato not in ("syslog", "iso"):
        raise ValueError("formato debe ser 'syslog' o 'iso'")
    fabrica = _Fabrica(semilla)
    for n in range(dias):
        dia = datetime(inicio.year, inicio.month, inicio.day) + timedelta(days=n)
        fabrica.dia_normal(dia)
        fabrica.ruido(dia, ruido_por_dia)
        if n == 0:
            fabrica.ataques(dia)
    # sort es "estable": dos eventos del mismo segundo conservan su orden.
    fabrica.eventos.sort(key=lambda evento: evento[0])
    return [formatear(t, m, formato) for t, m in fabrica.eventos]


def escribir_log(ruta: str | Path, **opciones) -> int:
    """Genera el log y lo guarda en 'ruta'. Devuelve el número de líneas."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    lineas = generar_lineas(**opciones)
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    return len(lineas)
