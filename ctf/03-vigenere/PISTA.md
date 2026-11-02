# Pista — Reto 03

- Vigenère es como aplicar un César diferente a cada letra. La clave dice
  cuánto desplazar: `A`=0, `B`=1, `C`=2, … y se repite una y otra vez.
- Si conoces una letra en claro y la misma letra cifrada, puedes calcular la
  letra de la clave en esa posición: **clave = cifrada − clara**.
- Tú conoces 9 letras en claro gratis: `CENTINELA`. Calcula 9 letras de la
  clave y busca qué palabra se repite.
- La clave solo avanza con letras (las llaves `{`, `_` y espacios no la gastan).
