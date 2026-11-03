"""Tests de la Fase 4: lista negra y script de firewall."""

from datetime import timedelta

import pytest

from centinela import lista_negra
from centinela.detector import Regla, detectar
from conftest import fallos

RAFAGA = [Regla("rafaga", 5, timedelta(seconds=60))]


def incidentes_de(*ips):
    intentos = [f for ip in ips for f in fallos(ip, 10, 1)]
    return detectar(intentos, RAFAGA)


def test_redes_privadas_no_se_bloquean_por_defecto():
    bloquear = lista_negra.ips_a_bloquear(incidentes_de("8.8.4.4", "192.168.1.22", "10.0.0.8"))
    assert list(bloquear) == ["8.8.4.4"]


def test_lista_blanca_con_cidr():
    bloquear = lista_negra.ips_a_bloquear(incidentes_de("203.0.113.9", "8.8.4.4"), ["203.0.113.0/24"])
    assert list(bloquear) == ["8.8.4.4"]


def test_lista_blanca_invalida_avisa():
    with pytest.raises(ValueError):
        lista_negra.esta_permitida("8.8.4.4", ["esto-no-es-una-red"])


def test_actualizar_fusiona_sin_duplicar(tmp_path):
    ruta = tmp_path / "lista_negra.txt"
    nuevas, total = lista_negra.actualizar(ruta, incidentes_de("8.8.4.4"))
    assert nuevas == ["8.8.4.4"]
    nuevas, total = lista_negra.actualizar(ruta, incidentes_de("8.8.4.4", "1.2.3.4"))
    assert nuevas == ["1.2.3.4"]
    assert set(lista_negra.cargar(ruta)) == {"8.8.4.4", "1.2.3.4"}
    assert ruta.read_text().count("8.8.4.4") == 1


def test_cargar_tolera_lineas_raras(tmp_path):
    ruta = tmp_path / "lista.txt"
    ruta.write_text("# comentario\n\n5.5.5.5  # a mano\nno-es-ip\n6.6.6.6\n")
    assert lista_negra.cargar(ruta) == {"5.5.5.5": "a mano", "6.6.6.6": ""}


def test_cargar_archivo_inexistente(tmp_path):
    assert lista_negra.cargar(tmp_path / "no-existe.txt") == {}


def test_script_firewall_es_idempotente_y_seguro():
    texto = lista_negra.script_firewall(["8.8.4.4"])
    assert "iptables -C INPUT -s 8.8.4.4 -j DROP" in texto
    assert "|| iptables -I INPUT -s 8.8.4.4 -j DROP" in texto
    with pytest.raises(ValueError):
        lista_negra.script_firewall(["1.2.3.4; rm -rf /"])  # nunca se cuela un comando
