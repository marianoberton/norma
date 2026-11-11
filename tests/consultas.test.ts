/**
 * Consultas directas para otros agentes: artículo entero por número y fila del cuadro de usos con su leyenda.
 * Datos sintéticos, con la forma del índice real. Corre sin API ni índice:  npx tsx --test tests/consultas.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChunkRecord } from "../src/lib/vector-store.js";
import { buscarArticulo, unirPartes } from "../src/articulos.js";
import { buscarUsos, decodificar, partirFila, type DatosUsos } from "../src/usos.js";

const base = { documento: "Código", capitulo_tema: null, titulo: null, ubicacion: "x", version: null, pdf_respaldo: "c.pdf" };
const reg = (o: Partial<ChunkRecord> & Record<string, unknown>): ChunkRecord =>
  ({ ...base, rt_code: null, articulo: null, source_doc: "CUR", archivo_origen: "cuerpo", chunk_index: 0, text: "", ...o }) as ChunkRecord;
const sinFiguras = () => [];

test("unirPartes quita el solapamiento entre partes", () => {
  assert.equal(unirPartes(["La manzana tiene cuatro lados, o algún lado curvo.", "o algún lado curvo. Siguiente frase."]),
    "La manzana tiene cuatro lados, o algún lado curvo. Siguiente frase.");
  assert.equal(unirPartes(["Sin relación.", "Otra cosa."]), "Sin relación. Otra cosa.");
});

const CUR = [
  reg({ articulo: "6.4.2", chunk_index: 10, text: "6.4.2. Línea de Frente Interno. 6.4.2.1. Casos especiales de determinación de L.F.I.", pagina: 153, parte: 1 }),
  reg({ articulo: "6.4.2", chunk_index: 11, text: "de L.F.I. La línea se determina así. 6.4.2.2. Compensación.", pagina: 153, parte: 2 }),
  reg({ articulo: "6.4", chunk_index: 9, text: "6.4. Tejido.", pagina: 152, parte: 1 }),
];

test("un inciso sin etiqueta devuelve el artículo de arriba entero, con nota", () => {
  const r = buscarArticulo(CUR, { doc: "CUR", n: "6.4.2.1" }, sinFiguras);
  assert.ok(r.ok);
  assert.equal(r.articulo.articulo, "6.4.2");
  assert.equal(r.articulo.exacto, false);
  assert.match(String(r.articulo.nota), /6\.4\.2\.1 es un inciso dentro de 6\.4\.2/);
  assert.equal((r.articulo.partes as unknown[]).length, 2);
  assert.equal(r.articulo.derogado, null); // el CUR no marca derogaciones: no se sabe, no es «false»
});

test("un número que el artículo de arriba no menciona es 404, no otro artículo", () => {
  const r = buscarArticulo(CUR, { doc: "CUR", n: "6.4.9.9" }, sinFiguras);
  assert.ok(!r.ok);
  assert.equal(r.fallo.status, 404);
  assert.equal(r.fallo.mas_cercano, "6.4");
});

test("en los RT el número se repite: sin rt devuelve los candidatos", () => {
  const rts = [
    reg({ source_doc: "RT", rt_code: "RT-1", archivo_origen: "RT-1", articulo: "2", chunk_index: 1, text: "2. Requisitos 3" }), // línea del índice
    reg({ source_doc: "RT", rt_code: "RT-1", archivo_origen: "RT-1", articulo: "2", chunk_index: 7, text: "2. Requisitos. Los interesados deben presentar la solicitud completa." }),
    reg({ source_doc: "RT", rt_code: "RT-2", archivo_origen: "RT-2", articulo: "2", chunk_index: 3, text: "2. Alcance." }),
  ];
  const sin = buscarArticulo(rts, { doc: "RT", n: "2" }, sinFiguras);
  assert.ok(!sin.ok);
  assert.equal(sin.fallo.status, 409);
  assert.deepEqual(sin.fallo.candidatos, ["RT-1", "RT-2"]);
  const con = buscarArticulo(rts, { doc: "RT", n: "2", rt: "rt-1" }, sinFiguras);
  assert.ok(con.ok);
  assert.match(String(con.articulo.texto), /solicitud completa/); // el tramo del cuerpo, no la línea del índice
  assert.equal(con.articulo.otras_menciones, 1);
});

test("doc y n se validan", () => {
  const a = buscarArticulo(CUR, { doc: "XX", n: "1.1" }, sinFiguras);
  const b = buscarArticulo(CUR, { doc: "CUR", n: "uno" }, sinFiguras);
  assert.ok(!a.ok && a.fallo.status === 400);
  assert.ok(!b.ok && b.fallo.status === 400);
});

// ---- Cuadro de usos
const DATOS: DatosUsos = {
  cuadro: "Cuadro 3.3",
  archivos: ["cuadro cuerpo", "cuadro planilla"],
  referencias: { articulo: "3.3.1", pagina: 58 },
  leyenda: {
    general: {
      "—": { significado: "No tiene requerimiento", seccion: "3.3.1.1", verificada: true },
      SI: { significado: "Permitido", seccion: "3.3.1.1", verificada: true },
      SA: { significado: "Sólo sobre vías de 26 m o más", seccion: "3.3.1.1", verificada: true },
      "500": { significado: "Superficie máxima 500m²", seccion: "3.3.1.1", verificada: true },
      "500C": { significado: "Superficie máxima 500 m². Para superficies mayores decide el Consejo.", seccion: "3.3.1.1", verificada: true },
      NPC: { significado: "No Permitido en la Ciudad", seccion: "3.3.1.1", verificada: true },
    },
    EST: { "28": { significado: "a) 1 módulo cada 3 habitaciones b) cocheras ≥ 20% de las habitaciones", seccion: "3.3.1.2", verificada: true } },
    BICI: { p: { significado: "Según cuadro", seccion: "3.3.1.3", verificada: true }, l: { significado: "1 módulo cada 2 aulas", seccion: "3.3.1.3", verificada: true } },
    CyD: {},
  },
  en_revision: { "2.3.11": { motivo: "no coinciden", planilla: { texto: "rubro 2.3.11 …", pagina: 9 } } },
};

test("una fila del índice se parte en columnas, aunque los encabezados traigan saltos de línea", () => {
  const f = partirFila("Cuadro 3.3 · rubro 2.3.3 «Gimnasio.» · 1\n(Baja\nMixtura de Usos): 500C · 2 (Media Mixtura de Usos A): 1000 · EST: - · BICI: p · Observacio-\nnes: NPC – Ver art. 3.6 · y algo más");
  assert.ok(f);
  assert.equal(f.rubro, "2.3.3");
  assert.equal(f.mixtura["1"], "500C");
  assert.equal(f.nombres_mixtura["1"], "Baja Mixtura de Usos");
  assert.equal(f.mixtura["3"], null);
  assert.equal(f.BICI, "p");
  assert.equal(f.observaciones, "NPC – Ver art. 3.6 · y algo más");
});

test("cada código se busca en su propia tabla de referencias", () => {
  const cod = (c: string, v: string) => decodificar(DATOS, c, v).map((l) => [l.codigo, l.significado ? "ok" : "sin"]);
  assert.deepEqual(cod("1", "500C"), [["500C", "ok"]]);
  assert.deepEqual(cod("2", "500/SA"), [["500", "ok"], ["SA", "ok"]]);
  assert.deepEqual(cod("2", "500SA"), [["500", "ok"], ["SA", "ok"]]); // pegados en la transcripción
  assert.deepEqual(cod("EST", "-"), [["-", "ok"]]);
  assert.deepEqual(cod("BICI", "p"), [["p", "ok"]]);
  assert.deepEqual(cod("3", "1200"), [["1200", "sin"]]); // no está en las referencias: no se adivina
  const i = decodificar(DATOS, "BICI", "I")[0];
  assert.equal(i.significado, null);
  assert.match(String(i.nota), /«l» transcrita como «I»/);
  const inc = decodificar(DATOS, "EST", "28b")[0];
  assert.equal(inc.significado, "cocheras ≥ 20% de las habitaciones");
  assert.match(String(inc.nota), /Inciso b\) de la referencia 28/);
});

test("buscar por rubro o por nombre, con en_revision y la leyenda de Observaciones", () => {
  const filas = [
    reg({ archivo_origen: "cuadro cuerpo", rubro: "2.3.3", chunk_index: 74, pagina: 73, text: "Cuadro 3.3 · rubro 2.3.3 «Gimnasio.» · 1 (Baja Mixtura de Usos): 500C · EST: - · BICI: p" }),
    reg({ archivo_origen: "cuadro cuerpo", rubro: "2.3.11", chunk_index: 82, text: "Cuadro 3.3 · rubro 2.3.11 «Estudio de danza» · 1 (Baja Mixtura de Usos): SA · Observaciones: NPC" }),
    reg({ archivo_origen: "otro cuadro", rubro: "2.3.3", chunk_index: 1, text: "Depósitos · rubro 2.3.3 «Otra cosa» · Grado: 3" }),
  ];
  const r = buscarUsos(filas, DATOS, { rubro: "2.3.3" }, sinFiguras);
  assert.equal(r.total, 1); // el cuadro de depósitos reusa números de rubro: no entra
  assert.equal(r.filas[0].en_revision, false);
  assert.equal(r.filas[0].pagina, 73);
  const q = buscarUsos(filas, DATOS, { q: "GIMNÁSIO" }, sinFiguras);
  assert.equal(q.filas[0].rubro, "2.3.3");
  const d = buscarUsos(filas, DATOS, { rubro: "2.3.11" }, sinFiguras).filas[0];
  assert.equal(d.en_revision, true);
  assert.ok(d.leyenda.some((l) => l.columna === "Observaciones" && l.codigo === "NPC"));
});
