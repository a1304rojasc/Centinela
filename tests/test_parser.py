"""Tests de la Fase 1: el parser."""

from datetime import datetime

import pytest

from centinela.parser import analizar_linea, analizar_lineas, leer_log

FALLO = "Nov  2 03:12:05 srv-web01 sshd[4242]: Failed password for root from 185.220.101.47 port 51234 ssh2"
INVALIDO = "Nov  2 14:41:10 srv-web01 sshd[4242]: Failed password for invalid user oracle from 45.134.26.89 port 40112 ssh2"
OK_CLAVE = "Nov 12 09:05:01 srv-web01 sshd[99]: Accepted publickey for deploy from 10.0.0.50 port 41000 ssh2: ED25519 SHA256:abc"
ISO = "2026-11-02T03:12:05.123456+00:00 srv-web01 sshd[4242]: Accepted password for maria from 192.168.1.15 port 52000 ssh2"


def test_fallo_clasico():
    i = analizar_linea(FALLO, anio=2026)
    assert i.momento == datetime(2026, 11, 2, 3, 12, 5)
    assert (i.ip, i.usuario, i.exito, i.puerto) == ("185.220.101.47", "root", False, 51234)
    assert i.usuario_valido and i.resultado == "FALLIDO"


def test_usuario_invalido_no_se_come_las_palabras():
    i = analizar_linea(INVALIDO, anio=2026)
    assert i.usuario == "oracle"          # no "invalid"
    assert i.usuario_valido is False


def test_publickey_y_dia_de_dos_cifras():
    i = analizar_linea(OK_CLAVE, anio=2026)
    assert i.exito and i.metodo == "publickey" and i.momento.day == 12


def test_formato_iso_sin_zona_horaria():
    i = analizar_linea(ISO)
    assert i.momento == datetime(2026, 11, 2, 3, 12, 5, 123456)
    assert i.momento.tzinfo is None and i.usuario == "maria" and i.exito


@pytest.mark.parametrize("linea", [
    "Nov  2 03:12:05 srv-web01 sshd[4242]: Invalid user oracle from 45.134.26.89 port 40112",
    "Nov  2 03:12:05 srv-web01 CRON[1]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)",
    "Nov  2 03:12:05 srv-web01 sshd[1]: Connection closed by authenticating user root 1.2.3.4 port 5 [preauth]",
    "Nov  2 03:12:05 srv-web01 sshd[1]: Failed password for root from 999.1.1.1 port 5 ssh2",  # IP imposible
    "",
    "basura sin formato",
])
def test_ruido_se_ignora(linea):
    assert analizar_linea(linea, anio=2026) is None


def test_cambio_de_anio():
    lineas = [FALLO.replace("Nov  2", "Dec 31"), FALLO.replace("Nov  2", "Jan  1")]
    a, b = analizar_lineas(lineas, anio=2025)
    assert a.momento.year == 2025 and b.momento.year == 2026


def test_leer_log_generado(log_ejemplo):
    intentos = leer_log(log_ejemplo, anio=2026)
    assert len(intentos) > 250
    # Cada línea "Failed"/"Accepted" del archivo es exactamente un intento.
    texto = log_ejemplo.read_text()
    assert len(intentos) == texto.count(": Failed ") + texto.count(": Accepted ")
