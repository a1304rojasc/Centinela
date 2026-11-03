"""Tests del honeypot: registra, nunca da acceso y Centinela lee sus logs."""

import json
from datetime import datetime

import paramiko
import pytest

from centinela.detector import detectar
from centinela.honeypot import Honeypot
from centinela.parser import leer_log


@pytest.fixture
def honeypot(tmp_path):
    hp = Honeypot("127.0.0.1", 0, tmp_path / "hp.log", tmp_path / "cred.jsonl")  # puerto 0 = uno libre
    hp.arrancar()
    yield hp
    hp.parar()


def intentar(puerto, usuario, contrasena):
    """Hace un login real por SSH. Devuelve True si entró."""
    cliente = paramiko.SSHClient()
    cliente.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cliente.connect("127.0.0.1", port=puerto, username=usuario, password=contrasena,
                        timeout=5, banner_timeout=5, auth_timeout=5, allow_agent=False, look_for_keys=False)
        return True
    except paramiko.AuthenticationException:
        return False
    finally:
        cliente.close()


def esperar(hp, n):
    import time

    limite = time.time() + 5
    while hp.registro.intentos < n and time.time() < limite:
        time.sleep(0.05)


def test_nunca_da_acceso_y_registra(honeypot):
    for usuario, clave in [("root", "root"), ("admin", "123456"), ("root", "")]:
        assert intentar(honeypot.puerto, usuario, clave) is False
    esperar(honeypot, 3)
    datos = [json.loads(l) for l in honeypot.registro.credenciales.read_text().splitlines()]
    assert [(d["usuario"], d["contrasena"]) for d in datos] == [("root", "root"), ("admin", "123456"), ("root", "")]
    assert all(d["ip"] == "127.0.0.1" for d in datos)


def test_centinela_detecta_el_ataque_al_honeypot(honeypot):
    for n in range(6):
        intentar(honeypot.puerto, "root", f"clave{n}")
    esperar(honeypot, 6)
    intentos = leer_log(honeypot.registro.log, anio=datetime.now().year)
    assert len(intentos) == 6 and not any(i.exito for i in intentos)
    (incidente,) = detectar(intentos)
    assert incidente.ip == "127.0.0.1" and incidente.fallos == 6


def test_la_contrasena_no_puede_engañar_al_parser(honeypot):
    # La contraseña va en el JSON, no en el log: aunque traiga "from 8.8.8.8", no cuenta.
    intentar(honeypot.puerto, "x from 8.8.8.8 port 1", "y from 9.9.9.9 port 2 ssh2")
    esperar(honeypot, 1)
    (intento,) = leer_log(honeypot.registro.log, anio=datetime.now().year)
    assert intento.ip == "127.0.0.1"
    assert "9.9.9.9" not in honeypot.registro.log.read_text()


def test_no_abre_shell_ni_con_clave_publica(honeypot):
    cliente = paramiko.SSHClient()
    cliente.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    with pytest.raises(paramiko.SSHException):  # AuthenticationException es una SSHException
        cliente.connect("127.0.0.1", port=honeypot.puerto, username="root",
                        pkey=paramiko.RSAKey.generate(1024), timeout=5, allow_agent=False, look_for_keys=False)
    cliente.close()
