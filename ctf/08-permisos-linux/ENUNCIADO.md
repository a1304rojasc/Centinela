# Reto 08 — La puerta trasera de root

**Categoría:** Permisos en Linux · **Dificultad:** ⭐⭐⭐☆☆ · **Archivos:** `archivos/listado.txt`, `archivos/preparar_laboratorio.py`

Durante una auditoría capturaste el listado de permisos de `/srv/sistema` en un
servidor (`archivos/listado.txt`). El administrador dice que todo está en
orden, pero tú sospechas que hay **un archivo que permitiría a cualquier
usuario del sistema convertirse en root**.

Ese archivo es peligroso por la combinación de dos cosas:

1. Se **ejecuta con los privilegios de su dueño** (root), lo lance quien lo lance.
2. **Cualquier usuario** puede modificar su contenido.

## Objetivo

Encuentra ese archivo y escribe la flag con su **nombre** y sus **permisos en
octal (4 cifras)**:

```
CENTINELA{nombre_del_archivo_OCTAL}
```

Ejemplo de formato: `CENTINELA{script.sh_0755}`.

### Opcional: laboratorio práctico (Linux/macOS)

```bash
cd archivos
python3 preparar_laboratorio.py   # crea ./laboratorio con esos mismos permisos
ls -lR laboratorio
```

Así puedes practicar con `ls`, `stat` y `find` sobre archivos de verdad.

## Comprueba tu respuesta

```bash
python3 verificar.py "CENTINELA{...}"
```
