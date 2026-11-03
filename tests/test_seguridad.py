"""
Tests de seguridad: uno (o más) por cada vulnerabilidad de la auditoría.

Cada test reproduce el ATAQUE y comprueba que ya no funciona. Con el código
anterior a la auditoría, todos fallaban (está documentado en SEGURIDAD.md).
Solo usan la interfaz pública de Centinela, para poder ejecutarlos también
contra versiones antiguas.
"""

import os
import stat
import sys
import time
from datetime import datetime, timedelta

import pytest

from centinela import lista_negra, reporte
from centinela.cli import main
from centinela.detector import Regla, detectar
from centinela.parser import Intento, analizar_linea, analizar_lineas

PREFIJO = "Nov  2 03:12:05 srv-web01 sshd[4242]: "
ATACANTE = "203.0.113.5"
RAFAGA = [Regla("rafaga", 5, timedelta(seconds=60))]


def linea_fallo(usuario, ip=ATACANTE, segundo=5, invalido=True):
    quien = f"invalid user {usuario}" if invalido else usuario
    return f"Nov  2 03:12:{segundo:02d} srv-web01 sshd[4242]: Failed password for {quien} from {ip} port 51234 ssh2"


# ---------------------------------------------------------------- V1 · ALTA
# Inyección en el log: el usuario contiene "from <IP falsa> port N".

def test_v1_usuario_con_ip_falsa_no_engana_al_parser():
    intento = analizar_linea(linea_fallo("x from 8.8.8.8 port 1"), anio=2026)
    assert intento.ip == ATACANTE
    assert intento.usuario == "x from 8.8.8.8 port 1"


def test_v1_la_cola_ssh2_tampoco_engana():
    intento = analizar_linea(linea_fallo("x from 8.8.8.8 port 1 ssh2: y"), anio=2026)
    assert intento.ip == ATACANTE


def test_v1_no_se_puede_meter_en_la_lista_negra_a_un_inocente(tmp_path):
    # 10 fallos en pocos segundos que intentan culpar a 8.8.8.8
    lineas = [linea_fallo("x from 8.8.8.8 port 1", segundo=s) for s in range(10)]
    incidentes = detectar(analizar_lineas(lineas, anio=2026), RAFAGA)
    bloquear = lista_negra.ips_a_bloquear(incidentes)
    assert list(bloquear) == [ATACANTE]


# ---------------------------------------------------------------- V2 · ALTA
# Evasión: un usuario con espacios hacía que la línea se ignorase entera.

def test_v2_usuario_con_espacios_no_esconde_el_ataque():
    lineas = [linea_fallo("a b", segundo=s) for s in range(10)]
    intentos = list(analizar_lineas(lineas, anio=2026))
    assert len(intentos) == 10
    (incidente,) = detectar(intentos, RAFAGA)
    assert incidente.ip == ATACANTE


def test_v2_las_lineas_normales_siguen_funcionando():
    clave = PREFIJO + "Accepted publickey for deploy from 10.0.0.50 port 41000 ssh2: ED25519 SHA256:q3Xb8kR0vNfY2mZ1"
    assert analizar_linea(clave, anio=2026).usuario == "deploy"
    assert analizar_linea(linea_fallo("root", invalido=False), anio=2026).usuario_valido


# ---------------------------------------------------------------- V3 · MEDIA
# Inyección de comandos en bloquear.sh con una IPv6 con "zona".

def test_v3_ipv6_con_zona_no_llega_al_script():
    with pytest.raises(ValueError):
        lista_negra.script_firewall(["fe80::1%;reboot;"])


def test_v3_lista_negra_manipulada_no_inyecta_comandos(tmp_path):
    ruta = tmp_path / "lista_negra.txt"
    ruta.write_text("fe80::1%;reboot;  # metido a mano\n198.51.100.7\n")
    entradas = lista_negra.cargar(ruta)
    assert entradas == {"198.51.100.7": ""}
    script = lista_negra.script_firewall(entradas)
    assert "reboot" not in script and script.count("iptables -I") == 1


# ---------------------------------------------------------------- V4 · MEDIA
# Un usuario con sintaxis de fórmula de matplotlib tumbaba el reporte,
# y como `todo` hacía el reporte antes que la lista negra, nadie se bloqueaba.

def _intentos(usuario, ip="198.51.100.9", n=10):
    t0 = datetime(2026, 11, 2, 3, 0, 0)
    return [Intento(t0 + timedelta(seconds=i), ip, usuario, False) for i in range(n)]


