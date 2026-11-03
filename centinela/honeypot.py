"""
Honeypot SSH simulado: un "tarro de miel" que finge ser un servidor SSH,
registra cada intento de login y NUNCA da acceso.

Cómo funciona:
  * Habla el protocolo SSH de verdad (con la librería paramiko), así que un
    cliente `ssh` o un bot de fuerza bruta no notan la diferencia al conectar.
  * Solo ofrece autenticación por contraseña, y la rechaza SIEMPRE. No hay
    shell, ni comandos, ni canales: después del login fallido no hay nada.
  * Cada intento se escribe en DOS archivos:
      - honeypot.log: líneas en formato auth.log ("Failed password for ...")
        que el parser de Centinela lee sin cambios.
      - credenciales.jsonl: una línea JSON por intento con la contraseña.

¿Por qué la contraseña va aparte? La escribe el atacante. Si la pusiéramos
al final de la línea de auth.log, podría contener "from 8.8.8.8 port 1" y
engañar al parser (la vulnerabilidad V1 de SEGURIDAD.md). En JSON va
escapada y no se mezcla con nada.

Medidas de contención:
  * Escucha en 127.0.0.1 por defecto: solo tu propia máquina puede conectar.
  * Puerto alto (2222): no hace falta ser root para abrirlo.
  * Límite de conexiones simultáneas, de intentos por conexión y de tiempo.
  * Usuario y contraseña se limpian (sin caracteres de control) y se recortan.

Uso:
    python -m centinela honeypot                  # 127.0.0.1:2222
    ssh -p 2222 root@127.0.0.1                    # pruébalo desde otra terminal
    python -m centinela todo logs/honeypot.log    # analiza lo registrado
"""

from __future__ import annotations

import json
import logging
import socket
import threading
from datetime import datetime
from pathlib import Path

import paramiko

from centinela.parser import limpiar_texto

BANNER = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.10"  # lo que el atacante cree ver
HOST_LOG = "honeypot"
MAX_LONGITUD = 100           # sshd también recorta los usuarios a 100 caracteres
MAX_INTENTOS = 6             # como MaxAuthTries de sshd
MAX_CONEXIONES = 20
TIEMPO_MAXIMO = 30           # segundos por conexión

logging.getLogger("paramiko").setLevel(logging.CRITICAL)  # paramiko es muy hablador


def _limpio(texto: str) -> str:
    return limpiar_texto(texto)[:MAX_LONGITUD]


class Registro:
    """Escribe los intentos en los dos archivos. Un candado (Lock) evita que
    dos conexiones a la vez mezclen sus líneas."""

    def __init__(self, log: Path, credenciales: Path):
        self.log, self.credenciales = Path(log), Path(credenciales)
        for ruta in (self.log, self.credenciales):
            ruta.parent.mkdir(parents=True, exist_ok=True)
        self._candado = threading.Lock()
        self.intentos = 0

    def anotar(self, ip: str, puerto: int, usuario: str, contrasena: str, pid: int) -> None:
        ahora = datetime.now()
        usuario = _limpio(usuario) or "?"
        # sshd escribe la fecha clásica sin año: "Nov  3 10:15:02"
        linea = (f"{ahora:%b} {ahora.day:>2} {ahora:%H:%M:%S} {HOST_LOG} sshd[{pid}]: "
                 f"Failed password for {usuario} from {ip} port {puerto} ssh2")
        dato = {"momento": ahora.isoformat(timespec="seconds"), "ip": ip, "puerto": puerto,
                "usuario": usuario, "contrasena": _limpio(contrasena)}
        with self._candado:
            with open(self.log, "a", encoding="utf-8") as f:
                f.write(linea + "\n")
            with open(self.credenciales, "a", encoding="utf-8") as f:
                f.write(json.dumps(dato, ensure_ascii=False) + "\n")
            self.intentos += 1


