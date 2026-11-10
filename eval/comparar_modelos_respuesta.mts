/**
 * Compara modelos de generación con las MISMAS preguntas y los MISMOS fragmentos recuperados.
 *
 * Uso:
 *   npx tsx eval/comparar_modelos_respuesta.mts generar <examen.json> <n_preguntas|todas> <modelo,modelo,...> <tope_usd>
 *   npx tsx eval/comparar_modelos_respuesta.mts juzgar  <modelo_juez> <tope_usd>
 *   npx tsx eval/comparar_modelos_respuesta.mts informe
 *
 * Todo se guarda en eval/comparaciones/respuestas/ (retoma: lo hecho no se vuelve a pagar).
 *
 * Controles automáticos (gratis):
 *   - error: el modelo no respondió (HTTP, vacío, tiempo);
 *   - formato: respuesta corta + «### Detalle» + «### Fuentes»;
 *   - citas inválidas: [n] fuera del rango de fragmentos;
 *   - referencias inventadas: números de artículo, rubro o código RT que no están en el contexto.
 * Juez (pago, opcional): ¿cada afirmación normativa está respaldada por el contexto? ¿hay errores graves?
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "../src/config.js";
import { buildMessages } from "../src/rag.js";
import { jurisdiccion } from "../src/jurisdiccion.js";

const DIR = resolve("eval/comparaciones/respuestas");
mkdirSync(DIR, { recursive: true });
const CTX = join(DIR, "contextos.json");
const RESP = join(DIR, "respuestas.json");
const JUICIO = join(DIR, "juicios.json");
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

type Msg = { role: "system" | "user" | "assistant"; content: string };
type Ctx = { id: string; pregunta: string; messages: Msg[]; n: number };
type Resp = { texto: string; costo: number; ms: number; error?: string; tokens_salida?: number };

const leer = <T,>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
const guardar = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 1));

async function llamar(model: string, messages: Msg[], extra: Record<string, unknown> = {}): Promise<Resp> {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 180_000);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openrouterApiKey}`, "X-Title": "Norma eval" },
      body: JSON.stringify({ model, messages, temperature: 0.2, usage: { include: true }, ...extra }),
    });
    clearTimeout(to);
    const j = (await res.json().catch(() => ({}))) as any;
    const costo = Number(j?.usage?.cost ?? 0);
    if (!res.ok) return { texto: "", costo, ms: Date.now() - t0, error: `HTTP ${res.status} ${JSON.stringify(j?.error ?? "").slice(0, 160)}` };
    const texto = String(j?.choices?.[0]?.message?.content ?? "");
    return { texto, costo, ms: Date.now() - t0, tokens_salida: j?.usage?.completion_tokens, ...(texto.trim() ? {} : { error: "respuesta vacía" }) };
  } catch (e) {
    return { texto: "", costo: 0, ms: Date.now() - t0, error: String((e as Error).message).slice(0, 160) };
  }
}

async function enParalelo<T>(tareas: (() => Promise<T>)[], n = 6): Promise<T[]> {
  const out: T[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tareas.length) { const k = i++; out[k] = await tareas[k](); } }));
  return out;
}

// ---------- controles automáticos
const REF = /\bRT-\d{6}-\d{6}-\d{2}\b|\b\d{1,2}(?:\.\d{1,2}){1,6}\b(?![.,]?\d)/g;
function controles(c: Ctx, r: Resp) {
  // Normaliza lo que no cambia el dato: «0,80» = «0.80» y «RT-…- 01» (espacio del PDF) = «RT-…-01».
  const norm = (t: string) => t.replace(/(\d),(\d)/g, "$1.$2").replace(/-\s+(\d)/g, "-$1");
  const ctx = norm(c.messages.map((m) => m.content).join("\n"));
  const refs = [...new Set((norm(r.texto).match(REF) ?? []))];
  const inventadas = refs.filter((x) => !ctx.includes(x));
  const citas = [...r.texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return {
    error: Boolean(r.error),
    formato: /###\s*Detalle/i.test(r.texto) && /###\s*Fuentes/i.test(r.texto),
    citas_invalidas: citas.filter((n) => n < 1 || n > c.n).length,
    sin_citas: citas.length === 0,
    inventadas,
  };
}

// ---------- juez
const TAREA_JUEZ = `Sos un auditor de respuestas sobre normativa de edificación${jurisdiccion.ingesta.de_lugar}.
Te doy: la PREGUNTA, el CONTEXTO (fragmentos numerados [n] de la norma) y la RESPUESTA de un asistente que solo puede usar ese contexto.
Revisá la respuesta afirmación por afirmación contra el contexto. No uses tu conocimiento propio de la norma: lo único válido es el contexto.
Devolvé SOLO un JSON:
{"respaldo": 0-1 (fracción de afirmaciones normativas respaldadas por el contexto),
 "sin_respaldo": ["afirmación que no está en el contexto o lo contradice", ...],
 "error_grave": true|false (un número, medida, condición, artículo o permiso afirmado que no está en el contexto o lo contradice; o decir que algo está permitido/prohibido sin respaldo),
 "cita_mal": true|false (atribuye un dato a un [n] que no lo contiene),
 "responde": "si"|"parcial"|"no",
 "reconoce_limites": true|false|null (si el contexto no alcanza: ¿lo dice? null si el contexto alcanza)}`;

function juezMsgs(c: Ctx, r: Resp): Msg[] {
  const contexto = c.messages[c.messages.length - 1].content;
  return [
    { role: "system", content: TAREA_JUEZ },
    { role: "user", content: `PREGUNTA:\n${c.pregunta}\n\nCONTEXTO Y PEDIDO ORIGINAL:\n${contexto}\n\nRESPUESTA A AUDITAR:\n${r.texto}` },
  ];
}

const parsear = (t: string) => { try { return JSON.parse(t.replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return null; } };

// ---------- comandos
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "generar") {
  const [examen, nStr, modelosStr, topeStr] = args;
  const tope = Number(topeStr ?? 0);
  const preguntas = (JSON.parse(readFileSync(examen, "utf8")).preguntas as { id: string; pregunta: string }[]);
  const elegidas = nStr === "todas" ? preguntas : preguntas.slice(0, Number(nStr));
  const ctxs = leer<Record<string, Ctx>>(CTX, {});
  for (const p of elegidas) {
    if (ctxs[p.id]) continue;
    const { messages, hits } = await buildMessages(p.pregunta, []);
    ctxs[p.id] = { id: p.id, pregunta: p.pregunta, messages: messages as Msg[], n: hits.length };
  }
  guardar(CTX, ctxs);
  const resp = leer<Record<string, Record<string, Resp>>>(RESP, {});
  let gasto = 0;
  const pend: (() => Promise<void>)[] = [];
  for (const m of modelosStr.split(",")) {
    resp[m] ??= {};
    for (const p of elegidas) {
      const prev = resp[m][p.id];
      if (prev && !prev.error) continue;
      pend.push(async () => {
        if (gasto > tope) return;
        const r = await llamar(m, ctxs[p.id].messages);
        gasto += r.costo;
        resp[m][p.id] = r;
        guardar(RESP, resp);
      });
    }
  }
  console.log(`${pend.length} respuestas por generar · tope USD ${tope}`);
  await enParalelo(pend, 8);
  console.log(`gasto USD ${gasto.toFixed(3)}${gasto > tope ? " (tope alcanzado)" : ""}`);
} else if (cmd === "juzgar") {
  const [juez, topeStr] = args;
  const tope = Number(topeStr ?? 0);
  const ctxs = leer<Record<string, Ctx>>(CTX, {});
  const resp = leer<Record<string, Record<string, Resp>>>(RESP, {});
  const juicios = leer<Record<string, Record<string, any>>>(JUICIO, {});
  let gasto = 0;
  const pend: (() => Promise<void>)[] = [];
  for (const [m, porP] of Object.entries(resp)) {
    juicios[m] ??= {};
    for (const [id, r] of Object.entries(porP)) {
      if (r.error || juicios[m][id]?.juez === juez) continue;
      pend.push(async () => {
        if (gasto > tope) return;
        const j = await llamar(juez, juezMsgs(ctxs[id], r), { temperature: 0, response_format: { type: "json_object" } });
        gasto += j.costo;
        const v = parsear(j.texto);
        if (v) { juicios[m][id] = { ...v, juez }; guardar(JUICIO, juicios); }
      });
    }
  }
  console.log(`${pend.length} juicios por hacer con ${juez} · tope USD ${tope}`);
  await enParalelo(pend, 8);
  console.log(`gasto USD ${gasto.toFixed(3)}${gasto > tope ? " (tope alcanzado)" : ""}`);
} else if (cmd === "informe") {
  const ctxs = leer<Record<string, Ctx>>(CTX, {});
  const resp = leer<Record<string, Record<string, Resp>>>(RESP, {});
  const juicios = leer<Record<string, Record<string, any>>>(JUICIO, {});
  const filas = Object.entries(resp).map(([m, porP]) => {
    const rs = Object.entries(porP);
    const ctl = rs.map(([id, r]) => controles(ctxs[id], r));
    const js = rs.map(([id]) => juicios[m]?.[id]).filter(Boolean);
    const ok = rs.filter(([, r]) => !r.error);
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    return {
      modelo: m,
      n: rs.length,
      errores: ctl.filter((c) => c.error).length,
      formato_ok: ctl.filter((c) => !c.error && c.formato).length,
      con_ref_inventada: ctl.filter((c) => c.inventadas.length).length,
      citas_invalidas: ctl.reduce((a, c) => a + c.citas_invalidas, 0),
      juzgadas: js.length,
      errores_graves: js.filter((j) => j.error_grave).length,
      respaldo_medio: js.length ? +(js.reduce((a, j) => a + Number(j.respaldo ?? 0), 0) / js.length).toFixed(3) : null,
      responde_si: js.filter((j) => j.responde === "si").length,
      usd_por_respuesta: ok.length ? +(ok.reduce((a, [, r]) => a + r.costo, 0) / ok.length).toFixed(5) : null,
      seg_mediana: +(med(ok.map(([, r]) => r.ms)) / 1000).toFixed(1),
      inventadas_ej: ctl.flatMap((c) => c.inventadas).slice(0, 5),
    };
  });
  guardar(join(DIR, "informe.json"), filas);
  console.table(filas.map(({ inventadas_ej, ...f }) => f));
  for (const f of filas) if (f.inventadas_ej.length) console.log(f.modelo, "referencias que no están en el contexto:", f.inventadas_ej.join(", "));
} else {
  console.log("comandos: generar | juzgar | informe");
}
