/**
 * Nucleo del agente RAG de normativa.
 * Recupera contexto del vector store, arma el prompt con disciplina de
 * citacion / anti-alucinacion, y genera la respuesta (con o sin streaming).
 */
import { config } from "./config.js";
import { embedOne } from "./lib/embeddings.js";
import { generate, generateStream, type ChatMessage } from "./lib/generate.js";
import { VectorStore, type ChunkRecord, type RegistroV2 } from "./lib/vector-store.js";
import { jurisdiccion, type Jurisdiccion } from "./jurisdiccion.js";

/**
 * Prompt de sistema: el bloque de la jurisdicción (qué norma hay y cómo se cita) más el
 * formato y las reglas, que son los mismos para cualquier jurisdicción.
 */
export function promptSistema(j: Jurisdiccion = jurisdiccion): string {
  return `${j.corpus}

FORMATO DE RESPUESTA (OBLIGATORIO, respetalo siempre):
1. PRIMERO una RESPUESTA DIRECTA Y CORTA: 1 a 3 frases que contesten lo
   concreto, con la cita [n] correspondiente. Es el primer parrafo, SIN titulo.
   No repitas la pregunta ni hagas introducciones. Si es un si/no o un dato,
   decilo en la primera frase.
2. LUEGO un encabezado exactamente asi: "### Detalle" con la explicacion
   ampliada (usa vinetas si ayuda), citando [n] en cada afirmacion.
3. AL FINAL un encabezado exactamente asi: "### Fuentes" con la lista de
   fragmentos efectivamente usados.

COMO CITAR (MUY IMPORTANTE):
- Cita SIEMPRE por la UBICACION NORMATIVA, nunca por nombre de archivo.
${j.citas}
- El CONTEXTO te da, por cada fragmento [n], su documento, capitulo, titulo,
  codigo RT, articulo y ubicacion: usa esos datos para citar. NUNCA menciones
  los nombres de archivo (tipo "CE 1" o "02. 5"): son cortes internos sin valor
  normativo.

REGLAS INQUEBRANTABLES:
- Responde SIEMPRE en espanol rioplatense, preciso y claro. Se breve: la
  respuesta corta es lo mas importante; el detalle, solo lo necesario.
- Usa UNICAMENTE el CONTEXTO recuperado para afirmar contenido normativo. No
  respondas de memoria ni completes con conocimiento general.
- Si el CONTEXTO no alcanza para responder con certeza, decilo explicitamente
  en la respuesta corta ("La normativa recuperada no especifica esto...") en vez
  de inventar. NUNCA inventes numeros de articulo, codigos RT ni requisitos.
- Si hay reglamentos con el mismo tema y distinta version, prioriza el mas
  reciente y aclaralo.
- Los fragmentos de tipo FIGURA describen un dibujo de la norma. Usalos para
  orientar ("ver la figura del art. X [n]"), pero no tomes como dato normativo
  una medida que aparezca solo en la descripcion de la figura: el texto del
  articulo manda. La interfaz muestra la imagen junto a la cita.
- Las filas de cuadro vienen como «Cuadro · <columna>: <valor> · <columna>: <valor>».
  El valor es el de ESA columna: no lo atribuyas a otra.
- Un cuadro marcado «sin verificar» NO trae sus valores (dos lecturas del PDF no
  coincidieron). Si la respuesta depende de ese cuadro, decí que el dato está en
  el cuadro del artículo y que hay que verlo en la imagen; no lo completes ni lo
  deduzcas.`;
}

const SYSTEM_PROMPT = promptSistema();

let store: VectorStore | null = null;

/** Carga el vector store una sola vez (lazy). */
export function getStore(): VectorStore {
  if (!store) {
    store = new VectorStore(config.storeDir, config.vectorIndex);
    store.load();
  }
  return store;
}

const RT_IN_QUERY = /\bRT-\d{6}-\d{6}-\d{2}\b/i;

