"""
Figuras de los PDF: recorte, vínculo con el artículo y descripción con un modelo de visión.

Paso 1, sin costo:
- encuentra las imágenes de cada página del CE y de los RT;
- descarta logos y sellos (la misma imagen repetida en muchas páginas) y las muy chicas;
- recorta cada figura a PNG;
- la vincula al artículo o RT de esa página (según data/v2/chunks.jsonl);
- toma el epígrafe del texto que la rodea.

Paso 2 (--describir USD_MAX): describe cada figura con un modelo barato vía OpenRouter, con un
tope de gasto. El texto se usa para buscarla («describe y embebe») y para mostrarla citada.

Uso:
  python -I ingest_v2/extraer_figuras.py <carpeta PDF> [--describir 1.50] [--modelo google/gemini-3.8-flash]
Salida: data/v2/figuras/*.png y data/v2/figuras.jsonl
"""
import argparse
import base64
import concurrent.futures as cf
import hashlib
import io
import json
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jurisdiccion import DE_LA_CIUDAD, PDF_CE, PDF_RT  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "v2" / "figuras"
INDICE = RAIZ / "data" / "v2" / "figuras.jsonl"
CHUNKS = RAIZ / "data" / "v2" / "chunks.jsonl"
DOCS = {"CE": PDF_CE, "RT": PDF_RT}
EPIGRAFE = re.compile(r"^(Figura|Fig\.|Gr[áa]fico|Esquema|Imagen|Cuadro|Tabla|Plano|Detalle)\b", re.I)

TAREA = """Esta imagen es una figura de la normativa de edificación«ciudad».
Devolvé SOLO un JSON: {"tipo": "...", "descripcion": "...", "textos": ["..."]}.
- tipo: uno de "plano", "corte", "esquema", "diagrama", "tabla", "grafico", "foto", "formulario", "logo_sello", "otro".
- descripcion: 1 a 3 frases en español que digan qué muestra y para qué sirve (medidas, elementos, relación con la norma). No inventes datos que no se ven.
- textos: los rótulos, cotas y medidas legibles tal como aparecen (máximo 25). Si algo es ilegible, no lo pongas.""".replace("«ciudad»", DE_LA_CIUDAD)


def cargar_secciones():
    """Por documento y página: las secciones (artículo, RT, ubicación) que cubren esa página."""
    por_pag = defaultdict(list)
    for linea in CHUNKS.read_text(encoding="utf-8").splitlines():
        r = json.loads(linea)
        doc = "CE" if r["source_doc"] == "CodigoEdificacion" else "RT"
        clave = (r.get("rt_code"), r.get("articulo"), r["ubicacion"])
        for p in range(r["pagina"], r.get("pagina_fin", r["pagina"]) + 1):
            if clave not in [x[0] for x in por_pag[(doc, p)]]:
                por_pag[(doc, p)].append((clave, r["pagina"]))
    return por_pag


def articulo_de(page, bbox, secs, pn):
    """El artículo cuyo título está más cerca por encima de la figura, en la misma página.
    Si ningún título de esta página queda arriba, la figura sigue al artículo que venía de antes."""
    numerados = {c[1]: c for c, _ in secs if c[1]}
    mejor, mejor_y = None, -1.0
    for x0, y0, x1, y1, t, *_ in page.get_text("blocks"):
        if y0 >= bbox.y0:
            continue
        m = re.match(r"\s*(\d+(?:\.\d+)*)\.?-?\s", t)
        if m and m.group(1) in numerados and y0 > mejor_y:
            mejor, mejor_y = numerados[m.group(1)], y0
    if mejor:
        return mejor
    previos = [(c, ini) for c, ini in secs if ini < pn]
    elegido = max(previos or secs, key=lambda x: x[1])
    return elegido[0]


def epigrafe(page, bbox):
    """Texto corto pegado arriba o abajo de la figura que parezca un epígrafe."""
    cands = []
    for b in page.get_text("blocks"):
        x0, y0, x1, y1, t = b[0], b[1], b[2], b[3], b[4].strip()
        if not t or x1 < bbox.x0 or x0 > bbox.x1:
            continue
        dist = min(abs(y0 - bbox.y1), abs(bbox.y0 - y1))
        if dist < 40 and len(t) < 200:
            cands.append((0 if EPIGRAFE.match(t) else 1, dist, " ".join(t.split())))
    cands.sort()
    return cands[0][2] if cands and cands[0][0] == 0 else None


