"""El corte en fragmentos nunca parte una fila de cuadro: cada fila llega entera, con sus nombres de columna."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest_v2"))
import extraer_pdf as ep  # noqa: E402


def fila(i, ancho=1):
    celdas = " · ".join(f"Columna {j}: valor {i}-{j}" for j in range(4 * ancho))
    return f"Cuadro · Riesgo: {i} · {celdas}"


class Partir(unittest.TestCase):
    def test_texto_corto_queda_entero(self):
        self.assertEqual(ep.partir("Art. 1. Breve."), ["Art. 1. Breve."])

    def test_cuadro_largo_se_corta_entre_filas(self):
        filas = [fila(i) for i in range(40)]
        texto = "Art. 3.5.2.1 Los baños deben tener área y lados mínimos según el cuadro:\n" + "\n".join(filas)
        piezas = ep.partir(texto)
        self.assertGreater(len(piezas), 1)
        for p in piezas:
            for linea in p.split("\n"):
                if " · Columna" in linea:
                    self.assertIn(linea, filas, "fila partida: " + linea[:60])
        # ninguna fila se pierde
        juntas = "\n".join(piezas)
        for f in filas:
            self.assertIn(f, juntas)

    def test_fila_mas_larga_que_un_fragmento_va_entera(self):
        larga = fila(1, ancho=12)
        self.assertGreater(len(larga), ep.MAX_CHARS)
        texto = "Cuadro de servicios sanitarios:\n" + larga + "\n" + fila(2)
        piezas = ep.partir(texto)
        self.assertTrue(any(larga in p for p in piezas))

    def test_prosa_se_corta_en_punto(self):
        texto = " ".join(f"Oración número {i} del artículo." for i in range(120))
        for p in ep.partir(texto)[:-1]:
            self.assertTrue(p.endswith("."), p[-40:])


if __name__ == "__main__":
    unittest.main()
