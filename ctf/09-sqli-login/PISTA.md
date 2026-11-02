# Pista — Reto 09

- El "modo depuración" te enseña la consulta exacta. Fíjate en cómo tu usuario
  y tu contraseña acaban metidos entre comillas dentro de ella.
- ¿Qué pasa si tu texto **contiene una comilla**? Prueba a escribir solo `'`
  en el usuario y mira el error: has roto la consulta, señal de que el texto
  no se está tratando con cuidado.
- La meta no es *adivinar* la contraseña, sino hacer que la comprobación de la
  contraseña **sobre**. En SQL, `--` convierte en comentario todo lo que viene
  después en esa línea.
- Quieres que la consulta busque al usuario `admin` e ignore por completo la
  parte de `AND password = ...`.
