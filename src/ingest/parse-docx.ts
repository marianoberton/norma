/**
 * Convierte un .docx a texto markdown limpio, DESCARTANDO las imagenes
 * embebidas (los .docx de la normativa traen sellos/diagramas en base64
 * que no aportan al RAG textual y rompen el chunking si se dejan).
 */
import mammoth from "mammoth";
import { jurisdiccion } from "../jurisdiccion.js";

// `convertToMarkdown` existe en runtime (mammoth >=1.x) pero no esta en los
// tipos empaquetados, que solo declaran convertToHtml. Lo tipamos a mano.
const mammothMd = mammoth as unknown as {
  convertToMarkdown: (
    input: { path: string },
    options?: { convertImage?: unknown },
  ) => Promise<{ value: string }>;
  images: { imgElement: (fn: (img: unknown) => Promise<{ src: string }>) => unknown };
};

export async function docxToText(filePath: string): Promise<string> {
  const result = await mammothMd.convertToMarkdown(
    { path: filePath },
    {
      // Reemplaza cualquier imagen por vacio en vez de incrustar base64.
      convertImage: mammothMd.images.imgElement(async () => ({ src: "" })),
    },
  );

  return clean(result.value);
}

/**
 * Limpia el texto que viene de un .docx que a su vez fue convertido (mal) desde
 * un PDF: marcas de negrita rotas (__ x __), encabezados/pies de pagina
 * repetidos (IF-2024-..., "Página X de Y"), numeros de pagina sueltos, etc.
 * Mejora tanto la legibilidad de las citas como la calidad de la recuperacion.
 */
function clean(md: string): string {
  let s = md
    // Elimina cualquier resto de data-uri de imagen.
    .replace(/!\[[^\]]*\]\(data:image\/[^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\(\s*\)/g, "")
    // Desescapa el markdown de mammoth (RT\-020201\-... -> RT-020201-...).
    .replace(/\\([^\w\s])/g, "$1");

  // Normaliza las negritas de mammoth con espacios pegados: "__a. __" -> "**a.**".
  s = s.replace(/__\s*([^_\n][^_]*?)\s*__/g, "**$1**");

  // Corrige el numero de pagina pegado al inicio de un encabezado en negrita:
  // "**341.1.9 Equivalencias**" -> "**1.1.9 Equivalencias**" (34 = pagina).
  // Solo dispara cuando tras 2-3 digitos viene un patron de articulo "N.N".
  s = s.replace(/(\*\*)(\d{2,3})(?=\d\.\d)/g, "$1");

  // Remueve furniture de pagina pegada al texto (sin tocar los ** que rodean):
  //  - el encabezado del código y el sello de expediente, definidos por la jurisdicción
  s = s.replace(new RegExp(jurisdiccion.ingesta.encabezado, "gi"), "");
  s = s.replace(new RegExp(jurisdiccion.ingesta.sello + "[-A-Z0-9]*", "gi"), "");
  // Negritas vacias o sueltas que quedan como ruido.
  s = s.replace(/\*\*\s*\*\*/g, "");

  // Limpieza linea por linea: descarta numeros de pagina y versiones sueltas.
  const drop = [
    /^\s*P[áa]gina\s+\d+\s+de\s+\d+\s*$/i, // "Página 15 de 36"
    /^\s*\*{0,2}\s*\d{1,4}\s*\*{0,2}\s*$/, // numero de pagina suelto (con o sin **)
    /^\s*\*{0,2}\s*VERSI[ÓO]N\s*:?\s*\d+\s*\*{0,2}\s*$/i, // "VERSIÓN: 8" repetido
  ];
  let lines = s.split(/\r?\n/).filter((line) => !drop.some((re) => re.test(line)));

  // Elimina lineas repetidas como encabezado/pie en cada pagina del PDF
  // (titulos de seccion que reaparecen >=5 veces), pero conserva las que llevan
  // un codigo RT (sirven para citar) y las muy cortas.
  const freq = new Map<string, number>();
  for (const l of lines) {
    const k = l.trim();
    if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  lines = lines.filter((l) => {
    const k = l.trim();
    return !(k.length >= 8 && (freq.get(k) ?? 0) >= 5 && !/RT-\d{6}-\d{6}-\d{2}/.test(k));
  });
  s = lines.join("\n");

  return s
    // Quita los puntos guia del indice ("TÍTULO 1 ........... 32").
    .replace(/ ?\.{3,} ?/g, " ")
    // Colapsa espacios multiples (la conversion del PDF dejo muchos).
    .replace(/ {2,}/g, " ")
    // Asegura un espacio cuando una negrita queda pegada a la palabra siguiente
    // ("**a.**Reparar" -> "**a.** Reparar").
    .replace(/\*\*([^*\n]+?)\*\*(?=[A-Za-zÁÉÍÓÚáéíóúÜüÑñ0-9])/g, "**$1** ")
    // Quita el espacio sobrante antes de signos de puntuacion y tras "(".
    .replace(/ +([;:,.)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
