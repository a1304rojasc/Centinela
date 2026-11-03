"""
Piezas compartidas por los tests. pytest carga este archivo solo.

Una "fixture" es una función que prepara algo para un test: el test la pide
poniendo su nombre como parámetro y pytest se la entrega ya construida.
"""

from datetime import datetime, timedelta

import pytest

from centinela.parser import Intento

T0 = datetime(2026, 11, 2, 10, 0, 0)


def fallos(ip, cuantos, cada_segundos, desde=T0, usuario="root"):
    """Crea 'cuantos' intentos fallidos de una IP, separados 'cada_segundos'."""
    return [Intento(desde + timedelta(seconds=n * cada_segundos), ip, usuario, False) for n in range(cuantos)]


def exito(ip, momento, usuario="maria"):
    return Intento(momento, ip, usuario, True)


@pytest.fixture
def log_ejemplo(tmp_path):
    """Un log generado en una carpeta temporal (tmp_path la crea pytest)."""
    from centinela import generador

    ruta = tmp_path / "auth.log"
    generador.escribir_log(ruta)
    return ruta
