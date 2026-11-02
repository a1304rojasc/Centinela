# Para quien resuelve: cómo abordar un CTF

Un **CTF** (*Capture The Flag*) es un juego de retos de seguridad. En cada uno
escondemos una **flag** (bandera) con este formato:

```
CENTINELA{algun_texto}
```

Encontrarla demuestra que resolviste el reto. No tienes que "adivinar": la flag
se *deduce* trabajando el reto.

## Flujo recomendado para cada reto

1. Lee `ENUNCIADO.md` (qué tienes y qué buscas).
2. Mira los archivos de la carpeta `archivos/`.
3. Intenta resolverlo. Si te atascas 10-15 min, abre `PISTA.md`.
4. Cuando creas tener la flag, verifícala:
   ```bash
   cd 01-bienvenida-base64        # la carpeta del reto
   python3 verificar.py "CENTINELA{...}"
   ```
5. Solo al final (o si de verdad no sale), lee `SOLUCION.md`: explica el
   porqué, no solo el cómo.

## Reglas del juego limpio

- No leas los `verificar.py` buscando la respuesta: guardan un **hash** de la
  flag, no la flag (lo entenderás en el reto 04).
- En los retos web (09 y 10), no abras `app-vulnerable/app.py` hasta terminar.
- La carpeta `herramientas/` contiene spoilers (genera y prueba los retos). No
  la necesitas para jugar.

## Qué necesitas instalado

- **Python 3.8+** (casi todo).
- **Flask** y **Pillow** para los retos 7, 9 y 10:
  ```bash
  pip install -r requirements.txt
  ```
- Comandos de terminal habituales en Linux/macOS (`base64`, `file`, `grep`,
  `md5sum`, `find`…). En Windows va de maravilla con **WSL** o Git Bash.
