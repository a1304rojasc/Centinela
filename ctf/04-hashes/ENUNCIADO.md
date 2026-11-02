# Reto 04 — Contraseñas en la basura

**Categoría:** Hashes · **Dificultad:** ⭐⭐☆☆☆ · **Archivos:** `archivos/volcado.txt`, `archivos/diccionario.txt`

Un atacante filtró la tabla de usuarios de una tienda online. Por suerte, las
contraseñas no estaban en texto plano: estaban "hasheadas". Por desgracia,
el desarrollador usó un algoritmo rápido y antiguo, sin *sal*, y los usuarios
eligieron contraseñas muy comunes.

También encontraste, en el mismo servidor, una lista de contraseñas populares
(`diccionario.txt`).

## Objetivo

1. Identifica qué tipo de hash se usó.
2. Averigua la contraseña del usuario **admin**.
3. La flag es esa contraseña dentro del formato: `CENTINELA{contraseña}`.

> Extra (sin flag): ¿cuántas contraseñas más puedes recuperar? ¿Hay alguna
> que se resista? ¿Por qué?

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
