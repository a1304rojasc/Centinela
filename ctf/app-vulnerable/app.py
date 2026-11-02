"""
app.py — "Tienda Centinela": aplicación web VULNERABLE A PROPÓSITO.

⚠️  NO la despliegues en internet ni en una red compartida. Solo escucha en
    127.0.0.1 (tu propia máquina). Existe para practicar inyección SQL
    (retos 09 y 10 del CTF).

⚠️  Si quieres jugar limpio, NO leas este archivo hasta resolver los retos:
    trata la aplicación como una "caja negra", igual que en un pentest real.

Uso:
    pip install flask
    python3 app.py
    → abre http://127.0.0.1:5000
"""

import base64
import sqlite3

from flask import Flask, render_template_string, request

app = Flask(__name__)


def _d(s):
    # Las flags van codificadas para que no se vean de un vistazo. (Ya sabes
    # desde el reto 01 que esto NO es seguridad de verdad).
    return base64.b64decode(s).decode()


FLAG_09 = _d("Q0VOVElORUxBe2FkbWluX3Npbl9jb250cmFzZW5hfQ==")
FLAG_10 = _d("Q0VOVElORUxBe3VuaW9uX3NlbGVjdF9hYnJlX2xhX2JvdmVkYX0=")


def conectar():
    """Crea una base de datos NUEVA en memoria para cada petición.

    Así, aunque alguien rompa algo (por ejemplo con un DROP TABLE),
    la siguiente petición vuelve a empezar limpia.
    """
    db = sqlite3.connect(":memory:")
    db.executescript(
        f"""
        CREATE TABLE usuarios (id INTEGER PRIMARY KEY, username TEXT, password TEXT, rol TEXT);
        INSERT INTO usuarios VALUES (1, 'invitado', 'invitado', 'invitado');
        INSERT INTO usuarios VALUES (2, 'admin', 'Zq8!fL0p#Wn2$uYe7', 'admin');
        INSERT INTO usuarios VALUES (3, 'maria', 'Gt5@mP9x&Rk1', 'empleado');

        CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, precio REAL, descripcion TEXT);
        INSERT INTO productos VALUES (1, 'Candado reforzado', 19.90, 'Resiste palancas y cizallas');
        INSERT INTO productos VALUES (2, 'Cámara de vigilancia', 49.50, 'Visión nocturna 1080p');
        INSERT INTO productos VALUES (3, 'Llave de seguridad USB', 35.00, 'Segundo factor de autenticación');
        INSERT INTO productos VALUES (4, 'Caja fuerte pequeña', 89.99, 'Cerradura electrónica');
        INSERT INTO productos VALUES (5, 'Router con firewall', 120.00, 'Bloquea tráfico sospechoso');

        CREATE TABLE boveda (id INTEGER PRIMARY KEY, secreto TEXT);
        INSERT INTO boveda VALUES (1, 'La combinación de la caja fuerte es 04-19-77');
        INSERT INTO boveda VALUES (2, '{FLAG_10}');
        """
    )
    return db


