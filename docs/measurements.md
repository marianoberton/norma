# Measurements behind the README

Each section points to the committed file it comes from.

## Retrieval exam v2: 44 questions

| Body of law | Questions |
|---|---|
| Building Code (CE) | 22 |
| Technical Regulations (RT) | 10 |
| Urban Code (CUR) | 12 |

**How the 25 new questions were written.** I picked articles that matter for commercial permits: kitchens, mechanical ventilation, exits, bakeries, gyms, food courts, five-a-side pitches, use mixes, active frontages, balconies and plans. I read each article before writing its question, and wrote the question without reusing the article's words, so the search gets no free hint. Each question names one expected article, so the exam measures whether retrieval finds the right place, not whether the full answer is right. None has been reviewed by an architect yet.

**Result on the full v2 index:** 40/44 in the top 8 (91 %), MRR 0.767 ([`eval/resultados/2026-11-09_v2_v2-CUR-completo.json`](../eval/resultados/2026-11-09_v2_v2-CUR-completo.json)). After verified tables replaced flattened text: 40/44, MRR 0.765 ([`2026-11-09_v2_v2-cuadros-verificados.json`](../eval/resultados/2026-11-09_v2_v2-cuadros-verificados.json)).

### The 4 misses

- **`ce-sanitario-pcd-cuando`** and **`ascensor-obligatorio`**: it is not clear which article is the right answer. An architect has to decide.
- **`ce-cocina-requisitos`**: the question says "commercial premises" and retrieval returns 3.8.1.3 (food service). That article regulates kitchens in restaurants and refers to 3.3.1.6.5, the expected one. It may be a flaw in the question rather than in retrieval. The expected answer was not changed after seeing the result.
- **`ce-dos-escaleras`**: article 3.4.7.6 lands between rank 7 and 9 depending on the run, pushed down by the other stair articles (3.4.6.x, 3.4.7.8). A real retrieval weakness.

Two of these (`ce-sanitario-pcd-cuando`, `ce-dos-escaleras`) fall inside the demo sample, which is why the CI exam on the sample scores 8/10 ([`tests/examen-muestra.test.ts`](../tests/examen-muestra.test.ts)).

## Answer model: three candidates on the same 44 questions

All three answered the 44 exam questions with the same retrieved context ([`eval/comparar_modelos_respuesta.mts`](../eval/comparar_modelos_respuesta.mts), answers in [`eval/comparaciones/respuestas/`](../eval/comparaciones/respuestas/)).

- **Automatic checks:** errors, format, citations, and any article or RT number not present in the context.
- **Judge:** Gemini 3.8 Flash, from a different vendor than the three candidates, checked each claim against the context.
- **Manual review:** I checked every error the judge flagged.

| Model | Errors / format OK | Serious errors, verified by hand | Mean support (judge) | USD per answer | Seconds (median) |
|---|---|---|---|---|---|
| deepseek/deepseek-v3.2 (previous) | 0 / 44 of 44 | **2**: a gym area limit attributed to the wrong use mix; "smooth" floor for a bakery where the law says non-slip | 0.984 | 0.00138 | 26 |
| anthropic/claude-haiku-5.5 | 0 / 44 of 44 | **1**: stair-enclosure doors "F60 in all cases", a misread of a flattened table that reaches F90 | 0.989 | 0.00143 | 8 |
| **openai/gpt-6-luna** | 0 / 44 of 44 | **0** | **1.000** | **0.00071** | **6** |

GPT-6 Luna became the primary model and Claude Haiku 5.5, from another vendor, the fallback. Luna was the only one without errors, said so when the context was not enough, cost half and was four times faster. Limits: 44 questions, one judge, questions not yet reviewed by an architect. Cost of the comparison: USD 0.15 in answers and USD 0.72 in judging.

## The first production error, and why it was not the model

In production, Luna swapped the columns of the bathroom table (art. 3.5.2.1): "type I: 1.50 m² and minimum side 3.00 m", when the law says side 1.50 m and area 3.00 m². Re-asked 3 times to each candidate with the same context, all 9 answers read it right: the error was intermittent. Haiku's "F60 in all cases" had the same cause. The PDF text layer flattens the table, and the model has to guess which number belongs to which column. The fix was in the data: [case study](case-study-tables.md).

## Verified tables

Counts by status, rows confirmed and withheld, which reading won and the API cost are in [`eval/resultados/tablas-verificacion.json`](../eval/resultados/tablas-verificacion.json). After the fix, the two questions that had failed were re-asked 3 times each to Luna and Haiku, and all 12 answers had the right values. That check was done by hand and its answers were not saved.
