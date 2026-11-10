/**
 * Levanta el chat y el panel con la muestra de demo/data (CE, capítulos 3.4 y 3.5).
 *   npm run demo   ->   http://localhost:8787  (panel en /panel)
 * Sin claves arrancan el panel y el Probador con las preguntas del examen de la muestra (sus vectores ya
 * están calculados). Para el chat hacen falta OPENAI_API_KEY y OPENROUTER_API_KEY en .env.local.
 * La muestra se regenera con: python -I scripts/muestra.py
 */
process.env.STORE_DIR ??= "demo/data";
// Las revisiones a mano que se hagan en la demo no ensucian la muestra versionada.
process.env.REVISIONES_PATH ??= "demo/.local/revisiones.jsonl";
process.env.EMBED_CACHE ??= "demo/examen/preguntas.vectores.json";
process.env.VECTOR_INDEX ??= "normativa_demo";
process.env.JURISDICCION ??= "jurisdicciones/ejemplo";
await import("../src/server.ts");
