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
