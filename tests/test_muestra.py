"""La muestra de demo/data tiene que cargar tal cual en el servidor (npm run demo)."""
import json
import unittest
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent / "demo" / "data"


class MuestraTest(unittest.TestCase):
    def test_registros_y_vectores_coinciden(self):
        meta = json.loads((DEMO / "normativa_demo.meta.json").read_text(encoding="utf-8"))
        registros = json.loads((DEMO / "normativa_demo.chunks.json").read_text(encoding="utf-8"))
        vectores = (DEMO / "normativa_demo.vectors.bin").stat().st_size
        self.assertEqual(meta["count"], len(registros))
        self.assertEqual(vectores, len(registros) * meta["dims"] * 4)

    def test_cada_cuadro_y_figura_tiene_su_imagen(self):
        ids = {c["id"] for p in json.loads((DEMO / "v2/tablas/cuadros.json").read_text(encoding="utf-8")) for c in p["cuadros"]}
        for rel in ("v2/figuras.jsonl", "v2/tablas/figuras.jsonl"):
            ids |= {json.loads(l)["id"] for l in (DEMO / rel).read_text(encoding="utf-8").splitlines() if l.strip()}
        faltan = [i for i in ids if not (DEMO / "v2/figuras" / f"{i}.png").exists()]
        self.assertEqual(faltan, [])

    def test_el_cuadro_de_banos_esta_verificado(self):
        cuadros = {c["id"]: c for p in json.loads((DEMO / "v2/tablas/cuadros.json").read_text(encoding="utf-8")) for c in p["cuadros"]}
        banos = cuadros["CET-p0179-1"]
        self.assertEqual(banos["modo"], "verificado")
        self.assertIn(["Baño tipo I(In-Lo-Ba)", "1,50", "3,00"], banos["filas"])


if __name__ == "__main__":
    unittest.main()
