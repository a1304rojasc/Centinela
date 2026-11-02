# Solución — Reto 03 (Vigenère con texto conocido)

## Idea clave

En Vigenère, la letra `i` del mensaje se desplaza según la letra `i` de la
clave (repetida tantas veces como haga falta):

```
cifrada = (clara + clave) mod 26      →      clave = (cifrada − clara) mod 26
```

Si sabemos qué dice una parte del texto (un **ataque de texto conocido**),
obtenemos esa parte de la clave directamente.

## Paso a paso

1. La primera línea de `archivos/cifrado.txt` empieza por `JEYVWALLL{`.
   Sabemos que en claro es `CENTINELA{`.

2. Restamos letra a letra (A=0, B=1, …, Z=25):

   | Cifrada | J (9) | E (4) | Y (24) | V (21) | W (22) | A (0) | L (11) | L (11) | L (11) |
   |---|---|---|---|---|---|---|---|---|---|
   | Clara   | C (2) | E (4) | N (13) | T (19) | I (8)  | N (13)| E (4)  | L (11) | A (0)  |
   | Clave   | 7 **H** | 0 **A** | 11 **L** | 2 **C** | 14 **O** | 13 **N** (−13 mod 26) | 7 **H** | 0 **A** | 11 **L** |

   Obtenemos `HALCONHAL`: la palabra **HALCON** que vuelve a empezar. ¡Esa es la clave!

3. Desciframos todo restando la clave (solo a las letras):

   ```python
   texto = open("archivos/cifrado.txt").read()
   clave = "HALCON"
   r, i = "", 0
   for c in texto:
       if c.isascii() and c.isalpha():
           base = 65 if c.isupper() else 97
           k = ord(clave[i % len(clave)]) - 65
           r += chr((ord(c) - base - k) % 26 + base)
           i += 1
       else:
           r += c
   print(r)
   ```

   (También funciona la receta *"Vigenère Decode"* de CyberChef con la clave `HALCON`.)

4. Resultado:
   ```
   CENTINELA{vigenere_cae_con_texto_conocido}
   Si estas leyendo esto, rompiste Vigenere con un ataque de texto conocido.
   ...
   ```

## Flag

```
CENTINELA{vigenere_cae_con_texto_conocido}
```

## Lección

Un buen cifrado moderno debe resistir ataques de texto conocido: aunque
sepas parte del mensaje, no debes poder deducir la clave. Vigenère no lo
cumple. (Sin texto conocido también se rompe, con el método de Kasiski y
análisis de frecuencias, pero eso es para otro día.)
