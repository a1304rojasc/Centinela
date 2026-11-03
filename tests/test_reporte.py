"""Tests de la Fase 3: pandas y matplotlib."""

from datetime import timedelta

from centinela import reporte
from centinela.detector import detectar
from centinela.parser import leer_log
from conftest import T0, exito, fallos


def test_dataframe_y_resumen():
    intentos = fallos("1.1.1.1", 6, 1) + [exito("1.1.1.1", T0 + timedelta(minutes=5)), exito("2.2.2.2", T0)]
    df = reporte.a_dataframe(intentos)
    assert list(df.columns) == reporte.COLUMNAS and len(df) == 8
    resumen = reporte.resumen_por_ip(df)
    assert resumen.index[0] == "1.1.1.1"  # la de más fallos, primero
    fila = resumen.loc["1.1.1.1"]
    assert (fila.intentos, fila.fallos, fila.exitos, fila.tasa_fallo) == (7, 6, 1, round(6 / 7, 3))


def test_sin_intentos_no_falla():
    df = reporte.a_dataframe([])
    assert df.empty and reporte.resumen_por_ip(df).empty


def test_reporte_completo(log_ejemplo, tmp_path):
    intentos = leer_log(log_ejemplo, anio=2026)
    rutas = reporte.generar_reporte(intentos, detectar(intentos), tmp_path / "rep")
    for ruta in rutas.values():
        assert ruta.exists() and ruta.stat().st_size > 0
    with open(rutas["top_ips"], "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n"  # firma de un PNG de verdad
    texto = rutas["markdown"].read_text()
    assert "45.134.26.89" in texto and "linea_tiempo.png" in texto
