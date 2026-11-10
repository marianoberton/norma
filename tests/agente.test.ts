/**
 * Piezas del servicio que no necesitan API: búsqueda en el índice y respaldo de modelo.
 * Corre con:  npx tsx --test tests/agente.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VectorStore, type ChunkRecord } from "../src/lib/vector-store.ts";
import { generateStream } from "../src/lib/generate.ts";
import { config } from "../src/config.ts";

function registro(articulo: string, text: string): ChunkRecord {
  return {
    text, documento: "Código de Edificación", capitulo_tema: null, titulo: null, ubicacion: articulo,
    rt_code: null, articulo, version: null, source_doc: "CodigoEdificacion",
    archivo_origen: "test", pdf_respaldo: "test", chunk_index: 0,
  } as ChunkRecord;
}

test("el índice guarda, carga y devuelve primero el fragmento más parecido", () => {
  const dir = mkdtempSync(join(tmpdir(), "norma-"));
  try {
    const recs = [registro("3.5.2.1", "baños"), registro("3.4.7.6", "escaleras"), registro("3.8.1.3", "gastronomía")];
    new VectorStore(dir, "prueba").save(recs, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "test");
    const s = new VectorStore(dir, "prueba");
    s.load();
    const hits = s.search([0.1, 0.9, 0], 2);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].record.articulo, "3.4.7.6");
    assert.ok(hits[0].score > hits[1].score);
    // el filtro por metadatos acota antes de ordenar
    const soloBanos = s.search([0, 1, 0], 3, (r) => r.articulo === "3.5.2.1");
    assert.deepEqual(soloBanos.map((h) => h.record.articulo), ["3.5.2.1"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("si el modelo principal falla, responde el de respaldo y el streaming llega entero", async () => {
  const pedidos: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const { model } = JSON.parse(init.body);
    pedidos.push(model);
    if (model === config.modelPrimary) return new Response("sobrecargado", { status: 503 });
    const sse = [
      'data: {"choices":[{"delta":{"content":"Lado mínimo "}}]}',
      ": comentario SSE",
      'data: {"choices":[{"delta":{"content":"1,50 m."}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(sse, { status: 200 });
  }) as typeof fetch;
  try {
    let recibido = "";
    const texto = await generateStream([{ role: "user", content: "baño tipo I" }], (t) => (recibido += t));
    assert.equal(texto, "Lado mínimo 1,50 m.");
    assert.equal(recibido, texto);
    assert.deepEqual(pedidos, [config.modelPrimary, config.modelFallback]);
  } finally {
    globalThis.fetch = original;
  }
});

test("la pestaña Cuadros resume la verificación y filtra sin perder el total", async () => {
  const { writeFileSync } = await import("node:fs");
  const { cargarCuadros, listarCuadros } = await import("../src/cuadros.ts");
  const dir = mkdtempSync(join(tmpdir(), "norma-cuadros-"));
  try {
    const c = (id: string, modo: string, filas: string[][], sin: number, extra = {}) => ({
      id, modo, filas, sin_verificar: sin, lectura: modo === "solo_imagen" ? null : "grilla",
      encabezados: ["Tipo", "Lado mínimo (m)"], encabezados_grilla: ["Tipo", "Lado mínimo (m)"],
      rotulos_sin_verificar: [], titulo: null, ...extra,
    });
    writeFileSync(join(dir, "cuadros.json"), JSON.stringify([
      { pdf: "ce.pdf", pagina: 179, cuadros: [c("CET-p0179-1", "verificado", [["Baño tipo I", "1,50"]], 0)] },
      { pdf: "rt.pdf", pagina: 506, cuadros: [c("RTT-p0506-1", "parcial", [["2", "F120"]], 3), c("RTT-p0506-2", "solo_imagen", [], 4, { rotulos_sin_verificar: ["Riesgo 4"] })] },
    ]));
    writeFileSync(join(dir, "figuras.jsonl"), JSON.stringify({ id: "CET-p0179-1", articulo: "3.5.2.1", ubicacion: "Título 3 › 3.5.2.1" }) + "\n");
    const todos = cargarCuadros(dir, (id) => id === "CET-p0179-1");
    assert.equal(todos.length, 3);
    assert.equal(todos[0].articulo, "3.5.2.1");
    assert.equal(todos[0].imagen, "/api/figura/CET-p0179-1.png");
    assert.equal(todos[1].doc, "RT");

    const r = listarCuadros(todos, new URLSearchParams("modo=solo_imagen"));
    assert.equal(r.total, 1);
    assert.deepEqual(r.resumen.por_modo, { verificado: 1, recuadro: 0, parcial: 1, solo_imagen: 1, revisado: 0 });
    assert.equal(r.resumen.por_revisar, 2);
    assert.equal(r.resumen.filas_confirmadas, 2);
    assert.equal(r.resumen.filas_sin_verificar, 7);
    assert.equal(listarCuadros(todos, new URLSearchParams("q=riesgo 4")).cuadros[0].id, "RTT-p0506-2");
    assert.equal(listarCuadros(todos, new URLSearchParams("q=3.5.2.1&doc=CE")).total, 1);
    assert.deepEqual(cargarCuadros(join(dir, "no-existe"), () => false), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("el prompt sale de la jurisdicción y no nombra ninguna ciudad por su cuenta", async () => {
  const { promptSistema } = await import("../src/rag.ts");
  const { cargarJurisdiccion } = await import("../src/jurisdiccion.ts");
  const ejemplo = cargarJurisdiccion("jurisdicciones/ejemplo");
  const p = promptSistema(ejemplo);
  assert.ok(p.startsWith(ejemplo.corpus) && p.includes(ejemplo.citas));
  assert.ok(p.includes("FORMATO DE RESPUESTA") && p.includes("REGLAS INQUEBRANTABLES"));
  assert.throws(() => cargarJurisdiccion("jurisdicciones/no-existe"), /No hay jurisdicción/);
  const raiz = join(config.projectRoot, "jurisdicciones");
  for (const id of readdirSync(raiz, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const j = cargarJurisdiccion(join(raiz, id));
    // El nombre de una ciudad entra solo por su propia jurisdicción.
    if (j.nombre && id !== "ejemplo") assert.ok(!p.includes(j.nombre), `el prompt genérico nombra ${j.nombre}`);
    // Si la jurisdicción guarda su prompt anterior, pasarla a configuración no lo alteró.
    const foto = join(raiz, id, "prompt.snapshot.txt");
    if (existsSync(foto)) assert.equal(promptSistema(j), readFileSync(foto, "utf8").replace(/\r/g, ""));
  }
});
