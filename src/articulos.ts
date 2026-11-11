/**
 * Un artículo entero, tal como está en el índice: todas sus partes en orden, sin pasar por la búsqueda.
 * Lo usa GET /api/articulo, pensado como herramienta para otro agente: cuando ya sabe qué artículo
 * quiere, lo pide por número y recibe el texto completo, no los fragmentos que caben en un top-k.
 */
import type { ChunkRecord, RegistroV2 } from "./lib/vector-store.js";

/** Cuerpos normativos que se pueden pedir por número, con su valor de source_doc en el índice. */
export const CUERPOS: Record<string, ChunkRecord["source_doc"]> = { CE: "CodigoEdificacion", RT: "RT", CUR: "CUR" };

const NUMERO = /^\d{1,2}(?:\.\d{1,3}){0,12}$/; // el CE llega a diez niveles (3.7.4.5.1.2.1.4.1)

/** Une partes consecutivas que se solapan: el principio de una suele repetir el final de la anterior. */
export function unirPartes(textos: string[]): string {
  let t = "";
  for (const s of textos) {
    if (!t) { t = s; continue; }
    let n = Math.min(t.length, s.length, 800);
    for (; n > 15; n--) if (t.endsWith(s.slice(0, n))) break;
    t = n > 15 ? t + s.slice(n) : t + " " + s;
  }
  return t;
}

export type Pedido = { doc: string; n: string; rt?: string | null };
export type Fallo = { status: number; error: string; [k: string]: unknown };

interface Figura { id: string; url: string; pagina: number }

/** Una línea del índice de un reglamento («5.1 Aviso de Obra 6 5.1.1 Documentación 6», «3.- Medios ......»):
 *  texto corto con puntos guía o con números de página entre títulos. No es el artículo. */
const TITULO_Y_PAGINA = /[a-záéíóúñ.)]\s\d{1,3}\s+\d{1,2}(?:\.\d{1,2})*\.?-?\s/gi;
function esIndice(t: ChunkRecord[]): boolean {
  // Los pies de página («página 3 de 678») no cuentan: el cuerpo también los tiene.
  const s = t.map((r) => r.text).join(" ").replace(/p[aá]gina\s+\d+\s+de\s+\d+/gi, " ").replace(/\s+/g, " ").trim();
  if (s.length >= 600) return false;
  return /\.{5,}/.test(s) || /^\S.{0,120}?\s\d{1,3}$/.test(s) || (s.match(TITULO_Y_PAGINA)?.length ?? 0) >= 2;
}

/** Las partes de un artículo dentro de un archivo, en tramos de fragmentos consecutivos. Un mismo número puede
 *  estar en varios tramos: incisos sueltos, anexos que reinician la numeración o el índice del reglamento.
 *  Se devuelven todos en orden, salvo las líneas del índice. */
function tramos(partes: ChunkRecord[]): { tramos: ChunkRecord[][]; indice: number } {
  const orden = [...partes].sort((a, b) => a.chunk_index - b.chunk_index);
  const ts: ChunkRecord[][] = [];
  for (const r of orden) {
    const ult = ts.at(-1);
    if (ult && r.chunk_index === ult.at(-1)!.chunk_index + 1) ult.push(r);
    else ts.push([r]);
  }
  const cuerpo = ts.filter((t) => !esIndice(t));
  // Si todo parece índice, mejor devolverlo que nada.
  return cuerpo.length ? { tramos: cuerpo, indice: ts.length - cuerpo.length } : { tramos: ts, indice: 0 };
}

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Busca un artículo por cuerpo y número. Si el número no está etiquetado en el índice (un inciso como el
 * 6.4.2.1 del CUR vive dentro del 6.4.2), devuelve el artículo etiquetado más cercano hacia arriba,
 * siempre que su texto mencione el número pedido; si no lo menciona, 404: mejor nada que otro artículo.
 */
