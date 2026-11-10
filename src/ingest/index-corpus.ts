/**
 * Pipeline de ingesta (offline). Ejecutar una vez:  pnpm ingest
 *
 *   .docx  ->  texto limpio  ->  chunks  ->  embeddings (OpenAI)
 *          ->  vector store local con metadata para citar/filtrar.
 *
 * Solo ingiere los .docx de CORPUS_DIR. El PDF padre "02. PROYECTO..."
 * NO tiene .docx, asi que queda excluido automaticamente (evita duplicar).
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { config } from "../config.js";
import { docxToText } from "./parse-docx.js";
import { fileMetadata, chunkMetadata } from "./extract-metadata.js";
import { chunkMarkdown } from "../lib/chunk.js";
import { embedBatch } from "../lib/embeddings.js";
import { VectorStore, type ChunkRecord } from "../lib/vector-store.js";

/** Devuelve el elemento mas frecuente de un arreglo (o null si esta vacio). */
function mostFrequent(arr: string[]): string | null {
  if (!arr.length) return null;
  const freq = new Map<string, number>();
  for (const x of arr) freq.set(x, (freq.get(x) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const dir = config.corpusDir;
  const files = (await readdir(dir)).filter((f) => /\.docx$/i.test(f)).sort();
  console.log(`Encontrados ${files.length} .docx en ${dir}\n`);

  // 1. Parsear + chunkear todos los documentos (acumula en memoria).
  const records: ChunkRecord[] = [];

  for (const file of files) {
    const fmeta = fileMetadata(file);
    const text = await docxToText(join(dir, file));
    if (!text) {
      console.warn(`  (vacio, omitido) ${file}`);
      continue;
    }

    // RT principal del archivo (el codigo mas frecuente): respaldo de citacion
    // para los chunks donde el RT no aparece textualmente.
    const primaryRt = mostFrequent(text.match(/RT-\d{6}-\d{6}-\d{2}/g) ?? []);

    const chunks = chunkMarkdown(text, config.chunkSize, config.chunkOverlap);
    for (const c of chunks) {
      const meta = chunkMetadata(c.text);
      records.push({
        text: c.text,
        documento: fmeta.documento,
        capitulo_tema: fmeta.capitulo_tema,
        titulo: c.titulo,
        ubicacion: c.ubicacion,
        // El articulo viene de la estructura; si no, del texto.
        articulo: c.articulo ?? meta.articulo_txt,
        rt_code: meta.rt_code ?? (fmeta.source_doc === "RT" ? primaryRt : null),
        version: meta.version,
        source_doc: fmeta.source_doc,
        archivo_origen: fmeta.archivo_origen,
        pdf_respaldo: fmeta.pdf_respaldo,
        chunk_index: c.index,
      });
    }
    console.log(`  ${file.padEnd(48)} -> ${chunks.length} chunks`);
  }

  // Deriva el Título del Codigo de Edificacion para los chunks que no lo tienen
  // (los archivos CE estan cortados a mitad de un Titulo). El numero de articulo
  // (4.2.1 -> Título 4) lo identifica; el nombre sale de los Titulos detectados.
  const ceTit = new Map<string, string>();
  for (const r of records) {
    if (r.source_doc === "CodigoEdificacion" && r.titulo && r.articulo) {
      const d = String(r.articulo).split(".")[0];
      if (!ceTit.has(d)) ceTit.set(d, r.titulo);
    }
  }
  for (const r of records) {
    if (r.source_doc === "CodigoEdificacion" && !r.titulo && r.articulo) {
      const d = String(r.articulo).split(".")[0];
      r.titulo = ceTit.get(d) ?? `Título ${d}`;
      if (!r.ubicacion) r.ubicacion = r.titulo;
      else if (!r.ubicacion.startsWith("Título")) r.ubicacion = `${r.titulo} › ${r.ubicacion}`;
    }
  }

  console.log(`\nTotal: ${records.length} chunks. Generando embeddings...`);

  // 2. Embeddings. Se embebe el encabezado + texto para mejorar la recuperacion,
  //    pero se guarda solo el texto crudo para mostrar/citar.
  const inputs = records.map((r) => {
    const ctx = [r.documento, r.capitulo_tema, r.ubicacion].filter(Boolean).join(" — ");
    return ctx ? `${ctx}\n\n${r.text}` : r.text;
  });

  const t0 = Date.now();
  const embeddings = await embedBatch(inputs, 96, (done, total) => {
    process.stdout.write(`\r  embeddings: ${done}/${total}`);
  });
  console.log(`\n  Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 3. Persistir el vector store.
  const store = new VectorStore(config.storeDir, config.vectorIndex);
  store.save(records, embeddings, config.embeddingModel);

  console.log(
    `\n✅ Indexados ${records.length} chunks en '${config.vectorIndex}' (${config.storeDir}).`,
  );
}

main().catch((err) => {
  console.error("\n❌ Error en la ingesta:", err);
  process.exit(1);
});
