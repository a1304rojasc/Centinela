# Pista — Reto 04

- Un hash **no se puede "descifrar"**: es una función de un solo sentido.
  Lo que sí puedes hacer es calcular el hash de cada palabra candidata y
  comparar. Si coincide, encontraste la contraseña.
- Cuenta los caracteres de un hash. 32 caracteres hexadecimales = 128 bits.
  ¿Qué algoritmo famoso (y ya inseguro) produce hashes de 128 bits?
- En Python: `hashlib.md5("palabra".encode()).hexdigest()`.
- En terminal: `echo -n "palabra" | md5sum` (¡ojo con el `-n`, si no, se cuela
  un salto de línea!).
