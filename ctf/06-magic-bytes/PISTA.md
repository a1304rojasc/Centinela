# Pista — Reto 06

- La extensión (`.txt`, `.jpg`, `.pdf`…) es solo parte del **nombre**. El
  sistema operativo puede averiguar el tipo real mirando los primeros bytes
  del contenido, llamados *magic bytes* o "firma".
- Prueba el comando `file`. O mira los primeros bytes con
  `head -c 16 archivo | od -c` (o `xxd archivo | head`, o `hexdump -C`).
- Busca esas dos primeras letras en internet junto a "magic bytes". Son las
  iniciales de una persona famosa en la historia de la compresión.
