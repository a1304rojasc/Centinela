# 🚩 CTF Centinela — mini CTF de ciberseguridad para principiantes

Diez retos progresivos para dar tus primeros pasos en seguridad informática,
**en español** y pensados para quien empieza desde cero. Cada reto tiene su
enunciado, sus archivos, una pista y una solución explicada paso a paso.

> Antes de empezar, lee **[`INTRODUCCION.md`](INTRODUCCION.md)**: explica qué es
> una flag, cómo verificar tus respuestas y las reglas del juego limpio.

## Instalación rápida

```bash
# (recomendado) un entorno virtual
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt   # flask y pillow, para los retos 7, 9 y 10
```

La mayoría de retos solo necesitan Python 3.8+ y comandos de terminal de
Linux/macOS. En Windows, usa **WSL** o Git Bash.

## Orden recomendado

Van de más fácil a más difícil; cada uno enseña una idea nueva. Lo ideal es
hacerlos en orden.

| # | Reto | Categoría | Dificultad | Aprendes… |
|---|------|-----------|------------|-----------|
| 01 | [Bienvenida en Base64](01-bienvenida-base64/) | Codificación | ⭐☆☆☆☆ | Codificar ≠ cifrar |
| 02 | [El mensaje del general](02-cifrado-cesar/) | Cripto clásica | ⭐☆☆☆☆ | Cifrado César y fuerza bruta |
| 03 | [Le chiffre indéchiffrable](03-vigenere/) | Cripto clásica | ⭐⭐☆☆☆ | Vigenère y ataque de texto conocido |
| 04 | [Contraseñas en la basura](04-hashes/) | Hashes | ⭐⭐☆☆☆ | Hashes y ataques de diccionario |
| 05 | [¿Quién entró anoche?](05-analisis-logs/) | Análisis de logs | ⭐⭐☆☆☆ | Detectar fuerza bruta en logs SSH |
| 06 | [El informe que no se deja leer](06-magic-bytes/) | Forense de archivos | ⭐⭐☆☆☆ | Magic bytes: la extensión miente |
| 07 | [Un atardecer sospechoso](07-esteganografia/) | Esteganografía | ⭐⭐⭐☆☆ | Ocultar datos en píxeles (LSB) |
| 08 | [La puerta trasera de root](08-permisos-linux/) | Permisos Linux | ⭐⭐⭐☆☆ | SUID/SGID y escalada de privilegios |
| 09 | [Entrar sin contraseña](09-sqli-login/) | Web / SQLi | ⭐⭐⭐☆☆ | Inyección SQL en un login |
| 10 | [El contenido de la bóveda](10-sqli-union/) | Web / SQLi | ⭐⭐⭐⭐☆ | SQLi con `UNION SELECT` |

Los retos **09 y 10** comparten una pequeña aplicación web Flask vulnerable a
propósito (`app-vulnerable/app.py`). Arráncala así y déjala corriendo mientras
los resuelves:

```bash
python3 app-vulnerable/app.py     # http://127.0.0.1:5000  (Ctrl+C para parar)
```

## Estructura del proyecto

```
ctf/
├── README.md              ← este archivo
├── INTRODUCCION.md        ← cómo jugar (léelo primero)
├── requirements.txt
├── NN-nombre-del-reto/
│   ├── ENUNCIADO.md       ← qué tienes y qué buscas
│   ├── PISTA.md           ← un empujón si te atascas
│   ├── SOLUCION.md        ← explicación paso a paso (spoiler)
│   ├── verificar.py       ← comprueba tu flag (guarda un hash, no la flag)
│   └── archivos/          ← los materiales del reto
├── app-vulnerable/        ← app Flask para los retos 09 y 10
└── herramientas/          ← SPOILERS: generador y probador (no hace falta para jugar)
```

## Para quien organiza el CTF

- **Regenerar todos los archivos** (deterministas; solo si cambias algo):
  ```bash
  python3 herramientas/generar_retos.py
  ```
- **Probar que los 10 retos funcionan** de punta a punta (resuelve cada reto
  automáticamente y comprueba su `verificar.py`):
  ```bash
  python3 herramientas/probar_todo.py
  ```
  > ⚠️ Ambos scripts contienen las flags / las soluciones. No los mires si vas
  > a jugar.

## Aviso

Todo esto es material **educativo**. La app web es vulnerable a propósito y
solo escucha en `127.0.0.1`: no la expongas a una red. Usa estas técnicas
únicamente en sistemas propios o donde tengas permiso explícito.
