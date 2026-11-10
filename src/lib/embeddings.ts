/**
 * Embeddings via la API REST de OpenAI (text-embedding-3-small por defecto).
 * Sin SDK: solo fetch, para no atarse a versiones de @ai-sdk que cambian seguido.
 */
import { existsSync, readFileSync } from "node:fs";
import { config } from "../config.js";

const ENDPOINT = "https://api.openai.com/v1/embeddings";

async function postEmbeddings(input: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: config.embeddingModel, input }),
      });
      if (!res.ok) {
        const body = await res.text();
        // 429/5xx -> reintentar con backoff; otros -> fallar.
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
        }
        throw new Error(`OpenAI ${res.status} (no reintentable): ${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      // Garantiza el orden por index.
      return json.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      const wait = 800 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`Fallaron los embeddings tras varios intentos: ${String(lastErr)}`);
}

/** Embebe muchos textos, en lotes, devolviendo un vector por texto (en orden). */
export async function embedBatch(
  texts: string[],
  batchSize = 96,
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await postEmbeddings(batch);
    out.push(...vecs);
    onProgress?.(Math.min(i + batchSize, texts.length), texts.length);
  }
  return out;
}

// Vectores ya calculados de preguntas fijas (EMBED_CACHE=<archivo .json> {texto: vector}).
// Así el examen de la muestra corre en el CI sin llamar a la API.
let cache: Map<string, number[]> | null | undefined;
function vectorGuardado(text: string): number[] | undefined {
  if (cache === undefined) {
    const f = process.env.EMBED_CACHE;
    cache = f && existsSync(f) ? new Map(Object.entries(JSON.parse(readFileSync(f, "utf8")) as Record<string, number[]>)) : null;
  }
  return cache?.get(text);
}

/** Embebe un unico texto (para las consultas). */
export async function embedOne(text: string): Promise<number[]> {
  const guardado = vectorGuardado(text);
  if (guardado) return guardado;
  const [v] = await postEmbeddings([text]);
  return v;
}
