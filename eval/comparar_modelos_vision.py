# Compara modelos de visión con las mismas páginas del CUR y una regla automática de acierto.
# Texto: coincidencia de letras con la capa de texto del PDF (que trae bien las letras).
# Tablas: filas con código y valores iguales a la extracción ya verificada (98,7 % de acuerdo entre dos fuentes).
import concurrent.futures as cf
import json
import re
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "ingest_v2"))
import fitz  # noqa: E402
import extraer_cur as ec  # noqa: E402
import extraer_figuras as ef  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
MODELOS = ["google/gemini-3.8-flash", "google/gemini-3.5-flash-lite", "google/gemini-2.5-flash-lite",
           "anthropic/claude-haiku-5.5", "openai/gpt-5-nano", "qwen/qwen3.7-flash", "z-ai/glm-5.3-flash",
           "deepseek/deepseek-v4.1-flash"]
PROSA = [16, 30, 45, 105, 140, 190]
TABLAS = [74, 80]
key = next(l.split("=", 1)[1].strip().strip('"').strip("'") for l in (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines()
           if l.startswith("OPENROUTER_API_KEY="))
doc = fitz.open(RAIZ.parent / "CUR" / "cur-cuerpo-principal_0.pdf")
png = {p: doc[p - 1].get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).tobytes("png") for p in PROSA}
png.update({p: doc[p - 1].get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png") for p in TABLAS})


def norm(v):
    return re.sub(r"[^0-9a-z]", "", str(v).lower())


def ref_tabla(p):
    d = json.loads((RAIZ / f"data/v2/cur/tablas/p{p:03d}.json").read_text(encoding="utf-8"))
    out = {}
    for f in d["filas"]:
        m = re.match(r"^(\d+(?:\.\d+)*)", str(f[0]).strip())
        if m and any(str(x).strip() for x in f[1:]):
            out[m.group(1)] = [norm(x) for x in f[1:]]
    return out


def correr(modelo, p):
    t0 = time.time()
    if p in PROSA:
        txt, costo = ec.llamar_texto(modelo, key, png[p])
        if not txt:
            return modelo, p, "texto", 0.0, costo, time.time() - t0
        return modelo, p, "texto", ec.acuerdo_letras(txt, doc[p - 1].get_text(flags=0)), costo, time.time() - t0
    viejo, ef.TAREA = ef.TAREA, ec.TAREA_TABLA
    try:
        data, costo = ef.llamar(modelo, key, png[p])
    finally:
        ef.TAREA = viejo
    ref = ref_tabla(p)
    got = {}
    for f in data.get("filas", []) if isinstance(data, dict) else []:
        m = re.match(r"^(\d+(?:\.\d+)*)", str(f[0]).strip()) if f else None
        if m:
            got[m.group(1)] = [norm(x) for x in f[1:]]
    bien = sum(1 for k, v in ref.items() if got.get(k) == v)
    return modelo, p, "tabla", round(bien / max(len(ref), 1), 3), costo, time.time() - t0


res = []
with cf.ThreadPoolExecutor(8) as ex:
    for r in ex.map(lambda a: correr(*a), [(m, p) for m in MODELOS for p in PROSA + TABLAS]):
        res.append(r)
(RAIZ / "eval/comparaciones/modelos-vision.json").write_text(json.dumps(res), encoding="utf-8")
print(f"{'modelo':34} {'texto (6 págs)':>15} {'peor pág':>9} {'tablas (2 págs)':>16} {'USD/pág':>9} {'seg/pág':>8}")
total = 0
for m in MODELOS:
    t = [r for r in res if r[0] == m and r[2] == "texto"]
    b = [r for r in res if r[0] == m and r[2] == "tabla"]
    costo = sum(r[4] for r in res if r[0] == m)
    total += costo
    print(f"{m:34} {sum(r[3] for r in t) / len(t):15.3f} {min(r[3] for r in t):9.3f} {sum(r[3] for r in b) / len(b):16.3f} "
          f"{costo / len(t + b):9.5f} {sum(r[5] for r in t + b) / len(t + b):8.1f}")
print(f"Gasto de la prueba: USD {total:.3f}")
