# Solución — Reto 04 (Hashes y ataque de diccionario)

## Idea clave

Una función hash (MD5, SHA-1, SHA-256…) convierte cualquier texto en una
"huella" de tamaño fijo. Es **de un solo sentido**: no hay forma de volver
atrás. Pero es **determinista**: la misma entrada siempre da la misma huella.

Por eso, para "romper" un hash se hace un **ataque de diccionario**: se
hashean miles de contraseñas probables y se compara el resultado.

## Paso a paso

1. **Identificar el algoritmo.** Mira el volcado:
   ```
   admin:670026045122dcc95566ebbe281a1080
   ```
   Son 32 caracteres hexadecimales → 32 × 4 = 128 bits → **MD5**.
   (Referencia rápida: 40 hex = SHA-1, 64 hex = SHA-256.)

2. **Ataque de diccionario.** Un script de pocas líneas:
   ```python
   import hashlib

   objetivo = "670026045122dcc95566ebbe281a1080"
   for palabra in open("archivos/diccionario.txt").read().split():
       if hashlib.md5(palabra.encode()).hexdigest() == objetivo:
           print("¡Encontrada!", palabra)
   ```
   Versión en Bash:
   ```bash
   while read -r p; do
     [ "$(echo -n "$p" | md5sum | cut -d' ' -f1)" = 670026045122dcc95566ebbe281a1080 ] && echo "$p"
   done < archivos/diccionario.txt
   ```
   Resultado: **`mariposa77`**.

   Las herramientas profesionales (`john`, `hashcat`) hacen lo mismo, pero
   probando millones de contraseñas por segundo:
   ```bash
   john --format=raw-md5 --wordlist=archivos/diccionario.txt archivos/volcado.txt
   ```

3. **Extra.** Con el mismo diccionario también salen `ana → gato123`,
   `luis → realmadrid2025` e `invitado → bienvenido`. La de `soporte`
   (`ec2668f3…`) **no** sale: es una contraseña larga y aleatoria que no está en
   ninguna lista. Esa es la moraleja.

## Flag

```
CENTINELA{mariposa77}
```

## Lección

- MD5 y SHA-1 son demasiado **rápidos** para contraseñas: un atacante prueba
  miles de millones por segundo. Para contraseñas se usan funciones lentas
  y con *sal* aleatoria: **bcrypt, scrypt o Argon2**.
- Sin sal, dos usuarios con la misma contraseña tienen el mismo hash, y se
  pueden usar tablas precalculadas (*rainbow tables*).
- Una contraseña larga y única te protege incluso cuando la empresa hace las
  cosas mal.
