"""
generar_retos.py — Regenera los archivos de los 10 retos del mini CTF.

⚠️  ESTE ARCHIVO CONTIENE TODAS LAS FLAGS EN TEXTO PLANO.
    Es una herramienta para quien organiza el CTF, no para quien lo juega.

Todo es determinista (semillas y fechas fijas): ejecutarlo dos veces produce
exactamente los mismos archivos. Solo necesitas ejecutarlo si cambias una flag
o quieres modificar un reto; los archivos ya vienen generados en el repositorio.

Uso (desde la raíz del repositorio):
    python3 ctf/herramientas/generar_retos.py

Requiere: Pillow (pip install pillow) para el reto 07.
"""

import base64
import hashlib
import io
import random
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

CTF = Path(__file__).resolve().parent.parent

FLAGS = {
    "01-bienvenida-base64": "CENTINELA{b4s3_64_n0_3s_c1fr4r}",
    "02-cifrado-cesar": "CENTINELA{julio_cesar_estaria_orgulloso}",
    "03-vigenere": "CENTINELA{vigenere_cae_con_texto_conocido}",
    "04-hashes": "CENTINELA{mariposa77}",
    "05-analisis-logs": "CENTINELA{198.51.100.23_soporte}",
    "06-magic-bytes": "CENTINELA{l0s_m4g1c_byt3s_n0_m13nt3n}",
    "07-esteganografia": "CENTINELA{lo_que_ves_no_es_todo}",
    "08-permisos-linux": "CENTINELA{respaldo_nocturno.sh_4777}",
    "09-sqli-login": "CENTINELA{admin_sin_contrasena}",
    "10-sqli-union": "CENTINELA{union_select_abre_la_boveda}",
}


