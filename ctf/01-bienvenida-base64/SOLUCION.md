# Solución — Reto 01 (Base64)

## Idea clave

**Codificar no es cifrar.** Base64 es una forma de representar cualquier
secuencia de bytes usando solo 64 caracteres "seguros" (`A-Z`, `a-z`, `0-9`,
`+`, `/`) para poder pegarlos en un correo, un JSON o una URL. No hay ninguna
clave: cualquiera puede revertirlo.

Cómo reconocerlo:

- Solo usa esos 64 caracteres.
- La longitud total es múltiplo de 4.
- A menudo termina en `=` o `==` (relleno).

## Paso a paso

1. Mira el archivo:
   ```bash
   cat archivos/mensaje.txt
   ```
   Verás 4 líneas de letras y números. Nada de espacios ni signos raros → huele a Base64.

2. Decodifícalo:
   ```bash
   base64 -d archivos/mensaje.txt
   ```
   (En macOS antiguos: `base64 -D`.)

   Alternativa en Python:
   ```python
   import base64
   print(base64.b64decode(open("archivos/mensaje.txt").read()).decode())
   ```

   Alternativa sin terminal: la receta *"From Base64"* de CyberChef.

3. Aparece el mensaje en claro:
   ```
   Bienvenido/a al CTF de Centinela.
   Si puedes leer esto, ya sabes que Base64 NO es cifrado: ...
   Tu primera flag es: CENTINELA{b4s3_64_n0_3s_c1fr4r}
   ```

## Flag

```
CENTINELA{b4s3_64_n0_3s_c1fr4r}
```

## Lección para la vida real

Si ves contraseñas o tokens "protegidos" con Base64 en un archivo de
configuración o en una cabecera HTTP (`Authorization: Basic ...`), en la
práctica están en texto plano.
