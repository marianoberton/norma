/**
 * El examen de recuperación corre en el CI, sobre la muestra de demo/data y sin API: los vectores
 * de las preguntas ya están calculados (demo/examen/preparar.mts). Si un cambio en la búsqueda,
 * el índice o el troceo baja el acierto o el MRR de la muestra, el CI falla.
 * Corre con:  npx tsx --test tests/examen-muestra.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.STORE_DIR = resolve(raiz, "demo/data");
process.env.VECTOR_INDEX = "normativa_demo";
process.env.JURISDICCION = "jurisdicciones/ejemplo";
process.env.EMBED_CACHE = resolve(raiz, "demo/examen/preguntas.vectores.json");
process.env.OPENAI_API_KEY ??= "sin-uso";      // si una pregunta no tuviera vector, la llamada falla
process.env.OPENROUTER_API_KEY ??= "sin-uso";

// Lo medido al fijar el umbral (2026-11-10): 8 de 10 en el primer puesto, 2 fuera de los 8 primeros.
const MINIMO = { acierto: 0.8, mrr: 0.8 };

test("el examen de la muestra no retrocede", async () => {
  const { retrieve } = await import("../src/rag.ts");
  const { cumple } = await import("../eval/criterio.ts");
  const examen = JSON.parse(readFileSync(resolve(raiz, "demo/examen/examen.json"), "utf8"));
  const puestos: (number | null)[] = [];
  for (const p of examen.preguntas) {
    const hits = await retrieve(p.pregunta, 8);
    const i = hits.findIndex((h) => p.esperado.some((e: Parameters<typeof cumple>[1]) => cumple(h.record, e)));
    puestos.push(i === -1 ? null : i + 1);
  }
  const acierto = puestos.filter(Boolean).length / puestos.length;
  const mrr = puestos.reduce((s: number, x) => s + (x ? 1 / x : 0), 0) / puestos.length;
  console.log(`muestra: acierto@8 ${(acierto * 100).toFixed(0)} % · MRR ${mrr.toFixed(3)} · puestos ${puestos.map((x) => x ?? "—").join(" ")}`);
  assert.ok(acierto >= MINIMO.acierto, `acierto@8 ${acierto} < ${MINIMO.acierto}`);
  assert.ok(mrr >= MINIMO.mrr - 1e-9, `MRR ${mrr.toFixed(3)} < ${MINIMO.mrr}`);
});
