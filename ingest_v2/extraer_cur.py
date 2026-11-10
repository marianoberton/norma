"""
Ingesta del Código Urbanístico (CUR) desde la carpeta CUR.

Qué hace, por tipo de material:
- Prosa del cuerpo principal: capa de texto (gratis). En este PDF las posiciones de los caracteres
  están rotas, así que no se ordena por geometría: se respeta el orden del archivo, que es el de
  lectura, y se reparan espacios y guiones de corte. Los artículos se ubican con el índice del propio
  PDF (páginas 3 a 14), que trae número y título; el índice sirve también de control.
- Tablas del cuerpo principal (Cuadro de Usos 3.3, cuadros de depósitos): un modelo de visión
  transcribe cada página y se controla contra las letras de la capa de texto de esa misma página
  (que son correctas aunque estén pegadas). Las páginas que no coinciden van a revisión.
- Anexos con texto (Anexo III, Anexo II de áreas especiales): capa de texto, gratis.
- Planos (Anexo I, Anexo IV y la documentación gráfica del Anexo II): imagen de página + descripción
  breve. La cita lleva a la página; la descripción orienta, no es dato normativo.
- Cuadros ya extraídos el 2026-11-09 (extracto de usos e industriales): una fila = un registro.

Uso:
  python -I ingest_v2/extraer_cur.py <carpeta CUR> [--tablas USD] [--planos USD]
Salida: data/v2/cur/chunks.jsonl, data/v2/cur/figuras.jsonl, data/v2/cur/validacion.json
"""
import argparse
import concurrent.futures as cf
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fitz  # noqa: E402

from extraer_figuras import llamar  # noqa: E402
from extraer_pdf import partir  # noqa: E402
from jurisdiccion import DE_LUGAR, SELLO  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")  # los módulos importados ya lo envuelven
RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "data" / "v2" / "cur"
FIG_DIR = RAIZ / "data" / "v2" / "figuras"
EXTR = RAIZ / "data" / "extracciones" / "2026-11-09_cuadros-cur"

CP = "cur-cuerpo-principal_0.pdf"
ANEXOS_TEXTO = {"Anexo III (2).pdf": "Anexo III", "cur-anexoii.pdf": "Anexo II"}
PLANOS = {"Anexo I (1).pdf": ("CURA1", "Anexo I · Planos"), "Anexo IV (2).pdf": ("CURA4", "Anexo IV · Planchetas"),
          "Anexo II (2).pdf": ("CURA2G", "Anexo II · Documentación gráfica")}
TAB_RE = re.compile(r"(?:SI|NO)(?:SI|NO|C\b)|\d\s?DLO|NONO|\b(?:I|II|III|IV|V)NO")
FURNITURE = re.compile(r"^(" + SELLO + r"-\w+)+$|^P[áa]gina\s*\d+\s*de\s*\d+$|^\d{1,3}$")
LETRA = "a-záéíóúñü"


def limpiar(t):
    """Repara la capa de texto del CUR: furniture, guiones de corte y espacios faltantes."""
    lineas = [l.strip() for l in t.splitlines()]
    lineas = [l for l in lineas if l and not FURNITURE.match(l.replace(" ", ""))]
    t = " ".join(lineas)
    t = re.sub(rf"([{LETRA}])-([{LETRA}])", r"\1\2", t)               # vehícu-los → vehículos
    t = re.sub(rf"([,;:)])(?=[A-Za-z{LETRA}ÁÉÍÓÚÑ])", r"\1 ", t)      # general,así → general, así
    t = re.sub(rf"(?<=[{LETRA}])\((?=\w)", " (", t)                     # transferencia(carga)
    t = re.sub(r"(?<=\))(?=\d)", " ", t)                                # (5)personas ya cubierto; (5)5
    return re.sub(r"\s+", " ", t).strip()


