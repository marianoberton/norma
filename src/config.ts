/**
 * Configuracion central del agente. Todo se controla por variables de entorno.
 * Carga .env.local (donde el usuario dejo las API keys) y, como respaldo, .env.
 * No depende de paquetes externos: parsea el archivo a mano.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Raiz del proyecto = carpeta que contiene /src
const projectRoot = resolve(__dirname, "..");

/** Carga variables de un archivo .env simple (KEY=VALUE) sin pisar las ya definidas. */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Quita comillas envolventes si las hay.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// .env.local tiene prioridad sobre .env (se carga primero; loadEnvFile no pisa).
loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta la variable de entorno ${name}. Definila en .env.local (ver .env.example).`,
    );
  }
  return v;
}

export const config = {
  projectRoot,

  openaiApiKey: req("OPENAI_API_KEY"),
  openrouterApiKey: req("OPENROUTER_API_KEY"),

  // Generacion (OpenRouter). El slug es un string: cambiarlo no requiere reindexar.
  modelPrimary: process.env.MODEL_PRIMARY ?? "openai/gpt-6-luna",
  modelFallback: process.env.MODEL_FALLBACK ?? "anthropic/claude-haiku-5.5",

  // Embeddings (OpenAI)
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDims: Number(process.env.EMBEDDING_DIMS ?? 1536),

  // Vector store local (archivos generados por la ingesta)
  storeDir: resolve(projectRoot, process.env.STORE_DIR ?? "data"),
  vectorIndex: process.env.VECTOR_INDEX ?? "normativa",

  // Corpus / chunking
  corpusDir: resolve(projectRoot, process.env.CORPUS_DIR ?? "../DIVISIÓN"),
  chunkSize: Number(process.env.CHUNK_SIZE ?? 1100),
  chunkOverlap: Number(process.env.CHUNK_OVERLAP ?? 150),

  // Recuperacion
  topK: Number(process.env.TOP_K ?? 8),

  // Servidor web (8787 por defecto para no chocar con apps en 3000/5173)
  port: Number(process.env.PORT ?? 8787),

  // Auth: si está seteado, /api/chat y /api/feedback exigen header X-API-Key.
  // Vacío = sin auth (solo para desarrollo local). En producción,
  // setear AGENT_API_KEY y configurar el mismo valor en la plataforma.
  agentApiKey: process.env.AGENT_API_KEY ?? "",
} as const;
