"""Tests de la Fase 2: detección por ventana de tiempo."""

from datetime import timedelta

import pytest

from centinela.detector import Regla, detectar
from conftest import T0, exito, fallos

RAFAGA = [Regla("rafaga", 5, timedelta(seconds=60))]


def test_justo_en_el_umbral_alerta():
    # 5 fallos separados 15 s: del primero al quinto pasan 60 s -> dentro.
    (inc,) = detectar(fallos("1.1.1.1", 5, 15), RAFAGA)
    assert inc.fallos == 5 and inc.duracion == timedelta(seconds=60)


def test_por_debajo_del_umbral_no_alerta():
    assert detectar(fallos("1.1.1.1", 4, 1), RAFAGA) == []


def test_fallos_demasiado_separados_no_alertan():
    # 5 fallos en 64 s: nunca caben 5 en una ventana de 60 s.
    assert detectar(fallos("1.1.1.1", 5, 16), RAFAGA) == []


def test_los_exitos_no_cuentan_como_fallos():
    intentos = fallos("1.1.1.1", 4, 1) + [exito("1.1.1.1", T0 + timedelta(seconds=2))]
    assert detectar(intentos, RAFAGA) == []


def test_cada_ip_se_cuenta_por_separado():
    intentos = fallos("1.1.1.1", 3, 1) + fallos("2.2.2.2", 3, 1)
    assert detectar(intentos, RAFAGA) == []


def test_rafaga_larga_es_un_solo_incidente():
    (inc,) = detectar(fallos("1.1.1.1", 100, 2), RAFAGA)
    assert inc.fallos == 100


def test_dos_rafagas_separadas_son_dos_incidentes():
    intentos = fallos("1.1.1.1", 6, 1) + fallos("1.1.1.1", 6, 1, desde=T0 + timedelta(hours=1))
    assert len(detectar(intentos, RAFAGA)) == 2


def test_ataque_lento_solo_lo_ve_la_regla_sostenida():
    lento = fallos("3.3.3.3", 30, 120)  # uno cada 2 minutos
    assert detectar(lento, RAFAGA) == []
    (inc,) = detectar(lento)  # reglas por defecto
    assert inc.regla == "sostenido"


def test_ataque_rapido_no_se_duplica_con_la_regla_sostenida():
    (inc,) = detectar(fallos("1.1.1.1", 50, 1))
    assert inc.regla == "rafaga"


def test_login_tras_el_ataque_es_compromiso():
    intentos = fallos("1.1.1.1", 10, 1) + [exito("1.1.1.1", T0 + timedelta(seconds=30), "test")]
    (inc,) = detectar(intentos, RAFAGA)
    assert inc.comprometido and inc.usuario_exito == "test"
    assert "ENTRÓ" in inc.describir()


def test_login_antes_del_ataque_no_es_compromiso():
    intentos = [exito("1.1.1.1", T0 - timedelta(hours=1))] + fallos("1.1.1.1", 10, 1)
    (inc,) = detectar(intentos, RAFAGA)
    assert not inc.comprometido


def test_el_orden_de_entrada_no_importa():
    intentos = fallos("1.1.1.1", 10, 1)
    assert detectar(list(reversed(intentos)), RAFAGA)[0].fallos == 10


@pytest.mark.parametrize("umbral, segundos", [(0, 60), (5, 0)])
def test_reglas_invalidas(umbral, segundos):
    with pytest.raises(ValueError):
        Regla("mala", umbral, timedelta(seconds=segundos))


def test_escenario_generado(log_ejemplo):
    """Sobre el log de ejemplo: los 3 atacantes, ningún usuario legítimo,
    la botnet NO (limitación conocida) y un compromiso."""
    from centinela import generador
    from centinela.parser import leer_log

    incidentes = detectar(leer_log(log_ejemplo, anio=2026))
    ips = {i.ip for i in incidentes}
    assert ips == {generador.ATACANTE_RAFAGA, generador.ATACANTE_ENUMERACION, generador.ATACANTE_LENTO}
    assert [i.ip for i in incidentes if i.comprometido] == [generador.ATACANTE_ENUMERACION]
