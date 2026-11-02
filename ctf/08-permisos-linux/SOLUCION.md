# Solución — Reto 08 (Permisos en Linux)

## Idea clave

Cada archivo tiene permisos para tres "clases" de usuarios: **dueño** (u),
**grupo** (g) y **otros** (o). Además existen tres bits especiales:

| Bit | Octal | Se ve como | Efecto |
|---|---|---|---|
| SUID | 4000 | `s` en la x del dueño | El programa se ejecuta **como su dueño** |
| SGID | 2000 | `s` en la x del grupo | Se ejecuta con el grupo del archivo |
| Sticky | 1000 | `t` en la x de otros | En un directorio: solo puedes borrar tus archivos |

Un archivo **SUID de root** que **cualquiera puede escribir** es una escalada
de privilegios regalada: cualquier usuario mete sus comandos dentro y, al
ejecutarlo, corren como root.

## Paso a paso

1. **Lee el listado** buscando una `s` en la 4.ª posición (x del dueño):
   ```bash
   grep -E '^...s' archivos/listado.txt
   ```
   ```
   -rwsr-xr-x 1 root   root        990 nov  1 03:00 actualizar.sh
   -rwsrwxrwx 1 root   root       2210 nov  1 03:00 respaldo_nocturno.sh
   ```

2. **De esos, ¿cuál es escribible por "otros"?** (`w` en la 9.ª posición)
   - `actualizar.sh` → otros: `r-x` → no se puede modificar. ✅ Correcto (es
     normal que existan SUID, como `/usr/bin/passwd`).
   - `respaldo_nocturno.sh` → otros: `rwx` → **cualquiera puede modificarlo**. 🚨

   Los distractores:
   - `notas.txt` (`-rw-rw-rw-`): lo puede escribir cualquiera, pero no es SUID.
   - `herramienta` (`-rwxr-sr-x`): SGID, pero no escribible por otros.
   - `tmp_subidas` (`drwxrwxrwt`): directorio con sticky bit, como `/tmp`. Normal.
   - `monitor.py` (`-rwxrwxr-x`): escribible por el grupo `deploy`, no por todos.

3. **Pásalo a octal**, bloque a bloque:
   ```
   especiales  dueño  grupo  otros
     SUID       rws    rwx    rwx
     4          4+2+1  4+2+1  4+2+1
     4          7      7      7      → 4777
   ```

4. **Con el laboratorio** (forma "real", como lo harías en un servidor):
   ```bash
   cd archivos
   python3 preparar_laboratorio.py
   find laboratorio -type f -perm -4000 -perm -o+w
   # laboratorio/bin/respaldo_nocturno.sh
   stat -c '%a %n' laboratorio/bin/respaldo_nocturno.sh
   # 4777 laboratorio/bin/respaldo_nocturno.sh
   ```
   (En macOS: `stat -f '%Lp %N' ...`.) En un servidor real, el comando de
   auditoría típico es `find / -perm -4000 -type f 2>/dev/null`.

## Flag

```
CENTINELA{respaldo_nocturno.sh_4777}
```

## Lección

- Arreglo: `chmod 0755 respaldo_nocturno.sh` (o `chmod u-s,go-w`). ¿Necesita
  de verdad SUID? Casi nunca: mejor `sudo` con una regla concreta o un cron de root.
- Nota técnica: Linux ignora el bit SUID en *scripts* (solo lo respeta en
  binarios), pero el mismo error en un binario, o en un script que root
  ejecuta por cron, sí es explotable. Los auditores lo marcan siempre.
