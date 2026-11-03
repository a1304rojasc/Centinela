# Auditoría de seguridad de Centinela

**Fecha:** 3 de noviembre de 2026
**Alcance:**
- El paquete `centinela/`: parser, detector, reporte, lista negra y CLI.
- Los scripts de `fase1/`.
- Las figuras interactivas de `figuras/`.
- El curso `curso/index.html`.

**Método:**
1. Revisión manual del código pensando como un atacante, siguiendo los datos que puede controlar: el nombre de usuario de SSH y el contenido de `lista_negra.txt`.
2. Reproducción de cada hallazgo con una prueba real.
3. Corrección.
4. Un test de regresión por hallazgo en [`tests/test_seguridad.py`](tests/test_seguridad.py).

**Resultado de los tests:**

| | Código anterior | Código corregido |
|---|---|---|
| Tests de seguridad (19) | 17 fallan | pasan todos |
| Suite completa (59) | — | pasa entera |

Los 2 tests de seguridad que ya pasaban con el código anterior son de control a propósito: comprueban que las líneas normales se siguen leyendo bien y que la nueva regex no se vuelve lenta con líneas gigantes.

## La idea clave

En un detector de intrusiones **el atacante escribe parte de los datos de entrada**. En `auth.log`, el nombre de usuario es texto libre que el atacante elige al conectarse: puede llevar espacios, la palabra `from`, IPs falsas, fórmulas o caracteres de control. Casi todos los hallazgos vienen de haber tratado ese texto como si fuera de fiar.

## Resumen

| # | Gravedad | Vulnerabilidad | Dónde |
|---|---|---|---|
| V1 | 🔴 **Alta** | Inyección en el log: un usuario con `from <IP> port N` hace culpar a otra IP | `parser.py` |
| V2 | 🔴 **Alta** | Evasión: un usuario con espacios vuelve invisibles todos los intentos | `parser.py` |
| V3 | 🟠 **Media** | Inyección de comandos en `bloquear.sh` con una IPv6 con "zona" | `lista_negra.py` |
| V4 | 🟠 **Media** | Un usuario con sintaxis matemática tumba el reporte, y `todo` se detenía antes de bloquear | `reporte.py`, `cli.py` |
| V5 | 🟠 **Media** | Inyección de fórmulas en los CSV | `reporte.py` |
| V6 | 🟠 **Media** | Denegación de servicio: el detector tenía coste cuadrático | `detector.py` |
| V7 | 🟢 **Baja** | Secuencias de escape de terminal en el usuario | `parser.py` |
| V8 | 🟢 **Baja** | Una fecha imposible (o un 29 de febrero con el año equivocado) detenía todo el análisis | `parser.py` |
| V9 | 🟢 **Baja** | Archivos que ejecuta root escritos con permisos abiertos y de forma no atómica | `lista_negra.py` |
| I1-I5 | ⚪ Informativo | Riesgos que no se corrigen en código | — |

**Criterio de gravedad:**
- **Alta:** un atacante remoto, sin ningún acceso previo, rompe la función principal del programa (detectar y bloquear al atacante).
- **Media:** el impacto es serio, pero requiere una condición previa o afecta a una función secundaria.
- **Baja:** endurecimiento o un daño limitado.

## Hallazgos

### V1 · 🔴 Alta · Inyección en el log: culpar a otra IP (CWE-117)

**Qué pasaba.** El patrón usaba `(?P<usuario>\S+)\sfrom\s(?P<ip>…)` y no anclaba el final de la línea. Si el atacante se conecta con el usuario `x from 8.8.8.8 port 1`, sshd escribe:

```
… Failed password for invalid user x from 8.8.8.8 port 1 from 203.0.113.5 port 5555 ssh2
                                   └── lo escribe el atacante ──┘ └── lo escribe sshd ──┘
```

La regex se quedaba con la **primera** IP, la falsa.

**Impacto.**
- El atacante esconde su IP real.
- El atacante elige a quién culpar: Centinela pone en la lista negra una IP inocente, como la casa de una administradora, un servicio externo o un DNS público. Es una denegación de servicio contra terceros.
- La lista blanca solo protege las redes privadas, así que una IP pública inocente sí acaba bloqueada.

Este tipo de fallo afectó a herramientas reales como fail2ban.

**Corrección.** El usuario se captura con `.+`, que es "codicioso", y el patrón se ancla al final de la línea: `(?:\sssh2)?(?::\s.*)?$`. Así la IP elegida es siempre la **última** `from IP port N`, que escribe sshd y no el atacante.

**Tests:**
- `test_v1_usuario_con_ip_falsa_no_engana_al_parser`
- `test_v1_la_cola_ssh2_tampoco_engana`
- `test_v1_no_se_puede_meter_en_la_lista_negra_a_un_inocente`

### V2 · 🔴 Alta · Evasión con usuarios que tienen espacios

