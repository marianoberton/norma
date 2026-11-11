"""Leyenda y revisión del cuadro de usos del suelo, para /api/cuadro-usos.

Las filas del cuadro ya están en el índice (una por rubro). Lo que faltaba es su leyenda estructurada:
qué significa cada código de las celdas (C, SA, 500C, el número de EST, la letra de BICI, la clase de CyD).
En el índice solo estaba como prosa del artículo de referencias, partida en fragmentos.

Hay tres lecturas de cada referencia: dos modelos de visión sobre la planilla «Usos y referencias»
(guardadas en data/extracciones) y la capa de texto del artículo de referencias del cuerpo principal.
Como en los cuadros del CE, un significado entra si dos de las tres lo leen igual: la capa de texto tiene
que contener el par código y significado, letra por letra, y se prefiere la lectura en la que coinciden los dos modelos.
Si no, queda con significado null y las lecturas a la vista: un significado equivocado es peor que ninguno.
Un significado que termina en «:» anuncia una tabla que ninguna fuente pudo leer: se marca incompleto.

También marca «en revisión» los rubros en los que el cuerpo principal y la planilla dicen distinto.

Corre sin API:  python ingest_v2/cuadro_usos.py      ->  data/v2/cur/cuadro-usos.json
"""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CUR = RAIZ / "data" / "v2" / "cur"
EXTR = RAIZ / "data" / "extracciones" / "2026-11-09_cuadros-cur"
SALIDA = CUR / "cuadro-usos.json"

CUADRO = "Cuadro de Usos del Suelo Nº 3.3"
ARCHIVO_CUERPO = "CUR Cuadro de Usos 3.3"
ARCHIVO_PLANILLA = "CUR Cuadro de usos (planilla «Usos y referencias»)"
PLANILLA = "CUR_-_Usos_y"  # prefijo de las lecturas guardadas
ART_REFERENCIAS = "3.3.1"
LECTURAS = ("anthropic/claude-sonnet-5.5", "google/gemini-3.8-flash")

# Las tablas de referencias van en este orden en la norma; cada una empieza por su primer código.
GRUPOS = [  # (grupo, sección, código con el que empieza, forma de sus códigos)
    ("general", "3.3.1.1", None, None),
    ("EST", "3.3.1.2", "1", re.compile(r"^\d{1,2}[ab]?$")),
    ("BICI", "3.3.1.3", "a", re.compile(r"^[a-v]$")),
    ("CyD", "3.3.1.4", "I", re.compile(r"^(I|II|IIIa|IIIb|IV|V|VI|VII|VIII)$")),
]
# Códigos de la tabla general que la norma escribe con un guion largo o bajo, y en el cuadro con «-».
SIN_REQUERIMIENTO = {"—", "-", "_", "–"}


def norm(s):
    """Para comparar significados: sin tildes de formato, sin espacios ni puntuación."""
    s = str(s).lower().replace("²", "2").replace("m2", "m2")
    s = re.sub(r"[‐-―_]", "-", s)
    return re.sub(r"[^0-9a-záéíóúüñ]", "", s)


def unir(a, b):
    """Une dos fragmentos consecutivos que se solapan (el final de uno repite el principio del otro)."""
    for n in range(min(len(a), len(b), 800), 15, -1):
        if a.endswith(b[:n]):
            return a + b[n:]
    return a + " " + b


# Encabezado de la tabla de referencias que el PDF repite en cada salto de página, a veces en medio de una subtabla.
ENCABEZADO_REF = re.compile(r"REFERENCIAS ADOPTADAS\s*\|\s*REGULACIÓN O REQUERIMIENTO\s*\|?", re.I)


def texto_articulo(chunks, art):
    partes = sorted((r for r in chunks if r.get("articulo") == art and r["archivo_origen"] == "CUR cuerpo principal"
                     and not r.get("figura_id")), key=lambda r: r["chunk_index"])
    t = ""
    for r in partes:
        t = unir(t, r["text"]) if t else r["text"]
    return t


def leyenda_de(lectura):
    """Filas (código, significado) de una lectura -> {grupo: {código: significado}}. Las filas sin código
    continúan la anterior (subtablas de módulos por superficie)."""
    grupos = {g: {} for g, *_ in GRUPOS}
    g_idx, ultimo = 0, None
    for p in sorted(lectura):
        for fila in lectura[p]:
            celdas = [str(c).strip() for c in fila]
            cod = celdas[0] if celdas else ""
            resto = " ".join(c for c in celdas[1:] if c)
            # ¿Empieza la tabla siguiente?
            if g_idx + 1 < len(GRUPOS) and cod == GRUPOS[g_idx + 1][2] and ultimo is not None:
                g_idx += 1
            forma = GRUPOS[g_idx][3]
            if cod and (forma is None or forma.match(cod)) and cod not in grupos[GRUPOS[g_idx][0]]:
                cod = "—" if cod in SIN_REQUERIMIENTO else cod
                grupos[GRUPOS[g_idx][0]][cod] = resto
                ultimo = (GRUPOS[g_idx][0], cod)
            elif ultimo:  # continuación: subtabla o fila partida
                g, c = ultimo
                grupos[g][c] = (grupos[g][c] + " " + " ".join(x for x in celdas if x)).strip()
    return grupos


