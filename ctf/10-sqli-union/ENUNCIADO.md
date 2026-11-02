# Reto 10 — El contenido de la bóveda

**Categoría:** Web / Inyección SQL (UNION) · **Dificultad:** ⭐⭐⭐⭐☆ · **Archivos:** `../app-vulnerable/app.py`

La misma "Tienda Centinela" tiene un buscador de productos en
<http://127.0.0.1:5000/productos>. Escribes un nombre y te muestra los
productos que coinciden, en una tabla.

Pero la base de datos guarda algo más que productos: hay una tabla `boveda`
con secretos. El buscador solo *debería* enseñar productos… *debería*.

Este reto continúa el 09; arranca la app igual:

```bash
python3 ../app-vulnerable/app.py
```

## Objetivo

Usa el buscador para leer datos de **otra tabla** y saca la flag escondida en
la bóveda. Técnica estrella: `UNION SELECT`.

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
