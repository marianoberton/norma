"""Gráficos del README a partir de los resultados versionados (sin API).

    python -I eval/graficos.py

Lee eval/resultados/*.json y, si existe, data/v2/tablas/cuadros.json. Escribe docs/img/*.png.
Los números de la comparación de modelos de respuesta están en docs/measurements.md (sección «Answer model»).
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
IMG = RAIZ / "docs" / "img"
TINTA, GRIS, LINEA = "#14213a", "#56637d", "#d3dbea"
AZUL, VERDE, VERDE2, AMBAR, ROJO = "#1c57c9", "#17794a", "#7fb8a0", "#c27c0e", "#b0271f"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "text.color": TINTA, "axes.labelcolor": GRIS,
    "axes.edgecolor": LINEA, "xtick.color": GRIS, "ytick.color": GRIS, "axes.spines.top": False,
    "axes.spines.right": False, "figure.facecolor": "white", "axes.facecolor": "white",
})


def guardar(fig, nombre):
    IMG.mkdir(parents=True, exist_ok=True)
    fig.savefig(IMG / nombre, dpi=200, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    print("escrito", IMG / nombre)


def examen():
    """Ablación sobre las mismas 15 preguntas (examen v0): qué aportó cada cambio."""
    corridas = [
        ("indice-actual", "v1 index\n(.docx)"),
        ("indice-actual+articulo", "v1 index\n+ article lookup"),
        ("v2-pdf", "PDF\ningestion"),
        ("v2-pdf+articulo", "PDF\n+ article lookup"),
        ("v2-pdf+articulo+figuras", "PDF + lookup\n+ figures"),
    ]
    res = {}
    for f in (RAIZ / "eval" / "resultados").glob("*_v0_*.json"):
        r = json.loads(f.read_text(encoding="utf-8"))["resumen"]
        res[r["etiqueta"]] = r
    etiquetas = [e for e, _ in corridas if e in res]
    hit = [res[e]["acierto_k"] for e in etiquetas]
    mrr = [res[e]["mrr"] for e in etiquetas]
    x = range(len(etiquetas))
    fig, ax = plt.subplots(figsize=(8.4, 3.6))
    ax.bar([i - 0.19 for i in x], hit, 0.36, color=AZUL, label="hit@8")
    ax.bar([i + 0.19 for i in x], mrr, 0.36, color="#86adff", label="MRR")
    for i, (h, m) in enumerate(zip(hit, mrr)):
        ax.text(i - 0.19, h + 0.02, f"{h:.0%}", ha="center", fontsize=9)
        ax.text(i + 0.19, m + 0.02, f"{m:.2f}", ha="center", fontsize=9, color=GRIS)
    ax.set_xticks(list(x), [dict(corridas)[e] for e in etiquetas], fontsize=9)
    ax.set_ylim(0, 1.08)
    ax.set_yticks([0, 0.25, 0.5, 0.75, 1])
    ax.yaxis.grid(True, color=LINEA, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, loc="upper left", ncols=2)
    ax.set_title("Retrieval ablation: same 15 questions, one change at a time", loc="left", fontsize=11, fontweight="bold")
    guardar(fig, "examen-ablacion.png")


def cuadros():
    """Qué pasó con los 454 cuadros y sus filas."""
    f = RAIZ / "data" / "v2" / "tablas" / "cuadros.json"
    if not f.exists():
        print("sin data/v2/tablas/cuadros.json: se omite el gráfico de cuadros")
        return
    todos = [c for p in json.loads(f.read_text(encoding="utf-8")) for c in p["cuadros"]]
    n = {m: sum(c["modo"] == m for c in todos) for m in ("verificado", "recuadro", "parcial", "solo_imagen")}
    lectura = {k: sum(c["lectura"] == k for c in todos) for k in ("grilla", "vision", "arbitro")}
    filas_ok = sum(len(c["filas"]) for c in todos)
    filas_no = sum(c["sin_verificar"] for c in todos)

    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 2.9), gridspec_kw={"hspace": 1.1})
    partes = [("verified", n["verificado"], VERDE), ("text box", n["recuadro"], VERDE2),
              ("partial", n["parcial"], AMBAR), ("image only", n["solo_imagen"], ROJO)]
    izq = 0
    for nombre, v, color in partes:
        a1.barh(0, v, left=izq, color=color, height=0.6)
        if v / len(todos) > 0.05:
            a1.text(izq + v / 2, 0, f"{nombre}\n{v}", ha="center", va="center", color="white", fontsize=9, fontweight="bold")
        izq += v
    a1.set_xlim(0, len(todos))
    a1.set_title(f"{len(todos)} tables found by PDF geometry, by verification status", loc="left", fontsize=11, fontweight="bold")
    a1.axis("off")
    a1.text(len(todos), -0.62, f"text box {n['recuadro']}  ·  rows taken from: PDF grid {lectura['grilla']}, "
            f"arbiter {lectura['arbitro']}, vision {lectura['vision']}", ha="right", va="top", fontsize=8.5, color=GRIS)

    a2.barh(0, filas_ok, color=VERDE, height=0.6)
    a2.barh(0, filas_no, left=filas_ok, color="#e7ecf3", height=0.6)
    a2.text(filas_ok / 2, 0, f"{filas_ok:,} confirmed → indexed",
            ha="center", va="center", color="white", fontsize=9, fontweight="bold")
    a2.text(filas_ok + filas_no / 2, 0, f"{filas_no:,} withheld\n(image shown)", ha="center", va="center", color=GRIS, fontsize=9)
    a2.set_xlim(0, filas_ok + filas_no)
    a2.set_title("Table rows: indexed as «column: value» only when two readings match", loc="left", fontsize=11, fontweight="bold")
    a2.axis("off")
    guardar(fig, "cuadros-verificacion.png")


def modelos():
    """Modelo de respuesta: mismas 44 preguntas y el mismo contexto (docs/measurements.md)."""
    datos = [  # modelo, errores graves verificados, USD por respuesta, segundos (mediana)
        ("DeepSeek V3.2", 2, 0.00138, 26),
        ("Claude Haiku 5.5", 1, 0.00143, 8),
        ("GPT-6 Luna", 0, 0.00071, 6),
    ]
    fig, ejes = plt.subplots(1, 3, figsize=(8.4, 2.4), gridspec_kw={"wspace": 0.55})
    nombres = [d[0] for d in datos]
    colores = [GRIS, GRIS, AZUL]
    for ax, (titulo, idx, fmt) in zip(ejes, [("Serious errors (of 44)", 1, "{:.0f}"),
                                            ("USD per answer", 2, "{:.5f}"),
                                            ("Seconds (median)", 3, "{:.0f}")]):
        vals = [d[idx] for d in datos]
        ax.barh(nombres, vals, color=colores, height=0.55)
        for i, v in enumerate(vals):
            ax.text(v + max(vals) * 0.03, i, fmt.format(v), va="center", fontsize=9)
        ax.set_xlim(0, max(vals) * 1.45 if max(vals) else 1)
        ax.set_title(titulo, loc="left", fontsize=10, fontweight="bold")
        ax.set_xticks([])
        ax.spines["bottom"].set_visible(False)
        if ax is not ejes[0]:
            ax.set_yticklabels([])
    fig.suptitle("Answer model: same 44 questions, same context, judge from another vendor + manual review",
                 x=0.02, y=1.12, ha="left", fontsize=11, fontweight="bold")
    guardar(fig, "modelos-respuesta.png")


if __name__ == "__main__":
    examen()
    cuadros()
    modelos()
