# Pista — Reto 07

- Cada píxel tiene tres valores (Rojo, Verde, Azul) entre 0 y 255, es decir,
  8 bits cada uno. Si cambias el **último bit** (el menos significativo, *LSB*),
  el color varía en 1 sobre 255: el ojo humano no lo nota.
- Recorre la imagen **fila por fila, de izquierda a derecha**, y quédate con el
  último bit del canal **rojo** de cada píxel: `r & 1`.
- Agrupa los bits de 8 en 8 para formar bytes (el primer bit es el más
  significativo). Para cuando encuentres un byte `0`.
- Para empezar: `from PIL import Image; img = Image.open("archivos/atardecer.png")`
  y `img.getpixel((x, y))` devuelve `(r, g, b)`.
