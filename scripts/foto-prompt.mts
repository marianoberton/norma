/**
 * Guarda el prompt de sistema de una jurisdicción en jurisdicciones/<id>/prompt.snapshot.txt.
 * tests/agente.test.ts lo compara con el prompt actual: si un cambio altera lo que ve el modelo, falla.
 *   npx tsx scripts/foto-prompt.mts jurisdicciones/ejemplo
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { promptSistema } from "../src/rag.js";
import { cargarJurisdiccion } from "../src/jurisdiccion.js";

const dir = process.argv[2];
if (!dir) throw new Error("Falta la carpeta: npx tsx scripts/foto-prompt.mts jurisdicciones/<id>");
writeFileSync(join(dir, "prompt.snapshot.txt"), promptSistema(cargarJurisdiccion(dir)));
console.log(`Prompt guardado en ${join(dir, "prompt.snapshot.txt")}`);
