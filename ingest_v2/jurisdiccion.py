"""La jurisdicción para la ingesta: el lugar que nombran los prompts de visión y los sellos que se limpian.

Se elige con JURISDICCION (variable de entorno o línea de .env.local), igual que el servicio;
por defecto, jurisdicciones/ejemplo. Ver jurisdicciones/README.md.
"""
import json
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _ruta():
    valor = os.environ.get("JURISDICCION")
    env = RAIZ / ".env.local"
    if not valor and env.exists():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.strip().startswith("JURISDICCION="):
                valor = linea.split("=", 1)[1].strip().strip("\"'")
    d = Path(valor or "jurisdicciones/ejemplo")
    return d if d.is_absolute() else RAIZ / d


def cargar(dir=None):
    d = Path(dir) if dir else _ruta()
    f = d / "jurisdiccion.json"
    if not f.exists():
        raise SystemExit(f"No hay jurisdicción en {d}. Revisá la variable JURISDICCION.")
    return json.loads(f.read_text(encoding="utf-8"))


J = cargar()
ING = J["ingesta"]
# Se insertan tal cual en los prompts: «del Código Urbanístico{DE_LUGAR}, en orden…».
DE_LUGAR = ING["de_lugar"]
DE_LA_CIUDAD = ING["de_la_ciudad"]
SELLO = ING["sello"]
ENCABEZADO = ING["encabezado"]
# Nombre de archivo de cada PDF de origen, por sigla.
PDF_CE = ING["pdfs"]["CE"]
PDF_RT = ING["pdfs"]["RT"]
