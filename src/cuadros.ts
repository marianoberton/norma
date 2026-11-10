/**
 * Cuadros del Código de Edificación y de los Reglamentos Técnicos, tal como los dejó la verificación
 * de la ingesta (ingest_v2/tablas_pdf.py decidir): estado, lectura usada, filas confirmadas y lo que quedó afuera.
 * Lo usa la pestaña Cuadros del panel, que también deja revisar a mano los cuadros que no quedaron
 * verificados enteros. Una revisión es una tercera categoría: nunca cuenta como «confirmada por dos lecturas».
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ModoCuadro = "verificado" | "recuadro" | "parcial" | "solo_imagen" | "revisado";
export const POR_REVISAR: ModoCuadro[] = ["parcial", "solo_imagen"];
export type NombreLectura = "grilla" | "vision" | "arbitro";
export interface Lectura { encabezados: string[]; filas: string[][] }

/** Una línea de revisiones.jsonl. El archivo solo crece: deshacer es otra línea. */
export interface Revision {
  id: string;
  huella: string;
  ts: string;
  accion: "confirmar" | "deshacer";
  base?: NombreLectura | "vacia";
  encabezados?: string[];
  filas?: string[][];
  editadas?: number; // celdas que cambió la persona respecto de la lectura base
  revisor?: string;
  nota?: string;
}

export interface Cuadro {
  id: string;
  doc: "CE" | "RT";
  pagina: number;
  articulo: string | null;
  ubicacion: string | null;
  titulo: string | null;
  modo: ModoCuadro;
  lectura: string | null; // grilla | vision | arbitro | humano: la lectura cuyas filas se indexaron
  encabezados: string[];
  filas: string[][]; // solo las confirmadas por dos lecturas
  sin_verificar: number;
  rotulos_sin_verificar: string[];
  encabezados_grilla: string[];
  imagen: string; // recorte del cuadro original
  huella: string; // ver huellaCuadro
  revision: { ts: string; base: string; editadas: number; revisor: string | null; nota: string | null } | null;
  revision_vieja: boolean; // hay una revisión, pero el cuadro cambió desde entonces y no se aplica
}

/**
 * Identifica el cuadro revisado. El id es posicional (página y orden): si se vuelve a correr la geometría y el
 * cuadro cambia, una revisión vieja no tiene que caer sobre otro. Misma cuenta que huella() en ingest_v2/tablas_pdf.py.
 */
export function huellaCuadro(id: string, bbox: number[], encabezadosGrilla: string[]): string {
  const caja = (bbox ?? []).map((x) => String(Math.floor(x))).join(",");
  return createHash("sha1").update(`${id}|${caja}|${(encabezadosGrilla ?? []).join("\u00a6")}`, "utf8").digest("hex").slice(0, 12);
}

/** La última revisión de cada cuadro. */
export function cargarRevisiones(ruta: string): Map<string, Revision> {
  const ultima = new Map<string, Revision>();
  if (!existsSync(ruta)) return ultima;
  for (const l of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    const r = JSON.parse(l) as Revision;
    ultima.set(r.id, r);
  }
  return ultima;
}

/** Aplica la última revisión confirmada de cada cuadro, si sigue siendo el mismo cuadro. */
export function aplicarRevisiones(cuadros: Cuadro[], revs: Map<string, Revision>): Cuadro[] {
  return cuadros.map((c) => {
    const r = revs.get(c.id);
    if (!r || r.accion !== "confirmar") return c;
    if (r.huella !== c.huella) return { ...c, revision_vieja: true };
    return {
      ...c, modo: "revisado", lectura: "humano", encabezados: r.encabezados ?? [], filas: r.filas ?? [],
      sin_verificar: 0, rotulos_sin_verificar: [],
      revision: { ts: r.ts, base: r.base ?? "vacia", editadas: r.editadas ?? 0, revisor: r.revisor ?? null, nota: r.nota ?? null },
    };
  });
}

const LIMITE = { filas: 400, columnas: 30, celda: 500, texto: 200 };
const limpio = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Valida lo que manda el panel y arma la línea a guardar. Devuelve un mensaje si no sirve.
 * `original` es el cuadro tal como salió de la ingesta (sin revisiones), `lecturas` lo que leyó cada fuente.
 */
