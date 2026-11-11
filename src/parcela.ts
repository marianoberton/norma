/**
 * Consulta de una parcela por dirección o por identificador catastral (GET /api/parcela).
 *
 * Cada ciudad tiene sus propios servicios de direcciones, catastro y edificabilidad, así que esto no vive
 * acá: la jurisdicción declara un módulo en jurisdiccion.json («parcela.modulo») y el servicio lo carga.
 * Sin ese módulo, /api/parcela responde 501. El contrato del módulo es este archivo.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { jurisdiccion } from "./jurisdiccion.js";

export interface PedidoParcela { direccion?: string | null; smp?: string | null }

export interface ContextoParcela {
  /** El bloque «parcela» de jurisdiccion.json. */
  config: Record<string, unknown>;
  /** Raíz del proyecto, para resolver archivos de datos. */
  raiz: string;
  /** fetch inyectable (las pruebas no salen a internet). */
  fetch: typeof fetch;
  /** Fecha de la consulta (inyectable para las pruebas). */
  ahora: () => Date;
}

export interface ModuloParcela {
  consultarParcela(pedido: PedidoParcela, ctx: ContextoParcela): Promise<{ status: number; cuerpo: unknown }>;
}

let modulo: Promise<ModuloParcela | null> | null = null;

/** El módulo de la jurisdicción activa, o null si no declara uno. Se carga una sola vez. */
export function moduloParcela(): Promise<ModuloParcela | null> {
  if (!modulo) {
    const m = jurisdiccion.parcela?.modulo;
    modulo = m ? import(pathToFileURL(resolve(jurisdiccion.dir, m)).href) as Promise<ModuloParcela> : Promise.resolve(null);
  }
  return modulo;
}