def sha256(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def escribir(ruta, contenido, binario=False):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    if binario:
        ruta.write_bytes(contenido)
    else:
        ruta.write_text(contenido, encoding="utf-8")
    print(f"  escrito {ruta.relative_to(CTF)}")


# --------------------------------------------------------------------------
# verificar.py (igual en todos los retos, solo cambia el hash)
# --------------------------------------------------------------------------

PLANTILLA_VERIFICADOR = '''"""
verificar.py — Comprueba si tu flag del reto {reto} es correcta.

Uso:
    python3 verificar.py "CENTINELA{{...}}"
    python3 verificar.py            (te la pedirá por teclado)

¿Por qué guardamos un hash y no la flag? Porque así este archivo no te
revela la respuesta: SHA-256 es de un solo sentido. (Lo aprenderás en el reto 04.)
"""

import hashlib
import sys

HASH_FLAG = "{hash}"


def main():
    if len(sys.argv) > 1:
        intento = sys.argv[1]
    else:
        intento = input("Escribe tu flag: ")
    intento = intento.strip()

    if hashlib.sha256(intento.encode("utf-8")).hexdigest() == HASH_FLAG:
        print("✅ ¡Correcto! Flag válida. Sigue con el siguiente reto.")
        return 0

    print("❌ Esa no es la flag.")
    if not (intento.startswith("CENTINELA{{") and intento.endswith("}}")):
        print("   Recuerda el formato: CENTINELA{{...}} (en mayúsculas, con llaves).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
'''


def generar_verificadores():
    for reto, flag in FLAGS.items():
        codigo = PLANTILLA_VERIFICADOR.format(reto=reto, hash=sha256(flag))
        escribir(CTF / reto / "verificar.py", codigo)


# --------------------------------------------------------------------------
# 01 — Base64
# --------------------------------------------------------------------------

def reto01():
    mensaje = (
        "Bienvenido/a al CTF de Centinela.\n"
        "Si puedes leer esto, ya sabes que Base64 NO es cifrado: es solo una\n"
        "forma de representar bytes con letras. Cualquiera puede revertirlo.\n"
        f"Tu primera flag es: {FLAGS['01-bienvenida-base64']}\n"
    )
    codificado = base64.b64encode(mensaje.encode("utf-8")).decode("ascii")
    # Partimos en líneas de 76 caracteres, como hace la herramienta `base64`.
    lineas = [codificado[i:i + 76] for i in range(0, len(codificado), 76)]
    escribir(CTF / "01-bienvenida-base64" / "archivos" / "mensaje.txt", "\n".join(lineas) + "\n")


# --------------------------------------------------------------------------
# 02 — César
# --------------------------------------------------------------------------

def cesar(texto, desplazamiento):
    resultado = []
    for c in texto:
        if "a" <= c <= "z":
            resultado.append(chr((ord(c) - 97 + desplazamiento) % 26 + 97))
        elif "A" <= c <= "Z":
            resultado.append(chr((ord(c) - 65 + desplazamiento) % 26 + 65))
        else:
            resultado.append(c)
    return "".join(resultado)


def reto02():
    claro = (
        "Mensaje interceptado del general a sus tropas:\n"
        "Atacaremos al amanecer por el flanco norte. Nadie debe saberlo.\n"
        f"Codigo de confirmacion: {FLAGS['02-cifrado-cesar']}\n"
    )
    escribir(CTF / "02-cifrado-cesar" / "archivos" / "interceptado.txt", cesar(claro, 11))


# --------------------------------------------------------------------------
# 03 — Vigenère
# --------------------------------------------------------------------------

def vigenere(texto, clave, descifrar=False):
    resultado = []
    i = 0
    for c in texto:
        if c.isascii() and c.isalpha():
            k = ord(clave[i % len(clave)].upper()) - 65
            if descifrar:
                k = -k
            base = 65 if c.isupper() else 97
            resultado.append(chr((ord(c) - base + k) % 26 + base))
            i += 1  # la clave solo avanza con letras
        else:
            resultado.append(c)
    return "".join(resultado)


def reto03():
    # La flag va AL PRINCIPIO: así el texto conocido "CENTINELA" revela la clave.
    claro = (
        f"{FLAGS['03-vigenere']}\n"
        "Si estas leyendo esto, rompiste Vigenere con un ataque de texto conocido.\n"
        "Durante siglos lo llamaron le chiffre indechiffrable. No lo era.\n"
    )
    escribir(CTF / "03-vigenere" / "archivos" / "cifrado.txt", vigenere(claro, "HALCON"))


# --------------------------------------------------------------------------
# 04 — Hashes
# --------------------------------------------------------------------------

def reto04():
    rng = random.Random(4)
    palabras = [
        "123456", "password", "qwerty", "admin", "letmein", "bienvenido", "contrasena",
        "futbol", "superman", "batman", "dragon", "monkey", "iloveyou", "princesa",
        "mariposa", "tequiero", "estrella", "corazon", "chocolate", "america",
        "barcelona", "realmadrid", "pokemon", "naruto", "minecraft", "fortnite",
        "sol", "luna", "gato", "perro", "tigre", "leon", "aguila", "halcon",
    ]
    diccionario = set(palabras)
    for p in palabras:
        for sufijo in ["1", "12", "123", "2024", "2025", "77", "!"]:
            diccionario.add(p + sufijo)
    diccionario = sorted(diccionario)
    rng.shuffle(diccionario)
    escribir(CTF / "04-hashes" / "archivos" / "diccionario.txt", "\n".join(diccionario) + "\n")

    def md5(t):
        return hashlib.md5(t.encode()).hexdigest()

    usuarios = [
        ("ana", md5("gato123")),
        ("luis", md5("realmadrid2025")),
        ("admin", md5("mariposa77")),  # la contraseña de admin ES la flag
        ("invitado", md5("bienvenido")),
        # Esta no está en el diccionario: así aprendes que no todo se rompe.
        ("soporte", md5("Xk9#vT2!qLm8")),
    ]
    contenido = "# volcado de la tabla usuarios (usuario:hash)\n"
    contenido += "".join(f"{u}:{h}\n" for u, h in usuarios)
    escribir(CTF / "04-hashes" / "archivos" / "volcado.txt", contenido)


# --------------------------------------------------------------------------
# 05 — Análisis de logs SSH
# --------------------------------------------------------------------------

def reto05():
    rng = random.Random(5)
    host = "srv-web01"
    t = datetime(2026, 11, 1, 0, 0, 0)
    pid = 20000
    lineas = []

    def linea(momento, texto):
        nonlocal pid
        pid += rng.randint(1, 40)
        lineas.append((momento, f"{momento:%b %e %H:%M:%S} {host} sshd[{pid}]: {texto}"))

    legitimos = [("maria", "192.168.1.15"), ("jorge", "192.168.1.22"), ("deploy", "10.0.0.5")]
    # Actividad normal durante el día
    for _ in range(140):
        momento = t + timedelta(seconds=rng.randint(0, 86399))
        usuario, ip = rng.choice(legitimos)
        puerto = rng.randint(40000, 65000)
        if rng.random() < 0.15:
            linea(momento, f"Failed password for {usuario} from {ip} port {puerto} ssh2")
            momento += timedelta(seconds=rng.randint(3, 20))
        linea(momento, f"Accepted password for {usuario} from {ip} port {puerto} ssh2")

    # Ruido
    for _ in range(80):
        momento = t + timedelta(seconds=rng.randint(0, 86399))
        texto = rng.choice([
            "pam_unix(sshd:session): session closed for user maria",
            "pam_unix(sshd:session): session closed for user jorge",
            "Received disconnect from 192.168.1.22 port 51234:11: disconnected by user",
            "Server listening on 0.0.0.0 port 22.",
            "Connection closed by 45.155.205.9 port 39822 [preauth]",
        ])
        linea(momento, texto)

    # Atacante 1: fuerza bruta que FRACASA (distractor)
    momento = t + timedelta(hours=3, minutes=12)
    for _ in range(120):
        usuario = rng.choice(["root", "admin", "test", "oracle", "ubuntu", "pi"])
        if usuario in ("root", "admin", "ubuntu"):
            linea(momento, f"Failed password for {usuario} from 45.155.205.9 port {rng.randint(30000, 60000)} ssh2")
        else:
            linea(momento, f"Failed password for invalid user {usuario} from 45.155.205.9 port {rng.randint(30000, 60000)} ssh2")
        momento += timedelta(seconds=rng.randint(1, 3))

    # Atacante 2: fuerza bruta que TIENE ÉXITO con el usuario "soporte"
    momento = t + timedelta(hours=14, minutes=47)
    for _ in range(85):
        usuario = rng.choice(["root", "soporte", "admin", "soporte", "backup"])
        if usuario == "backup":
            linea(momento, f"Failed password for invalid user backup from 198.51.100.23 port {rng.randint(30000, 60000)} ssh2")
        else:
            linea(momento, f"Failed password for {usuario} from 198.51.100.23 port {rng.randint(30000, 60000)} ssh2")
        momento += timedelta(seconds=rng.randint(1, 4))
    linea(momento, f"Accepted password for soporte from 198.51.100.23 port {rng.randint(30000, 60000)} ssh2")
    linea(momento + timedelta(seconds=1), "pam_unix(sshd:session): session opened for user soporte(uid=1003) by (uid=0)")

    lineas.sort(key=lambda par: par[0])
    escribir(CTF / "05-analisis-logs" / "archivos" / "auth.log", "\n".join(l for _, l in lineas) + "\n")


# --------------------------------------------------------------------------
# 06 — Magic bytes
# --------------------------------------------------------------------------

def reto06():
    nota = (
        "Informe confidencial\n"
        "====================\n"
        "La extension de un archivo es solo parte de su nombre: no dice nada\n"
        "de lo que hay dentro. Lo que manda son los primeros bytes (magic bytes).\n\n"
        f"Flag: {FLAGS['06-magic-bytes']}\n"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo("secreto/nota.txt", date_time=(2026, 11, 1, 9, 30, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, nota)
    escribir(CTF / "06-magic-bytes" / "archivos" / "informe_final.txt", buffer.getvalue(), binario=True)


# --------------------------------------------------------------------------
# 07 — Esteganografía LSB
# --------------------------------------------------------------------------

def reto07():
    from PIL import Image

    ancho, alto = 320, 200
    img = Image.new("RGB", (ancho, alto))
    px = img.load()
    # Un "atardecer": degradado de cielo, un sol y montañas.
    for y in range(alto):
        for x in range(ancho):
            if (x - 230) ** 2 + (y - 80) ** 2 < 28 ** 2:
                color = (255, 210, 90)
            elif y > 130 + 25 * abs(((x / 40) % 2) - 1):
                color = (40 + y // 10, 70 + y // 8, 50)
            else:
                color = (255 - y // 2, 120 + y // 3, 90 + y // 2)
            px[x, y] = color

    # Ocultamos la flag en el bit menos significativo del canal ROJO,
    # recorriendo la imagen fila por fila. Cada byte se guarda del bit más
    # significativo al menos significativo y al final va un byte 0 (fin).
    datos = FLAGS["07-esteganografia"].encode() + b"\x00"
    bits = [(b >> (7 - i)) & 1 for b in datos for i in range(8)]
    for n, bit in enumerate(bits):
        x, y = n % ancho, n // ancho
        r, g, b = px[x, y]
        px[x, y] = ((r & ~1) | bit, g, b)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=False)
    escribir(CTF / "07-esteganografia" / "archivos" / "atardecer.png", buffer.getvalue(), binario=True)


# --------------------------------------------------------------------------
# 08 — Permisos en Linux
# --------------------------------------------------------------------------

# (ruta, permisos octales, propietario, grupo, tamaño)
ARCHIVOS_RETO08 = [
    ("bin/limpiar_cache.sh", 0o755, "root", "root", 812),
    ("bin/rotar_logs.sh", 0o750, "root", "adm", 1430),
    ("bin/respaldo_nocturno.sh", 0o4777, "root", "root", 2210),  # ← el peligroso
    ("bin/actualizar.sh", 0o4755, "root", "root", 990),         # SUID pero no escribible
    ("bin/monitor.py", 0o775, "deploy", "deploy", 3021),        # escribible por grupo
    ("bin/herramienta", 0o2755, "root", "staff", 15872),        # SGID
    ("compartido/notas.txt", 0o666, "maria", "maria", 340),     # escribible por todos, pero no SUID
    ("compartido/tmp_subidas", 0o1777, "root", "root", 4096),   # sticky bit (directorio)
    ("config/app.conf", 0o640, "root", "www-data", 520),
    ("config/claves.env", 0o600, "root", "root", 128),
    ("config/publico.conf", 0o644, "root", "root", 77),
    ("home/jorge/.bashrc", 0o644, "jorge", "jorge", 3771),
]


def modo_a_texto(modo, es_dir):
    letras = "d" if es_dir else "-"
    for i, (r, w, x) in enumerate([(0o400, 0o200, 0o100), (0o40, 0o20, 0o10), (0o4, 0o2, 0o1)]):
        letras += "r" if modo & r else "-"
        letras += "w" if modo & w else "-"
        especial = [0o4000, 0o2000, 0o1000][i]
        if modo & especial:
            letra = "t" if i == 2 else "s"  # SUID/SGID → s, sticky → t
            letras += letra if modo & x else letra.upper()
        else:
            letras += "x" if modo & x else "-"
    return letras


def reto08():
    lineas = ["# Salida de: ls -lR /srv/sistema   (capturada en el servidor comprometido)", ""]
    por_dir = {}
    for ruta, modo, usr, grp, tam in ARCHIVOS_RETO08:
        carpeta, nombre = ruta.rsplit("/", 1)
        por_dir.setdefault(carpeta, []).append((nombre, modo, usr, grp, tam))
    for carpeta in sorted(por_dir):
        lineas.append(f"/srv/sistema/{carpeta}:")
        for nombre, modo, usr, grp, tam in sorted(por_dir[carpeta]):
            es_dir = nombre == "tmp_subidas"
            lineas.append(f"{modo_a_texto(modo, es_dir)} 1 {usr:<6} {grp:<8} {tam:>6} nov  1 03:00 {nombre}")
        lineas.append("")
    escribir(CTF / "08-permisos-linux" / "archivos" / "listado.txt", "\n".join(lineas))


# --------------------------------------------------------------------------

def main():
    print("Generando archivos del CTF…")
    generar_verificadores()
    reto01()
    reto02()
    reto03()
    reto04()
    reto05()
    reto06()
    reto07()
    reto08()
    print("Listo. (Los retos 09 y 10 usan la app Flask: ctf/app-vulnerable/app.py)")


if __name__ == "__main__":
    main()
