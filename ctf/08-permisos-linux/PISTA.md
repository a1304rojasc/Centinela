# Pista — Reto 08

- `-rwxr-xr--` se lee en bloques de tres: **dueño** `rwx`, **grupo** `r-x`,
  **otros** `r--`. `r`=4, `w`=2, `x`=1 → `754`.
- La `s` en lugar de la `x` del dueño es el bit **SUID**: el programa se
  ejecuta con los permisos de su dueño. Vale **4000** en octal. (SGID = 2000,
  sticky bit `t` = 1000.)
- Busca un archivo con `s` en el bloque del dueño **y** `w` en el bloque de
  "otros".
- En el laboratorio: `find laboratorio -perm -4000` encuentra los SUID y
  `-perm -o+w` los escribibles por cualquiera. Puedes combinar ambos.
  `stat -c '%a %n' archivo` te da el octal.