/** Recupera los fragmentos mas relevantes para la pregunta. */
export async function retrieve(
  question: string,
  topK = config.topK,
): Promise<{ record: ChunkRecord; score: number }[]> {
  const s = getStore();
  const qvec = await embedOne(question);

  // Si la pregunta nombra un RT puntual, acota la busqueda a ese reglamento.
  const rtMatch = question.match(RT_IN_QUERY);
  const filter = rtMatch
    ? (r: ChunkRecord) => (r.rt_code ?? "").toUpperCase() === rtMatch[0].toUpperCase()
    : undefined;

  let hits = s.search(qvec, topK, filter);
  // Si el filtro dejo todo afuera, reintenta sin filtro.
  if (hits.length === 0) hits = s.search(qvec, topK);

  // Búsqueda exacta por número de artículo: la búsqueda por significado no
  // distingue «2.1.2» de «1.1.2». Si la pregunta nombra un artículo, sus
  // fragmentos van primero (mismo cuerpo normativo o RT que pida la pregunta).
  // BUSQUEDA_ARTICULO=0 la apaga (para medir su aporte en el examen).
  const artMatch = process.env.BUSQUEDA_ARTICULO === "0" ? null : question.match(ART_IN_QUERY);
  // «3.5 metros» no es un artículo: sin la palabra «artículo» se exigen tres niveles (3.4.6).
  if (artMatch && (artMatch[0].match(/[a-z]/i) || artMatch[1].split(".").length >= 3)) {
    const num = artMatch[1];
    // Qué cuerpo pide la pregunta: el mismo número existe en el CE, en los RT y en el CUR.
    const cuerpo = /urban[ií]stico|\bCUR\b|cuadro de usos|\brubro\b/i.test(question)
      ? "CUR"
      : /c[oó]digo de edificaci[oó]n|\bCE\b/i.test(question) ? "CodigoEdificacion" : null;
    const pideRubro = /\brubro\b|cuadro de usos/i.test(question);
    const exactos = s
      .all()
      .filter((r) => {
        const x = r as RegistroV2;
        const coincide = r.articulo === num || (pideRubro && x.rubro === num);
        return coincide && !x.figura_id && (!filter || filter(r)) && (!cuerpo || r.source_doc === cuerpo);
      })
      .slice(0, Math.max(1, Math.floor(topK / 2)));
    if (exactos.length) {
      const ya = new Set(exactos);
      const resto = hits.filter((h) => !ya.has(h.record));
      hits = [...exactos.map((record) => ({ record, score: 1 })), ...resto].slice(0, topK);
    }
  }
  return hits;
}

/** «artículo 2.1.2», «art. 3.4.6.1», «el 2.1.2». Exige al menos dos niveles. */
const ART_IN_QUERY = /\b(?:art[íi]culo|art\.?|secci[oó]n|punto|rubro)?\s*(\d{1,2}(?:\.\d{1,2}){1,6})\b(?![.,]\d)/i;

/** Arma el bloque de contexto citable a partir de los fragmentos recuperados. */
function buildContext(hits: { record: ChunkRecord; score: number }[]): string {
  return hits
    .map((h, i) => {
      const r = h.record;
      const ref = [
        `documento: ${r.documento}`,
        (r as RegistroV2).figura_id
          ? "tipo: FIGURA (descripción de una lámina hecha por un modelo de visión; la interfaz muestra la imagen)"
          : null,
        r.capitulo_tema ? `capítulo: ${r.capitulo_tema}` : null,
        r.titulo ? `título: ${r.titulo}` : null,
        r.rt_code ? `RT: ${r.rt_code}` : null,
        r.articulo ? `art./secc.: ${r.articulo}` : null,
        r.version ? `versión: ${r.version}` : null,
        r.ubicacion ? `ubicación: ${r.ubicacion}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return `[${i + 1}] ${ref}\n${r.text}`;
    })
    .join("\n\n---\n\n");
}

/** Mensajes para enviar al modelo, dado el historial y la pregunta nueva. */
export async function buildMessages(
  question: string,
  history: ChatMessage[] = [],
): Promise<{ messages: ChatMessage[]; hits: { record: ChunkRecord; score: number }[] }> {
  const hits = await retrieve(question);
  const context = buildContext(hits);

  const userTurn = `CONTEXTO RECUPERADO (${jurisdiccion.contexto}):
${context}

------
PREGUNTA DEL USUARIO:
${question}

Responde citando los fragmentos [n] del contexto. Si el contexto no alcanza, decilo.`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userTurn },
  ];
  return { messages, hits };
}

/** Respuesta completa (no streaming). */
export async function ask(
  question: string,
  history: ChatMessage[] = [],
): Promise<string> {
  const { messages } = await buildMessages(question, history);
  return generate(messages);
}

/** Respuesta en streaming. Devuelve el texto completo al terminar. */
export async function askStream(
  question: string,
  onToken: (chunk: string) => void,
  history: ChatMessage[] = [],
): Promise<{ text: string; hits: { record: ChunkRecord; score: number }[] }> {
  const { messages, hits } = await buildMessages(question, history);
  const text = await generateStream(messages, onToken);
  return { text, hits };
}
