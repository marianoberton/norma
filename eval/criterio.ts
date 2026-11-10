/** Cuándo un fragmento devuelto cumple la respuesta esperada de una pregunta del examen. */
import type { ChunkRecord } from "../src/lib/vector-store.js";

export interface Esperado {
  doc?: "RT" | "CodigoEdificacion" | "CUR";
  rubro?: string;
  rt?: string;
  articulo?: string;
  articulo_prefijo?: string;
  texto_contiene?: string;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function cumple(r: ChunkRecord, e: Esperado): boolean {
  if (e.doc && r.source_doc !== e.doc) return false;
  if (e.rubro && (r as ChunkRecord & { rubro?: string }).rubro !== e.rubro) return false;
  if (e.rt && !(r.rt_code ?? "").toUpperCase().startsWith(e.rt.toUpperCase())) return false;
  if (e.articulo && r.articulo !== e.articulo) return false;
  if (e.articulo_prefijo) {
    const a = r.articulo ?? "";
    if (a !== e.articulo_prefijo && !a.startsWith(e.articulo_prefijo + ".")) return false;
  }
  if (e.texto_contiene && !sinTildes(r.text).includes(sinTildes(e.texto_contiene))) return false;
  return true;
}
