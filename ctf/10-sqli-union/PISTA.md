# Pista — Reto 10

- `UNION SELECT` pega los resultados de **otra** consulta debajo de la
  original. Pero solo funciona si ambas tienen el **mismo número de columnas**.
- Primer paso, entonces: averiguar cuántas columnas devuelve el buscador.
  Ve probando `... UNION SELECT 1,2 -- `, luego `1,2,3 -- `, etc. Con el
  número equivocado da error; con el correcto, no.
- El buscador muestra 3 columnas en la tabla (Nombre, Precio, Descripción).
  Eso te da una pista fuerte del número.
- En SQLite, la "tabla de tablas" se llama `sqlite_master`. Pregúntale qué
  tablas existen antes de leer la bóveda.
- Recuerda cerrar tu `'` y comentar el resto con `-- ` (con espacio final).