PLANTILLA = """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Tienda Centinela</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; background: #f6f7f9; color: #222; }
    .aviso { background: #fff3cd; border: 1px solid #e0c060; padding: .6rem 1rem; border-radius: 6px; font-size: .9rem; }
    nav a { margin-right: 1rem; }
    form { background: #fff; padding: 1rem; border-radius: 6px; border: 1px solid #ddd; margin: 1rem 0; }
    input { padding: .4rem; margin: .2rem 0; width: 100%; box-sizing: border-box; }
    button { padding: .4rem 1rem; margin-top: .5rem; }
    .sql { background: #1e1e1e; color: #9cdcfe; padding: .6rem; border-radius: 6px; font-family: monospace; white-space: pre-wrap; word-break: break-all; }
    .ok { background: #d4edda; border: 1px solid #8fd19e; padding: .6rem 1rem; border-radius: 6px; }
    .error { background: #f8d7da; border: 1px solid #e99; padding: .6rem 1rem; border-radius: 6px; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    td, th { border: 1px solid #ddd; padding: .4rem; text-align: left; }
  </style>
</head>
<body>
  <h1>🛡️ Tienda Centinela</h1>
  <p class="aviso">Aplicación vulnerable a propósito, solo para practicar en local.</p>
  <nav><a href="/">Inicio</a><a href="/login">Iniciar sesión</a><a href="/productos">Catálogo</a></nav>

  {% if pagina == 'inicio' %}
    <p>Bienvenido/a a la tienda. Puedes <a href="/login">iniciar sesión</a> (cuenta de prueba:
       <code>invitado</code> / <code>invitado</code>) o <a href="/productos">buscar en el catálogo</a>.</p>
  {% endif %}

  {% if pagina == 'login' %}
    <h2>Iniciar sesión</h2>
    <form method="post" action="/login">
      <label>Usuario <input name="usuario" autocomplete="off"></label>
      <label>Contraseña <input name="contrasena" type="password"></label>
      <button>Entrar</button>
    </form>
  {% endif %}

  {% if pagina == 'productos' %}
    <h2>Catálogo</h2>
    <form method="get" action="/productos">
      <label>Buscar producto <input name="q" value="{{ q }}" autocomplete="off"></label>
      <button>Buscar</button>
    </form>
    {% if filas is not none %}
      <table>
        <tr><th>Nombre</th><th>Precio</th><th>Descripción</th></tr>
        {% for f in filas %}<tr><td>{{ f[0] }}</td><td>{{ f[1] }}</td><td>{{ f[2] }}</td></tr>{% endfor %}
      </table>
      <p>{{ filas|length }} resultado(s).</p>
    {% endif %}
  {% endif %}

  {% if mensaje %}<div class="{{ clase }}">{{ mensaje }}</div>{% endif %}

  {% if sql %}
    <h3>🔧 Modo depuración — consulta ejecutada</h3>
    <div class="sql">{{ sql }}</div>
  {% endif %}
</body>
</html>
"""


def pagina(**kw):
    datos = {"pagina": None, "mensaje": None, "clase": "ok", "sql": None, "filas": None, "q": ""}
    datos.update(kw)
    return render_template_string(PLANTILLA, **datos)


@app.route("/")
def inicio():
    return pagina(pagina="inicio")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return pagina(pagina="login")

    usuario = request.form.get("usuario", "")
    contrasena = request.form.get("contrasena", "")

    # ❌ VULNERABLE: se pega el texto del usuario directamente dentro del SQL.
    sql = (
        "SELECT id, username, rol FROM usuarios "
        f"WHERE username = '{usuario}' AND password = '{contrasena}'"
    )
    try:
        fila = conectar().execute(sql).fetchone()
    except sqlite3.Error as e:
        return pagina(pagina="login", mensaje=f"Error de base de datos: {e}", clase="error", sql=sql), 500

    if fila is None:
        return pagina(pagina="login", mensaje="Usuario o contraseña incorrectos.", clase="error", sql=sql), 401

    _, nombre, rol = fila
    if rol == "admin":
        mensaje = f"Hola, {nombre}. Panel de administración desbloqueado. Flag: {FLAG_09}"
    else:
        mensaje = (f"Hola, {nombre} (rol: {rol}). Aquí no hay nada interesante: "
                   "solo la cuenta 'admin' puede ver el panel de administración.")
    return pagina(pagina="login", mensaje=mensaje, sql=sql)


@app.route("/productos")
def productos():
    q = request.args.get("q")
    if q is None:
        return pagina(pagina="productos")

    # ❌ VULNERABLE: misma historia, ahora en un buscador.
    sql = f"SELECT nombre, precio, descripcion FROM productos WHERE nombre LIKE '%{q}%'"
    try:
        filas = conectar().execute(sql).fetchall()
    except sqlite3.Error as e:
        return pagina(pagina="productos", q=q, mensaje=f"Error de base de datos: {e}", clase="error", sql=sql), 500
    return pagina(pagina="productos", q=q, filas=filas, sql=sql)


if __name__ == "__main__":
    print("⚠️  App vulnerable a propósito. Solo escucha en http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