def lecturas_planilla():
    por_modelo = {m: {} for m in LECTURAS}
    filas_rubro = {}
    for f in sorted(EXTR.glob(f"{PLANILLA}*_p*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for m in LECTURAS:
            x = d.get(m) or {}
            enc = x.get("encabezados") or []
            if enc and "REFERENCIA" in str(enc[0]).upper():
                por_modelo[m][d["pagina"]] = x.get("filas", [])
        # Filas del cuadro, con la misma elección que la ingesta (extraer_cur.filas_extraidas).
        datos = d.get(LECTURAS[0]) if (d.get(LECTURAS[0]) or {}).get("filas") else (d.get(LECTURAS[1]) or {})
        enc = datos.get("encabezados", [])
        if enc and "REFERENCIA" in str(enc[0]).upper():
            continue
        for fila in datos.get("filas", []):
            celdas = [str(c).strip() for c in fila]
            m_ = re.match(r"^\s*(\d{1,3}(?:\.\d{1,3})+)\.?\s*(.*)$", celdas[0] if celdas else "")
            if m_:
                valores = [f"{h}: {v}" for h, v in zip(enc[1:], celdas[1:]) if v]
                if valores:
                    filas_rubro[m_.group(1)] = (d["pagina"], f"rubro {m_.group(1)} «{m_.group(2)}» · " + " · ".join(valores))
    return por_modelo, filas_rubro


def main():
    if not EXTR.exists():
        sys.exit(f"Faltan las lecturas de la planilla en {EXTR}.")
    chunks = [json.loads(l) for l in (CUR / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    texto_ref = norm(ENCABEZADO_REF.sub(" ", texto_articulo(chunks, ART_REFERENCIAS)))
    pagina_ref = min(r["pagina"] for r in chunks if r.get("articulo") == ART_REFERENCIAS)

    por_modelo, filas_planilla = lecturas_planilla()
    a, b = (leyenda_de(por_modelo[m]) for m in LECTURAS)
    leyenda, dudosas = {}, []
    for grupo, seccion, *_ in GRUPOS:
        leyenda[grupo] = {}
        for cod in list(a[grupo]) + [c for c in b[grupo] if c not in a[grupo]]:
            sa, sb = a[grupo].get(cod), b[grupo].get(cod)
            acuerdan = sa is not None and sb is not None and norm(sa) == norm(sb)
            # Dos de tres: la capa de texto confirma una de las lecturas de la planilla. El texto dice
            # «código | significado», así que se busca el par: un significado corto no vale suelto.
            confirmada = next((x for x in (sa, sb) if x is not None and norm(x) and norm(cod) + norm(x) in texto_ref), None)
            e = {"significado": confirmada, "seccion": seccion, "verificada": confirmada is not None,
                 "lecturas_coinciden": acuerdan}
            if confirmada is None:
                e["lecturas"] = {"a": sa, "b": sb}
                e["motivo"] = "ninguna lectura de la planilla aparece tal cual en el texto del artículo de referencias"
                dudosas.append(f"{grupo} {cod}: {e['motivo']}")
            elif confirmada.rstrip().endswith(":"):
                e["incompleta"] = True
                e["nota"] = "La referencia anuncia una tabla que no se pudo leer; ver la imagen del original."
                dudosas.append(f"{grupo} {cod}: incompleta (termina en «:»)")
            leyenda[grupo][cod] = e

    # Rubros en los que el cuerpo principal y la planilla dicen distinto (mismo criterio que la ingesta).
    valores = lambda t: [re.sub(r"[^0-9a-z]", "", x.split(": ", 1)[-1].lower()) for x in t.split(" · ")[1:]]
    cuerpo = {r["rubro"]: r for r in chunks if r["archivo_origen"] == ARCHIVO_CUERPO}
    en_revision = {}
    for rubro, (pag, t) in sorted(filas_planilla.items()):
        if rubro in cuerpo:
            tc = cuerpo[rubro]["text"].split(" · ", 1)[1]
            if valores(tc) != valores(t):
                en_revision[rubro] = {
                    "motivo": "El cuerpo principal del código y la planilla «Usos y referencias» no dicen lo mismo en esta fila. "
                              "Se sirve la del cuerpo principal; confirmar contra el original.",
                    "planilla": {"texto": t, "pagina": pag},
                }

    salida = {
        "cuadro": CUADRO,
        "archivos": [ARCHIVO_CUERPO, ARCHIVO_PLANILLA],
        "columnas": {"mixtura": ["1", "2", "3", "4"], "otras": ["EST", "BICI", "CyD", "Observaciones"]},
        "referencias": {"articulo": ART_REFERENCIAS, "pagina": pagina_ref},
        "leyenda": leyenda,
        "en_revision": en_revision,
        "verificacion": {
            "codigos": sum(len(v) for v in leyenda.values()),
            "verificados": sum(1 for g in leyenda.values() for e in g.values() if e["verificada"]),
            "dudosos": dudosas,
        },
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    v = salida["verificacion"]
    print(f"{SALIDA.relative_to(RAIZ)}: {v['codigos']} códigos, {v['verificados']} verificados; "
          f"rubros en revisión: {', '.join(en_revision) or 'ninguno'}")
    for d in dudosas:
        print("  dudoso:", d)


if __name__ == "__main__":
    main()
