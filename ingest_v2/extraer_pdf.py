"""
Ingesta v2: extrae fragmentos citables desde los PDF originales (no desde los .docx).

Qué arregla respecto de la ingesta v1:
- Código RT por página, leído del encabezado de cada página (antes: «el más frecuente del archivo»).
- Rastro encadenado por número: el padre de 3.4.7.3 es 3.4.7, con los títulos de los marcadores del PDF.
- Encabezados y pies de página recortados por geometría (sello IF-…, «Página N de M», número de página).
- Palabras cortadas con guion al final de línea se vuelven a unir.
- Artículos derogados quedan como registro propio, marcados.

Uso:  python -I ingest_v2/extraer_pdf.py <carpeta con los PDF> <salida.jsonl>
Salida: un JSON por línea, compatible con ChunkRecord (src/lib/vector-store.ts) más página y
campos de control. Imprime chequeos de validación al final; no llama a ninguna API.
"""
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tablas_pdf as tp  # noqa: E402
from jurisdiccion import PDF_CE, PDF_RT  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

CE_PDF = PDF_CE
RT_PDF = PDF_RT
MAX_CHARS, OVERLAP = 1100, 150

RT_RE = re.compile(r"RT-\d{6}-\d{6}-\d{2}")
# Códigos mal impresos en el PDF (sufijo de un dígito, bloque de 5 dígitos, espacios o guiones de más).
RT_FLOJO = re.compile(r"RT-\s*(\d{5,6})\s*-\s*(\d{6})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{2}))?")


def codigo_rt(texto):
    """Devuelve (código normalizado, impreso_mal). None si no hay código."""
    m = RT_RE.search(texto)
    if m:
        return m.group(0), False
    m = RT_FLOJO.search(texto)
    if not m:
        return None, False
    a, b, c, d = m.groups()
    if len(a) == 5:  # p. ej. «RT-03090-020204-01- 06»: no se puede reconstruir con certeza
        return None, True
    return f"RT-{a}-{b}-{int(c):02d}", True
VER_RE = re.compile(r"VERSI[ÓO]N\s*:?\s*(\d+)", re.I)
PAG_RE = re.compile(r"^P[áa]gina\s+(\d+)\s+de\s+(\d+)$", re.I)
IF_RE = re.compile(r"^IF-\d{4}-\d+")
NUM_RE = re.compile(r"^(\d+(?:\.\d+)+)\.?\s+(\S.*)$")      # 3.4.7.3 Título
RT_GUION_RE = re.compile(r"^(\d+(?:\.\d+)*)\.-\s*([A-ZÁÉÍÓÚÑ].*)$")
NUM1_RE = re.compile(r"^(\d+)\.\s+([A-ZÁÉÍÓÚÑ].*)$")       # 6. TÍTULO (solo RT, en negrita)


