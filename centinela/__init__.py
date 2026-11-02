"""
Centinela — detector de ataques de fuerza bruta en logs de SSH.

El paquete está dividido en un módulo por fase del proyecto:

    generador.py   Fase 1 · crea logs SSH de ejemplo realistas.
    parser.py      Fase 1 · lee el log con expresiones regulares.
    detector.py    Fase 2 · busca ráfagas de fallos por ventana de tiempo.
    reporte.py     Fase 3 · resume los datos con pandas y dibuja gráficos.
    lista_negra.py Fase 4 · mantiene la lista negra y el script de bloqueo.
    cli.py         La línea de comandos que une todo (python -m centinela).
"""

__version__ = "1.0.0"
