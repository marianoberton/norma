/**
 * Generacion via OpenRouter (API compatible con OpenAI). Streaming por SSE.
 * Si el modelo primario falla, reintenta con el modelo de fallback.
 */
import { config } from "../config.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const COMMON_HEADERS = {
  "Content-Type": "application/json",
  // OpenRouter usa estos para atribucion (opcionales).
  "HTTP-Referer": "https://localhost",
  "X-Title": "Norma",
};

/** Genera una respuesta completa (no streaming). Devuelve el texto. */
export async function generate(
  messages: ChatMessage[],
  model: string = config.modelPrimary,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { ...COMMON_HEADERS, Authorization: `Bearer ${config.openrouterApiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status} (${model}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Genera en streaming, invocando onToken por cada fragmento de texto.
 * Maneja el fallback automatico si el modelo primario falla al iniciar.
 */
export async function generateStream(
  messages: ChatMessage[],
  onToken: (chunk: string) => void,
  model: string = config.modelPrimary,
): Promise<string> {
  let res: Response;
  try {
    res = await openStream(messages, model);
  } catch (err) {
    if (model !== config.modelFallback) {
      onToken(""); // no-op; permite que el caller sepa que arranco
      res = await openStream(messages, config.modelFallback);
    } else {
      throw err;
    }
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Procesa lineas SSE completas.
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        // Linea parcial o comentario SSE: ignorar.
      }
    }
  }
  return full;
}

async function openStream(messages: ChatMessage[], model: string): Promise<Response> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { ...COMMON_HEADERS, Authorization: `Bearer ${config.openrouterApiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
  });
  if (!res.ok || !res.body) {
    const body = res.body ? await res.text() : "(sin cuerpo)";
    throw new Error(`OpenRouter ${res.status} (${model}): ${body.slice(0, 300)}`);
  }
  return res;
}
