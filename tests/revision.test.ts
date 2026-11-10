/**
 * Revisión a mano de cuadros (pestaña Cuadros del panel): validación, registro de solo agregar y la regla de que
 * lo revisado a mano es una tercera categoría, que nunca suma a «confirmadas por dos lecturas».
 * Corre con:  npx tsx --test tests/revision.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  huellaCuadro, cargarCuadros, cargarRevisiones, aplicarRevisiones, armarRevision, listarCuadros, type Cuadro,
} from "../src/cuadros.ts";

// La misma huella que calcula ingest_v2/tablas_pdf.py (tests/test_cuadros.py usa el mismo caso).
test("la huella del cuadro es la misma que en la ingesta", () => {
  assert.equal(huellaCuadro("CET-p0179-1", [56.7, 120.2, 540.9, 300.5], ["Tipo de Local", "Lado mínimo (m)"]), "890ff1b9cde9");
});

function preparar() {
  const dir = mkdtempSync(join(tmpdir(), "norma-rev-"));
  const c = (id: string, modo: string, filas: string[][], sin: number) => ({
    id, modo, filas, sin_verificar: sin, bbox: [10, 20, 300, 400], lectura: modo === "solo_imagen" ? null : "grilla",
    encabezados: ["Tipo", "Lado mínimo (m)"], encabezados_grilla: ["Tipo", "Lado mínimo (m)"], rotulos_sin_verificar: [], titulo: null,
  });
  writeFileSync(join(dir, "cuadros.json"), JSON.stringify([
    { pdf: "ce.pdf", pagina: 179, cuadros: [c("CET-p0179-1", "verificado", [["Baño tipo I", "1,50"]], 0)] },
    { pdf: "ce.pdf", pagina: 177, cuadros: [c("CET-p0177-1", "solo_imagen", [], 2)] },
  ]));
  return { dir, todos: cargarCuadros(dir, () => true) };
}
const lecturas = { vision: { encabezados: ["Tipo", "Lado mínimo (m)"], filas: [["Baño tipo II", "1,50"], ["Toilette", "0,90"]] } };

test("una revisión válida queda con su base y las celdas que cambió la persona", () => {
  const { dir, todos } = preparar();
  try {
    const pend = todos.find((x) => x.id === "CET-p0177-1")!;
    const r = armarRevision({ accion: "confirmar", huella: pend.huella, base: "vision", revisor: " Ana ",
      encabezados: ["Tipo", "Lado mínimo (m)"], filas: [["Baño tipo II", "1,50"], ["Toilette", "0,80"], ["", ""]] }, pend, lecturas,
      new Date("2026-11-10T12:00:00Z"));
    assert.ok(typeof r !== "string");
    assert.equal(r.base, "vision");
    assert.equal(r.editadas, 1); // 0,90 -> 0,80; la fila vacía se descarta
    assert.equal(r.filas!.length, 2);
    assert.equal(r.revisor, "Ana");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("se rechaza lo que no corresponde", () => {
  const { dir, todos } = preparar();
  try {
    const pend = todos.find((x) => x.id === "CET-p0177-1")!;
    const ok = { accion: "confirmar", huella: pend.huella, encabezados: ["a", "b"], filas: [["1", "2"]] };
    assert.match(armarRevision(ok, undefined, undefined) as string, /No existe/);
    assert.match(armarRevision({ ...ok, huella: "otra" }, pend, undefined) as string, /cambió/);
    assert.match(armarRevision({ ...ok, filas: [["1"]] }, pend, undefined) as string, /no tiene 2 celdas/);
    assert.match(armarRevision({ ...ok, filas: [["", " "]] }, pend, undefined) as string, /vacías/);
    const verif = todos.find((x) => x.id === "CET-p0179-1")!;
    assert.match(armarRevision({ ...ok, huella: verif.huella }, verif, undefined) as string, /ya está verificado/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("lo revisado a mano va aparte de lo confirmado por dos lecturas; deshacer lo devuelve a la cola", () => {
  const { dir, todos } = preparar();
  try {
    const ruta = join(dir, "revisiones.jsonl");
    const pend = todos.find((x) => x.id === "CET-p0177-1")!;
    const r = armarRevision({ accion: "confirmar", huella: pend.huella, base: "vision", encabezados: ["Tipo", "Lado mínimo (m)"],
      filas: [["Baño tipo II", "1,50"], ["Toilette", "0,90"]] }, pend, lecturas);
    appendFileSync(ruta, JSON.stringify(r) + "\n");
    let vista: Cuadro[] = aplicarRevisiones(todos, cargarRevisiones(ruta));
    let res = listarCuadros(vista, new URLSearchParams()).resumen;
    assert.equal(res.por_modo.revisado, 1);
    assert.equal(res.filas_confirmadas, 1); // la del cuadro verificado; las revisadas no suman acá
    assert.equal(res.filas_revisadas, 2);
    assert.equal(res.por_revisar, 0);
    assert.equal(vista.find((x) => x.id === "CET-p0177-1")!.lectura, "humano");
    assert.equal(listarCuadros(vista, new URLSearchParams("modo=revisado")).total, 1);

    appendFileSync(ruta, JSON.stringify(armarRevision({ accion: "deshacer", huella: pend.huella }, pend, lecturas)) + "\n");
    vista = aplicarRevisiones(todos, cargarRevisiones(ruta));
    res = listarCuadros(vista, new URLSearchParams()).resumen;
    assert.equal(res.por_modo.revisado, 0);
    assert.equal(listarCuadros(vista, new URLSearchParams("modo=por_revisar")).cuadros[0].id, "CET-p0177-1");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("una revisión de un cuadro que cambió no se aplica y queda marcada", () => {
  const { dir, todos } = preparar();
  try {
    const ruta = join(dir, "revisiones.jsonl");
    writeFileSync(ruta, JSON.stringify({ id: "CET-p0177-1", huella: "000000000000", ts: "2026-11-10T12:00:00Z", accion: "confirmar",
      base: "vision", encabezados: ["a", "b"], filas: [["1", "2"]], editadas: 0 }) + "\n");
    const vista = aplicarRevisiones(todos, cargarRevisiones(ruta));
    const c = vista.find((x) => x.id === "CET-p0177-1")!;
    assert.equal(c.modo, "solo_imagen");
    assert.equal(c.revision_vieja, true);
    assert.equal(listarCuadros(vista, new URLSearchParams()).resumen.revisiones_viejas, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
