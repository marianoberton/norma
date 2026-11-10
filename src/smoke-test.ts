/**
 * Test de humo end-to-end: verifica config, vector store, recuperacion y
 * generacion con una consulta real.  npm run smoke
 */
import { config } from "./config.js";
import { retrieve, ask } from "./rag.js";
import { jurisdiccion } from "./jurisdiccion.js";

const PREGUNTA =
  process.argv.slice(2).join(" ").trim() ||
  "¿Qué documentación se necesita para tramitar un permiso de obra?";

async function main() {
  console.log(`Smoke test de Norma (${jurisdiccion.id})\n`);
  console.log("  Modelo generacion:", config.modelPrimary);
  console.log("  Modelo embeddings:", config.embeddingModel);
  console.log("  Indice:", config.vectorIndex, "en", config.storeDir);

  console.log(`\n1) Recuperacion para: "${PREGUNTA}"`);
  const hits = await retrieve(PREGUNTA, 5);
  if (!hits.length) throw new Error("No se recuperaron fragmentos. ¿Corriste la ingesta?");
  hits.forEach((h, i) => {
    console.log(
      `   [${i + 1}] score=${h.score.toFixed(3)}  ${h.record.archivo_origen}` +
        (h.record.rt_code ? `  RT ${h.record.rt_code}` : "") +
        (h.record.articulo ? `  art.${h.record.articulo}` : ""),
    );
  });

  console.log("\n2) Generacion (respuesta completa):\n");
  const answer = await ask(PREGUNTA);
  console.log(answer);

  console.log("\n✅ Smoke test OK\n");
}

main().catch((err) => {
  console.error("\n❌ Smoke test FALLÓ:", err);
  process.exit(1);
});
