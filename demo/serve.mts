/**
 * Levanta el chat y el panel con la muestra de demo/data (CE, capítulos 3.4 y 3.5).
 *   npm run demo   ->   http://localhost:8787  (panel en /panel)
 * Necesita OPENAI_API_KEY (embedding de la pregunta) y OPENROUTER_API_KEY (respuesta) en .env.local.
 * La muestra se regenera con: python -I scripts/muestra.py
 */
process.env.STORE_DIR ??= "demo/data";
process.env.VECTOR_INDEX ??= "normativa_demo";
process.env.JURISDICCION ??= "jurisdicciones/ejemplo";
await import("../src/server.ts");