export function armarRevision(
  body: Record<string, unknown>, original: Cuadro | undefined, lecturas: Partial<Record<NombreLectura, Lectura>> | undefined, ahora = new Date(),
): Revision | string {
  if (!original) return "No existe ese cuadro.";
  if (body.huella !== original.huella) return "El cuadro cambió desde que se abrió. Recargá la pestaña y revisalo de nuevo.";
  const comun = { id: original.id, huella: original.huella, ts: ahora.toISOString(),
    revisor: limpio(body.revisor, LIMITE.texto) || undefined, nota: limpio(body.nota, LIMITE.texto) || undefined };
  if (body.accion === "deshacer") return { ...comun, accion: "deshacer" };
  if (body.accion !== "confirmar") return "Acción desconocida.";
  if (!POR_REVISAR.includes(original.modo)) return "Ese cuadro ya está verificado por dos lecturas; no se revisa a mano.";
  const enc = Array.isArray(body.encabezados) ? body.encabezados.map((h) => limpio(h, LIMITE.celda)) : [];
  const filas = Array.isArray(body.filas) ? body.filas : [];
  if (!enc.length || enc.length > LIMITE.columnas) return `El cuadro tiene que tener entre 1 y ${LIMITE.columnas} columnas.`;
  if (!filas.length || filas.length > LIMITE.filas) return `El cuadro tiene que tener entre 1 y ${LIMITE.filas} filas.`;
  const limpias: string[][] = [];
  for (const [i, f] of filas.entries()) {
    if (!Array.isArray(f) || f.length !== enc.length) return `La fila ${i + 1} no tiene ${enc.length} celdas, como el encabezado.`;
    const fila = f.map((v) => limpio(v, LIMITE.celda));
    if (fila.some(Boolean)) limpias.push(fila);
  }
  if (!limpias.length) return "Todas las filas están vacías.";
  const base = (["grilla", "vision", "arbitro"] as const).find((b) => b === body.base) ?? "vacia";
  const ref = base === "vacia" ? undefined : lecturas?.[base];
  // Celdas cambiadas respecto de la lectura base: queda como rastro de cuánto puso la persona.
  let editadas = 0;
  enc.forEach((h, j) => { if (h !== limpio(ref?.encabezados?.[j], LIMITE.celda)) editadas++; });
  limpias.forEach((f, i) => f.forEach((v, j) => { if (v !== limpio(ref?.filas?.[i]?.[j], LIMITE.celda)) editadas++; }));
  return { ...comun, accion: "confirmar", base, encabezados: enc, filas: limpias, editadas };
}

/** Lee cuadros.json y figuras.jsonl de `dir` (data/v2/tablas). Sin datos, devuelve una lista vacía. */
export function cargarCuadros(dir: string, hayImagen: (id: string) => boolean): Cuadro[] {
  const ruta = join(dir, "cuadros.json");
  if (!existsSync(ruta)) return [];
  const ubic = new Map<string, { articulo: string | null; ubicacion: string | null }>();
  const figs = join(dir, "figuras.jsonl");
  if (existsSync(figs)) {
    for (const l of readFileSync(figs, "utf8").split(/\r?\n/)) {
      if (!l.trim()) continue;
      const f = JSON.parse(l);
      ubic.set(f.id, { articulo: f.articulo ?? null, ubicacion: f.ubicacion ?? null });
    }
  }
  const out: Cuadro[] = [];
  const paginas = JSON.parse(readFileSync(ruta, "utf8")) as { pagina: number; cuadros: Record<string, unknown>[] }[];
  for (const pag of paginas) {
    for (const c of pag.cuadros) {
      const id = String(c.id);
      out.push({
        id,
        doc: id.startsWith("RT") ? "RT" : "CE",
        pagina: pag.pagina,
        articulo: ubic.get(id)?.articulo ?? null,
        ubicacion: ubic.get(id)?.ubicacion ?? null,
        titulo: (c.titulo as string | null) ?? null,
        modo: c.modo as ModoCuadro,
        lectura: (c.lectura as string | null) ?? null,
        encabezados: (c.encabezados as string[]) ?? [],
        filas: (c.filas as string[][]) ?? [],
        sin_verificar: Number(c.sin_verificar) || 0,
        rotulos_sin_verificar: (c.rotulos_sin_verificar as string[]) ?? [],
        encabezados_grilla: (c.encabezados_grilla as string[]) ?? [],
        imagen: hayImagen(id) ? `/api/figura/${id}.png` : "",
        huella: huellaCuadro(id, (c.bbox as number[]) ?? [], (c.encabezados_grilla as string[]) ?? []),
        revision: null,
        revision_vieja: false,
      });
    }
  }
  return out;
}

/** Resumen de la verificación (siempre sobre todos) y una página de 30 cuadros filtrada. */
export function listarCuadros(todos: Cuadro[], q: URLSearchParams) {
  const resumen = {
    total: todos.length,
    por_modo: { verificado: 0, recuadro: 0, parcial: 0, solo_imagen: 0, revisado: 0 } as Record<ModoCuadro, number>,
    por_lectura: {} as Record<string, number>,
    filas_confirmadas: 0, // por dos lecturas; las revisadas a mano van aparte
    filas_revisadas: 0,
    filas_sin_verificar: 0,
    por_revisar: 0,
    revisiones_viejas: 0,
  };
  for (const c of todos) {
    resumen.por_modo[c.modo]++;
    if (c.lectura) resumen.por_lectura[c.lectura] = (resumen.por_lectura[c.lectura] ?? 0) + 1;
    if (c.modo === "revisado") resumen.filas_revisadas += c.filas.length;
    else resumen.filas_confirmadas += c.filas.length;
    resumen.filas_sin_verificar += c.sin_verificar;
    if (POR_REVISAR.includes(c.modo)) resumen.por_revisar++;
    if (c.revision_vieja) resumen.revisiones_viejas++;
  }
  const modo = q.get("modo") ?? "";
  const enModo = (c: Cuadro) => !modo || c.modo === modo || (modo === "por_revisar" && POR_REVISAR.includes(c.modo));
  const doc = q.get("doc") ?? "";
  const texto = (q.get("q") ?? "").toLowerCase().trim();
  const desde = Math.max(Number(q.get("desde")) || 0, 0);
  const lista = todos.filter(
    (c) =>
      enModo(c) &&
      (!doc || c.doc === doc) &&
      (!texto ||
        [c.id, c.titulo, c.articulo, c.ubicacion, ...c.encabezados_grilla, ...c.rotulos_sin_verificar].some(
          (x) => x && String(x).toLowerCase().includes(texto),
        )),
  );
  return { resumen, total: lista.length, desde, cuadros: lista.slice(desde, desde + 30) };
}