def filas(page):
    """Líneas de la página agrupadas en filas visuales (mismo renglón), en orden de lectura."""
    lineas = []
    for b in page.get_text("dict", sort=True)["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            t = " ".join(s["text"].strip() for s in spans)
            t = t.replace("‐", "-").replace("‑", "-")  # guiones Unicode que rompen los códigos RT
            s0 = spans[0]
            bold = bool(s0["flags"] & 16) or "bold" in s0["font"].lower()
            x0, y0, x1, y1 = l["bbox"]
            lineas.append({"x0": x0, "y0": y0, "y1": y1, "t": t, "bold": bold, "size": s0["size"]})
    lineas.sort(key=lambda l: (round(l["y0"]), l["x0"]))
    out = []
    for l in lineas:
        if out and abs(l["y0"] - out[-1]["y0"]) < 3:
            f = out[-1]
            f["t"] += " " + l["t"]
            f["y1"] = max(f["y1"], l["y1"])
        else:
            out.append(dict(l))
    return out


CUADROS_FIG = []  # imagen de cada cuadro, vinculada a su artículo (data/v2/tablas/figuras.jsonl)


def figuras_cuadro(seccion, documento, pdf, rt, articulo, ubic):
    for f in seccion["filas"]:
        if f.get("cuadro_id"):
            pag = int(f["cuadro_id"].split("-p")[1][:4])
            CUADROS_FIG.append({"id": f["cuadro_id"], "documento": documento, "pdf": pdf, "pagina": pag,
                                "rt_code": rt, "articulo": articulo, "ubicacion": ubic, "epigrafe": None,
                                "vision": {"tipo": "cuadro", "descripcion": f"Cuadro original del PDF, página {pag}."}})


def limite_cabecera_rt(fs):
    """y donde termina el encabezado de una página de RT (código, capítulo, «VERSIÓN: N»). None si no hay."""
    cod_f = next((f for f in fs if f["y0"] < 170 and (RT_RE.search(f["t"]) or RT_FLOJO.search(f["t"]))), None)
    ver_f = next((f for f in fs if f["y0"] < 190 and VER_RE.search(f["t"])), None)
    ancla = ver_f or cod_f
    if not ancla:
        return None
    # La banda del encabezado termina en la última fila de las columnas del encabezado
    # (x >= 140) que arranca cerca de la versión: el título del RT puede seguir un renglón abajo.
    banda = [f["y1"] for f in fs if f["x0"] >= 140 and f["y0"] < ancla["y1"] + 12]
    return max(banda + [ancla["y1"]]) + 4


def unir(filas_):
    """Une filas en párrafos: guion de corte + minúscula se pega; salto grande abre párrafo."""
    texto, prev = "", None
    for f in filas_:
        t = f["t"].strip()
        if prev is None:
            texto = t
        elif texto.endswith("-") and t[:1].islower():
            texto = texto[:-1] + t
        elif f["y0"] - prev["y1"] > 9 or f.get("salto"):
            texto += "\n" + t
        else:
            texto += " " + t
        prev = f
    return re.sub(r"[ \t]+", " ", texto).strip()


def partir(texto):
    """Corta un artículo largo en fragmentos de hasta MAX_CHARS con OVERLAP de solapamiento."""
    if len(texto) <= MAX_CHARS:
        return [texto]
    piezas, ini = [], 0
    while ini < len(texto):
        previo = ini
        fin = min(ini + MAX_CHARS, len(texto))
        cuadro = "Cuadro ·" in texto[ini:fin]
        if fin < len(texto):
            if cuadro:
                # En un cuadro se corta solo entre filas (hay filas de 600+ caracteres): cada fragmento
                # empieza y termina con filas enteras, cada una con el nombre de sus columnas.
                corte = texto.rfind("\n", ini + 1, fin)
                if corte <= ini:  # una sola fila más larga que el fragmento: va entera (hasta 3000)
                    sig = texto.find("\n", fin)
                    corte = sig if 0 < sig < ini + 3000 else -1
            else:
                corte = max(texto.rfind("\n", ini + MAX_CHARS // 2, fin), texto.rfind(". ", ini + MAX_CHARS // 2, fin))
            if corte > ini:
                fin = corte + 1
        piezas.append(texto[ini:fin].strip())
        if fin >= len(texto):
            break
        ini = max(fin - OVERLAP, ini + 1)
        linea = texto.rfind("\n", 0, ini) + 1
        if cuadro and linea > previo and texto.startswith("Cuadro ·", linea):
            ini = linea  # el solapamiento arranca al comienzo de una fila
        elif cuadro and texto.startswith("Cuadro ·", fin):
            ini = fin  # fila larga: sin solapamiento antes que partirla
        else:
            sp = texto.find(" ", ini)
            ini = sp + 1 if 0 <= sp < fin else ini
    return [p for p in piezas if p]


def rastro(num, titulos):
    """Cadena de ancestros por prefijo numérico: 3 › 3.4 › 3.4.7 › 3.4.7.3."""
    partes = num.split(".")
    out = []
    for i in range(1, len(partes) + 1):
        n = ".".join(partes[:i])
        if n in titulos:
            out.append(f"{n} {titulos[n]}")
    return out


# --------------------------------------------------------------------------- CE
def extraer_ce(pdf_path, validacion):
    doc = fitz.open(pdf_path)
    toc = doc.get_toc()
    titulos_bm = {}
    titulos_mayores = []  # (página 0-based, "TÍTULO 3. PROYECTO")
    for nivel, t, p in toc:
        t = t.strip()
        m = NUM_RE.match(t)
        if m:
            titulos_bm.setdefault(m.group(1), m.group(2).strip())
        elif t.upper().startswith("TÍTULO"):
            titulos_mayores.append((p - 1, t))
    inicio = min(p for p, _ in titulos_mayores)

    por_numero = {}
    for _, t in titulos_mayores:
        mm = re.match(r"T[ÍI]TULO\s+(\d+)\.\s*(.*)", t.strip(), re.I)
        if mm:
            nombre = re.sub(r"(^|\.\s+)(\w)", lambda x: x.group(1) + x.group(2).upper(), mm.group(2).strip().lower())
            por_numero[mm.group(1)] = f"Título {mm.group(1)}. {nombre}"

    def titulo_mayor(pag, num=None):
        # Manda el primer número del artículo: los marcadores de título pueden estar corridos de página.
        if num and num.split(".")[0] in por_numero:
            return por_numero[num.split(".")[0]]
        act = None
        for p, t in titulos_mayores:
            if p <= pag:
                act = t
        mm = re.match(r"T[ÍI]TULO\s+(\d+)", act or "", re.I)
        return por_numero.get(mm.group(1), act) if mm else act

    secciones, actual = [], None
    encontrados = set()
    validacion["ce_cuadros"] = 0
    for pn in range(inicio, len(doc)):
        page = doc[pn]
        h = page.rect.height
        # Cuadros: la grilla del PDF reemplaza a su texto aplanado (ver tablas_pdf.py).
        cuadros = tp.cuadros_de(CE_PDF, pn + 1)
        validacion["ce_cuadros"] += len(cuadros)
        for c in cuadros:
            tp.guardar_imagen(page, c)
        for f in tp.reemplazar_filas(filas(page), cuadros):
            if f["y1"] < 62 or f["y0"] > h - 60:  # encabezado y número de página
                continue
            t = f["t"].strip()
            m = NUM_RE.match(t)
            es_titulo = False
            if m and f["x0"] < 90:
                num = m.group(1)
                derog = re.match(r"\(Art[íi]culo\s+" + re.escape(num) + r"\b.*derogad", m.group(2), re.I)
                if (f["bold"] and num.split(".")[0] in "123456") or derog:
                    es_titulo = True
            if t.upper().startswith("TÍTULO") and f["bold"]:
                continue  # el título mayor sale de los marcadores
            if es_titulo:
                num = m.group(1)
                encontrados.add(num)
                actual = {"num": num, "titulo": m.group(2).strip(), "pagina": pn + 1, "filas": [],
                          "derogado": bool(derog), "titulo_mayor": titulo_mayor(pn, num)}
                secciones.append(actual)
            elif actual is None:
                actual = {"num": None, "titulo": "", "pagina": pn + 1, "filas": [], "derogado": False,
                          "titulo_mayor": titulo_mayor(pn)}
                secciones.append(actual)
            actual["filas"].append(f)
            actual["pagina_fin"] = pn + 1

    titulos = dict(titulos_bm)
    for s in secciones:
        if s["num"] and s["num"] not in titulos and not s["derogado"]:
            titulos[s["num"]] = s["titulo"]

    registros = []
    for s in secciones:
        texto = unir(s["filas"])
        if not texto:
            continue
        num = s["num"]
        cadena = rastro(num, titulos) if num else []
        if num and (not cadena or not cadena[-1].startswith(num + " ")):
            cadena.append(f"{num} {s['titulo']}")
        tm = s["titulo_mayor"] or ""
        ubic = " › ".join([tm] + cadena) if tm else " › ".join(cadena)
        figuras_cuadro(s, "CE", CE_PDF, None, num, ubic)
        for i, pieza in enumerate(partir(texto)):
            registros.append({
                "text": pieza, "documento": "Código de Edificación", "capitulo_tema": None,
                "titulo": tm or None, "ubicacion": ubic, "rt_code": None, "articulo": num,
                "version": None, "source_doc": "CodigoEdificacion",
                "archivo_origen": ("CE " + tm.split(".")[0] if tm else "CE"),
                "pdf_respaldo": CE_PDF, "chunk_index": 0, "pagina": s["pagina"],
                "pagina_fin": s.get("pagina_fin", s["pagina"]), "parte": i + 1, "derogado": s["derogado"],
            })

    numerados = set(titulos_bm)
    validacion["ce_marcadores_numerados"] = len(numerados)
    validacion["ce_marcadores_encontrados_en_texto"] = len(numerados & encontrados)
    validacion["ce_marcadores_no_encontrados_ej"] = sorted(numerados - encontrados)[:15]
    validacion["ce_titulos_en_texto_sin_marcador"] = len(encontrados - numerados)
    validacion["ce_titulos_en_texto_sin_marcador_ej"] = sorted(encontrados - numerados)[:15]
    validacion["ce_derogados"] = sum(1 for s in secciones if s["derogado"])
    return registros


# --------------------------------------------------------------------------- RT
def extraer_rt(pdf_path, validacion):
    doc = fitz.open(pdf_path)
    secciones, actual = [], None
    previo = {"rt": None, "ultima": True, "version": None, "cap": None, "tit": None}
    heredadas, sin_codigo, firmas, indice, mal_impresos = [], [], [], [], []
    titulos = {}  # (rt, num) -> título

    for pn in range(len(doc)):
        page = doc[pn]
        h = page.rect.height
        fs = filas(page)
        texto_pag = " ".join(f["t"] for f in fs)
        # Hojas de firmas del expediente: no son normativa, se descartan enteras.
        if "Hoja Adicional de Firmas" in texto_pag:
            firmas.append(pn + 1)
            previo["ultima"] = True
            actual = None
            continue
        # Índice de reglamentos (tabla con muchos códigos): no pertenece a ningún RT en particular.
        if len(set(RT_RE.findall(texto_pag))) >= 3:
            indice.append(pn + 1)
            secciones.append({"rt": None, "num": None, "titulo": "", "pagina": pn + 1, "pagina_fin": pn + 1,
                              "filas": [f for f in fs if not (f["y0"] > h - 110 and (IF_RE.match(f["t"]) or "gina" in f["t"]))],
                              "version": None, "cap": "Índice de reglamentos técnicos y su vigencia", "tit": None,
                              "heredado": False, "indice": True})
            previo["ultima"] = True
            actual = None
            continue
        # --- encabezado: banda hasta la fila con «VERSIÓN: N» (o la del código si no hay versión)
        cod_f = next((f for f in fs if f["y0"] < 170 and (RT_RE.search(f["t"]) or RT_FLOJO.search(f["t"]))), None)
        ver_f = next((f for f in fs if f["y0"] < 190 and VER_RE.search(f["t"])), None)
        limite = limite_cabecera_rt(fs)
        cuerpo, cab = [], []
        pag_n = pag_m = None
        for f in fs:
            t = f["t"].strip()
            mp = PAG_RE.search(t) or re.search(r"P[áa]gina\s+(\d+)\s+de\s+(\d+)\s*$", t)
            if f["y0"] > h - 110 and (mp or IF_RE.match(t)):
                if mp:
                    pag_n, pag_m = int(mp.group(1)), int(mp.group(2))
                continue
            if limite is not None and f["y1"] <= limite:
                cab.append(f)
                continue
            cuerpo.append(f)
        # Cuadros: la grilla del PDF reemplaza a su texto aplanado (ver tablas_pdf.py).
        cuadros = tp.cuadros_de(RT_PDF, pn + 1)
        for c in cuadros:
            tp.guardar_imagen(page, c)
        cuerpo = tp.reemplazar_filas(cuerpo, cuadros)
        validacion["rt_cuadros"] = validacion.get("rt_cuadros", 0) + len(cuadros)

        rt, mal = codigo_rt(cod_f["t"]) if cod_f else (None, False)
        if mal:
            mal_impresos.append((pn + 1, cod_f["t"][:60], rt))
        version = VER_RE.search(ver_f["t"]).group(1) if ver_f else None
        # capítulo y título del RT: columna izquierda del encabezado, sin el código ni la versión
        izq = [RT_FLOJO.sub("", RT_RE.sub("", VER_RE.sub("", f["t"]))).strip() for f in cab]
        izq = [t for t in izq if t]
        cap = izq[0] if izq else None
        tit = " ".join(izq[1:]) if len(izq) > 1 else None

        heredado = False
        if rt is None:
            if previo["rt"] and not previo["ultima"]:
                rt, version, cap, tit, heredado = previo["rt"], previo["version"], previo["cap"], previo["tit"], True
                heredadas.append(pn + 1)
            else:
                sin_codigo.append(pn + 1)
        ultima = pag_n is not None and pag_n == pag_m
        previo = {"rt": rt, "ultima": ultima, "version": version, "cap": cap, "tit": tit}

        if actual is not None and actual["rt"] != rt:
            actual = None  # cambia de reglamento: no se arrastra la sección
        for f in cuerpo:
            t = f["t"].strip()
            guion = RT_GUION_RE.match(t)  # «7.3.- Requisitos»: formato propio de algunos RT
            m = guion or NUM_RE.match(t) or (NUM1_RE.match(t) if f["bold"] else None)
            if m and (f["bold"] or guion) and f["x0"] < 120 and len(m.group(1)) <= 12:
                num = m.group(1)
                titulos[(rt, num)] = m.group(2).strip()
                actual = {"rt": rt, "num": num, "titulo": m.group(2).strip(), "pagina": pn + 1, "filas": [],
                          "version": version, "cap": cap, "tit": tit, "heredado": heredado}
                secciones.append(actual)
            elif actual is None:
                actual = {"rt": rt, "num": None, "titulo": "", "pagina": pn + 1, "filas": [],
                          "version": version, "cap": cap, "tit": tit, "heredado": heredado}
                secciones.append(actual)
            actual["filas"].append(f)
            actual["pagina_fin"] = pn + 1
        if ultima:
            actual = None

    registros = []
    for s in secciones:
        texto = unir(s["filas"])
        if not texto:
            continue
        tit_rt = {k[1]: v for k, v in titulos.items() if k[0] == s["rt"]}
        cadena = rastro(s["num"], tit_rt) if s["num"] else []
        cab = " ".join(x for x in [s["cap"], f"«{s['tit']}»" if s["tit"] else None] if x)
        ubic = " › ".join([x for x in [s["rt"], cab] if x] + cadena)
        figuras_cuadro(s, "RT", RT_PDF, s["rt"], s["num"], ubic)
        for i, pieza in enumerate(partir(texto)):
            registros.append({
                "text": pieza, "documento": "Reglamento Técnico", "capitulo_tema": s["cap"],
                "titulo": s["tit"], "ubicacion": ubic, "rt_code": s["rt"], "articulo": s["num"],
                "version": s["version"], "source_doc": "RT",
                "archivo_origen": s["rt"] or ("Índice de RT" if s.get("indice") else "RT sin código"),
                "pdf_respaldo": RT_PDF, "chunk_index": 0, "pagina": s["pagina"],
                "pagina_fin": s.get("pagina_fin", s["pagina"]), "parte": i + 1, "rt_heredado": s["heredado"],
            })

    codigos = Counter(r["rt_code"] for r in registros if r["rt_code"])
    validacion["rt_paginas"] = len(doc)
    validacion["rt_codigos_distintos"] = len(codigos)
    validacion["rt_paginas_hoja_de_firmas_descartadas"] = len(firmas)
    validacion["rt_paginas_indice"] = indice
    validacion["rt_paginas_codigo_heredado"] = len(heredadas)
    validacion["rt_codigos_mal_impresos"] = sorted({(t, r) for _, t, r in mal_impresos}, key=str)
    validacion["rt_paginas_sin_codigo"] = sin_codigo
    validacion["rt_fragmentos_sin_codigo"] = sum(1 for r in registros if not r["rt_code"])
    return registros


def main():
    base, salida = Path(sys.argv[1]), Path(sys.argv[2])
    val = {}
    regs = extraer_ce(base / CE_PDF, val) + extraer_rt(base / RT_PDF, val)
    por_archivo = Counter()
    for r in regs:
        r["chunk_index"] = por_archivo[r["archivo_origen"]]
        por_archivo[r["archivo_origen"]] += 1
    salida.parent.mkdir(parents=True, exist_ok=True)
    with salida.open("w", encoding="utf-8") as fh:
        for r in regs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    with (salida.parent / "tablas" / "figuras.jsonl").open("w", encoding="utf-8") as fh:
        for f in CUADROS_FIG:
            fh.write(json.dumps(f, ensure_ascii=False) + "\n")
    val["cuadros_con_imagen"] = len(CUADROS_FIG)
    val["fragmentos"] = len(regs)
    val["fragmentos_ce"] = sum(1 for r in regs if r["source_doc"] == "CodigoEdificacion")
    val["fragmentos_rt"] = sum(1 for r in regs if r["source_doc"] == "RT")
    val["caracteres_mediana"] = sorted(len(r["text"]) for r in regs)[len(regs) // 2]
    val["sin_articulo"] = sum(1 for r in regs if not r["articulo"])
    (salida.parent / "validacion.json").write_text(json.dumps(val, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in val.items():
        if isinstance(v, list) and len(v) > 20:
            v = f"{len(v)} páginas: {v[:20]}…"
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
