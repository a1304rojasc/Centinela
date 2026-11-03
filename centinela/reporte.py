"""
Fase 3 · Reporte con pandas y matplotlib.

pandas trabaja con DataFrames: tablas en memoria con columnas con nombre,
parecidas a una hoja de cálculo pero manejadas desde código. Aquí:

  * `a_dataframe` convierte la lista de Intentos en un DataFrame.
  * `resumen_por_ip` agrupa por IP (como una tabla dinámica de Excel).
  * Tres funciones dibujan gráficos PNG con matplotlib.
  * `generar_reporte` lo junta todo en una carpeta: CSVs, PNGs y un reporte.md.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import matplotlib

matplotlib.use("Agg")  # "Agg" dibuja en archivos, sin abrir ventanas (sirve en servidores)
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from centinela.detector import Incidente  # noqa: E402
from centinela.parser import Intento  # noqa: E402

# SEGURIDAD — los nombres de usuario los elige el atacante. Dos trampas:
#  * Inyección de fórmulas en CSV: una celda que empieza por = + - @ se
#    interpreta como fórmula al abrir el CSV en Excel o LibreOffice
#    (=HYPERLINK(...), =cmd|...). Se neutraliza poniendo un apóstrofo delante.
#  * matplotlib interpreta "$...$" como fórmula matemática (mathtext): un
#    usuario como "$\mathcal{$" hace fallar el gráfico y, con él, el reporte.
#    Se escapan los "$" de las etiquetas.
PELIGROSOS_CSV = ("=", "+", "-", "@", "\t", "\r")


def celda_segura(valor):
    """Neutraliza una celda de texto que una hoja de cálculo tomaría por fórmula."""
    if isinstance(valor, str) and valor.startswith(PELIGROSOS_CSV):
        return "'" + valor
    return valor


def csv_seguro(df: pd.DataFrame) -> pd.DataFrame:
    """Copia del DataFrame con todas las columnas de texto neutralizadas."""
    copia = df.copy()
    for columna in copia.columns:
        # pandas 3 usa un tipo "str" propio para el texto; pandas 2, "object".
        if copia[columna].dtype == object or pd.api.types.is_string_dtype(copia[columna]):
            copia[columna] = copia[columna].map(celda_segura)
    return copia


def etiqueta_segura(texto: str) -> str:
    """Escapa los '$' para que matplotlib no los lea como fórmula."""
    return str(texto).replace("$", r"\$")


COLUMNAS = ["momento", "ip", "usuario", "exito", "metodo", "usuario_valido", "puerto"]
COLOR_FALLO = "#c0392b"
COLOR_EXITO = "#2e86c1"
COLOR_ATAQUE = "#f5b7b1"


def a_dataframe(intentos: Iterable[Intento]) -> pd.DataFrame:
    """Una fila por intento. Si no hay intentos, devuelve la tabla vacía con
    las columnas correctas (así el resto del código no se rompe)."""
    filas = [{c: getattr(i, c) for c in COLUMNAS} for i in intentos]
    df = pd.DataFrame(filas, columns=COLUMNAS)
    df["momento"] = pd.to_datetime(df["momento"])
    df["exito"] = df["exito"].astype(bool)
    return df


def resumen_por_ip(df: pd.DataFrame) -> pd.DataFrame:
    """Tabla con una fila por IP, ordenada de más a menos fallos.

    groupby("ip") reparte las filas en grupos por IP; agg() calcula una
    columna nueva por cada pareja nombre=(columna, operación).
    """
    if df.empty:
        return pd.DataFrame(columns=["intentos", "fallos", "exitos", "usuarios_distintos", "primero", "ultimo", "tasa_fallo"])
    df = df.assign(fallo=~df["exito"])  # ~ invierte True/False
    tabla = df.groupby("ip").agg(
        intentos=("exito", "size"),
        fallos=("fallo", "sum"),
        exitos=("exito", "sum"),
        usuarios_distintos=("usuario", "nunique"),
        primero=("momento", "min"),
        ultimo=("momento", "max"),
    )
    tabla["tasa_fallo"] = (tabla["fallos"] / tabla["intentos"]).round(3)
    return tabla.sort_values(["fallos", "intentos"], ascending=False)


def tabla_incidentes(incidentes: Iterable[Incidente]) -> pd.DataFrame:
    return pd.DataFrame(
        [{
            "ip": i.ip, "regla": i.regla, "inicio": i.inicio, "fin": i.fin,
            "duracion_s": int(i.duracion.total_seconds()), "fallos": i.fallos,
            "usuarios": ", ".join(sorted(i.usuarios)), "comprometido": i.comprometido,
            "usuario_exito": i.usuario_exito or "",
        } for i in incidentes],
        columns=["ip", "regla", "inicio", "fin", "duracion_s", "fallos", "usuarios", "comprometido", "usuario_exito"],
    )


# --- gráficos ---------------------------------------------------------------

def grafico_top_ips(df: pd.DataFrame, ruta: Path, atacantes: set[str] = frozenset(), n: int = 10) -> Path:
    """Barras horizontales: las n IPs con más fallos. Las atacantes en rojo."""
    top = resumen_por_ip(df).head(n).iloc[::-1]  # iloc[::-1] invierte: la mayor queda arriba
    fig, ax = plt.subplots(figsize=(8, 4.5))
    colores = [COLOR_FALLO if ip in atacantes else "#95a5a6" for ip in top.index]
    ax.barh(top.index, top["fallos"], color=colores)
    for y, valor in enumerate(top["fallos"]):
        ax.text(valor, y, f" {int(valor)}", va="center", fontsize=9)
    ax.margins(x=0.08)
    ax.set_title(f"Top {len(top)} IPs por intentos fallidos (rojo = incidente detectado)")
    ax.set_xlabel("intentos fallidos")
    ax.spines[["top", "right"]].set_visible(False)
    return _guardar(fig, ruta)


def grafico_linea_tiempo(df: pd.DataFrame, ruta: Path, incidentes: Iterable[Incidente] = (), cada: str = "10min") -> Path:
    """Intentos por intervalo de tiempo: fallidos vs. exitosos, con los
    incidentes sombreados. resample() agrupa por tramos de tiempo."""
    fig, ax = plt.subplots(figsize=(10, 4))
    if not df.empty:
        serie = df.set_index("momento")
        fallos = serie[~serie["exito"]].resample(cada).size()
        exitos = serie[serie["exito"]].resample(cada).size()
        ax.plot(fallos.index, fallos.values, color=COLOR_FALLO, label="fallidos", linewidth=1.4)
        ax.plot(exitos.index, exitos.values, color=COLOR_EXITO, label="exitosos", linewidth=1.4)
    etiquetas = {"incidente", "login tras ataque"}  # cada etiqueta solo una vez en la leyenda
    for inc in incidentes:
        ax.axvspan(inc.inicio, inc.fin, color=COLOR_ATAQUE, alpha=0.5,
                   label="incidente" if "incidente" in etiquetas else None)
        etiquetas.discard("incidente")
        if inc.comprometido:
            ax.axvline(inc.momento_exito, color="black", linestyle="--", linewidth=1,
                       label="login tras ataque" if "login tras ataque" in etiquetas else None)
            etiquetas.discard("login tras ataque")
    ax.set_title(f"Intentos de login cada {cada}", pad=28)
    ax.set_ylabel("intentos")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m %H:%M"))
    fig.autofmt_xdate()
    ax.set_ylim(bottom=0)
    # La leyenda va encima del gráfico, para que no tape ninguna línea.
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=4, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    return _guardar(fig, ruta)


def grafico_usuarios(df: pd.DataFrame, ruta: Path, n: int = 12) -> Path:
    """Usuarios más probados en intentos fallidos, separando los que existen
    de los inventados (señal típica de enumeración)."""
    fallidos = df[~df["exito"]]
    tabla = fallidos.groupby(["usuario", "usuario_valido"]).size().unstack(fill_value=0)
    tabla = tabla.reindex(columns=[True, False], fill_value=0)
    tabla = tabla.loc[tabla.sum(axis=1).sort_values(ascending=False).index].head(n).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    etiquetas = [etiqueta_segura(u) for u in tabla.index]
    ax.barh(etiquetas, tabla[True], color="#7f8c8d", label="usuario existe")
    ax.barh(etiquetas, tabla[False], left=tabla[True], color="#e67e22", label="usuario inventado")
    for y, total in enumerate(tabla.sum(axis=1)):
        ax.text(total, y, f" {int(total)}", va="center", fontsize=9)
    ax.margins(x=0.08)
    ax.set_title("Usuarios más atacados (intentos fallidos)")
    ax.set_xlabel("intentos fallidos")
    ax.legend(loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    return _guardar(fig, ruta)


def _guardar(fig, ruta: Path) -> Path:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(ruta, dpi=120)
    plt.close(fig)  # libera memoria: matplotlib guarda las figuras abiertas
    return ruta


# --- reporte completo ---------------------------------------------------------

def _tabla_md(df: pd.DataFrame) -> str:
    """Convierte un DataFrame pequeño en tabla Markdown (sin dependencias extra)."""
    if df.empty:
        return "_(sin datos)_\n"
    cabecera = "| " + " | ".join(map(str, df.columns)) + " |"
    separador = "|" + "---|" * len(df.columns)
    filas = ["| " + " | ".join(str(v) for v in fila) + " |" for fila in df.itertuples(index=False)]
    return "\n".join([cabecera, separador, *filas]) + "\n"


def generar_reporte(intentos: list[Intento], incidentes: list[Incidente], carpeta: str | Path) -> dict[str, Path]:
    """Escribe en 'carpeta' todos los archivos del reporte y devuelve sus rutas."""
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    df = a_dataframe(intentos)
    resumen = resumen_por_ip(df)
    incs = tabla_incidentes(incidentes)
    atacantes = {i.ip for i in incidentes}

    rutas = {
        "intentos_csv": carpeta / "intentos.csv",
        "resumen_csv": carpeta / "resumen_por_ip.csv",
        "incidentes_csv": carpeta / "incidentes.csv",
        "top_ips": grafico_top_ips(df, carpeta / "top_ips.png", atacantes),
        "linea_tiempo": grafico_linea_tiempo(df, carpeta / "linea_tiempo.png", incidentes),
        "usuarios": grafico_usuarios(df, carpeta / "usuarios.png"),
        "markdown": carpeta / "reporte.md",
    }
    csv_seguro(df).to_csv(rutas["intentos_csv"], index=False)
    csv_seguro(resumen).to_csv(rutas["resumen_csv"])
    csv_seguro(incs).to_csv(rutas["incidentes_csv"], index=False)

    total, fallos = len(df), int((~df["exito"]).sum())
    comprometidos = sorted({i.ip for i in incidentes if i.comprometido})
    top = resumen.head(10).reset_index()[["ip", "intentos", "fallos", "exitos", "usuarios_distintos"]] if not resumen.empty else resumen
    vista_inc = incs[["ip", "regla", "inicio", "duracion_s", "fallos", "comprometido"]] if not incs.empty else incs
    texto = [
        "# Reporte de Centinela\n",
        f"- Intentos de login analizados: **{total}** ({fallos} fallidos, {total - fallos} exitosos)",
        f"- IPs distintas: **{df['ip'].nunique()}**",
        f"- Incidentes detectados: **{len(incidentes)}** en **{len(atacantes)}** IPs",
        f"- IPs comprometidas (login exitoso tras el ataque): **{', '.join(comprometidos) or 'ninguna'}**\n",
        "## Incidentes\n", _tabla_md(vista_inc),
        "## Top 10 IPs por fallos\n", _tabla_md(top),
        "## Gráficos\n",
        "![Línea de tiempo](linea_tiempo.png)\n",
        "![Top IPs](top_ips.png)\n",
        "![Usuarios](usuarios.png)\n",
    ]
    rutas["markdown"].write_text("\n".join(texto), encoding="utf-8")
    return rutas
