/**
 * Arma el examen de la muestra: las preguntas de eval/examen-v2.json cuya respuesta está en
 * demo/data (Código de Edificación, capítulos 3.4 y 3.5), con el vector de cada pregunta ya
 * calculado para que el CI no llame a la API.
 *   npx tsx demo/examen/preparar.mts      (un embedding por pregunta: menos de USD 0,001)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { embedBatch } from "../../src/lib/embeddings.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../..");
const CAPITULOS = ["3.4", "3.5"];
const enMuestra = (a = "") => CAPITULOS.some((c) => a === c || a.startsWith(c + "."));

const examen = JSON.parse(readFileSync(resolve(raiz, "eval/examen-v2.json"), "utf8"));
const preguntas = examen.preguntas.filter((p: { esperado: { doc?: string; articulo?: string; articulo_prefijo?: string }[] }) =>
  p.esperado.some((e) => e.doc === "CodigoEdificacion" && enMuestra(e.articulo ?? e.articulo_prefijo)));
writeFileSync(resolve(aqui, "examen.json"), JSON.stringify({
  version: `${examen.version}-muestra`,
  nota: `Preguntas de eval/examen-v2.json con respuesta en demo/data (CE ${CAPITULOS.join(", ")}). Las marcadas «por revisar» se miden, pero el umbral del CI usa todas.`,
  preguntas,
}, null, 1));
const vectores = await embedBatch(preguntas.map((p: { pregunta: string }) => p.pregunta));
writeFileSync(resolve(aqui, "preguntas.vectores.json"),
  JSON.stringify(Object.fromEntries(preguntas.map((p: { pregunta: string }, i: number) => [p.pregunta, vectores[i]]))));
console.log(`${preguntas.length} preguntas y sus vectores en demo/examen/`);
