"""
verificar.py — Comprueba si tu flag del reto 08-permisos-linux es correcta.

Uso:
    python3 verificar.py "CENTINELA{...}"
    python3 verificar.py            (te la pedirá por teclado)

¿Por qué guardamos un hash y no la flag? Porque así este archivo no te
revela la respuesta: SHA-256 es de un solo sentido. (Lo aprenderás en el reto 04.)
"""

import hashlib
import sys

HASH_FLAG = "5961d20b84ba92a469893d55f645ff9f578aff5731022a83512f25e4dc0c74c1"


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
    if not (intento.startswith("CENTINELA{") and intento.endswith("}")):
        print("   Recuerda el formato: CENTINELA{...} (en mayúsculas, con llaves).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
