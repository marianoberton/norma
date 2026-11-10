"""Arma demo/data: una muestra chica del índice para probar Norma sin los PDF ni la ingesta.

    python -I scripts/muestra.py <índice de origen>

Toma del índice completo (data/<índice de origen>.*) los registros del Código de Edificación de los capítulos
3.4 (medios de salida, escaleras) y 3.5 (servicios de salubridad), con sus vectores ya
calculados, sus figuras y sus cuadros verificados. No llama a ninguna API.
"""
import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "data"
DESTINO = RAIZ / "demo" / "data"
INDICE = "normativa_demo"
CAPITULOS = ("3.4", "3.5")


def entra(articulo):
    return any(articulo == c or articulo.startswith(c + ".") for c in CAPITULOS) if articulo else False


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python -I scripts/muestra.py <índice de origen en data/>")
    origen = sys.argv[1]
    meta = json.loads((ORIGEN / f"{origen}.meta.json").read_text(encoding="utf-8"))
    registros = json.loads((ORIGEN / f"{origen}.chunks.json").read_text(encoding="utf-8"))
    vectores = (ORIGEN / f"{origen}.vectors.bin").read_bytes()
    paso = meta["dims"] * 4
    assert len(vectores) == paso * len(registros), "el índice no coincide con sus vectores"

    elegidos = [i for i, r in enumerate(registros) if r.get("source_doc") == "CodigoEdificacion" and entra(r.get("articulo"))]
    if DESTINO.exists():
        shutil.rmtree(DESTINO)
    (DESTINO / "v2" / "tablas").mkdir(parents=True)
    (DESTINO / "v2" / "figuras").mkdir()
    (DESTINO / f"{INDICE}.chunks.json").write_text(
        json.dumps([registros[i] for i in elegidos], ensure_ascii=False), encoding="utf-8")
    (DESTINO / f"{INDICE}.vectors.bin").write_bytes(b"".join(vectores[i * paso:(i + 1) * paso] for i in elegidos))
    (DESTINO / f"{INDICE}.meta.json").write_text(
        json.dumps({**meta, "count": len(elegidos), "muestra": f"CE, capítulos {', '.join(CAPITULOS)}"}, indent=2), encoding="utf-8")

    ids = set()
    for rel in ("v2/figuras.jsonl", "v2/tablas/figuras.jsonl"):
        lineas = [l for l in (ORIGEN / rel).read_text(encoding="utf-8").splitlines() if l.strip()]
        sel = [l for l in lineas if json.loads(l)["documento"] == "CE" and entra(json.loads(l).get("articulo"))]
        ids |= {json.loads(l)["id"] for l in sel}
        (DESTINO / rel).write_text("\n".join(sel) + "\n", encoding="utf-8")
    paginas = []
    for p in json.loads((ORIGEN / "v2" / "tablas" / "cuadros.json").read_text(encoding="utf-8")):
        cuadros = [c for c in p["cuadros"] if c["id"] in ids]
        if cuadros:
            paginas.append({**p, "cuadros": cuadros})
    (DESTINO / "v2" / "tablas" / "cuadros.json").write_text(json.dumps(paginas, ensure_ascii=False), encoding="utf-8")
    # Lo que leyó cada fuente en los cuadros que quedan por revisar a mano (cola de revisión del panel).
    origen_lect = ORIGEN / "v2" / "tablas" / "lecturas.json"
    if origen_lect.exists():
        lect = json.loads(origen_lect.read_text(encoding="utf-8"))
        (DESTINO / "v2" / "tablas" / "lecturas.json").write_text(
            json.dumps({k: v for k, v in lect.items() if k in ids}, ensure_ascii=False), encoding="utf-8")
    for i in sorted(ids):
        png = ORIGEN / "v2" / "figuras" / f"{i}.png"
        if png.exists():
            shutil.copy2(png, DESTINO / "v2" / "figuras" / png.name)

    total = sum(f.stat().st_size for f in DESTINO.rglob("*") if f.is_file())
    print(f"{len(elegidos)} registros, {len(ids)} figuras y cuadros, {sum(len(p['cuadros']) for p in paginas)} cuadros "
          f"en {len(paginas)} páginas · {total / 1e6:.1f} MB en {DESTINO.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