def test_v4_usuario_mathtext_no_rompe_el_reporte(tmp_path):
    intentos = _intentos(r"$\mathcal{$")
    rutas = reporte.generar_reporte(intentos, detectar(intentos), tmp_path / "rep")
    assert rutas["usuarios"].exists()


def test_v4_todo_bloquea_aunque_el_reporte_falle(tmp_path, monkeypatch):
    log = tmp_path / "auth.log"
    log.write_text("\n".join(linea_fallo("root", segundo=s, invalido=False) for s in range(10)) + "\n")

    def roto(*args, **kwargs):
        raise ValueError("reporte roto a propósito")

    monkeypatch.setattr(reporte, "generar_reporte", roto)
    lista = tmp_path / "lista_negra.txt"
    main(["todo", str(log), "--anio", "2026", "--carpeta", str(tmp_path / "rep"),
          "--lista", str(lista), "--script", str(tmp_path / "b.sh")])
    assert ATACANTE in lista.read_text()


# ---------------------------------------------------------------- V5 · MEDIA
# Inyección de fórmulas en los CSV del reporte.

@pytest.mark.parametrize("usuario", ['=HYPERLINK("http://malo")', "+cmd|' /C calc'!A0", "-2+3", "@SUM(1)"])
def test_v5_csv_no_contiene_formulas(tmp_path, usuario):
    intentos = _intentos(usuario)
    rutas = reporte.generar_reporte(intentos, detectar(intentos), tmp_path / "rep")
    import pandas as pd

    for clave in ("intentos_csv", "incidentes_csv"):
        tabla = pd.read_csv(rutas[clave], dtype=str, keep_default_na=False)
        for valor in tabla.to_numpy().ravel():
            assert not valor.startswith(("=", "+", "-", "@")) or valor[:4].isdigit(), (clave, valor)


# ---------------------------------------------------------------- V6 · MEDIA
# Denegación de servicio: el detector era cuadrático con muchas ráfagas.

def test_v6_detector_escala_con_muchas_rafagas():
    t0 = datetime(2026, 1, 1)
    intentos = [Intento(t0 + timedelta(seconds=b * 600 + i), "198.51.100.9", "root", False)
                for b in range(8000) for i in range(5)]
    inicio = time.perf_counter()
    incidentes = detectar(intentos)
    assert len(incidentes) == 8000
    assert time.perf_counter() - inicio < 3  # antes: ~15 s


# ---------------------------------------------------------------- V7 · BAJA
# Secuencias de escape de terminal en el nombre de usuario.

def test_v7_escapes_de_terminal_se_muestran_como_texto(tmp_path, capsys):
    malo = "\x1b[2J\x1b[31mhola"
    intento = analizar_linea(linea_fallo(malo), anio=2026)
    assert "\x1b" not in intento.usuario and "\\x1b" in intento.usuario
    log = tmp_path / "auth.log"
    log.write_text(linea_fallo(malo) + "\n")
    main(["intentos", str(log), "--anio", "2026"])
    assert "\x1b" not in capsys.readouterr().out


# ---------------------------------------------------------------- V8 · BAJA
# Una sola línea con fecha imposible detenía todo el análisis.

def test_v8_fecha_imposible_no_detiene_el_analisis():
    lineas = [linea_fallo("root").replace("Nov  2", "Nov 31"), linea_fallo("root", segundo=6)]
    assert len(list(analizar_lineas(lineas, anio=2026))) == 1


def test_v8_linea_gigante_se_descarta_rapido():
    gigante = PREFIJO + "Failed password for invalid user " + " from 1.1.1.1 port 1" * 5000 + " z"
    inicio = time.perf_counter()
    assert analizar_linea(gigante, anio=2026) is None
    assert time.perf_counter() - inicio < 0.5


# ---------------------------------------------------------------- V9 · BAJA
# Archivos que ejecutará root: permisos privados y escritura atómica.

@pytest.mark.skipif(sys.platform == "win32", reason="permisos POSIX")
def test_v9_lista_y_script_solo_para_su_dueno(tmp_path):
    lista, script = tmp_path / "lista_negra.txt", tmp_path / "bloquear.sh"
    lista_negra.guardar(lista, {"198.51.100.7": "prueba"})
    lista_negra.escribir_script(script, ["198.51.100.7"])
    for ruta in (lista, script):
        assert stat.S_IMODE(os.stat(ruta).st_mode) == 0o600


def test_v9_un_motivo_no_puede_inventar_lineas(tmp_path):
    ruta = tmp_path / "lista_negra.txt"
    lista_negra.guardar(ruta, {"198.51.100.7": "motivo\n6.6.6.6  # colado"})
    assert set(lista_negra.cargar(ruta)) == {"198.51.100.7"}
