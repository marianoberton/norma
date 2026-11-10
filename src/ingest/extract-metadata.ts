/**
 * Metadata por ARCHIVO y por CHUNK orientada a citar por estructura normativa
 * (documento + capitulo tematico + RT + articulo), NO por el nombre de archivo,
 * que es un corte arbitrario por paginas hecho por el cliente.
 */

export interface FileMeta {
  source_doc: "RT" | "CodigoEdificacion";
  documento: string; // "Código de Edificación" | "Reglamento Técnico"
  capitulo_tema: string | null; // tema real del capitulo RT (null para CE)
  archivo_origen: string; // referencia interna (NO se muestra como cita)
  pdf_respaldo: string; // referencia interna
}

const MINOR = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "en", "a", "al",
  "con", "para", "por", "un", "una",
]);
function titleCaseEs(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Capitulos del Compilado RT. Los "02. N" son cortes arbitrarios de un mismo
// capitulo; todos comparten el tema del padre.
const RT_CHAPTER: Record<string, string> = {
  "00": "Generalidades",
  "01": "Avisos de Obra y Permisos de Obra",
  "02": "Proyecto, Ejecución, Conservación y Mantenimiento",
  "03": "Diseño Sostenible",
  "04": "Conservación y Mantenimiento",
};

/** Tema real del capitulo a partir del nombre de archivo RT. */
function rtCapitulo(base: string): string {
  const m = base.match(/^(\d+)\.\s*(.*)$/);
  if (!m) return titleCaseEs(base);
  const num = m[1];
  const rest = (m[2] ?? "").trim();
  // "02. 5" / "02. 1": resto numerico -> usar el tema del padre.
  if (rest === "" || /^\d+$/.test(rest)) return RT_CHAPTER[num] ?? `Capítulo ${num}`;
  return RT_CHAPTER[num] ?? titleCaseEs(rest);
}

/** Metadata derivada del nombre del archivo .docx. */
export function fileMetadata(fileName: string): FileMeta {
  const base = fileName.replace(/\.docx$/i, "").trim();
  const isCodigo = /^CE\s*\d+/i.test(base);

  return {
    source_doc: isCodigo ? "CodigoEdificacion" : "RT",
    documento: isCodigo ? "Código de Edificación" : "Reglamento Técnico",
    capitulo_tema: isCodigo ? null : rtCapitulo(base),
    archivo_origen: fileName,
    pdf_respaldo: `${base}.pdf`,
  };
}

// RT-CCCCCC-SSSSSS-VV  (admite variantes con/sin guion final y sufijos)
const RT_CODE = /\bRT-\d{6}-\d{6}-\d{2}(?:-\d{2,4})?(?:-[A-Z])?\b/g;
const VERSION = /VERSI[OÓ]N\s*:?\s*(\d+)/i;
const ARTICULO_TXT = /\bArt[ií]culo\s+(\d+(?:\.\d+)*)/i;

/**
 * Metadata textual de un chunk: RT, version y (como respaldo) un numero de
 * articulo mencionado en el texto. El articulo "principal" del chunk viene de la
 * estructura (ver chunk.ts); esto es solo un fallback.
 */
export function chunkMetadata(text: string): {
  rt_code: string | null;
  version: string | null;
  articulo_txt: string | null;
} {
  const rt = text.match(RT_CODE);
  const ver = text.match(VERSION);
  const art = text.match(ARTICULO_TXT);
  return {
    rt_code: rt ? rt[0] : null,
    version: ver ? ver[1] : null,
    articulo_txt: art ? art[1] : null,
  };
}
