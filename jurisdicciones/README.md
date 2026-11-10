# Jurisdicciones

Norma no sabe de qué ciudad es la norma que indexa: eso vive acá. Cada carpeta es una
jurisdicción y se elige con la variable `JURISDICCION` (por defecto `jurisdicciones/ejemplo`).

| Archivo | Qué define |
|---|---|
| `jurisdiccion.json` | `id`, `nombre` (lo muestra la interfaz; `null` para no mostrar ninguno), `contexto` (el rótulo del contexto en cada turno), `documentos` (nombre de cada cuerpo normativo por sigla), `ingesta` (nombre de archivo de cada PDF de origen, lugar para los prompts de visión, sello y encabezado que se limpian del texto) y `ejemplos` (preguntas de la bienvenida del chat). |
| `corpus.md` | El primer párrafo del prompt de sistema: qué cuerpos normativos hay y qué cubre cada uno. |
| `citas.md` | Cómo se cita cada cuerpo normativo. |
| `prompt.snapshot.txt` | Foto del prompt de sistema completo. `tests/agente.test.ts` la compara con el prompt actual, así que cualquier cambio en lo que ve el modelo tiene que ser deliberado: `npx tsx scripts/foto-prompt.mts jurisdicciones/<id>` la actualiza. |

El resto del prompt (formato de respuesta y reglas) es el mismo para cualquier jurisdicción
y está en `src/rag.ts`. `/health` devuelve `jurisdiccion.id` para confirmar cuál está cargada.

`ejemplo` describe la muestra de `demo/data` (Código de Edificación, capítulos 3.4 y 3.5).
