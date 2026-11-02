# Reto 05 — ¿Quién entró anoche?

**Categoría:** Análisis de logs / Forense · **Dificultad:** ⭐⭐☆☆☆ · **Archivos:** `archivos/auth.log`

El servidor `srv-web01` lleva todo el día recibiendo intentos de acceso por
SSH. El equipo de sistemas sospecha que **un atacante consiguió entrar**,
pero el log tiene cientos de líneas y nadie tiene tiempo de leerlo entero.

(Si ya hiciste la Fase 1 del proyecto Centinela, este formato te sonará.)

## Objetivo

Encuentra la IP del atacante que **sí** logró iniciar sesión tras un ataque de
fuerza bruta, y el usuario con el que entró.

La flag tiene el formato:

```
CENTINELA{IP_usuario}
```

Por ejemplo: `CENTINELA{10.1.2.3_pepe}`.

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
