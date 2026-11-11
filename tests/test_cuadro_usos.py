"""Leyenda del cuadro de usos (ingest_v2/cuadro_usos.py): cómo se arman las tablas de referencias.

Corre sin API ni datos:  python -m unittest discover -s tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest_v2"))
import cuadro_usos as cu  # noqa: E402


class Leyenda(unittest.TestCase):
    LECTURA = {
        1: [["SI", "Permitido"], ["-", "No tiene requerimiento"], ["C", "El Consejo decide"], ["500C", "Superficie máxima 500 m2"]],
        2: [["1", "1 módulo cada 160m2"], ["35a", "Según el cuadro:"], ["", "2 | de 500 a 750m2"], ["", "3 | de 751 a 1.000m2"],
            ["a", "1 módulo cada 150m2"], ["Número de módulos", "Superficie"], ["I", "1 espacio para un camión"]],
    }

    def test_cada_tabla_empieza_por_su_primer_codigo(self):
        g = cu.leyenda_de(self.LECTURA)
        self.assertEqual(set(g["general"]), {"SI", "—", "C", "500C"})  # el guion se guarda como «—», como en la norma
        self.assertEqual(set(g["EST"]), {"1", "35a"})
        self.assertEqual(set(g["BICI"]), {"a"})
        self.assertEqual(set(g["CyD"]), {"I"})

    def test_las_filas_sin_codigo_continuan_la_anterior(self):
        g = cu.leyenda_de(self.LECTURA)
        self.assertIn("2 | de 500 a 750m2", g["EST"]["35a"])
        self.assertIn("3 | de 751 a 1.000m2", g["EST"]["35a"])
        # Un «código» que no tiene la forma de su tabla (una subtabla leída como filas) también continúa.
        self.assertIn("Número de módulos", g["BICI"]["a"])

    def test_comparar_significados(self):
        self.assertEqual(cu.norm("Superficie máxima 500m²"), cu.norm("Superficie máxima 500 m2"))
        self.assertNotEqual(cu.norm("considerándose el número"), cu.norm("considerándose al número"))

    def test_encabezado_repetido_en_el_salto_de_pagina(self):
        t = "6 | de 751 a 1.000m² REFERENCIAS ADOPTADAS | REGULACIÓN O REQUERIMIENTO | 8 | de 1.001 a 1.500m²"
        self.assertIn(cu.norm("6 de 751 a 1.000m² 8 de 1.001 a 1.500m²"), cu.norm(cu.ENCABEZADO_REF.sub(" ", t)))

    def test_unir_fragmentos_solapados(self):
        self.assertEqual(cu.unir("uno dos tres cuatro cinco seis", "tres cuatro cinco seis siete"), "uno dos tres cuatro cinco seis siete")


if __name__ == "__main__":
    unittest.main()
