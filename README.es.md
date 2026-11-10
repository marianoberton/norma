# Norma: agente de normativa de edificación y urbanismo

> **Versión 2 (en desarrollo).** Esta versión ingiere los PDF oficiales en lugar de los .docx, suma el Código Urbanístico, guarda las figuras de la norma y las muestra junto a la cita, y trae un panel de trabajo y un examen que mide cada cambio. El plan completo y las mediciones están en [`docs/plan-v2.md`](docs/plan-v2.md).

## Versión 2 en una mirada

| Qué | Cómo |
|---|---|
| Ingesta desde PDF | `ingest_v2/extraer_pdf.py`: código RT leído del encabezado de cada página, rastro de artículos encadenado por número con los títulos de los marcadores del PDF, encabezados y pies recortados por geometría, hojas de firmas descartadas |
| Figuras | `ingest_v2/extraer_figuras.py`: 402 láminas recortadas, vinculadas al artículo de su título más cercano y descritas con un modelo de visión barato; cada cita trae sus figuras |
| Código Urbanístico | `ingest_v2/extraer_cur.py`: artículos ubicados con el índice del propio PDF, Cuadro de Usos 3.3 fila por fila (con la imagen de su página), anexos por área y planos |
| Control de calidad | Cada transcripción por visión se compara contra la capa de texto del PDF; lo que no coincide va a revisión |
| Búsqueda | Embeddings (`text-embedding-3-small`) + búsqueda exacta por artículo o rubro |
| Examen | `eval/correr-examen.mts`: preguntas con su artículo esperado; acierto@k y MRR por corrida |
| Cuadros del CE y los RT | `ingest_v2/tablas_pdf.py`: cada cuadro leído tres veces (grilla del PDF, visión y árbitro de otra empresa); una fila entra al índice solo si dos lecturas coinciden, con el nombre de su columna |
| Interfaz | Chat en `/` y panel de trabajo en `/panel` (Documentos, Cuadros, Probador, Examen, Consultas) |

**Examen v2 (44 preguntas: 22 del Código de Edificación, 10 de los RT y 12 del Código Urbanístico):** 40/44 (91 %), MRR 0,767. Elección del modelo de visión: ocho modelos comparados sobre las mismas páginas; ver `docs/plan-v2.md`.

**Resultados del examen v0** (15 preguntas, acierto@8): índice v1, 11/15; ingesta desde PDF, 12/15; más búsqueda exacta por artículo, 13/15; más figuras, 13/15 con MRR 0,628. El examen todavía no está revisado por un arquitecto: los números orientan.

**Correr la versión 2 en local:**

```bash
python -I ingest_v2/extraer_pdf.py <carpeta con los PDF> data/v2/chunks.jsonl
python -I ingest_v2/extraer_figuras.py <carpeta con los PDF> --describir 2.00   # tope de gasto en USD
python -I ingest_v2/extraer_cur.py <carpeta CUR> --prosa 0.30 --tablas 0.10 --planos 0.30   # Claude Haiku 5.5 por defecto
npx tsx ingest_v2/indexar.mts normativa_v2          # índice aparte
VECTOR_INDEX=normativa_v2 JURISDICCION=jurisdicciones/ejemplo PORT=8799 npx tsx src/server.ts
# chat: http://localhost:8799/   panel: http://localhost:8799/panel
VECTOR_INDEX=normativa_v2 npx tsx eval/correr-examen.mts eval/examen-v2.json mi-etiqueta 8
```

Los PDF de la normativa y los índices generados no se versionan (`data/` está en `.gitignore`).

---

## Versión 1 (en producción)

Agente conversacional (RAG) sobre el **Código de Edificación** y los **Reglamentos
Técnicos (RT)**. Responde citando la
fuente (RT, artículo, archivo) y no inventa: solo afirma lo que está en la
normativa indexada.

- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims) — vía REST
- **Generación:** OpenRouter — **DeepSeek V3.2** por defecto, **GLM-5.1** como fallback
- **Vector store:** local, autocontenido (binario Float32 + JSON), búsqueda coseno en memoria
- **Sin frameworks pesados:** todo con `fetch` y Node estándar, para no atarse a
  APIs que cambian seguido. Migrar a Qdrant/PgVector toca solo `vector-store.ts`.

## Requisitos

- Node 20+ (probado en Node 22)
- La carpeta `DIVISIÓN/` con los 19 `.docx` (por defecto se busca en `../DIVISIÓN`)
- API keys de OpenAI (embeddings) y OpenRouter (generación) en `.env.local`

