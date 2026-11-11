/**
 * Un artículo entero, tal como está en el índice: todas sus partes en orden, sin pasar por la búsqueda.
 * Lo usa GET /api/articulo, pensado como herramienta para otro agente: cuando ya sabe qué artículo
 * quiere, lo pide por número y recibe el texto completo, no los fragmentos que caben en un top-k.
 */
import type { ChunkRecord, RegistroV2 } from "./lib/vector-store.js";

/** Cuerpos normativos que se pueden pedir por número, con su valor de source_doc en el índice. */
export const CUERPOS: Record<string, ChunkRecord["source_doc"]> = { CE: "CodigoEdificacion", RT: "RT", CUR: "CUR" };

const NUMERO = /^\d{1,2}(?:\.\d{1,3}){0,6}$/;

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

/** Las partes de un artículo dentro de un archivo, en orden. Si el número aparece en tramos separados
 *  (el índice de un RT lista sus artículos antes del cuerpo), se queda con el tramo de más texto. */
function tramoPrincipal(partes: ChunkRecord[]): { tramo: ChunkRecord[]; otros: number } {
  const orden = [...partes].sort((a, b) => a.chunk_index - b.chunk_index);
  const tramos: ChunkRecord[][] = [];
  for (const r of orden) {
    const ult = tramos.at(-1);
    if (ult && r.chunk_index === ult.at(-1)!.chunk_index + 1) ult.push(r);
    else tramos.push([r]);
  }
  const largo = (t: ChunkRecord[]) => t.reduce((s, r) => s + r.text.length, 0);
  const tramo = tramos.reduce((a, b) => (largo(b) > largo(a) ? b : a));
  return { tramo, otros: tramos.length - 1 };
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
  // Un mismo número podría estar en dos archivos del mismo cuerpo: se toma el de más texto.
  const porArchivo = new Map<string, ChunkRecord[]>();
  for (const r of coincidentes) porArchivo.get(r.archivo_origen)?.push(r) ?? porArchivo.set(r.archivo_origen, [r]);
  const { tramo, otros } = [...porArchivo.values()].map(tramoPrincipal)
    .reduce((a, b) => (b.tramo.reduce((s, r) => s + r.text.length, 0) > a.tramo.reduce((s, r) => s + r.text.length, 0) ? b : a));

  const unido = unirPartes(tramo.map((r) => r.text));
  let nota: string | null = null;
  if (elegido !== n) {
    const menciona = new RegExp(`(^|[^\\d.])${escaparRe(n)}(?![\\d]|\\.\\d)`).test(unido);
    if (!menciona) {
      return { ok: false, fallo: { status: 404, error: `${n} no está en el índice, y el artículo etiquetado más cercano (${elegido}) no lo menciona.`, mas_cercano: elegido } };
    }
    nota = `${n} es un inciso dentro de ${elegido}: se devuelve ${elegido} entero.`;
  }

  const primero = tramo[0] as RegistroV2;
  const ultimo = tramo.at(-1)! as RegistroV2;
  // Figuras: las de cada parte (por página) más las láminas descritas que el índice asocia al artículo.
  const figuras = new Map<string, Figura>();
  const partes = tramo.map((r) => {
    const x = r as RegistroV2 & { derogado?: boolean | null; parte?: number };
    const fs = figurasDe(r);
    for (const f of fs) figuras.set(f.id, f);
    return {
      chunk: r.chunk_index, parte: x.parte ?? null, pagina: x.pagina ?? null, pagina_fin: x.pagina_fin ?? null,
      pdf: r.pdf_respaldo, derogado: x.derogado ?? null, figuras: fs.map((f) => f.id), texto: r.text,
    };
  });
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
      pdf: primero.pdf_respaldo, pagina: primero.pagina ?? null, pagina_fin: ultimo.pagina_fin ?? ultimo.pagina ?? null,
      // null: el índice no sabe (el CUR no lo marca); true/false: lo dice la ingesta para todas las partes.
      derogado: derogados.every((d) => d === true) ? true : derogados.some((d) => d === true) ? "en parte" : derogados.every((d) => d === false) ? false : null,
      partes,
      texto: unido,
      figuras: [...figuras.values()],
      ...(otros ? { otras_menciones: otros, nota_menciones: "El número aparece también en otros tramos del archivo (por ejemplo, el índice del reglamento); se devuelve el tramo con el texto del artículo." } : {}),
    },
  };
}
