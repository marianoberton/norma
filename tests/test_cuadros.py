"""Regla de los cuadros: una fila entra al índice solo si dos lecturas independientes la leen igual.

Los casos salen de errores reales:
- el cuadro de baños del CE (art. 3.5.2.1), donde un modelo cruzó «lado» con «superficie»;
- el cuadro de servicios sanitarios, donde la grilla del PDF lee al revés el texto girado («.srep 04/c 1»).

Corre sin API ni PDF:  python -m unittest discover -s tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest_v2"))
import tablas_pdf as tp  # noqa: E402

ENC_BANOS = ["Tipo de Local destinado a Servicio de Salubridad", "Lado mínimo (m)", "Superficie mínima (m2)"]
FILAS_BANOS = [
    ["Baño tipo I(In-Lo-Ba)", "1,50", "3,00"],
    ["Baño tipo II (In-Lo-Du s/Ba)", "1,50", "2,50"],
    ["Baño mínimo (In-Lo-Du)", "0,90", "1,40"],
]


def grilla(enc, filas, continua=False):
    return {"encabezados": enc, "filas": filas, "continua": continua}


def lectura(enc, filas):
    return [{"encabezados": enc, "filas": filas}]


class Normalizacion(unittest.TestCase):
    def test_coma_decimal_y_superindice(self):
        self.assertEqual(tp._norm("1,50"), tp._norm("1.50"))
        self.assertEqual(tp._norm("m²"), tp._norm("m2"))

    def test_palabra_cortada_con_guion(self):
        self.assertEqual(tp._t("empre-\nsas"), "empresas")
        self.assertEqual(tp._norm("empre- sas"), tp._norm("empresas"))

    def test_un_digito_distinto_es_otro_dato(self):
        self.assertNotEqual(tp._norm("3,00"), tp._norm("3,50"))


class CeldasIguales(unittest.TestCase):
    def test_columnas_cruzadas_no_coinciden(self):
        # El error de producción: los mismos números, en la columna equivocada.
        self.assertFalse(tp._celdas_iguales(["Baño tipo I", "1,50", "3,00"], ["Baño tipo I", "3,00", "1,50"]))

    def test_celda_combinada_a_lo_ancho(self):
        # Una lectura deja vacía la celda combinada; la otra repite el valor de la izquierda.
        self.assertTrue(tp._celdas_iguales(["COMERCIAL", "Minorista", ""], ["COMERCIAL", "Minorista", "Minorista"]))

    def test_distinta_cantidad_de_columnas(self):
        self.assertFalse(tp._celdas_iguales(["a", "1"], ["a", "1", ""]))

    def test_fila_vacia_no_confirma(self):
        self.assertFalse(tp._celdas_iguales(["", ""], ["", ""]))


class Encabezados(unittest.TestCase):
    def test_aclaracion_que_agrega_una_lectura(self):
        self.assertTrue(tp._encabezado_igual(["Descripción o Rubro"], ["Descripción o Rubro (subrubro)"]))

    def test_columnas_distintas(self):
        self.assertFalse(tp._encabezado_igual(["Lado mínimo (m)"], ["Superficie mínima (m2)"]))


class DosDeTres(unittest.TestCase):
    def test_grilla_y_vision_coinciden(self):
        e = tp.evaluar(grilla(ENC_BANOS, FILAS_BANOS), [("vision", lectura(ENC_BANOS, FILAS_BANOS))], False)
        self.assertEqual(e["modo"], "verificado")
        self.assertEqual(e["lectura"], "grilla")  # a igualdad, el texto exacto del PDF
        self.assertEqual(len(e["filas"]), 3)

    def test_fila_en_disputa_queda_afuera(self):
        vision = [FILAS_BANOS[0][:2] + ["3,50"]] + FILAS_BANOS[1:]
        e = tp.evaluar(grilla(ENC_BANOS, FILAS_BANOS), [("vision", lectura(ENC_BANOS, vision))], False)
        self.assertEqual(e["modo"], "parcial")
        self.assertEqual(e["sin_verificar"], 1)
        self.assertNotIn(FILAS_BANOS[0], e["filas"])

    def test_el_arbitro_desempata(self):
        enc = ["Tipo de usuario", "Cant. de usuarios", "Mº"]
        g = [["Personal", "10 a 20", ".srep 04/c 1"]]  # la grilla lee al revés el texto girado
        v = [["Personal", "10 a 20", "1 c/40 pers."]]
        sin_arbitro = tp.evaluar(grilla(enc, g), [("vision", lectura(enc, v))], False)
        self.assertEqual(sin_arbitro["modo"], "solo_imagen")
        con_arbitro = tp.evaluar(grilla(enc, g), [("vision", lectura(enc, v)), ("arbitro", lectura(enc, v))], False)
        self.assertEqual(con_arbitro["modo"], "verificado")
        self.assertEqual(con_arbitro["filas"], v)

    def test_una_sola_lectura_no_alcanza(self):
        e = tp.evaluar(grilla(ENC_BANOS, FILAS_BANOS), [], False)
        self.assertEqual(e["modo"], "solo_imagen")
        self.assertEqual(e["filas"], [])

    def test_sin_nombres_de_columna_no_se_atribuyen_valores(self):
        enc = ["", "", ""]
        filas = [["2", "S/E", "F120"]]
        e = tp.evaluar(grilla(enc, filas), [("vision", lectura(enc, filas))], False)
        self.assertEqual(e["modo"], "solo_imagen")

    def test_continuacion_hereda_el_encabezado_verificado(self):
        # Página siguiente del mismo cuadro: la grilla repite el encabezado y la visión no lo transcribe.
        e = tp.evaluar(grilla(ENC_BANOS, FILAS_BANOS, continua=True),
                       [("vision", lectura(["", "", ""], FILAS_BANOS))], True)
        self.assertEqual(e["modo"], "verificado")


class Renderizado(unittest.TestCase):
    def test_cada_valor_lleva_su_columna(self):
        c = {"modo": "verificado", "encabezados": ENC_BANOS, "filas": FILAS_BANOS[:1], "titulo": None}
        self.assertEqual(
            tp.renderizar(c),
            "Cuadro · Tipo de Local destinado a Servicio de Salubridad: Baño tipo I(In-Lo-Ba)"
            " · Lado mínimo (m): 1,50 · Superficie mínima (m2): 3,00")

    def test_sin_verificar_no_transcribe_valores(self):
        c = {"modo": "solo_imagen", "encabezados": ENC_BANOS, "filas": [], "titulo": None, "sin_verificar": 3,
             "encabezados_grilla": ENC_BANOS, "rotulos_sin_verificar": ["Baño tipo I(In-Lo-Ba)"]}
        texto = tp.renderizar(c)
        self.assertIn("sin verificar", texto)
        self.assertIn("imagen del cuadro", texto)
        self.assertNotIn("3,00", texto)
        self.assertNotIn("1,50", texto)


if __name__ == "__main__":
    unittest.main()
