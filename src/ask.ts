/**
 * Consulta rapida por linea de comandos, sin servidor.
 *   npm run ask -- "Que documentacion exige el RT para una obra civil?"
 */
import { askStream } from "./rag.js";

async function main() {
  const pregunta = process.argv.slice(2).join(" ").trim();
  if (!pregunta) {
    console.error('Uso: npm run ask -- "tu pregunta sobre la normativa"');
    process.exit(1);
  }

  process.stdout.write("\n");
  await askStream(pregunta, (chunk) => process.stdout.write(chunk));
  process.stdout.write("\n\n");
}

main().catch((err) => {
  console.error("\n❌", err);
  process.exit(1);
});
