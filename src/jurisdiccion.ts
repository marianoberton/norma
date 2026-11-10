/**
 * La jurisdicción: qué ciudad, qué cuerpos normativos y cómo se citan. Vive en
 * jurisdicciones/<id>/ y se elige con JURISDICCION (por defecto jurisdicciones/ejemplo).
 * Si la carpeta no existe, el servicio no arranca: mejor caerse que responder con otra norma.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { config } from "./config.js";

export interface Jurisdiccion {
  id: string;
  nombre: string | null;
  /** Rótulo del contexto recuperado en cada turno: «CONTEXTO RECUPERADO (<contexto>)». */
  contexto: string;
  documentos: Record<string, string>;
  ingesta: { de_lugar: string; de_la_ciudad: string; sello: string; encabezado: string };
  ejemplos: string[];
  /** Primer bloque del prompt de sistema (corpus.md). */
  corpus: string;
  /** Reglas de cita por cuerpo normativo (citas.md). */
  citas: string;
}

/** Texto de un archivo sin \r ni saltos finales: el prompt no cambia con el checkout de Windows. */
const leer = (f: string) => readFileSync(f, "utf8").replace(/\r/g, "").replace(/\n+$/, "");

export function cargarJurisdiccion(dir: string = process.env.JURISDICCION ?? "jurisdicciones/ejemplo"): Jurisdiccion {
  const d = isAbsolute(dir) ? dir : resolve(config.projectRoot, dir);
  const json = resolve(d, "jurisdiccion.json");
  if (!existsSync(json)) throw new Error(`No hay jurisdicción en ${d}. Revisá la variable JURISDICCION.`);
  const j = JSON.parse(leer(json));
  for (const k of ["id", "contexto", "documentos", "ingesta"]) {
    if (j[k] == null) throw new Error(`${json}: falta «${k}».`);
  }
  return { nombre: null, ejemplos: [], ...j, corpus: leer(resolve(d, "corpus.md")), citas: leer(resolve(d, "citas.md")) };
}

export const jurisdiccion = cargarJurisdiccion();
