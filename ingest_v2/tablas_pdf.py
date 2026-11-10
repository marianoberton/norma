"""
Cuadros del Código de Edificación y de los Reglamentos Técnicos: leídos de la grilla del PDF y verificados.

Problema: la capa de texto aplana los cuadros («Tipo de Local … Lado mínimo mínima (m) (m 2) Baño tipo I
1,50 3,00») y el modelo de respuesta tiene que adivinar qué número va con qué columna. Así GPT-6 Luna llegó a
decir «baño tipo I: 1,50 m² y lado 3,00 m» (es al revés) y Haiku, «F60 en todas».

Solución: cada fila del cuadro se escribe con el nombre de su columna, igual que las filas del CUR:

    Cuadro · Tipo de Local destinado a Servicio de Salubridad: Baño tipo I(In-Lo-Ba) · Lado mínimo (m): 1,50 · Superficie mínima (m2): 3,00

y ninguna fila entra al índice si no la leen igual dos lecturas independientes:
  G. grilla: `page.find_tables()` arma las celdas con las líneas del PDF, sin modelos;
  V. visión: Claude Haiku 5.5 transcribe la imagen de la página;
  A. árbitro: Gemini 3.8 Flash (otra familia), solo en las páginas donde G y V no coinciden.
Regla (2 de 3): una fila vale si aparece igual en dos lecturas (normalizando espacios, coma decimal y
palabras cortadas con guion); el encabezado, si coincide en dos lecturas o si el cuadro continúa uno ya
verificado. Se usa la lectura con más filas confirmadas, con preferencia por la grilla (texto exacto del PDF).
Las filas sin confirmar NO entran como texto: el fragmento dice cuántas faltan y remite a la imagen del cuadro.
Casos que esto atrapa: texto girado dentro de una celda (la grilla lo lee al revés), encabezados de varias
filas mal armados, cuadros sin líneas entre filas, un número asignado a la columna equivocada.

Además, cada cuadro se recorta como imagen y se vincula a su artículo: la interfaz lo muestra junto a la cita.

Pasos (cada uno guarda su resultado en data/v2/tablas/ y retoma lo hecho):
  python -I ingest_v2/tablas_pdf.py geometria  <carpeta PDF>              # sin API, ~5 min
  python -I ingest_v2/tablas_pdf.py vision     <carpeta PDF> <tope_usd>   # Haiku, todas las páginas con cuadros
  python -I ingest_v2/tablas_pdf.py arbitro    <carpeta PDF> <tope_usd>   # Gemini, solo las dudosas
  python -I ingest_v2/tablas_pdf.py decidir    <carpeta PDF>              # sin API: cuadros.json + revisar.json
Después, extraer_pdf.py usa data/v2/tablas/cuadros.json.
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jurisdiccion import DE_LUGAR, PDF_CE, PDF_RT  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "data" / "v2" / "tablas"
FIGS = RAIZ / "data" / "v2" / "figuras"
CE_PDF = PDF_CE
RT_PDF = PDF_RT
RT_CAB = re.compile(r"RT-\s*\d{5,6}|VERSI[ÓO]N", re.I)
NUM = re.compile(r"^[\d.,x%\-+/<>=≥≤ ]+$")


def sigla(pdf):
    return "RT" if pdf == RT_PDF else "CE"


def _t(c):
    # «empre-\nsas» -> «empresas»: palabra cortada al final de un renglón de la celda.
    c = re.sub(r"([a-záéíóúñ])-[ \t]*\n[ \t]*([a-záéíóúñ])", r"\1\2", c or "")
    return re.sub(r"\s+", " ", c).strip()


def _norm(v):
    v = re.sub(r"([a-záéíóúñ])- ([a-záéíóúñ])", r"\1\2", str(v).lower()).replace(",", ".").replace("²", "2").replace("³", "3")
    return re.sub(r"[^0-9a-záéíóúñü.%+\-/<>=≥≤]", "", v).rstrip(".")


# ------------------------------------------------------------------ A. geometría
def _crudo(t):
    """Celdas con las combinadas repetidas hacia donde se extienden + caja de cada columna."""
    datos = t.extract()
    cajas = [r.cells for r in t.rows]
    n, m = len(datos), max(len(r) for r in datos)
    cols = {}
    for r in cajas:
        for j, c in enumerate(r):
            if c is not None and (j + 1 >= len(r) or r[j + 1] is not None):  # celda de una sola columna
                x0, x1 = cols.get(j, (c[0], c[2]))
                cols[j] = (min(x0, c[0]), max(x1, c[2]))
    crudo = [[datos[i][j] if j < len(datos[i]) else None for j in range(m)] for i in range(n)]
    out = [[None] * m for _ in range(n)]
    span_h = [False] * n  # la fila tiene una celda que abarca varias columnas
    for i in range(n):
        y1_fila = t.rows[i].bbox[3]
        for j in range(m):
            if crudo[i][j] is not None:
                out[i][j] = crudo[i][j]
                continue
            arriba = next((k for k in range(i - 1, -1, -1) if j < len(cajas[k]) and cajas[k][j] is not None), None)
            if arriba is not None and cajas[arriba][j][3] >= y1_fila - 1:
                out[i][j] = out[arriba][j]
                continue
            izq = next((l for l in range(min(j, len(cajas[i])) - 1, -1, -1) if cajas[i][l] is not None), None)
            out[i][j] = out[i][izq] if izq is not None else ""
            span_h[i] = span_h[i] or izq is not None
    primera_combinada = [bool(cajas[i]) and cajas[i][0] is None for i in range(n)]
    return {"bbox": [round(v, 1) for v in t.bbox], "celdas": out, "cols": [list(cols.get(j, (0, 0))) for j in range(m)],
            "externo": [_t(x) for x in t.header.names] if t.header.external else None,
            "primera_combinada": primera_combinada, "span_h": span_h}


def geometria(base):
    sys.path.insert(0, str(Path(__file__).parent))
    import extraer_pdf as ep
    res = []
    for pdf in (CE_PDF, RT_PDF):
        doc = fitz.open(base / pdf)
        for pn in range(len(doc)):
            page = doc[pn]
            h = page.rect.height
            if pdf == RT_PDF:
                fs = ep.filas(page)
                txt = " ".join(f["t"] for f in fs)
                if "Hoja Adicional de Firmas" in txt or len(set(ep.RT_RE.findall(txt))) >= 3:
                    continue  # firmas e índice de RT: no pasan por el cuerpo
                arriba, abajo = (ep.limite_cabecera_rt(fs) or 0), h - 110
            else:
                arriba, abajo = 62, h - 60
            tablas = []
            for t in page.find_tables().tables:
                x0, y0, x1, y1 = t.bbox
                if y1 <= arriba + 2 or y0 >= abajo or t.row_count < 2 or t.col_count < 2:
                    continue
                if y0 < 200 and RT_CAB.search(" ".join(_t(c) for r in t.extract() for c in r if c)):
                    continue  # encabezado de página de un RT
                tablas.append(_crudo(t))
            if tablas:
                res.append({"pdf": pdf, "pagina": pn + 1, "arriba": arriba, "abajo": abajo, "tablas": tablas})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "geometria.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print(len(res), "páginas,", sum(len(p["tablas"]) for p in res), "cuadros")


def _sin_columnas_repetidas(enc, filas, cols):
    """Una columna lógica partida en varias celdas (líneas de más en la grilla) se junta."""
    keep = []
    for j in range(len(enc)):
        if keep:
            k = keep[-1]
            if all(_t(f[j]) == _t(f[k]) for f in filas) and (not enc[j] or not enc[k] or enc[j] == enc[k]):
                enc[k] = enc[k] or enc[j]
                cols[k] = [min(cols[k][0], cols[j][0]), max(cols[k][1], cols[j][1])]
                continue
        keep.append(j)
    return [enc[j] for j in keep], [[f[j] for j in keep] for f in filas], [cols[j] for j in keep]


def procesar(pag, previa=None):
    """Encabezados, filas y columnas de cada cuadro de la página. `previa`: último cuadro de la página anterior."""
    cuadros = []
    for tb in pag["tablas"]:
        celdas, cols = tb["celdas"], [list(c) for c in tb["cols"]]
        titulo = None
        if not tb["externo"]:
            # Fila de título que ocupa todo el ancho («PLANILLA DE …»): no es el encabezado de las columnas.
            while len(celdas) > 2 and celdas[0][0] and all(_t(x) == _t(celdas[0][0]) for x in celdas[0]):
                titulo = _t(celdas[0][0]) if titulo is None else f"{titulo} · {_t(celdas[0][0])}"
                celdas = celdas[1:]
                tb = dict(tb, primera_combinada=tb["primera_combinada"][1:], span_h=(tb.get("span_h") or [False] * (len(celdas) + 1))[1:])
        if tb["externo"]:
            enc, cuerpo = list(tb["externo"]), celdas
        else:
            nh = 1
            span_h = tb.get("span_h") or [False] * len(celdas)
            while nh < len(celdas) - 1 and (
                    (tb["primera_combinada"][nh] and celdas[nh][0] == celdas[0][0])  # 1.ª celda abarca varias filas
                    or (span_h[nh - 1] and not any(NUM.match(_t(x)) for x in celdas[nh] if _t(x)))):
                nh += 1  # encabezado de dos niveles: un título que agrupa columnas y sus subtítulos debajo
            enc = []
            for j in range(len(celdas[0])):
                partes = []
                for i in range(nh):
                    v = _t(celdas[i][j])
                    if v and v not in partes:
                        partes.append(v)
                enc.append(" ".join(partes))
            cuerpo = celdas[nh:]
        continua = bool(previa and previa["hasta_el_pie"] and tb["bbox"][1] < pag["arriba"] + 60
                        and previa["columnas"] == len(enc))
        if continua and enc != previa["encabezados"]:
            cuerpo = [celdas[0]] + cuerpo if not tb["externo"] and nh == 1 else cuerpo
            enc = list(previa["encabezados"])
        enc, cuerpo, cols = _sin_columnas_repetidas(enc, cuerpo, cols)
        cuadros.append({"bbox": tb["bbox"], "titulo": titulo, "encabezados": enc, "filas_crudas": cuerpo,
                        "filas": [[_t(c) for c in f] for f in cuerpo], "cols": cols, "continua": continua})
        previa = {"columnas": len(enc), "encabezados": enc, "hasta_el_pie": tb["bbox"][3] > pag["abajo"] - 60}
    return cuadros, previa


def paginas():
    """Páginas con cuadros procesados, en orden, con la continuidad entre páginas resuelta."""
    out, previa, ultimo = [], None, None
    for pag in json.loads((OUT / "geometria.json").read_text(encoding="utf-8")):
        if ultimo != (pag["pdf"], pag["pagina"] - 1):
            previa = None
        cuadros, previa = procesar(pag, previa)
        out.append(dict(pag, cuadros=cuadros))
        ultimo = (pag["pdf"], pag["pagina"])
    return out


# ------------------------------------------------------------------ B. visión
TAREA = """Transcribí TODAS las tablas de esta página de una norma de edificación«lugar», sin inventar nada.
Devolvé SOLO un objeto JSON: {"tablas": [{"encabezados": [..], "filas": [[..], ..]}, ..]}.
- No incluyas el encabezado de página (logo, código RT, VERSIÓN) ni el pie.
- Una celda por columna, con el texto exacto (números con su coma decimal, "-", "F60", etc.).
- Cada fila visual de la tabla es una fila: si una columna tiene varios valores uno debajo del otro, cada uno va en su fila.
- Una celda combinada que abarca varias filas o columnas vale para CADA fila o columna que abarca: repetí su valor.
- Si el encabezado ocupa varias filas, uní sus textos en un solo encabezado por columna.
- Si una celda es ilegible, poné "?". Si no hay tablas, devolvé {"tablas": []}.""".replace("«lugar»", DE_LUGAR)


def vision(base, usd, modelo, sub="vision", solo=None):
    """Transcribe por visión las páginas con cuadros (o solo las de `solo`) en data/v2/tablas/<sub>/."""
    import concurrent.futures as cf
    import os
    sys.path.insert(0, str(Path(__file__).parent))
    import extraer_figuras as ef
    key = os.environ.get("OPENROUTER_API_KEY") or next(
        (l.split("=", 1)[1].strip() for l in (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines()
         if l.startswith("OPENROUTER_API_KEY=")), "")
    d = OUT / sub
    d.mkdir(parents=True, exist_ok=True)
    pags = json.loads((OUT / "geometria.json").read_text(encoding="utf-8"))
    pend = [(p["pdf"], p["pagina"]) for p in pags if not (d / f"{sigla(p['pdf'])}-p{p['pagina']:04d}.json").exists()
            and (solo is None or (p["pdf"], p["pagina"]) in solo)]
    print(f"{len(pags)} páginas con cuadros, {len(pend)} por transcribir · tope USD {usd} · {modelo}", flush=True)
    docs = {n: fitz.open(base / n) for n in (CE_PDF, RT_PDF)}
    viejo, ef.TAREA = ef.TAREA, TAREA
    gasto, hechas = 0.0, 0

    def trabajo(k):
        png = docs[k[0]][k[1] - 1].get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png")
        return k, *ef.llamar(modelo, key, png)

    try:
        with cf.ThreadPoolExecutor(6) as ex:
            futs = [ex.submit(trabajo, k) for k in pend]
            for f in cf.as_completed(futs):
                k, data, costo = f.result()
                gasto += costo
                hechas += 1
                if "_error" in data:
                    print("error", k, data["_error"][:80], flush=True)
                else:
                    data["_modelo"] = modelo
                    (d / f"{sigla(k[0])}-p{k[1]:04d}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                if hechas % 50 == 0:
                    print(f"  {hechas}/{len(pend)} · USD {gasto:.3f}", flush=True)
                if gasto > usd:
                    print("Tope alcanzado.", flush=True)
                    for g in futs:
                        g.cancel()
                    break
    finally:
        ef.TAREA = viejo
    print(f"gasto USD {gasto:.3f}")


# ------------------------------------------------------------------ controles y decisión (2 de 3)
def _hnorm(h):
    h = re.sub(r"([a-záéíóúñ])- ([a-záéíóúñ])", r"\1\2", _t(str(h)).lower()).replace("²", "2").replace("³", "3")
    return re.sub(r"[^0-9a-záéíóúñü%]", "", h)


def _rnorm(f):
    return tuple(x for x in (_norm(v) for v in f) if x)


def _celdas_iguales(a, b):
    """Misma fila, columna por columna. Única tolerancia: una celda combinada a lo ancho que una lectura deja
    vacía y la otra repite (vacío contra el mismo valor de la celda de la izquierda)."""
    if len(a) != len(b):
        return False
    na, nb = [_norm(x) for x in a], [_norm(x) for x in b]
    if not any(na):
        return False
    for j, (x, y) in enumerate(zip(na, nb)):
        if x == y:
            continue
        if j and ((not x and y == nb[j - 1]) or (not y and x == na[j - 1])):
            continue
        return False
    return True


def _lectura(t):
    """Tabla de un modelo de visión -> {encabezados, filas} con celdas de texto."""
    filas = [[_t(str(x)) for x in f] for f in t.get("filas", []) if any(_t(str(x)) for x in f)]
    return {"encabezados": [_t(str(h)) for h in t.get("encabezados", [])], "filas": filas}


def _la_que_corresponde(tablas, ref, k, n):
    """De las tablas que un modelo leyó en la página, la que corresponde al cuadro k (de n) de la grilla.

    Por filas en común o encabezado igual; si no hay nada en común (grilla ilegible), por orden en la página,
    pero solo si el modelo vio la misma cantidad de cuadros. Si no, ninguna: mejor sin lectura que la de otro cuadro."""
    claves = {_rnorm(f) for f in ref["filas"]}
    puntos = [(sum(1 for f in t["filas"] if _rnorm(f) in claves), _encabezado_igual(t["encabezados"], ref["encabezados"]))
              for t in tablas]
    i = max(range(len(tablas)), key=lambda j: puntos[j], default=None)
    if i is not None and (puntos[i][0] > 0 or puntos[i][1]):
        return tablas[i]
    return tablas[k] if len(tablas) == n else None


def _encabezado_igual(a, b):
    """Mismo nombre de columna, columna por columna. Tolera lo tipográfico: el orden de un superíndice
    («m².K» / «2 (W/m .K)»), apóstrofos y un título o aclaración que una lectura agrega y la otra no («Rubro» / «Rubro (subrubro)»). Las FILAS se
    comparan exactas (ahí un dígito cambiado es otro dato)."""
    def igual(x, y):
        x, y = _hnorm(x), _hnorm(y)
        return x == y or sorted(x) == sorted(y) or (min(len(x), len(y)) >= 3 and (x.endswith(y) or y.endswith(x) or x.startswith(y) or y.startswith(x)))
    return len(a) == len(b) and all(igual(x, y) for x, y in zip(a, b))


def _leer(sub, pdf, pagina):
    f = OUT / sub / f"{sigla(pdf)}-p{pagina:04d}.json"
    if not f.exists():
        return None
    return [_lectura(t) for t in json.loads(f.read_text(encoding="utf-8")).get("tablas", [])]


def evaluar(c, lecturas_pag, encabezado_heredado_ok, k=0, n=1):
    """Elige la lectura del cuadro y sus filas confirmadas por al menos otra lectura independiente.

    lecturas: G (grilla) y, si existen, V (visión) y A (árbitro). Una fila vale si aparece igual en dos
    lecturas; el encabezado, si coincide en dos lecturas (o si el cuadro continúa uno ya verificado)."""
    G = {"nombre": "grilla", "encabezados": c["encabezados"], "filas": c["filas"]}
    lecturas = [G]
    for nombre, tablas in lecturas_pag:
        if tablas:
            t = _la_que_corresponde(tablas, G, k, n)
            if t:
                lecturas.append(dict(t, nombre=nombre))
    mejor = None
    for R in lecturas:
        otras = [L for L in lecturas if L is not R]
        filas = [f for f in R["filas"] if _rnorm(f)]
        conf = [f for f in filas if any(_celdas_iguales(f, g) for L in otras for g in L["filas"])]
        enc_ok = any(_encabezado_igual(R["encabezados"], L["encabezados"]) for L in otras)
        if R is G and c["continua"] and encabezado_heredado_ok:
            enc_ok = True
        vacios = not any(R["encabezados"])
        if vacios and len(R["filas"][0] if R["filas"] else []) > 2:
            enc_ok = False  # sin nombres de columna no hay cómo atribuir los valores
        if not enc_ok:
            continue
        clave = (len(conf), R is G, R["nombre"] == "arbitro")
        if mejor is None or clave > mejor[0]:
            mejor = (clave, R, conf, filas)
    if mejor is None or not mejor[2]:
        return {"modo": "solo_imagen", "lectura": None, "encabezados": c["encabezados"], "filas": [],
                "sin_verificar": len([f for f in c["filas"] if _rnorm(f)])}
    _, R, conf, filas = mejor
    return {"modo": "verificado" if len(conf) == len(filas) else "parcial", "lectura": R["nombre"],
            "encabezados": R["encabezados"], "filas": conf, "sin_verificar": len(filas) - len(conf)}


def decidir(base, informar=True):
    final, revisar = [], []
    cuenta = {"verificado": 0, "recuadro": 0, "parcial": 0, "solo_imagen": 0}
    por_lectura = {}
    filas_ok = filas_sin = 0
    previo_ok = False
    for pag in paginas():
        V = _leer("vision", pag["pdf"], pag["pagina"])
        A = _leer("arbitro", pag["pdf"], pag["pagina"])
        cuadros = []
        for k, c in enumerate(pag["cuadros"]):
            todas = [c["encabezados"]] + c["filas"]
            if all(len({_t(x) for x in f if _t(x)}) <= 1 for f in todas):
                # Recuadro de texto (párrafos dentro de un marco): no hay columnas que asignar mal.
                textos = [next((_t(x) for x in f if _t(x)), "") for f in todas]
                e = {"modo": "recuadro", "lectura": "grilla", "encabezados": [], "sin_verificar": 0,
                     "filas": [[t] for t in textos if t]}
            else:
                e = evaluar(c, [("vision", V), ("arbitro", A)], previo_ok, k, len(pag["cuadros"]))
            previo_ok = e["modo"] != "solo_imagen" and e["lectura"] == "grilla"
            cuenta[e["modo"]] += 1
            por_lectura[e["lectura"]] = por_lectura.get(e["lectura"], 0) + 1
            filas_ok += len(e["filas"])
            filas_sin += e["sin_verificar"]
            if e["modo"] not in ("verificado", "recuadro"):
                revisar.append({"pdf": sigla(pag["pdf"]), "pagina": pag["pagina"], "cuadro": k + 1, "modo": e["modo"],
                                "lectura": e["lectura"], "sin_verificar": e["sin_verificar"],
                                "encabezados_grilla": c["encabezados"], "filas_grilla": c["filas"][:4]})
            confirmadas = {_rnorm(f) for f in e["filas"]}
            rotulos = []  # nombre de cada fila sin confirmar (1.ª celda): sirve para encontrar el cuadro, no es un dato
            for f in c["filas"]:
                if f and f[0] and _rnorm(f) not in confirmadas and f[0] not in rotulos:
                    rotulos.append(f[0])
            cuadros.append({"id": f"{sigla(pag['pdf'])}T-p{pag['pagina']:04d}-{k + 1}", "bbox": c["bbox"],
                            "encabezados_grilla": c["encabezados"], "rotulos_sin_verificar": rotulos,
                            "titulo": c.get("titulo"), "encabezados": e["encabezados"], "filas": e["filas"], "modo": e["modo"],
                            "lectura": e["lectura"], "sin_verificar": e["sin_verificar"], "continua": c["continua"]})
        final.append({"pdf": pag["pdf"], "pagina": pag["pagina"], "cuadros": cuadros})
    (OUT / "cuadros.json").write_text(json.dumps(final, ensure_ascii=False), encoding="utf-8")
    (OUT / "revisar.json").write_text(json.dumps(revisar, ensure_ascii=False, indent=1), encoding="utf-8")
    if informar:
        print("cuadros:", cuenta, "· lectura usada:", por_lectura)
        print(f"filas confirmadas por dos lecturas: {filas_ok} · sin confirmar (quedan fuera del texto): {filas_sin}"
              f" · cuadros para revisar: {len(revisar)}")
    return revisar


# ------------------------------------------------------------------ uso desde extraer_pdf
_FINAL = None


def cuadros_de(pdf, pagina):
    global _FINAL
    if _FINAL is None:
        f = OUT / "cuadros.json"
        _FINAL = {(d["pdf"], d["pagina"]): d["cuadros"] for d in json.loads(f.read_text(encoding="utf-8"))} if f.exists() else {}
    return _FINAL.get((pdf, pagina), [])


def renderizar(c):
    """Una línea por fila, cada valor con el nombre de su columna."""
    if c["modo"] == "recuadro":
        return "\n".join(f[0] for f in c["filas"])
    enc = [h or f"columna {j + 1}" for j, h in enumerate(c["encabezados"])]
    lineas = [f"Cuadro: {c['titulo']}"] if c.get("titulo") else []
    for fila in c["filas"]:
        if not any(fila):
            continue
        if all(v == fila[0] for v in fila):  # fila de título o de grupo que ocupa todo el ancho
            lineas.append(f"Cuadro · {fila[0]}")
            continue
        if not any(c["encabezados"]):  # cuadro de dos columnas sin títulos: «concepto: valor»
            lineas.append("Cuadro · " + ": ".join(v for v in fila if v))
            continue
        partes = [f"{h}: {v}" for h, v in zip(enc, fila) if v]
        lineas.append("Cuadro · " + " · ".join(partes))
    if c["modo"] not in ("verificado", "recuadro"):
        # Sin valores: solo de qué trata, para que el cuadro se encuentre y se muestre su imagen.
        cols = " · ".join(h for h in dict.fromkeys(c.get("encabezados_grilla") or []) if h)
        rot = "; ".join(c.get("rotulos_sin_verificar") or [])
        lineas.append(("Cuadro sin verificar" if c["modo"] == "solo_imagen" else
                       f"Resto del cuadro sin verificar ({c['sin_verificar']} filas)")
                      + ": sus valores no se transcriben porque dos lecturas independientes no coincidieron; "
                        "ver la imagen del cuadro en la norma."
                      + (f" Columnas: {cols}." if cols else "") + (f" Filas: {rot}." if rot else ""))
    return "\n".join(lineas)


def reemplazar_filas(filas_pag, cuadros):
    """Saca las filas de texto que caen dentro de un cuadro y pone el cuadro renderizado en su lugar."""
    if not cuadros:
        return filas_pag
    rects = [fitz.Rect(c["bbox"]) for c in cuadros]
    fuera = [f for f in filas_pag
             if not any(r.contains(fitz.Point(f.get("x0", 0) + 1, (f["y0"] + f["y1"]) / 2)) for r in rects)]
    nuevas = [{"x0": max(c["bbox"][0], 100), "y0": c["bbox"][1], "y1": c["bbox"][3], "t": renderizar(c),
               "bold": False, "size": 0, "salto": True, "cuadro": True, "cuadro_id": c["id"]} for c in cuadros]
    res = sorted(fuera + nuevas, key=lambda f: (f["y0"], f["x0"]))
    for i in range(1, len(res)):  # el párrafo que sigue a un cuadro empieza aparte
        if res[i - 1].get("cuadro"):
            res[i] = dict(res[i], salto=True)
    return res


def guardar_imagen(page, c):
    """Recorte PNG del cuadro, para mostrarlo junto a la cita."""
    FIGS.mkdir(parents=True, exist_ok=True)
    r = fitz.Rect(c["bbox"]) + (-4, -4, 4, 4)
    page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=r & page.rect).save(FIGS / f"{c['id']}.png")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, base = sys.argv[1], Path(sys.argv[2])
    if cmd == "geometria":
        geometria(base)
    elif cmd == "vision":
        vision(base, float(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "anthropic/claude-haiku-5.5")
    elif cmd == "decidir":
        decidir(base)
    elif cmd == "arbitro":
        # Tercera lectura (otra familia de modelo) solo donde la grilla y la visión no coinciden.
        dudosos = {(CE_PDF if r["pdf"] == "CE" else RT_PDF, r["pagina"]) for r in decidir(base, informar=False)}
        vision(base, float(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else "google/gemini-3.8-flash",
               sub="arbitro", solo=dudosos)