def texto_flujo(page):
    """Texto en orden de archivo, uniendo tramos con espacio cuando corresponde."""
    partes = []
    for b in page.get_text("dict", flags=0)["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                t = s["text"]
                if partes and partes[-1] and t and not partes[-1][-1].isspace() and not t[0].isspace() \
                        and partes[-1][-1].isalnum() and t[0].isalnum() and t[0].isupper():
                    partes.append(" ")  # «Óptica»«Y» … solo si el tramo nuevo arranca en mayúscula
                partes.append(t)
            partes.append("\n")
    return "".join(partes)


def sin_esp(s):
    return re.sub(r"\s+", "", s).lower()


# ------------------------------------------------------------------ cuerpo principal: índice
def leer_indice(doc):
    entradas, titulos_mayores = [], {}
    for p in doc:
        t = p.get_text(flags=0)
        if t.count("....") <= 5:
            continue
        for linea in t.splitlines():
            linea = linea.strip()
            m = re.match(r"^T[íi]tulo\s+(\d+)\.\s*(.+?)\s*\.{3,}\s*\d+$", linea)
            if m:
                titulos_mayores[m.group(1)] = f"Título {m.group(1)}. {m.group(2).strip()}"
                continue
            m = re.match(r"^((?:\d+\.)+\d*)\.?\s*(.+?)\s*\.{3,}\s*(\d+)$", linea)
            if m:
                num = m.group(1).rstrip(".")
                entradas.append((num, m.group(2).strip(), int(m.group(3))))
    return entradas, titulos_mayores


def cuerpo_principal(base, val, paginas_tabla):
    doc = fitz.open(base / CP)
    entradas, mayores = leer_indice(doc)
    titulos = {n: t for n, t, _ in entradas}
    # texto completo de las páginas de prosa, con el mapa posición → página
    texto, offs = "", []
    for i, p in enumerate(doc):
        crudo = p.get_text(flags=0)
        if crudo.count("....") > 5 or (i + 1) in paginas_tabla:
            continue
        offs.append((len(texto), i + 1))
        texto += (prosa_verificada(i + 1) or limpiar(texto_flujo(p))) + " "
    plano = sin_esp(texto)
    # mapa índice-sin-espacios → índice real
    idx = [i for i, c in enumerate(texto) if not c.isspace()]

    def pagina_de(pos):
        pg = offs[0][1]
        for o, p in offs:
            if o <= pos:
                pg = p
        return pg

    hallados, desde = [], 0
    for num, tit, _ in entradas:
        clave = sin_esp(f"{num}.{tit[:18]}")
        k = plano.find(clave, desde)
        if k < 0:
            clave2 = sin_esp(f"{num}{tit[:18]}")
            k = plano.find(clave2, desde)
        if k >= 0:
            hallados.append((idx[k], num, tit))
            desde = k + 1
    val["cur_indice_entradas"] = len(entradas)
    val["cur_indice_halladas_en_texto"] = len(hallados)
    val["cur_indice_no_halladas_ej"] = [n for n, _, _ in entradas if n not in {h[1] for h in hallados}][:20]

    registros = []
    for j, (pos, num, tit) in enumerate(hallados):
        fin = hallados[j + 1][0] if j + 1 < len(hallados) else len(texto)
        cuerpo = texto[pos:fin].strip()
        partes = num.split(".")
        cadena = [f"{'.'.join(partes[:k])} {titulos['.'.join(partes[:k])]}" for k in range(1, len(partes) + 1)
                  if ".".join(partes[:k]) in titulos]
        mayor = mayores.get(partes[0])
        ubic = " › ".join(["Código Urbanístico"] + ([mayor] if mayor else []) + cadena)
        for k, pieza in enumerate(partir(cuerpo)):
            registros.append(reg(pieza, ubic, num, "CUR cuerpo principal", CP, pagina_de(pos), mayor, k + 1))
    return registros, titulos, mayores


def reg(texto, ubic, art, archivo, pdf, pagina, titulo=None, parte=1, **extra):
    r = {"text": texto, "documento": "Código Urbanístico", "capitulo_tema": None, "titulo": titulo,
         "ubicacion": ubic, "rt_code": None, "articulo": art, "version": None, "source_doc": "CUR",
         "archivo_origen": archivo, "pdf_respaldo": pdf, "chunk_index": 0, "pagina": pagina,
         "pagina_fin": pagina, "parte": parte}
    r.update(extra)
    return r


# ------------------------------------------------------------------ anexos con texto
AREA_RE = re.compile(r"^(?:\d+(?:\.\d+)*\.?\s+)?((?:APH|AE|EE|UP|UF|RUA|RU|U|E|P|C)\d+[a-z]?)\)\s*(.*)$")


def anexo_texto(base, nombre, rotulo, val):
    """Los anexos se ordenan por área (APH 5, U 85, EE 52…) con numeración local que se repite;
    se corta por área y la numeración interna queda en el texto."""
    doc = fitz.open(base / nombre)
    secciones, actual = [], None
    for i, p in enumerate(doc):
        t = p.get_text()
        if t.count("....") > 5:
            continue
        for linea in t.splitlines():
            l = linea.strip()
            if not l or FURNITURE.match(l.replace(" ", "")):
                continue
            m = AREA_RE.match(l)
            if m and len(l) < 200:
                area = m.group(1)
                if actual is None or actual["area"] != area:
                    actual = {"area": area, "titulo": m.group(2).rstrip(":").strip(), "pagina": i + 1, "lineas": []}
                    secciones.append(actual)
            if actual is None:
                actual = {"area": None, "titulo": "", "pagina": i + 1, "lineas": []}
                secciones.append(actual)
            actual["lineas"].append((i + 1, l))
    registros = []
    for s_ in secciones:
        cuerpo = limpiar("\n".join(l for _, l in s_["lineas"]))
        if len(cuerpo) < 20:
            continue
        nombre_area = f"{s_['area']}) {s_['titulo']}".strip() if s_["area"] else "(sin área)"
        ubic = " › ".join(["Código Urbanístico", rotulo, nombre_area[:120]])
        for k, pieza in enumerate(partir(cuerpo)):
            r = reg(pieza, ubic, None, f"CUR {rotulo}", nombre, s_["pagina"], rotulo, k + 1, area=s_["area"])
            r["pagina_fin"] = max(p for p, _ in s_["lineas"])
            registros.append(r)
    val[f"anexo_{rotulo}_areas"] = len({s_["area"] for s_ in secciones})
    val[f"anexo_{rotulo}_secciones"] = len(secciones)
    return registros


# ------------------------------------------------------------------ prosa del cuerpo principal (visión + control)
TAREA_PROSA = """Transcribí el texto de esta página del Código Urbanístico«lugar», en orden de lectura y sin cambiar nada.
- Omití el encabezado y el pie de página (sellos «IF-…», «Página N de M», número de página suelto).
- Cada artículo numerado (ej. «3.13.1. Disposiciones…») empieza en una línea nueva.
- Si hay una tabla, cada fila va en una línea con las celdas separadas por « | ».
- No agregues comentarios ni formato: devolvé solo el texto.""".replace("«lugar»", DE_LUGAR)
UMBRAL = 0.85


def llamar_texto(modelo, key, png):
    import base64
    import time
    import urllib.request
    body = {"model": modelo, "temperature": 0, "usage": {"include": True}, "messages": [{"role": "user", "content": [
        {"type": "text", "text": TAREA_PROSA},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}}]}]}
    for intento in range(3):
        try:
            req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                         headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                                                  "X-Title": "Norma CUR prosa"})
            with urllib.request.urlopen(req, timeout=240) as r:
                j = json.load(r)
            txt = j["choices"][0]["message"]["content"]
            if isinstance(txt, list):
                txt = "".join(c.get("text", "") for c in txt)
            return txt.strip(), float(j.get("usage", {}).get("cost") or 0)
        except Exception:  # noqa: BLE001
            time.sleep(3 * (intento + 1))
    return None, 0.0


