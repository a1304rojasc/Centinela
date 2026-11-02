# Solución — Reto 06 (Magic bytes)

## Idea clave

Casi todos los formatos de archivo empiezan con una **firma** fija:

| Formato | Primeros bytes | Como texto |
|---|---|---|
| PNG | `89 50 4E 47` | `.PNG` |
| PDF | `25 50 44 46` | `%PDF` |
| ZIP (y .docx, .xlsx, .apk, .jar…) | `50 4B 03 04` | `PK..` |
| JPEG | `FF D8 FF` | — |
| Ejecutable Linux (ELF) | `7F 45 4C 46` | `.ELF` |

La extensión puede mentir; la firma, no (salvo que alguien la manipule a propósito).

## Paso a paso

1. **Pregunta al sistema qué es:**
   ```bash
   file archivos/informe_final.txt
   ```
   ```
   archivos/informe_final.txt: Zip archive data, at least v2.0 to extract
   ```

2. **Compruébalo a mano** mirando los primeros bytes:
   ```bash
   head -c 4 archivos/informe_final.txt | od -c
   ```
   ```
   0000000   P   K 003 004
   ```
   `PK` son las iniciales de **Phil Katz**, creador del formato ZIP.

3. **Ábrelo como ZIP.** No hace falta renombrarlo, pero si quieres:
   ```bash
   cp archivos/informe_final.txt /tmp/informe.zip
   unzip -l /tmp/informe.zip          # lista el contenido
   unzip -p /tmp/informe.zip secreto/nota.txt
   ```
   Sin `unzip`, con Python:
   ```bash
   python3 -m zipfile -l archivos/informe_final.txt
   python3 -c "import zipfile; print(zipfile.ZipFile('archivos/informe_final.txt').read('secreto/nota.txt').decode())"
   ```

4. Dentro de `secreto/nota.txt`:
   ```
   Flag: CENTINELA{l0s_m4g1c_byt3s_n0_m13nt3n}
   ```

## Flag

```
CENTINELA{l0s_m4g1c_byt3s_n0_m13nt3n}
```

## Lección

- Los atacantes cambian extensiones para colar archivos (por ejemplo, un
  ejecutable llamado `foto.jpg`). Un filtro de subidas que solo mira la
  extensión es fácil de engañar: hay que validar el contenido.
- Muchos formatos "de oficina" (`.docx`, `.xlsx`, `.odt`) son en realidad ZIP
  con XML dentro. ¡Prueba a descomprimir uno!
