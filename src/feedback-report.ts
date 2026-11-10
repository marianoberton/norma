/**
 * Reporte del feedback de usuarios.  npm run feedback
 * Lee data/feedback.jsonl y resume valoraciones y comentarios para iterar
 * sobre la calidad del agente.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const path = join(config.storeDir, "feedback.jsonl");

interface Entry {
  ts: string;
  rating: "up" | "down";
  question: string;
  answer: string;
  comment: string;
}

function main() {
  if (!existsSync(path)) {
    console.log("Todavia no hay feedback (archivo inexistente:", path, ")");
    return;
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const entries: Entry[] = lines
    .map((l) => {
      try {
        return JSON.parse(l) as Entry;
      } catch {
        return null;
      }
    })
    .filter((e): e is Entry => e !== null);

  const up = entries.filter((e) => e.rating === "up").length;
  const down = entries.filter((e) => e.rating === "down").length;

  console.log(`\n📊 Feedback (${entries.length} respuestas valoradas)`);
  console.log(`   👍 útil: ${up}    👎 no útil: ${down}`);
  if (entries.length) {
    console.log(`   satisfaccion: ${((up / entries.length) * 100).toFixed(0)}%`);
  }

  const negativas = entries.filter((e) => e.rating === "down");
  if (negativas.length) {
    console.log(`\n⚠️  Respuestas marcadas como NO útiles (a revisar):`);
    negativas.forEach((e, i) => {
      console.log(`\n  ${i + 1}. [${e.ts}]`);
      console.log(`     Pregunta: ${e.question.slice(0, 160)}`);
      if (e.comment) console.log(`     Comentario: ${e.comment}`);
    });
  }

  const conComentario = entries.filter((e) => e.rating === "up" && e.comment);
  if (conComentario.length) {
    console.log(`\n💬 Comentarios en respuestas útiles:`);
    conComentario.forEach((e) => console.log(`   - ${e.comment}`));
  }
  console.log("");
}

main();
