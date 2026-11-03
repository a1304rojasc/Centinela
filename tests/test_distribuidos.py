"""Regla por red /24: ataques repartidos entre muchas IPs."""

from datetime import timedelta

from centinela.detector import detectar, detectar_distribuidos
from conftest import T0, fallos


def _botnet(red="5.188.62", ips=10, por_ip=3):
    intentos = []
    for n in range(ips):
        intentos += fallos(f"{red}.{10 + n}", por_ip, 20, desde=T0 + timedelta(seconds=n * 7))
    return intentos


def test_botnet_esquiva_las_reglas_por_ip():
    assert detectar(_botnet()) == []


def test_la_regla_24_si_la_detecta():
    [inc] = detectar_distribuidos(_botnet())
    assert inc.ip == "5.188.62.0/24"
    assert inc.regla == "distribuido"
    assert inc.fallos == 30


def test_pocas_ips_no_es_distribuido():
    # 20 fallos, pero de solo 2 IPs: eso ya lo cubren las reglas por IP
    intentos = fallos("5.188.62.1", 10, 20) + fallos("5.188.62.2", 10, 20)
    assert detectar_distribuidos(intentos) == []


def test_redes_distintas_no_se_suman():
    intentos = _botnet("5.188.62", ips=4) + _botnet("5.188.63", ips=4)
    assert detectar_distribuidos(intentos) == []


def test_redes_privadas_se_ignoran():
    assert detectar_distribuidos(_botnet("192.168.1")) == []


def test_fallos_muy_separados_no_alertan():
    intentos = []
    for n in range(10):
        intentos += fallos(f"5.188.62.{10 + n}", 3, 20, desde=T0 + timedelta(hours=n))
    assert detectar_distribuidos(intentos) == []


def test_log_de_ejemplo_tiene_el_ataque_distribuido():
    from pathlib import Path
    from centinela.parser import analizar_lineas
    ruta = Path(__file__).parent.parent / "logs" / "auth.log"
    intentos = list(analizar_lineas(ruta.read_text().splitlines(), anio=2026))
    redes = [i.ip for i in detectar_distribuidos(intentos)]
    assert redes == ["5.188.62.0/24"]