class _ServidorFalso(paramiko.ServerInterface):
    """Lo que paramiko pregunta durante el login. Respondemos siempre "no"."""

    def __init__(self, registro: Registro, ip: str, puerto: int, pid: int):
        self.registro, self.ip, self.puerto, self.pid = registro, ip, puerto, pid
        self.intentos = 0

    def get_allowed_auths(self, username):
        return "password"

    def check_auth_password(self, username, password):
        self.intentos += 1
        self.registro.anotar(self.ip, self.puerto, username, password, self.pid)
        return paramiko.AUTH_FAILED  # NUNCA AUTH_SUCCESSFUL

    def check_auth_publickey(self, username, key):
        return paramiko.AUTH_FAILED

    def check_auth_none(self, username):
        return paramiko.AUTH_FAILED

    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED  # ni shell ni nada


class Honeypot:
    def __init__(self, host: str = "127.0.0.1", puerto: int = 2222,
                 log: str | Path = "logs/honeypot.log", credenciales: str | Path = "logs/credenciales.jsonl"):
        self.host, self.puerto = host, puerto
        self.registro = Registro(log, credenciales)
        self.clave = paramiko.RSAKey.generate(2048)  # clave del "servidor", nueva en cada arranque
        self._cupos = threading.BoundedSemaphore(MAX_CONEXIONES)
        self._parar = threading.Event()
        self._socket: socket.socket | None = None
        self._pid = 20000

    def arrancar(self) -> int:
        """Abre el puerto y devuelve el número real (útil con puerto=0)."""
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._socket.bind((self.host, self.puerto))
        self._socket.listen(50)
        self._socket.settimeout(0.5)
        self.puerto = self._socket.getsockname()[1]
        threading.Thread(target=self._aceptar, daemon=True).start()
        return self.puerto

    def parar(self) -> None:
        self._parar.set()
        if self._socket:
            self._socket.close()

    def _aceptar(self) -> None:
        while not self._parar.is_set():
            try:
                cliente, (ip, puerto) = self._socket.accept()
            except (socket.timeout, OSError):
                continue
            if not self._cupos.acquire(blocking=False):
                cliente.close()  # demasiadas conexiones: no dejamos que nos tumben
                continue
            self._pid += 1
            threading.Thread(target=self._atender, args=(cliente, ip, puerto, self._pid), daemon=True).start()

    def _atender(self, cliente: socket.socket, ip: str, puerto: int, pid: int) -> None:
        transporte = None
        try:
            cliente.settimeout(TIEMPO_MAXIMO)
            transporte = paramiko.Transport(cliente)
            transporte.local_version = BANNER
            transporte.add_server_key(self.clave)
            servidor = _ServidorFalso(self.registro, ip, puerto, pid)
            transporte.start_server(server=servidor)
            # Esperamos a que el cliente se rinda, sin pasar de los límites.
            limite = datetime.now().timestamp() + TIEMPO_MAXIMO
            while (transporte.is_active() and servidor.intentos < MAX_INTENTOS
                   and datetime.now().timestamp() < limite and not self._parar.is_set()):
                transporte.accept(timeout=0.5)  # nunca devolverá un canal: los rechazamos todos
        except Exception:  # noqa: BLE001 - un cliente roto no debe tumbar el honeypot
            pass
        finally:
            if transporte:
                transporte.close()
            cliente.close()
            self._cupos.release()


def ejecutar(host: str, puerto: int, log: str, credenciales: str) -> int:
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"AVISO: escuchando en {host}: otras máquinas de la red podrán conectar.")
    hp = Honeypot(host, puerto, log, credenciales)
    real = hp.arrancar()
    print(f"Honeypot escuchando en {host}:{real}. Registro: {log} y {credenciales}. Ctrl+C para parar.")
    print(f"Pruébalo con:  ssh -p {real} root@{host}")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        hp.parar()
        print(f"\nParado. {hp.registro.intentos} intentos registrados. Analízalos con:  python -m centinela todo {log}")
    return 0
