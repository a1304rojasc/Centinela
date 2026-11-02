"""
Permite ejecutar el paquete como programa:  python -m centinela ...

Python busca este archivo cuando usas "-m" con el nombre de un paquete.
Lo único que hace es llamar a la función principal de cli.py.
"""

from centinela.cli import main

raise SystemExit(main())