def extraer(base):
    SALIDA.mkdir(parents=True, exist_ok=True)
    secciones = cargar_secciones()
    figuras, descartes = [], Counter()
    for doc_id, nombre in DOCS.items():
        pdf = fitz.open(base / nombre)
        # Imágenes repetidas en muchas páginas = logos, escudos, sellos.
        apariciones = Counter()
        for page in pdf:
            for info in page.get_image_info(hashes=True):
                apariciones[info["digest"]] += 1
        for pn, page in enumerate(pdf, start=1):
            if (doc_id, pn) not in secciones:
                descartes["página fuera del índice (tapa, índice, hoja de firmas)"] += 1 if page.get_images() else 0
                continue
            area_pag = page.rect.width * page.rect.height
            vistos = set()
            for i, info in enumerate(page.get_image_info(hashes=True)):
                bbox = fitz.Rect(info["bbox"]) & page.rect
                if bbox.is_empty:
                    continue
                if apariciones[info["digest"]] > 3:
                    descartes["repetida en más de 3 páginas (logo o sello)"] += 1
                    continue
                if bbox.width * bbox.height < 0.02 * area_pag or min(bbox.width, bbox.height) < 40:
                    descartes["muy chica"] += 1
                    continue
                if info["digest"] in vistos:
                    continue
                vistos.add(info["digest"])
                pix = page.get_pixmap(clip=bbox, matrix=fitz.Matrix(2, 2))
                fid = f"{doc_id}-p{pn:04d}-{len(vistos)}"
                pix.save(SALIDA / f"{fid}.png")
                secs = secciones[(doc_id, pn)]
                (rt, art, ubic) = articulo_de(page, bbox, secs, pn)
                figuras.append({
                    "id": fid, "documento": doc_id, "pdf": nombre, "pagina": pn,
                    "bbox": [round(v, 1) for v in bbox], "rt_code": rt, "articulo": art, "ubicacion": ubic,
                    "epigrafe": epigrafe(page, bbox), "ancho_px": pix.width, "alto_px": pix.height,
                    "sha1": hashlib.sha1(pix.samples).hexdigest()[:12],
                })
    return figuras, descartes


def llamar(modelo, key, png):
    body = {"model": modelo, "temperature": 0, "usage": {"include": True}, "messages": [{"role": "user", "content": [
        {"type": "text", "text": TAREA},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}}]}]}
    err = ""
    for intento in range(3):
        try:
            req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                         headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                                                  "X-Title": "Norma figuras"})
            with urllib.request.urlopen(req, timeout=180) as r:
                j = json.load(r)
            txt = j["choices"][0]["message"]["content"]
            if isinstance(txt, list):
                txt = "".join(c.get("text", "") for c in txt)
            return json.loads(txt[txt.find("{"): txt.rfind("}") + 1]), float(j.get("usage", {}).get("cost") or 0)
        except Exception as e:  # noqa: BLE001
            err = str(e)[:200]
            time.sleep(3 * (intento + 1))
    return {"_error": err}, 0.0


def describir(figuras, usd_max, modelo):
    env = RAIZ / ".env.local"
    key = next(l.split("=", 1)[1].strip().strip('"').strip("'") for l in env.read_text(encoding="utf-8").splitlines()
               if l.strip().startswith("OPENROUTER_API_KEY="))
    previas = {}
    if INDICE.exists():  # no se paga dos veces la misma figura
        for l in INDICE.read_text(encoding="utf-8").splitlines():
            f = json.loads(l)
            if f.get("vision") and "_error" not in f["vision"]:
                previas[f["sha1"]] = f["vision"]
    gasto, pend = 0.0, []
    for f in figuras:
        if f["sha1"] in previas:
            f["vision"] = previas[f["sha1"]]
        else:
            pend.append(f)
    print(f"Para describir: {len(pend)} (ya descritas: {len(figuras) - len(pend)}) · tope USD {usd_max}")
    with cf.ThreadPoolExecutor(6) as ex:
        futuros = {}
        for f in pend:
            futuros[ex.submit(llamar, modelo, key, (SALIDA / f"{f['id']}.png").read_bytes())] = f
        for n, fut in enumerate(cf.as_completed(futuros), 1):
            f = futuros[fut]
            f["vision"], costo = fut.result()
            f["vision_modelo"] = modelo
            gasto += costo
            if n % 25 == 0:
                print(f"  {n}/{len(pend)} · USD {gasto:.3f}")
            if gasto > usd_max:
                print("Tope de gasto alcanzado: se cancela el resto.")
                for g in futuros:
                    g.cancel()
                break
    return gasto


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--describir", type=float, default=0.0)
    ap.add_argument("--modelo", default="google/gemini-3.8-flash")
    a = ap.parse_args()
    figuras, descartes = extraer(Path(a.base))
    print(f"Figuras: {len(figuras)} · CE {sum(f['documento'] == 'CE' for f in figuras)} · RT {sum(f['documento'] == 'RT' for f in figuras)}")
    print("Descartadas:", dict(descartes))
    print("Con epígrafe:", sum(1 for f in figuras if f["epigrafe"]))
    if a.describir > 0:
        gasto = describir(figuras, a.describir, a.modelo)
        tipos = Counter(f.get("vision", {}).get("tipo", "sin describir") for f in figuras)
        print(f"Gasto: USD {gasto:.3f} · tipos: {dict(tipos)}")
    else:  # conserva descripciones previas aunque no se describa de nuevo
        if INDICE.exists():
            prev = {json.loads(l)["sha1"]: json.loads(l).get("vision") for l in INDICE.read_text(encoding="utf-8").splitlines()}
            for f in figuras:
                if prev.get(f["sha1"]):
                    f["vision"] = prev[f["sha1"]]
    INDICE.write_text("\n".join(json.dumps(f, ensure_ascii=False) for f in figuras) + "\n", encoding="utf-8")
    print(f"Guardado {INDICE}")


if __name__ == "__main__":
    main()
