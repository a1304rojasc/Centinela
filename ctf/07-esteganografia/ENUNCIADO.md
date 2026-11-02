# Reto 07 — Un atardecer sospechoso

**Categoría:** Esteganografía · **Dificultad:** ⭐⭐⭐☆☆ · **Archivos:** `archivos/atardecer.png`

Interceptamos esta imagen en un correo entre dos sospechosos. Parece un
atardecer cualquiera. Los metadatos están limpios, `strings` no muestra nada
útil y no hay archivos pegados al final.

Pero nuestro informante insiste: *"el mensaje está en los píxeles; en el rojo,
en lo más pequeño"*.

## Objetivo

Extrae el mensaje oculto en la imagen y encuentra la flag.

Necesitarás Python con **Pillow** (`pip install pillow`).

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
