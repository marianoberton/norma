/**
 * Chunking estructural de la normativa. Ademas de cortar el texto,
 * detecta la ESTRUCTURA NORMATIVA real (Titulo, articulo/seccion numerada) para
 * poder citar por ubicacion legal y no por el nombre arbitrario del archivo.
 *
 * Encabezados que reconoce:
 *  - "TÍTULO 2. OBRA. AVISOS..."            -> Titulo (nivel 1)
 *  - "**2.1.2 Permiso de Demolición**"      -> articulo/seccion (nivel = profundidad)
 *  - "**5.2 Permiso de Demolición**" (RT)   -> idem
 *  - "# ..."  (markdown)                     -> por nivel de almohadilla
 */

export interface Chunk {
  text: string; // texto del chunk (lo que se muestra/cita)
  ubicacion: string; // rastro estructural, p.ej. "Título 2. Obra › 2.1.2 Permiso de Demolición"
  titulo: string | null; // Titulo normativo vigente (solo CE), p.ej. "Título 2. Obra..."
  articulo: string | null; // numero de articulo/seccion mas profundo, p.ej. "2.1.2"
  index: number;
}

interface Heading {
  level: number;
  title: string; // texto a mostrar en el rastro
  num: string | null; // numero (articulo/seccion) si lo tiene
  esTitulo: boolean;
}

// Palabras que en castellano van en minuscula dentro de un titulo.
const MINOR = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "en", "a", "al",
  "con", "para", "por", "un", "una", "su", "sus", "se",
]);

function titleCaseEs(s: string): string {
  const words = s.toLowerCase().split(/\s+/);
  return words
    .map((w, i) =>
      i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/**
 * Sanea el numero de articulo cuando el primer segmento trae pegado el numero
 * de pagina del PDF (ej. pagina 34 + art 1.1.9 -> "341.1.9"). Ningun Titulo ni
 * seccion real supera 12, asi que un primer segmento mayor es pagina pegada y
 * el Titulo verdadero es su ultimo digito ("341" -> "1", "1833" -> "3").
 */
function fixArticulo(n: string): string {
  const segs = n.split(".");
  if (segs[0].length > 1 && Number(segs[0]) > 12) segs[0] = segs[0].slice(-1);
  return segs.join(".");
}

/** Clasifica una linea como encabezado estructural, o null si no lo es. */
function classify(line: string): Heading | null {
  const raw = line.trim();
  if (!raw) return null;

  // Markdown estandar (#)
  const md = raw.match(/^(#{1,6})\s+(.*)$/);
  if (md) return { level: md[1].length, title: md[2].trim(), num: null, esTitulo: false };

  // Si esta envuelto en negrita exacta, trabajamos sobre el interior.
  const bold = raw.match(/^\*\*\s*(.*?)\s*\*\*$/);
  const inner = bold ? bold[1].trim() : raw;
  const isBold = !!bold;

  // TÍTULO N. NOMBRE   (nombre sin digitos; descarta entradas del indice)
  const tit = inner.match(/^T[ÍI]TULO\s+(\d+)\.?\s+([A-ZÁÉÍÓÚ][^\d]{2,70})$/i);
  if (tit) {
    return {
      level: 1,
      title: `Título ${tit[1]}. ${titleCaseEs(tit[2].trim().replace(/[.\s]+$/, ""))}`,
      num: tit[1],
      esTitulo: true,
    };
  }

  // Encabezado numerado en negrita: "N(.N){0,3} Nombre" (nombre sin digitos, corto)
  const num = inner.match(/^(\d+(?:\.\d+){0,3})\.?\s+([A-ZÁÉÍÓÚ][^\d]{2,68})$/);
  if (num && isBold) {
    const fixed = fixArticulo(num[1]);
    const segs = fixed.split(".").length;
    return {
      level: segs + 1,
      title: `${fixed} ${titleCaseEs(num[2].trim().replace(/[.\s]+$/, ""))}`,
      num: fixed,
      esTitulo: false,
    };
  }

  return null;
}

function trail(stack: Heading[]): string {
  return stack.map((h) => h.title).join(" › ");
}
function tituloActual(stack: Heading[]): string | null {
  const t = stack.find((h) => h.esTitulo);
  return t ? t.title : null;
}
function articuloActual(stack: Heading[]): string | null {
  // El numero mas profundo (ultimo encabezado numerado no-titulo).
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].num && !stack[i].esTitulo) return stack[i].num;
  }
  return null;
}

export function chunkMarkdown(text: string, size: number, overlap: number): Chunk[] {
  const lines = text.split(/\r?\n/);
  const stack: Heading[] = [];
  const chunks: Chunk[] = [];

  let buf: string[] = [];
  let bufLen = 0;
  // Estructura vigente al ARRANCAR el chunk actual (no la del final).
  let curUbic = "";
  let curTit: string | null = null;
  let curArt: string | null = null;
  let started = false;

  const snapshot = () => {
    curUbic = trail(stack);
    curTit = tituloActual(stack);
    curArt = articuloActual(stack);
    started = true;
  };

  const push = (body: string) => {
    const t = body.trim();
    if (t) {
      chunks.push({
        text: t,
        ubicacion: curUbic,
        titulo: curTit,
        articulo: curArt,
        index: chunks.length,
      });
    }
  };

  for (const line of lines) {
    const h = classify(line);
    if (h) {
      // Cierra el chunk en curso antes de cambiar de seccion.
      push(buf.join("\n"));
      buf = [];
      bufLen = 0;
      started = false;
      // Actualiza el stack por nivel.
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push(h);
      continue;
    }

    if (!started) snapshot();
    buf.push(line);
    bufLen += line.length + 1;

    if (bufLen >= size) {
      const body = buf.join("\n").trim();
      push(body);
      if (overlap > 0 && body.length > overlap) {
        const tail = body.slice(body.length - overlap);
        buf = [tail];
        bufLen = tail.length;
        // El proximo chunk sigue en la misma seccion: refrescamos snapshot.
        snapshot();
      } else {
        buf = [];
        bufLen = 0;
        started = false;
      }
    }
  }
  push(buf.join("\n"));

  return chunks;
}