## Puesta en marcha

```bash
npm install
# .env.local ya tiene las API keys. Si no, copiá .env.example y completalas.

# 1) Indexar el corpus (una sola vez). Lee los .docx, genera embeddings
#    y guarda el vector store en data/
npm run ingest

# 2) Elegí cómo conversar:
npm run serve     # UI web de chat en http://localhost:8787   (recomendado)
npm run chat      # chat interactivo por terminal
npm run ask "¿Qué documentación exige un permiso de obra?"   # consulta única
npm run smoke     # test end-to-end (recuperación + generación)

# 3) Revisar el feedback de los usuarios para ir mejorando el agente:
npm run feedback  # resumen de 👍/👎 y comentarios (data/feedback.jsonl)
```

## La UI web (http://localhost:8787)

- **Respuesta corta primero**: una respuesta directa y certera (destacada en un
  recuadro), seguida de un "Detalle" expandido. Lo más importante arriba.
- **De dónde sale la info**: cada respuesta lista los fragmentos citados [n];
  al hacer clic se ve el **texto exacto del documento** (archivo, RT, artículo,
  sección). Clic en una cita [n] del texto salta directo a su fragmento.
- **Feedback**: cada respuesta tiene 👍 / 👎 + comentario. Se guarda en
  `data/feedback.jsonl` y se resume con `npm run feedback`.

## Cómo funciona

```
.docx ──parse(mammoth)──► texto markdown limpio
      ──chunk────────────► fragmentos (~1100 chars, solape 150) + encabezados
      ──embed(OpenAI)────► vectores 1536d  ──► data/<índice>.{vectors.bin, chunks.json, meta.json}

consulta ──embed──► búsqueda coseno top-K ──► contexto citable
         ──► prompt anti-alucinación + historial ──► OpenRouter (DeepSeek) ──► respuesta con fuentes
```

## Qué indexa (y qué NO)

Ingiere **solo los 19 `.docx`** de `DIVISIÓN/`, que cubren ambos documentos sin
duplicados:

- `CE 1`…`CE 6` → Código de Edificación
- `00`, `01`, `02.1`…`02.9`, `03`, `04` → Compilado RT

> El PDF `02. PROYECTO, EJECUCIÓN…` es el *padre* de los `02.x` y solo existe
> como PDF, por lo que queda excluido automáticamente (el pipeline ignora todos
> los `.pdf`). No agregarlo: duplicaría medio corpus.

## Estructura

```
src/
├── config.ts                 # toda la config vía .env.local
├── rag.ts                    # núcleo: recuperar + prompt + generar (el "agente")
├── ask.ts / chat.ts / server.ts   # interfaces: CLI única / REPL / web
├── smoke-test.ts             # test end-to-end
├── ingest/
│   ├── parse-docx.ts         # docx -> markdown (descarta imágenes base64)
│   ├── extract-metadata.ts   # RT code, capítulo, versión, artículo
│   └── index-corpus.ts       # chunk + embed + guardar  (npm run ingest)
└── lib/
    ├── embeddings.ts         # OpenAI embeddings (REST, batch, reintentos)
    ├── generate.ts           # OpenRouter chat (REST, streaming, fallback)
    ├── chunk.ts              # chunking estructural markdown
    └── vector-store.ts       # store local + búsqueda coseno
public/index.html             # UI de chat (streaming, fuentes, sin dependencias)
data/                         # vector store generado por la ingesta (gitignored)
```

## Cambiar de modelo de generación

Es un string en `.env.local`. No requiere reindexar:

```
MODEL_PRIMARY=openai/gpt-6-luna             # default desde 2026-11-09
MODEL_FALLBACK=anthropic/claude-haiku-5.5
# antes: deepseek/deepseek-v3.2 + z-ai/glm-5.1
```

La elección sale de `eval/comparar_modelos_respuesta.mts` (44 preguntas, mismo contexto para todos, juez de otra familia y verificación a mano); el detalle está en `docs/plan-v2.md`.

> Verificá los slugs exactos en https://openrouter.ai/models (cambian con cada release).

## Migrar a producción

- **Vector store:** reemplazar `VectorStore` (`src/lib/vector-store.ts`) por un
  cliente Qdrant/PgVector. El resto del sistema (recuperación, agente, UI) no cambia.
  Reindexar.
- **Embeddings (opcional):** otro modelo cambia la dimensión → reindexar todo.
```
