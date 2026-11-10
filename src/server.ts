/**
 * Servidor web del agente. Sirve una UI de chat y un endpoint de streaming.
 *   npm run serve   ->   http://localhost:8787
 *
 * Sin frameworks: node:http + un index.html estatico.
 */
import { createServer } from "node:http";
import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { askStream, getStore, retrieve } from "./rag.js";
import { jurisdiccion } from "./jurisdiccion.js";
import type { ChatMessage } from "./lib/generate.js";
import type { ChunkRecord, RegistroV2 } from "./lib/vector-store.js";
import {
  cargarCuadros, listarCuadros, cargarRevisiones, aplicarRevisiones, armarRevision,
  type Cuadro, type Lectura, type NombreLectura,
} from "./cuadros.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const evalDir = resolve(__dirname, "..", "eval", "resultados");
const feedbackPath = join(config.estadoDir, "feedback.jsonl");
const consultasPath = join(config.estadoDir, "consultas.jsonl");

// ---- Figuras (ingesta v2): PNG recortados del PDF + descripción del modelo de visión.
const figurasDir = join(config.storeDir, "v2", "figuras");
const figurasPaths = [join(config.storeDir, "v2", "figuras.jsonl"), join(config.storeDir, "v2", "cur", "figuras.jsonl"), join(config.storeDir, "v2", "tablas", "figuras.jsonl")];
const FIGURA_ID = /^(CE|RT|CET|RTT|CURA1|CURA4|CURA2G|CURCP|CURUR|CURIND)-p\d{4}-\d{1,3}$/;
const SOURCE_DOC: Record<string, string> = { CE: "CodigoEdificacion", RT: "RT", CUR: "CUR" };
interface FiguraPublica { id: string; url: string; pagina: number; tipo: string | null; descripcion: string | null; epigrafe: string | null }
let figurasPorClave: Map<string, FiguraPublica[]> | null = null;
let figurasPorId = new Map<string, FiguraPublica>();
const claveFig = (doc: string, rt: string | null, art: string | null) => `${doc}|${rt ?? ""}|${art ?? ""}`;

function cargarFiguras(): Map<string, FiguraPublica[]> {
  if (figurasPorClave) return figurasPorClave;
  figurasPorClave = new Map();
  const lineas = figurasPaths.filter((p) => existsSync(p)).flatMap((p) => readFileSync(p, "utf8").split(/\r?\n/));
  for (const l of lineas) {
    if (!l.trim()) continue;
    const f = JSON.parse(l);
    if (f.vision?.tipo === "logo_sello") continue;
    const pub: FiguraPublica = {
      id: f.id, url: `/api/figura/${f.id}.png`, pagina: f.pagina, tipo: f.vision?.tipo ?? null,
      descripcion: f.vision?.descripcion ?? null, epigrafe: f.epigrafe ?? null,
    };
    figurasPorId.set(f.id, pub);
    const k = claveFig(SOURCE_DOC[f.documento] ?? f.documento, f.rt_code, f.articulo);
    figurasPorClave.get(k)?.push(pub) ?? figurasPorClave.set(k, [pub]);
  }
  return figurasPorClave;
}

/** Figuras de un fragmento: la propia si es una figura; si no, las de su artículo en sus páginas. */
function figurasDe(r: ChunkRecord): FiguraPublica[] {
  const x = r as RegistroV2;
  const mapa = cargarFiguras();
  if (x.figura_id) return figurasPorId.has(x.figura_id) ? [figurasPorId.get(x.figura_id)!] : [];
  // Filas de cuadros (CUR): la imagen es la página del cuadro donde está la fila.
  if (x.imagenes?.length) return x.imagenes.flatMap((id) => (figurasPorId.has(id) ? [figurasPorId.get(id)!] : []));
  if (!r.articulo || x.pagina === undefined) return [];
  const ini = x.pagina, fin = x.pagina_fin ?? x.pagina;
  return (mapa.get(claveFig(r.source_doc, r.rt_code, r.articulo)) ?? []).filter((f) => f.pagina >= ini && f.pagina <= fin)
    .sort((a, b) => Number(b.tipo === "cuadro") - Number(a.tipo === "cuadro")) // el cuadro original, primero
    .slice(0, 4);
}

/** Fuente citable de un fragmento, igual para /api/chat y /api/retrieve. */
function toSource(h: { record: ChunkRecord; score: number }, i: number) {
  return {
    figuras: figurasDe(h.record),
    es_figura: Boolean((h.record as RegistroV2).figura_id),
    n: i + 1,
    doc: h.record.source_doc,
    documento: h.record.documento,
    capitulo: h.record.capitulo_tema,
    titulo: h.record.titulo,
    ubicacion: h.record.ubicacion,
    rt: h.record.rt_code,
    articulo: h.record.articulo,
    version: h.record.version,
    archivo: h.record.archivo_origen,
    chunk: h.record.chunk_index,
    pagina: (h.record as RegistroV2).pagina ?? null, // solo índice v2 (desde PDF)
    pdf: h.record.pdf_respaldo,
    texto: h.record.text, // fragmento textual exacto de la normativa
    score: Number(h.score.toFixed(3)),
  };
}

