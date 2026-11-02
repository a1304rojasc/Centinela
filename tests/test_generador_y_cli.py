"""Tests del generador y de la línea de comandos de principio a fin."""

from centinela import generador
from centinela.cli import main


def test_misma_semilla_mismo_log():
    assert generador.generar_lineas(semilla=7) == generador.generar_lineas(semilla=7)
    assert generador.generar_lineas(semilla=7) != generador.generar_lineas(semilla=8)


def test_lineas_ordenadas_y_formato_iso():
    lineas = generador.generar_lineas(formato="iso", dias=2)
    fechas = [linea.split(" ")[0] for linea in lineas]
    assert fechas == sorted(fechas)  # en ISO, ordenar el texto de la fecha = ordenar por tiempo
    assert lineas[0].startswith("2026-11-02T")


def test_cli_todo(tmp_path, capsys):
    log = tmp_path / "auth.log"
    assert main(["generar", "--salida", str(log)]) == 0
    assert main(["todo", str(log), "--anio", "2026", "--carpeta", str(tmp_path / "rep"),
                 "--lista", str(tmp_path / "ln.txt"), "--script", str(tmp_path / "b.sh")]) == 0
    salida = capsys.readouterr().out
    assert "COMPROMISO" in salida and "45.134.26.89" in salida
    assert (tmp_path / "b.sh").read_text().count("iptables -I") == 3