**Qué pasaba.** SSH permite nombres de usuario con espacios, y sshd los registra tal cual: `Failed password for invalid user a b from …`. Con `\S+` el usuario no podía contener espacios, la regex no encajaba y **la línea entera se ignoraba**.

**Impacto.** Un atacante que use usuarios con un espacio hace miles de intentos y Centinela no ve ninguno: ni incidente, ni lista negra, ni aviso de compromiso.

**Corrección.** La misma de V1: el usuario se captura con `.+`.

**Tests:**
- `test_v2_usuario_con_espacios_no_esconde_el_ataque`
- `test_v2_las_lineas_normales_siguen_funcionando` (control)

### V3 · 🟠 Media · Inyección de comandos en `bloquear.sh` (CWE-78)

**Qué pasaba.** Antes de escribir cada IP en el script, se comprobaba con `ipaddress.ip_address(ip)`, pero se escribía **el texto original**. Python acepta IPv6 con "zona" (*scope id*), y la zona puede contener casi cualquier carácter:

```python
>>> ipaddress.ip_address("fe80::1%;reboot;")
IPv6Address('fe80::1%;reboot;')
```

Una línea así en `lista_negra.txt` acababa en el script como `iptables -C INPUT -s fe80::1%;reboot; …`, y `sudo sh bloquear.sh` ejecutaba `reboot` **como root**. Además, `iptables` solo maneja IPv4, así que cualquier IPv6 en la lista era un error.

**Por qué no es Alta.** El parser solo produce IPv4. Para explotarlo hay que poder escribir en `lista_negra.txt` (V9 lo hacía más fácil). Aun así, el impacto es la ejecución de comandos como root.

**Corrección.**
- Solo se aceptan IPv4, a través de `ipv4_normalizada()`.
- Al script se escribe `str(IPv4Address(...))`, **nunca el texto recibido**.
- `cargar()` descarta todo lo demás.

**Tests:**
- `test_v3_ipv6_con_zona_no_llega_al_script`
- `test_v3_lista_negra_manipulada_no_inyecta_comandos`

### V4 · 🟠 Media · Un usuario tumba el reporte y frena el bloqueo

**Qué pasaba.**
- matplotlib interpreta el texto entre `$…$` como fórmula matemática (*mathtext*). Con un usuario como `$\mathcal{$` en el gráfico de usuarios, `savefig` lanza `ValueError`.
- `python -m centinela todo` generaba el reporte **antes** que la lista negra, así que esa excepción detenía el programa y **no se bloqueaba a nadie**.

**Impacto.** Con un solo intento de login con ese usuario, el atacante anula la respuesta automática.

**Corrección.**
- `etiqueta_segura()` escapa los `$` de las etiquetas.
- `todo` ahora bloquea primero y genera el reporte después. Si el reporte falla, avisa y devuelve el código de salida 1, pero el bloqueo ya está hecho: un fallo en la parte "bonita" nunca debe frenar la defensa.

**Tests:**
- `test_v4_usuario_mathtext_no_rompe_el_reporte`
- `test_v4_todo_bloquea_aunque_el_reporte_falle`

### V5 · 🟠 Media · Inyección de fórmulas en los CSV (CWE-1236)

**Qué pasaba.** `intentos.csv` e `incidentes.csv` guardaban los usuarios tal cual. Un usuario como `=HYPERLINK("http://malo")` o `+cmd|' /C calc'!A0` se convierte en una **fórmula** al abrir el CSV en Excel o LibreOffice.

**Impacto.** Según el programa y su configuración: enlaces trampa, fuga de datos hacia un servidor externo o, en versiones antiguas, ejecución de comandos en el ordenador de quien revisa el reporte.

**Corrección.** `csv_seguro()` antepone un apóstrofo (`'`) a toda celda de texto que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de carro, como recomienda OWASP. El código funciona tanto con pandas 2 (columnas de tipo `object`) como con pandas 3 (tipo `str`). Ese detalle lo detectó el propio test.

**Test:** `test_v5_csv_no_contiene_formulas` con 4 cargas distintas.

### V6 · 🟠 Media · Denegación de servicio por coste cuadrático (CWE-407)

**Qué pasaba.** Para cada incidente se recorrían **todos** los fallos y éxitos de la IP, y la eliminación de duplicados comparaba cada incidente con todos los anteriores. Un atacante que reparte su ataque en muchas ráfagas cortas multiplica el trabajo:

| Ráfagas de 5 fallos | Antes | Después |
|---|---|---|
| 2 000 | 0,9 s | — |
| 8 000 | 15 s | 0,06 s |
| 80 000 | ~25 min (estimado) | 0,9 s |

**Corrección.** Búsqueda binaria (`bisect`) sobre listas ordenadas para el tramo de cada incidente, para el primer login posterior y para detectar solapes entre los incidentes de una IP.

**Test:** `test_v6_detector_escala_con_muchas_rafagas` (8 000 ráfagas en menos de 3 s).

