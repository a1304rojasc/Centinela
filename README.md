# Centinela

Detector de ataques de fuerza bruta en logs de SSH, escrito en Python como proyecto de aprendizaje.

## Fase 1 — Leer y entender los logs

| Archivo | Qué hace |
|---|---|
| `generar_logs.py` | Crea `logs/auth.log`: 500 líneas de ejemplo con logins legítimos, dos IPs atacantes y ruido del sistema. |
| `centinela.py` | Lee el log y extrae fecha, IP, usuario y resultado de cada intento usando expresiones regulares. |

```bash
python3 generar_logs.py   # (opcional) regenera logs/auth.log
python3 centinela.py      # analiza logs/auth.log
```

No necesita librerías externas (solo Python 3.8+).

## 🚩 CTF Centinela — mini CTF para principiantes

En la carpeta [`ctf/`](ctf/) hay un mini CTF de ciberseguridad en español: **10
retos progresivos** (Base64, César, Vigenère, hashes, análisis de logs, magic
bytes, esteganografía, permisos de Linux e inyección SQL en una app Flask
vulnerable a propósito). Cada reto trae enunciado, archivos, pista, solución
paso a paso y un script que verifica tu flag.

Empieza por [`ctf/README.md`](ctf/README.md).

```bash
pip install -r ctf/requirements.txt    # flask y pillow (retos 7, 9 y 10)
cat ctf/INTRODUCCION.md                 # cómo jugar
```