def acuerdo_letras(a, b):
    """Coincidencia de trigramas de letras entre la transcripción y la capa de texto (que trae bien las letras)."""
    ta, tb = trigramas(a), trigramas(b)
    if not ta or not tb:
        return 0.0
    return round(sum((ta & tb).values()) / max(sum(ta.values()), sum(tb.values())), 3)


def prosa_vision(base, paginas, usd, modelo, key):
    doc = fitz.open(base / CP)
    d = OUT / "prosa"
    d.mkdir(parents=True, exist_ok=True)
    pend = [p for p in paginas if not (d / f"p{p:03d}.json").exists()]
    print(f"Prosa: {len(paginas)} páginas, {len(pend)} por transcribir · tope USD {usd}")
    gasto = 0.0

    def trabajo(p):
        png = doc[p - 1].get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).tobytes("png")
        return p, *llamar_texto(modelo, key, png)

    with cf.ThreadPoolExecutor(6) as ex:
        futs = [ex.submit(trabajo, p) for p in pend]
        for f in cf.as_completed(futs):
            p, txt, costo = f.result()
            gasto += costo
            if txt is not None:
                acuerdo = acuerdo_letras(txt, doc[p - 1].get_text(flags=0))
                (d / f"p{p:03d}.json").write_text(json.dumps({"texto": txt, "acuerdo_capa_texto": acuerdo, "modelo": modelo},
                                                             ensure_ascii=False), encoding="utf-8")
            if gasto > usd:
                print("Tope alcanzado.")
                for g in futs:
                    g.cancel()
                break
    return gasto


