"""
preparar_laboratorio.py — Recrea en tu máquina los archivos de listado.txt
con los MISMOS permisos, para que practiques con `ls -l`, `stat` y `find`.

Solo funciona en Linux/macOS. No necesita ser root: los archivos serán tuyos
(no de root), pero los bits de permiso (incluidos SUID, SGID y sticky) sí
serán idénticos a los del listado.

Uso (desde esta carpeta):
    python3 preparar_laboratorio.py
    → crea la carpeta ./laboratorio/

Para borrarlo después:
    rm -rf laboratorio
"""

import os
import re
import stat
from pathlib import Path

AQUI = Path(__file__).resolve().parent
LISTADO = AQUI / "listado.txt"
DESTINO = AQUI / "laboratorio"

ESPECIALES = {  # posición de la x → (bit especial, bit de ejecución)
    3: (stat.S_ISUID, stat.S_IXUSR),
    6: (stat.S_ISGID, stat.S_IXGRP),
    9: (stat.S_ISVTX, stat.S_IXOTH),
}
NORMALES = [stat.S_IRUSR, stat.S_IWUSR, stat.S_IXUSR,
            stat.S_IRGRP, stat.S_IWGRP, stat.S_IXGRP,
            stat.S_IROTH, stat.S_IWOTH, stat.S_IXOTH]


def texto_a_modo(letras):
    """'-rwsr-xr-x' → 0o4755"""
    modo = 0
    for i, c in enumerate(letras[1:10], start=1):
        if c in "rwx":
            modo |= NORMALES[i - 1]
        elif c in "st":
            especial, ejecucion = ESPECIALES[i]
            modo |= especial | ejecucion
        elif c in "ST":
            modo |= ESPECIALES[i][0]
    return modo


def main():
    carpeta = None
    creados = 0
    for linea in LISTADO.read_text(encoding="utf-8").splitlines():
        if linea.startswith("/srv/sistema/") and linea.endswith(":"):
            carpeta = DESTINO / linea[len("/srv/sistema/"):-1]
            continue
        m = re.match(r"^([d-][rwxsStT-]{9})\s+\S+\s+\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.+)$", linea)
        if not m or carpeta is None:
            continue
        letras, nombre = m.groups()
        ruta = carpeta / nombre
        ruta.parent.mkdir(parents=True, exist_ok=True)
        if letras[0] == "d":
            ruta.mkdir(exist_ok=True)
        else:
            ruta.write_text(f"# archivo de práctica: {nombre}\n", encoding="utf-8")
        os.chmod(ruta, texto_a_modo(letras))
        creados += 1

    print(f"Laboratorio creado en {DESTINO} ({creados} entradas).")
    print("Prueba por ejemplo:  ls -lR laboratorio   o   find laboratorio -perm -4000")


if __name__ == "__main__":
    main()
