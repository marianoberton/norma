/**
 * Vector store local, autocontenido y sin dependencias nativas.
 * - vectores -> archivo binario Float32 (normalizados, para que coseno = producto punto)
 * - metadata/texto -> JSON paralelo (mismo orden)
 * - meta -> dims, cantidad, modelo de embedding
 *
 * Para ~miles de chunks corre en memoria sin problema. Para produccion a gran
 * escala se reemplaza por Qdrant/PgVector sin tocar el resto del sistema.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ChunkRecord {
  text: string;
  // Ubicacion normativa (para citar), NO el nombre de archivo:
  documento: string; // "Código de Edificación" | "Reglamento Técnico" | "Código Urbanístico"
  capitulo_tema: string | null; // tema del capitulo RT
  titulo: string | null; // Titulo normativo (CE)
  ubicacion: string; // rastro estructural completo
  rt_code: string | null;
  articulo: string | null;
  version: string | null;
  source_doc: "RT" | "CodigoEdificacion" | "CUR";
  // Referencias internas (no se muestran como cita principal):
  archivo_origen: string;
  pdf_respaldo: string;
  chunk_index: number;
}

/** Campos que agrega el índice v2 (desde los PDF). El índice v1 (.docx) no los tiene. */
export interface CamposV2 {
  pagina?: number;
  pagina_fin?: number;
  figura_id?: string; // el registro describe una figura o lámina
  imagenes?: string[]; // ids de las imágenes de la página (filas de cuadros)
  rubro?: string; // CUR: rubro del cuadro de usos
  rt_heredado?: boolean; // el código RT viene de la página anterior
}
export type RegistroV2 = ChunkRecord & CamposV2;

interface StoreMeta {
  dims: number;
  count: number;
  embeddingModel: string;
}

function normalize(v: number[]): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export class VectorStore {
  private dims = 0;
  private vectors: Float32Array = new Float32Array(0);
  private records: ChunkRecord[] = [];

  constructor(
    private dir: string,
    private indexName: string,
  ) {}

  private get vectorsPath() {
    return join(this.dir, `${this.indexName}.vectors.bin`);
  }
  private get recordsPath() {
    return join(this.dir, `${this.indexName}.chunks.json`);
  }
  private get metaPath() {
    return join(this.dir, `${this.indexName}.meta.json`);
  }

  /** Construye el store completo desde cero y lo persiste. */
  save(records: ChunkRecord[], embeddings: number[][], embeddingModel: string): void {
    if (records.length !== embeddings.length) {
      throw new Error("records y embeddings deben tener la misma longitud");
    }
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });

    const dims = embeddings[0]?.length ?? 0;
    const flat = new Float32Array(records.length * dims);
    for (let i = 0; i < embeddings.length; i++) {
      const n = normalize(embeddings[i]);
      flat.set(n, i * dims);
    }

    writeFileSync(this.vectorsPath, Buffer.from(flat.buffer));
    writeFileSync(this.recordsPath, JSON.stringify(records));
    const meta: StoreMeta = { dims, count: records.length, embeddingModel };
    writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
  }

  /** Carga el store a memoria. Lanza si no existe (hay que correr la ingesta). */
  load(): void {
    if (!existsSync(this.metaPath)) {
      throw new Error(
        `No existe el indice '${this.indexName}' en ${this.dir}. Corre la ingesta primero (npm run ingest) o probá la muestra con npm run demo`,
      );
    }
    const meta = JSON.parse(readFileSync(this.metaPath, "utf8")) as StoreMeta;
    this.dims = meta.dims;
    this.records = JSON.parse(readFileSync(this.recordsPath, "utf8")) as ChunkRecord[];
    const buf = readFileSync(this.vectorsPath);
    this.vectors = new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
  }

  get size(): number {
    return this.records.length;
  }

  /** Todos los registros, en el orden del índice (solo lectura). */
  all(): readonly ChunkRecord[] {
    return this.records;
  }

  /**
   * Busca los topK chunks mas similares al vector de consulta.
   * `filter` permite acotar por metadata (ej. solo RT, o un rt_code puntual).
   */
  search(
    queryVec: number[],
    topK: number,
    filter?: (r: ChunkRecord) => boolean,
  ): { record: ChunkRecord; score: number }[] {
    const q = normalize(queryVec);
    const dims = this.dims;
    const results: { record: ChunkRecord; score: number }[] = [];

    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i];
      if (filter && !filter(rec)) continue;
      let dot = 0;
      const base = i * dims;
      for (let d = 0; d < dims; d++) dot += q[d] * this.vectors[base + d];
      results.push({ record: rec, score: dot });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
