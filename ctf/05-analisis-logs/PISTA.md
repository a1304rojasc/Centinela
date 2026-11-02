# Pista — Reto 05

- Hay dos tipos de líneas que importan: `Failed password` (intento fallido)
  y `Accepted password` (intento correcto). El resto es ruido.
- Primero cuenta los fallos **por IP**. Combina `grep`, `grep -o`, `sort` y
  `uniq -c`. Las IPs con muchísimos fallos son atacantes.
- Ojo: hay **más de un** atacante. Uno de ellos se rinde sin éxito. Para cada
  IP sospechosa, busca si tiene algún `Accepted password`.
