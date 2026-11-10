/**
 * Cuadros del Código de Edificación y de los Reglamentos Técnicos, tal como los dejó la verificación
 * de la ingesta (ingest_v2/tablas_pdf.py decidir): estado, lectura usada, filas confirmadas y lo que quedó afuera.
 * Lo usa la pestaña Cuadros del panel.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ModoCuadro = "verificado" | "recuadro" | "parcial" | "solo_imagen";

export interface Cuadro {
  id: string;
  doc: "CE" | "RT";
  pagina: number;
  articulo: string | null;
  ubicacion: string | null;
  titulo: string | null;
  modo: ModoCuadro;
  lectura: string | null; // grilla | vision | arbitro: la lectura cuyas filas se indexaron
  encabezados: string[];
  filas: string[][]; // solo las confirmadas por dos lecturas
  sin_verificar: number;
  rotulos_sin_verificar: string[];
  encabezados_grilla: string[];
  imagen: string; // recorte del cuadro original
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
      });
    }
  }
  return out;
}

/** Resumen de la verificación (siempre sobre todos) y una página de 30 cuadros filtrada. */
export function listarCuadros(todos: Cuadro[], q: URLSearchParams) {
  const resumen = {
    total: todos.length,
    por_modo: { verificado: 0, recuadro: 0, parcial: 0, solo_imagen: 0 } as Record<ModoCuadro, number>,
    por_lectura: {} as Record<string, number>,
    filas_confirmadas: 0,
    filas_sin_verificar: 0,
  };
  for (const c of todos) {
    resumen.por_modo[c.modo]++;
    if (c.lectura) resumen.por_lectura[c.lectura] = (resumen.por_lectura[c.lectura] ?? 0) + 1;
    resumen.filas_confirmadas += c.filas.length;
    resumen.filas_sin_verificar += c.sin_verificar;
  }
  const modo = q.get("modo") ?? "";
  const doc = q.get("doc") ?? "";
  const texto = (q.get("q") ?? "").toLowerCase().trim();
  const desde = Math.max(Number(q.get("desde")) || 0, 0);
  const lista = todos.filter(
    (c) =>
      (!modo || c.modo === modo) &&
      (!doc || c.doc === doc) &&
      (!texto ||
        [c.id, c.titulo, c.articulo, c.ubicacion, ...c.encabezados_grilla, ...c.rotulos_sin_verificar].some(
          (x) => x && String(x).toLowerCase().includes(texto),
        )),
  );
  return { resumen, total: lista.length, desde, cuadros: lista.slice(desde, desde + 30) };
}
