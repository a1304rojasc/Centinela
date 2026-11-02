# Solución — Reto 05 (Análisis de logs SSH)

## Idea clave

Un ataque de fuerza bruta deja un rastro muy claro: **muchos fallos seguidos
desde la misma IP**. Lo peligroso es cuando esa racha de fallos termina en un
**éxito**: significa que el atacante adivinó una contraseña.

## Paso a paso

1. **Echa un vistazo al formato.**
   ```bash
   head archivos/auth.log
   grep -c "" archivos/auth.log         # cuántas líneas hay
   ```
   Líneas típicas:
   ```
   Nov  1 14:47:03 srv-web01 sshd[...]: Failed password for root from 198.51.100.23 port 40123 ssh2
   Nov  1 08:12:44 srv-web01 sshd[...]: Accepted password for maria from 192.168.1.15 port 51234 ssh2
   ```

2. **Cuenta los fallos por IP.**
   ```bash
   grep "Failed password" archivos/auth.log | grep -oE "from [0-9.]+" | sort | uniq -c | sort -rn
   ```
   ```
       120 from 45.155.205.9
        85 from 198.51.100.23
         7 from 192.168.1.22
         7 from 10.0.0.5
         5 from 192.168.1.15
   ```
   Dos IPs destacan muchísimo: `45.155.205.9` y `198.51.100.23`. Los
   5-7 fallos de las IPs internas son usuarios normales que se equivocan.

3. **¿Alguna de ellas consiguió entrar?**
   ```bash
   grep "Accepted password" archivos/auth.log | grep -E "45\.155\.205\.9|198\.51\.100\.23"
   ```
   ```
   Nov  1 14:50:42 srv-web01 sshd[28819]: Accepted password for soporte from 198.51.100.23 port 55443 ssh2
   ```
   - `45.155.205.9` falló 120 veces y se rindió (es el **distractor**).
   - `198.51.100.23` falló 85 veces en unos 3 minutos y luego **entró como
     `soporte`**. La línea siguiente confirma que se abrió la sesión.

4. Versión en Python (útil para logs enormes):
   ```python
   import re
   from collections import Counter

   fallos, exitos = Counter(), []
   for linea in open("archivos/auth.log"):
       if m := re.search(r"Failed password for (?:invalid user )?\S+ from (\S+)", linea):
           fallos[m[1]] += 1
       elif m := re.search(r"Accepted password for (\S+) from (\S+)", linea):
           exitos.append((m[2], m[1]))

   print([(ip, u) for ip, u in exitos if fallos[ip] > 20])
   ```

## Flag

```
CENTINELA{198.51.100.23_soporte}
```

## Lección

- Un IDS como **fail2ban** (o el propio Centinela) bloquearía la IP tras unos
  pocos fallos.
- Mejor aún: desactivar el login por contraseña en SSH y usar solo claves
  (`PasswordAuthentication no`).
- En un incidente real, lo siguiente sería revisar qué hizo `soporte` tras
  entrar y cambiar su contraseña inmediatamente.
