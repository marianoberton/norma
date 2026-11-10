/**
 * Corre el examen contra el índice y guarda el resultado.
 *   npx tsx eval/correr-examen.ts [examen.json] [etiqueta] [k]
 *
 * Mide, por pregunta, en qué puesto aparece el primer fragmento que cumple la
 * respuesta esperada. Resume con acierto@k (Recall@k) y MRR. Solo recuperación:
 * no redacta respuestas, así que cuesta un embedding por pregunta.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieve } from "../src/rag.js";
import { config } from "../src/config.js";
import { cumple, type Esperado } from "./criterio.js";

interface Pregunta {
  id: string;
  pregunta: string;
  esperado: Esperado[];
  por_revisar?: string;
}

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaExamen = resolve(process.argv[2] ?? resolve(aqui, "examen-v0.json"));
const etiqueta = process.argv[3] ?? "indice-actual";
const K = Number(process.argv[4] ?? config.topK);

const examen = JSON.parse(readFileSync(rutaExamen, "utf8")) as { version: string; preguntas: Pregunta[] };
const filas = [];
for (const p of examen.preguntas) {
  const t0 = Date.now();
  const hits = await retrieve(p.pregunta, K);
  const ms = Date.now() - t0;
  const puesto = hits.findIndex((h) => p.esperado.some((e) => cumple(h.record, e)));
  filas.push({
    id: p.id,
    pregunta: p.pregunta,
    por_revisar: p.por_revisar ?? null,
    puesto: puesto === -1 ? null : puesto + 1,
    ms,
    devueltos: hits.map((h) => ({
      score: Number(h.score.toFixed(3)),
      doc: h.record.source_doc,
      rt: h.record.rt_code,
      articulo: h.record.articulo,
      ubicacion: h.record.ubicacion,
      archivo: h.record.archivo_origen,
      chunk: h.record.chunk_index,
    })),
  });
  const marca = puesto === -1 ? "✗" : "✓";
  console.log(`${marca} ${String(puesto === -1 ? "—" : puesto + 1).padStart(2)}  ${p.id}${p.por_revisar ? "  (por revisar)" : ""}`);
}

const n = filas.length;
const aciertos = filas.filter((f) => f.puesto !== null).length;
const mrr = filas.reduce((s, f) => s + (f.puesto ? 1 / f.puesto : 0), 0) / n;
const confiables = filas.filter((f) => !f.por_revisar);
const resumen = {
  examen: examen.version,
  etiqueta,
  fecha: new Date().toISOString(),
  k: K,
  modelo_embeddings: config.embeddingModel,
  preguntas: n,
  acierto_k: Number((aciertos / n).toFixed(3)),
  mrr: Number(mrr.toFixed(3)),
  acierto_k_sin_por_revisar: Number((confiables.filter((f) => f.puesto !== null).length / Math.max(confiables.length, 1)).toFixed(3)),
  ms_mediana: filas.map((f) => f.ms).sort((a, b) => a - b)[Math.floor(n / 2)],
};
console.log(`\nAcierto@${K}: ${aciertos}/${n} (${(100 * resumen.acierto_k).toFixed(0)} %) · MRR ${resumen.mrr} · sin las «por revisar»: ${(100 * resumen.acierto_k_sin_por_revisar).toFixed(0)} %`);

const dirRes = resolve(aqui, "resultados");
mkdirSync(dirRes, { recursive: true });
const archivo = resolve(dirRes, `${resumen.fecha.slice(0, 10)}_${examen.version}_${etiqueta}.json`);
writeFileSync(archivo, JSON.stringify({ resumen, filas }, null, 1));
console.log(`Guardado en ${archivo}`);
