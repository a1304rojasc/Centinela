# Solución — Reto 07 (Esteganografía LSB)

## Idea clave

La **esteganografía** esconde la *existencia* del mensaje (a diferencia de la
criptografía, que esconde su *contenido*). La técnica más clásica en imágenes
es **LSB** (*Least Significant Bit*):

```
Rojo original:  200 = 1100100[0]
Con un bit 1:   201 = 1100100[1]   ← diferencia imperceptible
```

Cada píxel "presta" un bit, y 8 píxeles forman una letra.

## Paso a paso

1. **Descarta lo fácil** (siempre conviene, en cualquier reto de estego):
   ```bash
   file archivos/atardecer.png        # PNG 320x200, nada raro
   strings archivos/atardecer.png | grep -i centinela   # nada
   ```

2. **Extrae los LSB del canal rojo** con este script (`extraer.py`):
   ```python
   from PIL import Image

   img = Image.open("archivos/atardecer.png").convert("RGB")
   ancho, alto = img.size

   bits = []
   for y in range(alto):            # fila por fila
       for x in range(ancho):       # de izquierda a derecha
           r, g, b = img.getpixel((x, y))
           bits.append(r & 1)       # último bit del rojo

   mensaje = bytearray()
   for i in range(0, len(bits), 8):
       byte = 0
       for bit in bits[i:i + 8]:    # el primer bit es el más significativo
           byte = (byte << 1) | bit
       if byte == 0:                # byte 0 = fin del mensaje
           break
       mensaje.append(byte)

   print(mensaje.decode())
   ```
   ```bash
   python3 extraer.py
   ```
   ```
   CENTINELA{lo_que_ves_no_es_todo}
   ```

3. Herramientas que hacen esto automáticamente: `zsteg` (Ruby) o
   *StegSolve* (Java) prueban todos los canales y órdenes de bits a la vez.
   Con `zsteg archivos/atardecer.png` aparece en la línea `b1,r,msb,xy`.

## Flag

```
CENTINELA{lo_que_ves_no_es_todo}
```

## Lección

- La esteganografía LSB sobrevive en PNG (compresión **sin pérdida**), pero
  se destruye si la imagen se guarda como JPEG o si una red social la
  recomprime.
- Se usa en la vida real para marcas de agua, y también por malware para
  esconder órdenes o código dentro de imágenes inocentes.
