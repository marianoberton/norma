/**
 * Chat interactivo por terminal, con memoria de la conversacion.
 *   npm run chat
 * Comandos: /salir para terminar, /reset para limpiar el historial.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { askStream } from "./rag.js";
import { jurisdiccion } from "./jurisdiccion.js";
import type { ChatMessage } from "./lib/generate.js";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const history: ChatMessage[] = [];

  console.log(`\nNorma: normativa de edificación${jurisdiccion.nombre ? " — " + jurisdiccion.nombre : ""}`);
  console.log(`   ${Object.values(jurisdiccion.documentos).join(" + ")}`);
  console.log("   Escribi tu consulta. /reset para reiniciar, /salir para terminar.\n");

  while (true) {
    const q = (await rl.question("Vos > ")).trim();
    if (!q) continue;
    if (q === "/salir" || q === "/exit") break;
    if (q === "/reset") {
      history.length = 0;
      console.log("(historial reiniciado)\n");
      continue;
    }

    process.stdout.write("\nAgente > ");
    const { text } = await askStream(q, (chunk) => process.stdout.write(chunk), history);
    process.stdout.write("\n\n");

    history.push({ role: "user", content: q });
    history.push({ role: "assistant", content: text });
    // Mantiene la ventana de contexto acotada (ultimos 6 turnos).
    while (history.length > 12) history.shift();
  }

  rl.close();
  console.log("\nHasta luego.\n");
}

main().catch((err) => {
  console.error("\n❌", err);
  process.exit(1);
});
