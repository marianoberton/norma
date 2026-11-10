/**
 * Embebe los fragmentos de la ingesta v2 y guarda un índice aparte.
 *   npx tsx ingest_v2/indexar.mts <nombre del índice nuevo>
 * Fuentes: data/v2/chunks.jsonl (CE y RT), data/v2/cur/chunks.jsonl (Código Urbanístico) y las
 * figuras descritas de data/v2/figuras.jsonl y data/v2/cur/figuras.jsonl.
 * No pisa el índice que sirve el agente (VECTOR_INDEX). Se embebe «documento › rastro» + texto;
 * en el registro se guarda solo el texto, para mostrar y citar.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../src/config.js";
import { embedBatch } from "../src/lib/embeddings.js";
import { VectorStore, type ChunkRecord } from "../src/lib/vector-store.js";

const nombre = process.argv[2];
if (!nombre) throw new Error("Falta el nombre del índice nuevo: npx tsx ingest_v2/indexar.mts <nombre>.");
if (nombre === config.vectorIndex) throw new Error("Este script no pisa el índice que sirve el agente (VECTOR_INDEX).");

const leer = <T,>(rel: string): T[] => {
  const ruta = resolve(config.projectRoot, rel);
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
};

const registros: ChunkRecord[] = [...leer<ChunkRecord>("data/v2/chunks.jsonl"), ...leer<ChunkRecord>("data/v2/cur/chunks.jsonl")];
console.log(`${registros.length} fragmentos de texto y tablas`);

// Figuras descritas por el modelo de visión: entran al índice como un registro más
// («describe y embebe»), para que una consulta pueda encontrar el dibujo. Se muestran por figura_id.
interface Figura {
  id: string; documento: "CE" | "RT" | "CUR"; pdf: string; pagina: number; rt_code: string | null; articulo: string | null;
  ubicacion: string; epigrafe: string | null; vision?: { tipo?: string; descripcion?: string | null; textos?: string[]; _error?: string };
}
const DOC = {
  CE: { documento: "Código de Edificación", source_doc: "CodigoEdificacion" },
  RT: { documento: "Reglamento Técnico", source_doc: "RT" },
  CUR: { documento: "Código Urbanístico", source_doc: "CUR" },
} as const;
let n = 0;
for (const f of [...leer<Figura>("data/v2/figuras.jsonl"), ...leer<Figura>("data/v2/cur/figuras.jsonl")]) {
  const v = f.vision;
  if (!v || v._error || !v.descripcion || v.tipo === "logo_sello") continue;
  // Las páginas de cuadros no se indexan como figura: sus filas ya están como registros propios.
  if (f.documento === "CUR" && v.tipo === "tabla") continue;
  const rotulos = (v.textos ?? []).filter(Boolean).slice(0, 25).join(", ");
  registros.push({
    text: [`[Figura: ${v.tipo ?? "figura"}]`, f.epigrafe, v.descripcion, rotulos ? `Rótulos: ${rotulos}.` : null].filter(Boolean).join(" "),
    documento: DOC[f.documento].documento,
    capitulo_tema: null,
    titulo: null,
    ubicacion: f.ubicacion,
    rt_code: f.rt_code,
    articulo: f.articulo,
    version: null,
    source_doc: DOC[f.documento].source_doc,
    archivo_origen: `Figuras ${f.documento}`,
    pdf_respaldo: f.pdf,
    chunk_index: n++,
    ...({ pagina: f.pagina, pagina_fin: f.pagina, figura_id: f.id, tipo: "figura" } as object),
  } as ChunkRecord);
}
console.log(`+ ${n} figuras descritas`);

const entradas = registros.map((r) => `${r.documento} › ${r.ubicacion}\n\n${r.text}`);
const caracteres = entradas.reduce((s, t) => s + t.length, 0);
const tokens = Math.round(caracteres / 3.5); // aproximación para español
console.log(`${registros.length} registros · ~${tokens.toLocaleString("es-AR")} tokens · ~USD ${((tokens / 1e6) * 0.02).toFixed(3)} con ${config.embeddingModel}`);

const t0 = Date.now();
const vectores = await embedBatch(entradas, 96, (hechos, total) => process.stdout.write(`\r  embeddings: ${hechos}/${total}`));
console.log(`\n  listo en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
new VectorStore(config.storeDir, nombre).save(registros, vectores, config.embeddingModel);
console.log(`Índice guardado: ${config.storeDir}/${nombre}.*`);
