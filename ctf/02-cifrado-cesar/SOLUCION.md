# Solución — Reto 02 (Cifrado César)

## Idea clave

El cifrado César sustituye cada letra por la que está `k` posiciones más
adelante en el alfabeto. Su debilidad es enorme: **solo existen 25 claves**,
así que basta con probarlas todas (*fuerza bruta*).

## Paso a paso

### Opción A — Texto conocido (lo más rápido)

1. La última línea del archivo contiene `NPYETYPWL{...}`. Por el formato,
   sabemos que en claro es `CENTINELA{...}`.
2. Calcula la distancia entre la primera letra cifrada y la clara:
   `N` es la letra 13 (empezando en A=0) y `C` es la 2 → **13 − 2 = 11**.
   Comprueba con otra: `P`(15) − `E`(4) = 11. ✔️
3. Desplaza todo el texto **11 posiciones hacia atrás**. Con `tr`:
   ```bash
   tr 'L-ZA-Kl-za-k' 'A-Za-z' < archivos/interceptado.txt
   ```
   (`tr` cambia la L por la A, la M por la B… es decir, resta 11.)

### Opción B — Fuerza bruta en Python

```python
texto = open("archivos/interceptado.txt").read()

def cesar(t, d):
    r = ""
    for c in t:
        if c.islower():   r += chr((ord(c) - 97 + d) % 26 + 97)
        elif c.isupper(): r += chr((ord(c) - 65 + d) % 26 + 65)
        else:             r += c
    return r

for d in range(1, 26):
    print(d, cesar(texto, -d).splitlines()[0])
```

Solo una línea es español legible: la del desplazamiento **11**.

### Resultado

```
Mensaje interceptado del general a sus tropas:
Atacaremos al amanecer por el flanco norte. Nadie debe saberlo.
Codigo de confirmacion: CENTINELA{julio_cesar_estaria_orgulloso}
```

## Flag

```
CENTINELA{julio_cesar_estaria_orgulloso}
```

## Lección

Un cifrado con pocas claves posibles se rompe por fuerza bruta. Los cifrados
modernos (AES) tienen 2¹²⁸ claves o más: probarlas todas es imposible.