export function buscarArticulo(
  registros: readonly ChunkRecord[],
  pedido: Pedido,
  figurasDe: (r: ChunkRecord) => Figura[],
): { ok: true; articulo: Record<string, unknown> } | { ok: false; fallo: Fallo } {
  const doc = (pedido.doc ?? "").toUpperCase();
  const n = (pedido.n ?? "").trim().replace(/\.$/, "");
  const fuente = CUERPOS[doc];
  if (!fuente) return { ok: false, fallo: { status: 400, error: `doc tiene que ser ${Object.keys(CUERPOS).join(", ")}` } };
  if (!NUMERO.test(n)) return { ok: false, fallo: { status: 400, error: "n tiene que ser un número de artículo, como 3.4.6.1" } };
  const rt = pedido.rt?.trim().toUpperCase() || null;

  const delCuerpo = registros.filter((r) => r.source_doc === fuente && r.articulo && (!rt || (r.rt_code ?? "").toUpperCase() === rt));
  const texto = delCuerpo.filter((r) => !(r as RegistroV2).figura_id);

  // Del número pedido hacia arriba, hasta el primero que esté etiquetado.
  const niveles = n.split(".");
  let elegido: string | null = null;
  for (let k = niveles.length; k >= 1 && !elegido; k--) {
    const cand = niveles.slice(0, k).join(".");
    if (texto.some((r) => r.articulo === cand)) elegido = cand;
  }
  if (!elegido) {
    return { ok: false, fallo: { status: 404, error: `No hay artículo ${n} en ${doc}${rt ? ` ${rt}` : ""}.` } };
  }

  const coincidentes = texto.filter((r) => r.articulo === elegido);
  // En los RT el número se repite en cada reglamento: sin rt no se sabe cuál se pide.
  if (fuente === "RT") {
    const rts = [...new Set(coincidentes.map((r) => r.rt_code ?? "(sin código)"))];
    if (rts.length > 1) {
      return { ok: false, fallo: { status: 409, error: `El artículo ${elegido} existe en ${rts.length} reglamentos técnicos. Indicá cuál con rt=.`, candidatos: rts.sort() } };
    }
  }
  // Por archivo (chunk_index se reinicia en cada uno), en el orden en que aparecen en el índice.
  const porArchivo = new Map<string, ChunkRecord[]>();
  for (const r of coincidentes) porArchivo.get(r.archivo_origen)?.push(r) ?? porArchivo.set(r.archivo_origen, [r]);
  let lineasIndice = 0;
  const bloques: ChunkRecord[][] = [];
  for (const ps of porArchivo.values()) {
    const t = tramos(ps);
    bloques.push(...t.tramos);
    lineasIndice += t.indice;
  }
  const tramo = bloques.flat();
  const unido = bloques.map((b) => unirPartes(b.map((r) => r.text))).join("\n\n");
  let nota: string | null = null;
  if (elegido !== n) {
    const menciona = new RegExp(`(^|[^\\d.])${escaparRe(n)}(?![\\d]|\\.\\d)`).test(unido);
    if (!menciona) {
      return { ok: false, fallo: { status: 404, error: `${n} no está en el índice, y el artículo etiquetado más cercano (${elegido}) no lo menciona.`, mas_cercano: elegido } };
    }
    nota = `${n} es un inciso dentro de ${elegido}: se devuelve ${elegido} entero.`;
  }

  const primero = tramo[0] as RegistroV2;
  const paginasFin = tramo.map((r) => (r as RegistroV2).pagina_fin ?? (r as RegistroV2).pagina).filter((p): p is number => p != null);
  // Figuras: las de cada parte (por página) más las láminas descritas que el índice asocia al artículo.
  const figuras = new Map<string, Figura>();
  const partes = bloques.flatMap((b, i) => b.map((r) => {
    const x = r as RegistroV2 & { derogado?: boolean | null; parte?: number };
    const fs = figurasDe(r);
    for (const f of fs) figuras.set(f.id, f);
    return {
      tramo: i + 1, chunk: r.chunk_index, parte: x.parte ?? null, pagina: x.pagina ?? null, pagina_fin: x.pagina_fin ?? null,
      pdf: r.pdf_respaldo, derogado: x.derogado ?? null, figuras: fs.map((f) => f.id), texto: r.text,
    };
  }));
  for (const r of delCuerpo) {
    if ((r as RegistroV2).figura_id && r.articulo === elegido && r.rt_code === primero.rt_code) {
      for (const f of figurasDe(r)) figuras.set(f.id, f);
    }
  }
  const derogados = partes.map((p) => p.derogado);
  return {
    ok: true,
    articulo: {
      doc, pedido: n, articulo: elegido, exacto: elegido === n, nota,
      documento: primero.documento, rt: primero.rt_code, titulo: primero.titulo, ubicacion: primero.ubicacion,
      pdf: primero.pdf_respaldo, pagina: primero.pagina ?? null, pagina_fin: paginasFin.length ? Math.max(...paginasFin) : null,
      // null: el índice no sabe (el CUR no lo marca); true/false: lo dice la ingesta para todas las partes.
      derogado: derogados.every((d) => d === true) ? true : derogados.some((d) => d === true) ? "en parte" : derogados.every((d) => d === false) ? false : null,
      partes,
      texto: unido,
      figuras: [...figuras.values()],
      tramos: bloques.length,
      ...(bloques.length > 1 ? { nota_tramos: `El número ${elegido} aparece en ${bloques.length} tramos separados (incisos sueltos o anexos que reinician la numeración): se devuelven todos, en orden; el texto los separa con una línea en blanco.` } : {}),
      ...(lineasIndice ? { lineas_de_indice_omitidas: lineasIndice } : {}),
    },
  };
}