### V7 · 🟢 Baja · Secuencias de escape de terminal (CWE-150)

**Qué pasaba.** Un usuario como `\x1b[2J\x1b[31mhola` llegaba tal cual a la pantalla con `python -m centinela intentos` o `detectar`. Esas secuencias pueden borrar la pantalla, cambiar colores u ocultar líneas.

**Por qué es Baja.** OpenSSH ya convierte los caracteres de control en texto visible al escribir el log. El riesgo aparece con logs de otros programas o manipulados.

**Corrección.** `limpiar_texto()` muestra los caracteres invisibles como texto (`\x1b`). **No se descarta la línea**: si se descartara, un atacante podría usar caracteres raros para esconder sus intentos (sería otro V2).

**Test:** `test_v7_escapes_de_terminal_se_muestran_como_texto`

### V8 · 🟢 Baja · Una línea con fecha imposible detenía todo

**Qué pasaba.**
- `datetime.strptime` lanzaba `ValueError` con una fecha como `Nov 31`, y una sola línea así detenía el análisis completo.
- Un log de un año bisiesto con `Feb 29`, leído con un `--anio` no bisiesto, hacía lo mismo.

**Corrección.**
- Las fechas imposibles descartan solo esa línea.
- Las líneas de más de 4 096 caracteres se descartan antes de pasar por la regex. sshd no las produce, y así la regex no trabaja de más con entradas manipuladas.

**Tests:**
- `test_v8_fecha_imposible_no_detiene_el_analisis`
- `test_v8_linea_gigante_se_descarta_rapido`

### V9 · 🟢 Baja · Permisos y escritura de los archivos que ejecuta root (CWE-732, CWE-367)

**Qué pasaba.**
- `lista_negra.txt` y `bloquear.sh` se creaban con los permisos por defecto (normalmente 644) y se escribían directamente sobre el archivo final.
- En una carpeta compartida, otra persona usuaria podía modificar el script entre su creación y el `sudo sh`.
- Un corte a mitad de la escritura dejaba la lista negra a medias.
- El motivo de cada entrada, que contiene nombres de usuario del atacante, se copiaba sin quitar los saltos de línea.

**Corrección.**
- Ambos archivos se escriben en un temporal con permisos **600** y se colocan con `os.replace`, que es atómico.
- El motivo se reduce a una sola línea.

**Tests:**
- `test_v9_lista_y_script_solo_para_su_dueno`
- `test_v9_un_motivo_no_puede_inventar_lineas`

## Informativos (sin cambio de código)

- **I1 · Líneas falsificadas por usuarios locales.** Cualquier persona con cuenta en el servidor puede escribir en syslog (`logger -t 'sshd[1]' "Failed password for root from 1.2.3.4 port 1 ssh2"`) y fabricar intentos que culpan a cualquier IP. Centinela no puede distinguirlas leyendo `auth.log`. Si importa, lee el diario de systemd filtrando por la unidad real (`journalctl _SYSTEMD_UNIT=ssh.service`), que no se puede falsificar con `logger`. La lista blanca y la revisión manual del script limitan el daño.
- **I2 · Ataques distribuidos.** Contar por IP no detecta una botnet. Es una limitación ya documentada en el README; los límites por usuario y la autenticación por clave la compensan.
- **I3 · Dependencias sin fijar.** `requirements.txt` usa `>=`. En producción conviene fijar versiones exactas con sus hashes (`pip-compile --generate-hashes`) para evitar ataques a la cadena de suministro.
- **I4 · Año supuesto.** Con el formato clásico, el año por defecto es el actual. Un log antiguo analizado sin `--anio` tendrá fechas equivocadas, aunque los incidentes siguen siendo correctos dentro del log.
- **I5 · `fase1/centinela_fase1.py`.** El script de aprendizaje conserva la regex original, con V1 y V2. Solo imprime una tabla y no bloquea nada, y se mantiene como material didáctico con un aviso en su cabecera.

## Revisado sin hallazgos

- **`figuras/`.** Las páginas solo procesan lo que escribe quien las usa en su propio navegador y no reciben datos de terceros (ni URL, ni red, ni almacenamiento compartido). El texto de la figura del hash se convierte en bytes antes de dibujarse, el mensaje de la figura de cifrado se muestra con `textContent` (no se interpreta como HTML), y los registros de las figuras de TCP y firewall se construyen con valores del propio modelo.
- **`curso/index.html`.** Todo el contenido dinámico (preguntas, glosario, laboratorio de regex) pasa por `escapar()` antes de insertarse. La navegación por `#hash` solo compara con identificadores conocidos y nunca inserta el texto de la URL. El progreso en `localStorage` solo guarda números.
- **`generador.py`.** Solo escribe en la ruta que se le indica, con datos sintéticos.

## Cómo comprobarlo

```bash
python -m pytest tests/test_seguridad.py -v
```
