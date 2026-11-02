# Reto 09 — Entrar sin contraseña

**Categoría:** Web / Inyección SQL · **Dificultad:** ⭐⭐⭐☆☆ · **Archivos:** `../app-vulnerable/app.py`

La "Tienda Centinela" tiene un formulario de login. Te han dado una cuenta de
prueba (`invitado` / `invitado`), pero el panel de administración solo lo ve
el usuario **admin**, y nadie conoce su contraseña.

Los desarrolladores dejaron activado un "modo depuración" que muestra la
consulta SQL que se ejecuta. Mala idea.

## Cómo arrancar la aplicación

```bash
pip install flask          # solo la primera vez
python3 ../app-vulnerable/app.py
```

Abre <http://127.0.0.1:5000/login> en el navegador. Para pararla: `Ctrl+C`.

> ⚠️ La app es vulnerable **a propósito** y solo escucha en tu máquina
> (`127.0.0.1`). No la expongas a una red. Y, para jugar limpio, **no leas
> `app.py`** hasta terminar: trátala como una caja negra.

## Objetivo

Inicia sesión como **admin** sin conocer su contraseña. El panel te mostrará
la flag.

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