// ---- Cuadros del CE y los RT verificados en la ingesta (pestaña Cuadros del panel).
// Tal como los dejó la ingesta; las revisiones a mano se aplican encima en cada pedido (el archivo es chico).
let cuadros: Cuadro[] | null = null;
function cuadrosOriginales(): Cuadro[] {
  if (!cuadros) {
    cargarFiguras();
    cuadros = cargarCuadros(join(config.storeDir, "v2", "tablas"), (id) => figurasPorId.has(id));
  }
  return cuadros;
}
function cuadrosDelIndice(): Cuadro[] {
  return aplicarRevisiones(cuadrosOriginales(), cargarRevisiones(config.revisionesPath));
}
// Lo que leyó cada fuente en los cuadros por revisar (ingest_v2/tablas_pdf.py lecturas).
let lecturas: Record<string, Partial<Record<NombreLectura, Lectura>>> | null = null;
function lecturasDe(id: string) {
  if (!lecturas) {
    const f = join(config.storeDir, "v2", "tablas", "lecturas.json");
    lecturas = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  }
  return lecturas![id];
}

/** Registro de consultas (append-only). Nunca rompe la respuesta si falla. */
function logConsulta(entry: Record<string, unknown>): void {
  try {
    if (!existsSync(config.estadoDir)) mkdirSync(config.estadoDir, { recursive: true });
    appendFileSync(consultasPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch (err) {
    console.error("No se pudo registrar la consulta:", err);
  }
}

/** Últimas N líneas de un .jsonl, de la más nueva a la más vieja. */
function ultimas(path: string, n: number): unknown[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(-n).reverse().flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

/** Estadísticas del índice por archivo: fragmentos y cobertura de metadatos. */
function indexStats() {
  const s = getStore();
  const RT = /RT-\d{6}-\d{6}-\d{2}/;
  const porArchivo = new Map<string, { archivo: string; documento: string; fragmentos: number; con_articulo: number; rt_por_respaldo: number; caracteres: number }>();
  for (const r of s.all()) {
    const a = porArchivo.get(r.archivo_origen) ?? { archivo: r.archivo_origen, documento: r.documento, fragmentos: 0, con_articulo: 0, rt_por_respaldo: 0, caracteres: 0 };
    a.fragmentos++;
    a.caracteres += r.text.length;
    if (r.articulo) a.con_articulo++;
    // v2 marca explícitamente las páginas sin código propio; v1 se infiere del texto.
    const v2 = r as RegistroV2;
    if (v2.rt_heredado !== undefined ? v2.rt_heredado : r.rt_code && !RT.test(r.text)) a.rt_por_respaldo++;
    porArchivo.set(r.archivo_origen, a);
  }
  return {
    fragmentos: s.size,
    indice: config.vectorIndex,
    modelo_embeddings: config.embeddingModel,
    modelo_respuesta: config.modelPrimary,
    top_k: config.topK,
    documentos: [...porArchivo.values()].sort((x, y) => x.archivo.localeCompare(y.archivo)),
  };
}

/** Nombre legible de un slug de OpenRouter para mostrar en la UI. */
function modelDisplayName(slug: string): string {
  const map: Record<string, string> = {
    "deepseek/deepseek-v3.2": "DeepSeek V3.2",
    "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
    "z-ai/glm-5.1": "GLM-5.1",
    "z-ai/glm-5.2": "GLM-5.2",
    "moonshotai/kimi-k2.6": "Kimi K2.6",
    "qwen/qwen3.7-plus": "Qwen 3.7 Plus",
  };
  if (map[slug]) return map[slug];
  // Fallback: "vendor/modelo-x" -> "Modelo X"
  const tail = slug.split("/").pop() ?? slug;
  return tail.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Persiste un feedback como una linea JSON (append-only). */
function saveFeedback(entry: Record<string, unknown>): void {
  if (!existsSync(config.estadoDir)) mkdirSync(config.estadoDir, { recursive: true });
  appendFileSync(feedbackPath, JSON.stringify(entry) + "\n", "utf8");
}

/** Resumen de feedback acumulado. */
function feedbackStats(): { up: number; down: number; total: number } {
  if (!existsSync(feedbackPath)) return { up: 0, down: 0, total: 0 };
  let up = 0,
    down = 0,
    total = 0;
  for (const line of readFileSync(feedbackPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    total++;
    try {
      const r = JSON.parse(line).rating;
      if (r === "up") up++;
      else if (r === "down") down++;
    } catch {
      /* linea corrupta: ignorar */
    }
  }
  return { up, down, total };
}

function send(res: import("node:http").ServerResponse, status: number, type: string, body: string | Buffer) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

async function readJson(req: import("node:http").IncomingMessage, max = 1_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > max) throw new Error("El pedido es demasiado grande.");
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/**
 * Auth por token. Si config.agentApiKey está seteado, exige el header
 * X-API-Key con ese valor (comparación timing-safe). Devuelve true si pasa;
 * si no, responde 401 y devuelve false.
 */
function requireApiKey(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): boolean {
  const expected = config.agentApiKey;
  if (!expected) return true; // sin auth (solo desarrollo local)
  const provided = (req.headers["x-api-key"] ?? "").toString();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const okToken = a.length === b.length && timingSafeEqual(a, b);
  if (!okToken) {
    send(res, 401, "application/json", JSON.stringify({ error: "no autorizado" }));
    return false;
  }
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = readFileSync(resolve(publicDir, "index.html"));
      return send(res, 200, "text/html; charset=utf-8", html);
    }

    if (req.method === "GET" && (url.pathname === "/panel" || url.pathname === "/panel/")) {
      const html = readFileSync(resolve(publicDir, "panel.html"));
      return send(res, 200, "text/html; charset=utf-8", html);
    }

    // Figuras: públicas (son láminas de la normativa) para que un <img> las pueda pedir sin clave.
    const mFig = url.pathname.match(/^\/api\/figura\/([^/]+)\.png$/);
    if (req.method === "GET" && mFig) {
      const id = mFig[1];
      const ruta = join(figurasDir, `${id}.png`);
      if (!FIGURA_ID.test(id) || !existsSync(ruta)) return send(res, 404, "application/json", JSON.stringify({ error: "figura inexistente" }));
      res.setHeader("Cache-Control", "public, max-age=86400"); // la imagen de un id no cambia entre cargas
      return send(res, 200, "image/png", readFileSync(ruta));
    }

    if (req.method === "POST" && url.pathname === "/api/retrieve") {
      if (!requireApiKey(req, res)) return;
      const body = await readJson(req);
      const question: string = (body.question ?? "").toString().trim();
      if (!question) return send(res, 400, "application/json", JSON.stringify({ error: "falta question" }));
      const topK = Math.min(Math.max(Number(body.top_k) || config.topK, 1), 50);
      const t0 = Date.now();
      const hits = await retrieve(question, topK);
      const latencyMs = Date.now() - t0;
      const sources = hits.map(toSource);
      logConsulta({ tipo: "retrieve", question, top_k: topK, latencyMs, fuentes: sources.map(({ texto, ...s }) => s) });
      return send(res, 200, "application/json", JSON.stringify({ sources, latencyMs }));
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      if (!requireApiKey(req, res)) return;
      return send(res, 200, "application/json", JSON.stringify({ ...indexStats(), feedback: feedbackStats(), ultimas_consultas: ultimas(consultasPath, 30) }));
    }

    if (req.method === "GET" && url.pathname === "/api/fragmentos") {
      if (!requireApiKey(req, res)) return;
      const archivo = url.searchParams.get("archivo") ?? "";
      const desde = Math.max(Number(url.searchParams.get("desde")) || 0, 0);
      const lista = getStore().all().filter((r) => r.archivo_origen === archivo);
      return send(res, 200, "application/json", JSON.stringify({ archivo, total: lista.length, fragmentos: lista.slice(desde, desde + 40).map((r) => ({ ...r, figuras: figurasDe(r) })) }));
    }

    if (req.method === "GET" && url.pathname === "/api/examen") {
      if (!requireApiKey(req, res)) return;
      const archivos = existsSync(evalDir) ? readdirSync(evalDir).filter((f) => f.endsWith(".json")).sort() : [];
      const corridas = archivos.map((f) => {
        const d = JSON.parse(readFileSync(join(evalDir, f), "utf8"));
        return { archivo: f, ...d };
      }).filter((c) => c.resumen && Array.isArray(c.filas)) // solo corridas del examen
        .sort((a, b) => String(a.resumen?.fecha).localeCompare(String(b.resumen?.fecha))); // la última corrida, al final
      return send(res, 200, "application/json", JSON.stringify({ corridas }));
    }

    if (req.method === "GET" && url.pathname === "/api/cuadros") {
      if (!requireApiKey(req, res)) return;
      return send(res, 200, "application/json", JSON.stringify(listarCuadros(cuadrosDelIndice(), url.searchParams)));
    }

    // Cola de revisión: lecturas de un cuadro, guardar una revisión (o deshacerla) y bajar el registro.
    if (req.method === "GET" && url.pathname === "/api/cuadros/lecturas") {
      if (!requireApiKey(req, res)) return;
      const id = url.searchParams.get("id") ?? "";
      const c = cuadrosDelIndice().find((x) => x.id === id);
      if (!c) return send(res, 404, "application/json", JSON.stringify({ error: "No existe ese cuadro." }));
      return send(res, 200, "application/json", JSON.stringify({ cuadro: c, lecturas: lecturasDe(id) ?? {} }));
    }

    if (req.method === "POST" && url.pathname === "/api/cuadros/revision") {
      if (!requireApiKey(req, res)) return;
      const body = await readJson(req);
      const original = cuadrosOriginales().find((x) => x.id === body.id);
      const r = armarRevision(body, original, original ? lecturasDe(original.id) : undefined);
      if (typeof r === "string") return send(res, 400, "application/json", JSON.stringify({ error: r }));
      mkdirSync(dirname(config.revisionesPath), { recursive: true });
      appendFileSync(config.revisionesPath, JSON.stringify(r) + "\n", "utf8");
      return send(res, 200, "application/json", JSON.stringify({ ok: true, cuadro: cuadrosDelIndice().find((x) => x.id === r.id) }));
    }

    if (req.method === "GET" && url.pathname === "/api/cuadros/revisiones") {
      if (!requireApiKey(req, res)) return;
      const txt = existsSync(config.revisionesPath) ? readFileSync(config.revisionesPath, "utf8") : "";
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": 'attachment; filename="revisiones.jsonl"' });
      return res.end(txt);
    }

    if (req.method === "GET" && url.pathname === "/health") {
      let count = 0;
      try {
        count = getStore().size;
      } catch {
        /* sin indice */
      }
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({
          ok: true,
          chunks: count,
          feedback: feedbackStats(),
          model: { slug: config.modelPrimary, name: modelDisplayName(config.modelPrimary) },
          jurisdiccion: { id: jurisdiccion.id, nombre: jurisdiccion.nombre, documentos: jurisdiccion.documentos, ejemplos: jurisdiccion.ejemplos },
        }),
      );
    }

    if (req.method === "POST" && url.pathname === "/api/feedback") {
      if (!requireApiKey(req, res)) return;
      const body = await readJson(req);
      const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
      if (!rating) return send(res, 400, "application/json", JSON.stringify({ error: "rating invalido" }));
      const stars = Number(body.stars) >= 1 && Number(body.stars) <= 5 ? Number(body.stars) : null;
      saveFeedback({
        ts: new Date().toISOString(),
        rating,
        stars,
        question: (body.question ?? "").toString().slice(0, 4000),
        answer: (body.answer ?? "").toString().slice(0, 20000),
        comment: (body.comment ?? "").toString().slice(0, 4000),
        sources: Array.isArray(body.sources)
          ? body.sources.map((s: any) => ({ archivo: s.archivo, rt: s.rt, articulo: s.articulo }))
          : [],
        model: config.modelPrimary,
      });
      return send(res, 200, "application/json", JSON.stringify({ ok: true, stats: feedbackStats() }));
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      if (!requireApiKey(req, res)) return;
      const body = await readJson(req);
      const question: string = (body.question ?? "").toString().trim();
      const history: ChatMessage[] = Array.isArray(body.history) ? body.history.slice(-12) : [];
      if (!question) return send(res, 400, "application/json", JSON.stringify({ error: "falta question" }));
      const startedAt = Date.now();

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const emit = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

      try {
        const { hits } = await askStream(
          question,
          (chunk) => emit({ type: "token", v: chunk }),
          history,
        );
        const sources = hits.map(toSource);
        const latencyMs = Date.now() - startedAt;
        emit({ type: "done", sources, model: config.modelPrimary, latencyMs });
        logConsulta({ tipo: "chat", question, model: config.modelPrimary, latencyMs, fuentes: sources.map(({ texto, ...s }) => s) });
      } catch (err) {
        emit({ type: "error", message: String(err) });
        logConsulta({ tipo: "chat", question, error: String(err) });
      }
      return res.end();
    }

    send(res, 404, "text/plain", "Not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, "application/json", JSON.stringify({ error: String(err) }));
    else res.end();
  }
});

server.listen(config.port, () => {
  // Verifica que el indice exista al arrancar para avisar temprano.
  let info = "";
  try {
    info = ` — indice con ${getStore().size} chunks`;
  } catch {
    info = " — ⚠️  sin indice todavia (corre: npm run ingest)";
  }
  console.log(`\nNorma (${jurisdiccion.id}) escuchando en http://localhost:${config.port}${info}\n`);
});