def prosa_verificada(p):
    f = OUT / "prosa" / f"p{p:03d}.json"
    if not f.exists():
        return None
    d = json.loads(f.read_text(encoding="utf-8"))
    if d["acuerdo_capa_texto"] < UMBRAL:
        return None  # no coincide con la capa de texto: se usa la capa y la página queda para revisión
    lineas = [l.strip() for l in d["texto"].splitlines() if l.strip() and not FURNITURE.match(l.replace(" ", ""))]
    return " ".join(lineas)


# ------------------------------------------------------------------ tablas del cuerpo principal (visión)
TAREA_TABLA = """Transcribí la tabla de esta página del Código Urbanístico«lugar» a JSON, sin inventar nada.
Devolvé SOLO un objeto JSON: {"encabezados": [..], "filas": [[..], ..]}.
- Una celda por encabezado, con el texto exacto (SI, NO, C, SCPC, 1000, números, letras, "-", vacío "").
- La primera columna lleva el código y el nombre del rubro tal como aparecen (ej. "1.3.1. Local de venta de productos perecederos.").
- Una celda combinada que abarca varias filas vale para CADA fila que abarca: repetí su valor en todas.
- Si una celda es ilegible, poné "?". Si la página no tiene tabla, devolvé {"encabezados": [], "filas": []}.""".replace("«lugar»", DE_LUGAR)


def trigramas(s):
    s = re.sub(r"[^0-9a-záéíóúñ]", "", s.lower())
    return Counter(s[i:i + 3] for i in range(len(s) - 2))


def acuerdo_texto(filas, capa):
    a, b = trigramas(" ".join(" ".join(map(str, f)) for f in filas)), trigramas(capa)
    if not a or not b:
        return 0.0
    return round(sum((a & b).values()) / max(sum(a.values()), sum(b.values())), 3)


def tablas_vision(base, paginas, usd, modelo, key):
    doc = fitz.open(base / CP)
    cache_dir = OUT / "tablas"
    cache_dir.mkdir(parents=True, exist_ok=True)
    pend = [p for p in paginas if not (cache_dir / f"p{p:03d}.json").exists()]
    print(f"Tablas: {len(paginas)} páginas, {len(pend)} por transcribir · tope USD {usd}")
    gasto = 0.0

    def trabajo(p):
        png = doc[p - 1].get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png")
        return p, *llamar_tabla(modelo, key, png)

    with cf.ThreadPoolExecutor(6) as ex:
        for p, data, costo in ex.map(trabajo, pend):
            gasto += costo
            data["_acuerdo_capa_texto"] = acuerdo_texto(data.get("filas", []), doc[p - 1].get_text(flags=0))
            data["_modelo"] = modelo
            (cache_dir / f"p{p:03d}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            if gasto > usd:
                print("Tope alcanzado.")
                break
    return gasto


def llamar_tabla(modelo, key, png):
    import extraer_figuras as ef
    viejo = ef.TAREA
    ef.TAREA = TAREA_TABLA
    try:
        return ef.llamar(modelo, key, png)
    finally:
        ef.TAREA = viejo


def filas_cuerpo(base, paginas, val, figuras):
    doc = fitz.open(base / CP)
    registros, revisar = [], []
    ultimo_enc = []
    for p in paginas:
        f = OUT / "tablas" / f"p{p:03d}.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        enc = d.get("encabezados") or ultimo_enc
        ultimo_enc = enc
        # Control: qué parte de lo transcrito está en la capa de texto de la página (nada inventado).
        a = trigramas(" ".join(" ".join(map(str, f)) for f in d.get("filas", [])))
        b = trigramas(doc[p - 1].get_text(flags=0))
        precision = round(sum((a & b).values()) / max(sum(a.values()), 1), 3)
        d["_precision_capa_texto"] = precision
        if precision < 0.95:
            revisar.append((p, precision))
        # Los cuadros de depósitos (columna «Grado de Molestia») reinician la numeración: son otro cuadro.
        deposito = any("molestia" in str(h).lower() for h in enc)
        cuadro = "Cuadro de depósitos (Grado de Molestia)" if deposito else "Cuadro de Usos del Suelo Nº 3.3"
        seccion = None if deposito else "3.3.2"
        archivo = "CUR Cuadro de depósitos" if deposito else "CUR Cuadro de Usos 3.3"
        fid = f"CURCP-p{p:04d}-1"
        guardar_pagina(doc[p - 1], fid)
        figuras.append(fig(fid, f"{cuadro} (página)", CP, p, seccion, "tabla",
                           f"Página {p} del cuerpo principal del Código Urbanístico con el {cuadro}."))
        for fila in d.get("filas", []):
            celdas = [str(c).strip() for c in fila]
            if not celdas or not celdas[0]:
                continue
            m = re.match(r"^(\d+(?:\.\d+)*)\.?\s*(.*)$", celdas[0])
            valores = [f"{h}: {v}" for h, v in zip(enc[1:], celdas[1:]) if v]
            if not m:
                continue
            rubro, nombre = m.group(1), m.group(2).strip()
            if not valores:  # fila de grupo (1. COMERCIAL)
                continue
            texto = f"{cuadro} · rubro {rubro} «{nombre}» · " + " · ".join(valores)
            ruta = f"{seccion + ' ' if seccion else ''}{cuadro}"
            registros.append(reg(texto, f"Código Urbanístico › {ruta} › rubro {rubro}",
                                 None, archivo, CP, p, cuadro,
                                 rubro=rubro, imagenes=[fid], precision_capa_texto=precision))
    val["cur_tablas_paginas_transcritas"] = sum(1 for p in paginas if (OUT / "tablas" / f"p{p:03d}.json").exists())
    val["cur_tablas_filas"] = len(registros)
    val["cur_tablas_para_revisar"] = revisar
    return registros


# ------------------------------------------------------------------ cuadros ya extraídos (2026-11-09)
def filas_extraidas(base, val, figuras):
    """Extracto «CUR - Usos y referencias» e industriales: se toma la fila del modelo que repite celdas combinadas."""
    B = "anthropic/claude-sonnet-5.5"
    A = "google/gemini-3.8-flash"
    fuentes = {"CUR_-_Usos_y": ("CUR - Usos y referencias.pdf", "CURUR", "Cuadro de usos (planilla «Usos y referencias»)", 0),
               "Cuadro_de_us": ("Cuadro de usos industriales.pdf", "CURIND", "Cuadro de actividades industriales", 90)}
    registros = []
    for pref, (pdf, sigla, nombre_cuadro, rot) in fuentes.items():
        doc = fitz.open(base / pdf)
        for f in sorted(EXTR.glob(f"{pref}*_p*.json")):
            d = json.loads(f.read_text(encoding="utf-8"))
            p = d["pagina"]
            datos = d.get(B) if d.get(B, {}).get("filas") else d.get(A, {})
            enc = datos.get("encabezados", [])
            fid = f"{sigla}-p{p:04d}-1"
            guardar_pagina(doc[p - 1], fid, rot)
            figuras.append(fig(fid, f"{nombre_cuadro} (página)", pdf, p, None, "tabla", f"Página {p} de «{pdf}»."))
            for fila in datos.get("filas", []):
                celdas = [str(c).strip() for c in fila]
                m = re.match(r"^\s*(\d{1,3}(?:\.\d{1,3})+)\.?\s*(.*)$", celdas[0] if celdas else "")
                if not m:
                    continue
                valores = [f"{h}: {v}" for h, v in zip(enc[1:], celdas[1:]) if v]
                if not valores:
                    continue
                texto = f"{nombre_cuadro} · rubro {m.group(1)} «{m.group(2)}» · " + " · ".join(valores)
                registros.append(reg(texto, f"Código Urbanístico › {nombre_cuadro} › rubro {m.group(1)}", None,
                                     f"CUR {nombre_cuadro}", pdf, p, nombre_cuadro, rubro=m.group(1), imagenes=[fid]))
    val["cur_filas_cuadros_extraidos"] = len(registros)
    return registros


# ------------------------------------------------------------------ planos
TAREA_PLANO = """Esta es una página de un anexo de planos del Código Urbanístico«lugar».
Devolvé SOLO un JSON: {"tipo": "...", "titulo": "...", "descripcion": "...", "textos": ["..."]}.
- tipo: "plano", "plancheta", "foto", "ficha", "texto", "tapa" u "otro".
- titulo: el título que figura en la lámina, tal cual.
- descripcion: 1 a 3 frases: qué zona o tema muestra y qué información trae (distritos, alturas, trazados). No inventes.
- textos: nombres de calles, distritos y rótulos legibles con certeza (máximo 25). Lo dudoso, no lo pongas.""".replace("«lugar»", DE_LUGAR)


def planos(base, usd, modelo, key, figuras, val):
    gasto = 0.0
    import extraer_figuras as ef
    trabajos = []
    for pdf, (sigla, rotulo) in PLANOS.items():
        doc = fitz.open(base / pdf)
        for i in range(len(doc)):
            fid = f"{sigla}-p{i + 1:04d}-1"
            trabajos.append((pdf, sigla, rotulo, i + 1, fid))
            if not (FIG_DIR / f"{fid}.png").exists():
                guardar_pagina(doc[i], fid, escala=1.5)
    cache = OUT / "planos.json"
    previas = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    pend = [t for t in trabajos if t[4] not in previas or "_error" in previas[t[4]]] if usd > 0 else []
    print(f"Planos: {len(trabajos)} páginas, {len(pend)} por describir · tope USD {usd}")
    ef.TAREA, viejo = TAREA_PLANO, ef.TAREA
    try:
        with cf.ThreadPoolExecutor(6) as ex:
            fut = {ex.submit(ef.llamar, modelo, key, (FIG_DIR / f"{t[4]}.png").read_bytes()): t for t in pend}
            for f_ in cf.as_completed(fut):
                data, costo = f_.result()
                previas[fut[f_][4]] = data
                gasto += costo
                if gasto > usd:
                    print("Tope alcanzado.")
                    for g in fut:
                        g.cancel()
                    break
    finally:
        ef.TAREA = viejo
    cache.write_text(json.dumps(previas, ensure_ascii=False), encoding="utf-8")
    registros = []
    for pdf, sigla, rotulo, p, fid in trabajos:
        v = previas.get(fid) or {}
        if v.get("tipo") in ("tapa", "texto") or "_error" in v:
            continue
        figuras.append(fig(fid, v.get("titulo") or rotulo, pdf, p, rotulo, v.get("tipo") or "plano", v.get("descripcion"),
                           textos=v.get("textos")))
    val["cur_planos_paginas"] = len(trabajos)
    val["cur_planos_descritos"] = sum(1 for t in trabajos if t[4] in previas and "_error" not in previas[t[4]])
    return gasto


def guardar_pagina(page, fid, rot=0, escala=1.3):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    ruta = FIG_DIR / f"{fid}.png"
    if not ruta.exists():
        page.get_pixmap(matrix=fitz.Matrix(escala, escala).prerotate(rot)).save(ruta)


def fig(fid, titulo, pdf, pagina, articulo, tipo, descripcion, textos=None):
    return {"id": fid, "documento": "CUR", "pdf": pdf, "pagina": pagina, "rt_code": None, "articulo": articulo,
            "ubicacion": f"Código Urbanístico › {titulo}", "epigrafe": titulo,
            "vision": {"tipo": tipo, "descripcion": descripcion, "textos": textos or []}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--tablas", type=float, default=0.0)
    ap.add_argument("--planos", type=float, default=0.0)
    ap.add_argument("--prosa", type=float, default=0.0)
    ap.add_argument("--modelo", default="anthropic/claude-haiku-5.5")  # elegido por comparación: docs/plan-v2.md
    a = ap.parse_args()
    base = Path(a.base)
    OUT.mkdir(parents=True, exist_ok=True)
    val, figuras = {}, []
    key = None
    if a.tablas or a.planos or a.prosa:
        env = (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines()
        key = next(l.split("=", 1)[1].strip().strip('"').strip("'") for l in env if l.strip().startswith("OPENROUTER_API_KEY="))

    doc = fitz.open(base / CP)
    pag_tabla = [i + 1 for i, p in enumerate(doc) if p.get_text(flags=0).count("....") <= 5
                 and len(TAB_RE.findall(p.get_text(flags=0))) >= 6]
    val["cur_paginas_tabla"] = pag_tabla
    gasto = 0.0
    if a.tablas:
        gasto += tablas_vision(base, pag_tabla, a.tablas, a.modelo, key)
    pag_prosa = [i + 1 for i, p in enumerate(doc) if p.get_text(flags=0).count("....") <= 5
                 and (i + 1) not in pag_tabla and len(p.get_text(flags=0).strip()) > 50]
    if a.prosa:
        gasto += prosa_vision(base, pag_prosa, a.prosa, a.modelo, key)
    hechas = {p: json.loads((OUT / "prosa" / f"p{p:03d}.json").read_text(encoding="utf-8")) for p in pag_prosa
              if (OUT / "prosa" / f"p{p:03d}.json").exists()}
    val["cur_prosa_paginas"] = len(pag_prosa)
    val["cur_prosa_transcritas"] = len(hechas)
    val["cur_prosa_bajo_umbral_usa_capa"] = sorted(p for p, h in hechas.items() if h["acuerdo_capa_texto"] < UMBRAL)
    acs = sorted(h["acuerdo_capa_texto"] for h in hechas.values())
    val["cur_prosa_acuerdo_mediana"] = acs[len(acs) // 2] if acs else None
    regs, _, _ = cuerpo_principal(base, val, set(pag_tabla))
    for nombre, rotulo in ANEXOS_TEXTO.items():
        regs += anexo_texto(base, nombre, rotulo, val)
    cuerpo_filas = filas_cuerpo(base, pag_tabla, val, figuras)
    extra = filas_extraidas(base, val, figuras)
    # Dos fuentes independientes del mismo cuadro: el cuerpo principal (consolidado) y la planilla
    # «Usos y referencias». Se comparan por rubro; en el índice queda la del cuerpo principal.
    # Se comparan solo los valores (los encabezados de cada fuente se escriben distinto).
    norm = lambda t: [re.sub(r"[^0-9a-z]", "", x.split(": ", 1)[-1].lower()) for x in t.split(" · ")[2:]]
    por_rubro = {r["rubro"]: r for r in cuerpo_filas if r["archivo_origen"] == "CUR Cuadro de Usos 3.3"}
    comunes = [r for r in extra if r["archivo_origen"].startswith("CUR Cuadro de usos") and r["rubro"] in por_rubro]
    val["cur_cruce_planilla_vs_cuerpo_rubros_comunes"] = len(comunes)
    val["cur_cruce_valores_identicos"] = sum(1 for r in comunes if norm(r["text"]) == norm(por_rubro[r["rubro"]]["text"]))
    val["cur_cruce_distintos_ej"] = [r["rubro"] for r in comunes if norm(r["text"]) != norm(por_rubro[r["rubro"]]["text"])][:15]
    ids_comunes = {id(r) for r in comunes}
    regs += cuerpo_filas + [r for r in extra if id(r) not in ids_comunes]
    if a.planos:
        gasto += planos(base, a.planos, a.modelo, key, figuras, val)
    elif (OUT / "planos.json").exists():  # sin gastar: arma las figuras con las descripciones guardadas
        planos(base, 0.0, a.modelo, None, figuras, val)

    cuenta = Counter()
    for r in regs:
        r["chunk_index"] = cuenta[r["archivo_origen"]]
        cuenta[r["archivo_origen"]] += 1
    (OUT / "chunks.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in regs) + "\n", encoding="utf-8")
    (OUT / "figuras.jsonl").write_text("\n".join(json.dumps(f, ensure_ascii=False) for f in figuras) + "\n", encoding="utf-8")
    val["fragmentos"] = len(regs)
    val["por_archivo"] = dict(cuenta)
    val["figuras"] = len(figuras)
    val["gasto_usd_esta_corrida"] = round(gasto, 3)
    (OUT / "validacion.json").write_text(json.dumps(val, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in val.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()
