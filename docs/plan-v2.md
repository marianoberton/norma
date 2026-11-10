# Norma v2: plan para rehacer la ingesta, sumar el Código Urbanístico y publicarlo

Escrito el 2026-11-09. Todo lo que dice «medido» o «verificado» se comprobó sobre los archivos locales o por API; lo que no, está marcado.

## 1. Qué se midió el 2026-11-09

### 1.1 Quince búsquedas reales contra el índice actual

Solo recuperación (los 8 fragmentos), sin redactar respuesta. Juicio propio, no de un arquitecto: sirve como primera foto, no como medición.

| # | Pregunta | Resultado | Detalle |
|---|---|---|---|
| 1 | Ancho mínimo de escalera principal | Bien | CE 3.4.6.1 en los tres primeros |
| 2 | Ancho de pasillo de salida | Bien | 3.4.7.4 primero; 3.4.7.3, que es la respuesta, recién en el puesto 7 |
| 3 | Sanitario para PcD en local comercial | A medias | Trae cómo es el sanitario (3.5.2.2), no cuándo se exige |
| 4 | Puertas de caja de escalera, F30 o F60 | A medias | Trae la tabla de resistencia aplanada y 3.4.6.3 |
| 5 | Documentación para Aviso de Obra | Bien | CE 2.1.1 y RT 5.1.1 |
| 6 | Qué es una micro obra | A medias | RT 5.5, pero con puntajes bajos (0,53) |
| 7 | Altura mínima de local de 1.ª clase | A medias | Encuentra el artículo; la tabla de alturas está aplanada |
| 8 | «Qué dice el artículo 2.1.2 del CE» | **Falla** | El fragmento existe (`CE 1#105`) y no aparece entre los 8: la búsqueda por significado no entiende números |
| 9 | RT-030909-020202-03 sobre hidrantes | A medias | El filtro por RT funciona, pero trae índice, carátula y ruido, todo sin artículo |
| 10 | Cantidad de matafuegos | Bien | RT 4.5.2 primero |
| 11 | Iluminación y ventilación de dormitorio | A medias | Lo pertinente (3.3.2.x) en los puestos 2 y 8 |
| 12 | Cuándo es obligatorio el ascensor | **Falla** | Trae artículos que solo dicen «se rige por los Reglamentos Técnicos» |
| 13 | Pendiente máxima de rampa | Bien | 3.4.5.1 con su tabla |
| 14 | Cada cuántos años verificar fachadas | **Cita mal** | Trae el texto correcto, pero etiquetado `RT-050105-020601-05`. Verificado en el PDF: «Conservación de Fachadas» es `RT-050102-020601-01` |
| 15 | Factor de ocupación de un restaurante | Bien | 3.4.7.2; la tabla está aplanada |

Seis bien, seis a medias y tres fallas (una de ellas, cita equivocada). La búsqueda tarda unos 250 ms, casi todo en la llamada a OpenAI.

### 1.2 Los PDF originales traen la estructura que a los `.docx` les falta

- **Compilado RT (1.462 páginas):** 1.299 páginas (89 %) llevan el código RT en el encabezado o el pie, y salen 118 reglamentos distintos, los mismos que hay en el índice. El encabezado también trae el nombre del reglamento y «VERSIÓN: N». Hay 107 páginas con la tabla de versiones y fechas de vigencia.
- **Código de Edificación (492 páginas):** 779 marcadores del PDF, 739 con número de artículo. Es el árbol oficial de Títulos y artículos.
- **Figuras:** 86 en 60 páginas del CE y 434 en 339 páginas del RT. Hoy se descartan todas.

### 1.3 La carpeta `CUR` (10 PDF, 1.811 páginas, 216 MB)

| Archivo | Págs. | Qué es | Capa de texto | Cómo se trabaja |
|---|---|---|---|---|
| `cur-cuerpo-principal_0.pdf` | 257 | Texto consolidado del CUR, «versión actualizada a 31 de diciembre de 2024» (SECDU) | Sí. Corregido el 2026-11-09: el texto está en orden de lectura si no se lo ordena por posición, porque las posiciones de los caracteres están rotas. Faltan espacios entre algunas palabras y las celdas de las tablas salen pegadas | Fuente principal. Prosa transcrita con visión y controlada contra la capa de texto; el Cuadro de Usos N° 3.3 (págs. 67–88) y los cuadros de depósitos (págs. 101–112), con visión |
| `Ley modificatoria CUR.pdf` | 209 | Ley modificatoria (12/12/2024): «se sustituye el texto del artículo…» | Sí | No es texto vigente; sirve como historial («modificado por la ley modificatoria, art. N») |
| `cur-anexoii.pdf` | 608 | Anexo II, Áreas Especiales Individualizadas | Sí, buena (Word) | Texto. Tiene imágenes en 310 páginas |
| `Anexo III (2).pdf` | 82 | Listados de usos por área | Sí, buena | Texto |
| `Anexo I Catalogados.pdf` | 488 | Listado de inmuebles catalogados: dirección, sección, manzana, parcela, nivel de protección, ley | Sí (Word) | **Tabla a base de datos**, consultable por dirección o SMP; no se embebe |
| `Anexo II (2).pdf` | 21 | Fichas de catalogación con casillas tildadas | Parcial | Visión, a campos |
| `Anexo I (1).pdf` | 58 | Planos de distritos (UBP) | No (imagen) | Imagen para mostrar y descripción con visión |
| `Anexo IV (2).pdf` | 37 | 35 planchetas «Mapa de edificabilidad y usos», cada una armada con 46 mosaicos | No (imagen) | Imagen para mostrar. Los datos por parcela salen de la API oficial (ver 1.4) |
| `CUR - Usos y referencias.pdf` | 31 | Extracto del Cuadro de Usos | **No**: impresión sin texto | Visión con doble extracción |
| `Cuadro de usos industriales.pdf` | 20 | Cuadro de Actividades Industriales (Decreto 86/2019, códigos ClaNaE) | **No**: texto convertido a trazos; páginas apaisadas | Visión con doble extracción, a tabla |

### 1.4 Datos oficiales por parcela (investigado el 2026-11-09)

- **API de parcelas, pública y sin clave** (pide un User-Agent de navegador):
  - `https://<api-de-parcelas>/catastro/parcela/?smp=…` devuelve superficie, frente, fondo y pisos.
  - `https://<api-de-parcelas>/cur3d/seccion_edificabilidad/?smp=…` devuelve unidad de edificabilidad, altura máxima, plano límite, FOT, catalogación, afectaciones y linderos.
  - No hay documentación oficial: los campos salen de lo que respondió. **Sin verificar:** si está al día con la ley modificatoria (una respuesta trae `distrito_cpu: "E3"`, nomenclatura vieja, junto a las unidades nuevas).
- **datos abiertos, dataset «Código Urbanístico»** (CC-BY-2.5-AR): CSV, GeoJSON y SHP por parcela, actualizado al 31/12/2024. <portal de datos abiertos de la ciudad>
- **Texto oficial del CUR:** el mismo dataset publica los PDF del cuerpo principal y los anexos I a IV.
- **Cuadro de Usos N° 3.3:** no se encontró versión estructurada (planilla o CSV). Hay un cuadro de asimilación aprobado por la Disposición 1487/DGIUR/22.

**Verificado a mano el 2026-11-09 con la parcela 031-094-023 (Av. Estado de Israel 4215):**

| Dato | API de parcelas | CSV de datos abiertos (318.127 parcelas, modificado el 14/05/2025) |
|---|---|---|
| Altura / unidad de edificabilidad | 31,2 | 31,2 |
| Plano límite | **38,2** | **39,2** |
| FOT (medianera, perímetro libre, semilibre) | 3 / 3 / 3 | 3 / 3 / 3 |
| Alícuota | 0,27 | 0,27 |
| Incidencia UVA | **420** | **330** |
| Distrito CPU | E3 | E3 |
| Uso (`uso_1`; sería la mixtura) | no lo trae | **4** |
| Catalogación | Cautelar, catálogo preventivo, singular | `catalogado = 2` |

- Las dos fuentes difieren en dos campos. La API parece más reciente: sus datos de puertas son de octubre de 2026.
- Solo el CSV trae `uso_1`, `uso_2` y `uso_3`, y todo indica que son la mixtura de usos, el dato que hace falta para consultar el Cuadro de Usos:
  - `uso_1` toma solo valores de 0 a 4;
  - en San Nicolás (microcentro) es casi siempre 4;
  - en Villa Devoto, mayormente 1.
- La confirmación formal con el diccionario de datos queda pendiente: el catálogo de datos abiertos respondió 503.
- Los valores de `uni_edif_1` son las alturas del CUR vigente (9; 12; 14,6; 17,2; 22,8; 31,2 y 38 m).
- La herramienta de parcela consulta las dos fuentes, muestra el origen y la fecha de cada dato, y marca cuando no coinciden. Qué fuente manda lo decide el cliente.
- Una parcela inexistente responde `{"error": "ObjetoTerritorial matching query does not exist."}`.

Consecuencia: para «¿qué puedo construir en tal dirección?» no hay que leer planchetas con un modelo de visión. Se consulta la API y el CSV, y la plancheta se muestra como respaldo visual.

### 1.5 Piloto de visión: tres páginas difíciles, dos modelos

Hecho con `google/gemini-3.8-flash` y `anthropic/claude-sonnet-5.5` por OpenRouter, a temperatura 0, comparando celda por celda. Las tres páginas con los dos modelos costaron unos USD 0,07.

| Página | Por qué es difícil | Resultado |
|---|---|---|
| `CUR - Usos y referencias.pdf` p. 16 (Cuadro de Usos, rubros 2.4.x) | Sin capa de texto | Los dos modelos coinciden en 153 de 153 celdas, y coinciden con la página a la vista |
| `Cuadro de usos industriales.pdf` p. 11 | Apaisada; el texto está convertido a trazos | 44 de 44 celdas con datos (código, EST, CyD) coinciden. Las 13 filas de grupo tienen el mismo texto; solo cambia en qué columna lo ponen |
| `Anexo I (1).pdf` p. 30 (plano UBP 90) | Plano rotado con texto chico | Los dos leen bien el título («UBP 90 La Carbonilla, Plano N° 2.4.1»). Difieren en números de parcela, en el número de sello y en la lista de calles: uno nombra calles que el otro no ve |

Conclusiones:

- Para tablas, la doble extracción funciona y el desacuerdo marca lo que hay que revisar a mano.
- En los planos, el título y el identificador son confiables, pero el texto chico (calles, números de parcela) no. Los planos se usan para mostrar, vinculados por su identificador; el dato por parcela sale de la API oficial.
### 1.6 Extracción completa de los dos cuadros sin capa de texto (mismo día)

Las 51 páginas, con los dos modelos, costaron USD 1,78. Los JSON y el script quedaron en `data/extracciones/2026-11-09_cuadros-cur/`. Comparación por código de rubro, con el texto normalizado (cortes de línea con guion, «m²» y «M2», rayas y guiones):

| Cuadro | Filas con código | Valores idénticos | Desacuerdos |
|---|---|---|---|
| Extracto del Cuadro de Usos (31 págs.) | 326 en los dos modelos | 325 (99,7 %) | 1: celda vacía contra «-» |
| Actividades industriales (20 págs.) | 244 y 244; 243 en común | 215 (88,5 %) | 27 son celdas combinadas que un modelo deja vacías; 1 con valores distintos |

- **Celdas combinadas:** en la página 5 (17 desacuerdos), «35a / IIIa» ocupa una sola celda que vale para todo un grupo de filas. Verificado mirando la página: el modelo que repite el valor fila por fila tiene razón. El desacuerdo encontró un error real. Para la extracción definitiva, el pedido al modelo va a explicitar que una celda combinada vale para cada fila que abarca.
- **El desacuerdo con valores distintos:** es el código 500.161 de la página 9, la última fila de la página. Ahí el sello «IF-2019-…» está impreso encima de las celdas EST y CyD.
  - Un modelo marcó «?» (ilegible).
  - El otro leyó «35a / IIIb», coherente con las filas vecinas, pero no se puede confirmar a la vista.
  - Es el caso que tiene que resolver un humano en Revisión, por ejemplo contra el Decreto 86/2019 publicado en el Boletín Oficial.
- **Comparar fila por fila sin normalizar subestima el acuerdo:** el texto crudo daba 79 % y 85 % de filas idénticas, casi todo por diferencias de forma.
- **Método que queda:**
  1. Dos modelos.
  2. Normalizar el texto.
  3. Comparar por código.
  4. Lo que no coincide va a la pantalla Revisión.
  5. Muestreo a mano de lo que sí coincide.
- **Falta comparar con la fuente de texto:** el cuerpo principal del CUR (págs. 59–104) trae el Cuadro de Usos completo con capa de texto, aunque desordenada. Contrastar las dos fuentes da una tercera verificación.

## 2. Respuestas cortas a las preguntas de Mariano

- **¿Se puede arreglar el RT mal atribuido?** Sí, de forma determinista. Se ingiere desde el PDF compilado página por página y cada página toma el RT de su encabezado. La versión y la vigencia salen del mismo encabezado y de la tabla de versiones.
- **¿Se puede arreglar el rastro que no encadena?**
  - En el CE, sí: se usa el árbol de marcadores del PDF.
  - En los RT: se reinicia la pila de encabezados en cada reglamento, y un número solo cuelga de otro si lo tiene de prefijo (3.4.7.3 cuelga de 3.4.7, no de 3.4.6).
  - Un control automático lista los rastros que no encadenan.
- **¿Cómo se trabaja el ruido?** En el origen y por geometría: se recortan encabezado y pie por zona de la página, no con expresiones regulares. Además:
  - Las páginas de índice y carátula se descartan.
  - Las tablas de versiones pasan a metadatos.
  - El solape corta en fin de oración.
  - Un informe de calidad por documento corre en cada ingesta (fragmentos que arrancan a mitad de frase, restos de página, porcentaje de dígitos) y falla si se pasa de un umbral.
- **¿Cómo se trabajan las imágenes?** Cada figura se recorta con su página y su recuadro y se guarda como archivo. Un modelo de visión la clasifica (plano, esquema, tabla, foto, sello) y la describe; si es tabla, la transcribe. La descripción se indexa como un fragmento más, vinculado a la imagen y al artículo donde aparece. Cuando ese fragmento se cita, la respuesta muestra la imagen. Sellos y logos se descartan.

## 3. Arquitectura propuesta

### 3.1 Tres tipos de conocimiento, tres formas de guardarlo

1. **Texto normativo** (CE, RT, cuerpo del CUR, Anexos II y III) se guarda como fragmentos con búsqueda híbrida (por significado y por palabras exactas). Cada fragmento lleva documento, versión del texto, artículo, rastro, página del PDF oficial y recuadro.
2. **Tablas** (Cuadro de Usos 3.3, Actividades Industriales, Catalogados, tabla maestra de RT) se guardan como filas en la base. Se consultan con exactitud («gimnasio» → rubro 2.3.3 → mixtura 2: `C`). Los embeddings sirven solo para encontrar el rubro.
3. **Imágenes** (figuras de CE y RT, planos UBP, planchetas, fichas) se guardan como archivo, descripción, tipo, página, recuadro y artículo vinculado.

Los datos por parcela no se guardan: se consultan en vivo a la API de parcelas, con caché.

### 3.2 Un agente con herramientas en vez de una sola búsqueda

| Herramienta | Qué hace |
|---|---|
| `buscar_normativa(pregunta, filtros)` | Búsqueda híbrida más reordenador sobre el texto |
| `ver_articulo(documento, número)` | Trae un artículo exacto; resuelve el caso «qué dice el 2.1.2» |
| `consultar_cuadro_usos(rubro, mixtura)` | Consulta las tablas de usos |
| `consultar_parcela(dirección o SMP)` | Consulta la API de parcelas y datos abiertos |
| `ver_imagen(id)` | Devuelve la figura citada para mostrarla |

Cada respuesta cita la ubicación normativa y la página del PDF oficial. La interfaz abre esa página con la zona marcada.

### 3.3 Búsqueda y modelos

Investigado el 2026-11-09. Las cifras de proveedores están marcadas como tales.

- **Base:** Postgres con `pgvector`, en el Supabase del servidor o en una base nueva.
  - La imagen estándar de Supabase trae `pgvector` pero no extensiones BM25 (`pg_search`, VectorChord). Verificado en el repo `supabase/postgres`.
  - La búsqueda por palabras usa `tsvector` con diccionario `spanish` y `unaccent`.
  - Las dos búsquedas se unen con fusión RRF en una función SQL, según la guía oficial de búsqueda híbrida de Supabase.
  - Alternativa si hace falta BM25 real o búsqueda visual: Qdrant, que calcula BM25 en el servidor y admite multivector.
- **Por qué híbrida:** la normativa está llena de términos exactos («2.1.2», «RT-030909», «F60», «hidrantes»). La búsqueda 8 de la sección 1.1 falla justamente por eso.
- **Encabezado de cada fragmento:** la jerarquía del documento (Código › Título › Artículo › nombre) va delante del texto antes de embeberlo. No cuesta nada.
  - El «contexto generado por modelo» (contextual retrieval) es opcional. Anthropic midió 35 % menos fallos con contexto, 49 % sumando BM25 y 67 % sumando reordenador. Para 10.000 fragmentos cuesta del orden de USD 5–10.
- **Modelo de embeddings:** no hay un benchmark público de recuperación jurídica en castellano, así que se elige con el examen.
  - Candidatos, todos disponibles en OpenRouter según su catálogo: `text-embedding-3-small` (el actual, línea base), Qwen3-Embedding-8B, voyage-4 y Gemini Embedding 2.
  - Embeber el corpus entero cuesta menos de USD 1 con cualquiera, así que comparar los cuatro es barato.
- **Reordenador:** después de la búsqueda híbrida, un reordenador elige los mejores 8 entre unos 40.
  - Candidatos: Cohere Rerank 5 (anuncio de octubre de 2026, cifras del propio proveedor), Voyage rerank y Qwen3-Reranker. Se elige con el examen.
- **Imágenes y planos:** se describen con un modelo de visión y se busca sobre el texto de la descripción. La imagen se guarda para mostrarla.
  - Un estudio de 2025 con diapositivas dio 83,9 nDCG@10 con descripciones más BM25 más reordenador, contra 75,3 de un recuperador visual (DSE).
  - La búsqueda visual por página (ColPali y familia; ColModernVBERT corre en CPU) queda como canal opcional para la etapa de portfolio.
- **Evaluación:** el examen corre en CI, con métricas de recuperación (Recall@10, MRR) y de respuesta (artículo citado correcto, se abstiene cuando no hay respuesta).
  - Las preguntas sintéticas tienden a copiar el vocabulario del fragmento e inflar los números, así que se mezclan con preguntas reales de el cliente.
  - Trazas de cada consulta en la base propia; Langfuse es opcional.
- **Lenguajes:** Python para ingesta y evaluación, porque las herramientas de PDF y visión están ahí. TypeScript para la API y la interfaz web.
- **Generación:** sigue por OpenRouter. El modelo también se elige con el examen, con su costo por consulta.

### 3.4 Cómo se cita y cómo se muestra

Cada cosa que el agente puede citar guarda dónde está en el documento oficial. Así la cita se puede verificar con un clic.

| Qué se cita | Datos que guarda | Cómo se cita en la respuesta | Qué ve el usuario al tocar la cita |
|---|---|---|---|
| Fragmento de texto | Documento, versión del texto (p. ej. «consolidado al 31/12/2024»), artículo, rastro, PDF oficial, página, recuadro | «(Código Urbanístico, art. 3.3.1.4) [3]» | La página del PDF, con el párrafo resaltado |
| Fila de tabla | Tabla, rubro, columna, valor, página, recuadro de la fila, quién la revisó | «(Cuadro de Usos N° 3.3, rubro 2.3.3 Gimnasio, mixtura 2: C) [4]» | La fila resaltada y, al lado, el recorte de la página original |
| Figura o plano | Archivo de imagen, tipo, identificador (p. ej. «UBP 90, Plano N° 2.4.1»), descripción revisada, página, recuadro, artículo donde aparece | «(Anexo I, Plano N° 2.4.1, UBP 90 La Carbonilla) [5]» | La imagen dentro de la respuesta, con zoom y enlace a la página |
| Dato de parcela | Fuente (la API de parcelas o CSV), fecha de consulta, campo, valor | «(API de parcelas, consultada el 09/11/2026: altura máxima 31,2 m) [6]» | Ficha de la parcela, la plancheta que le corresponde y aviso si las fuentes no coinciden |

- **Imágenes:** se guardan una vez, como archivo, en el almacenamiento del servidor (volumen o almacenamiento de Supabase). La base guarda la ruta. Una imagen solo se muestra si su descripción fue aprobada en la pantalla Revisión.
- **Enlace al PDF oficial:** cada documento guarda la URL pública de datos abiertos o del Boletín Oficial. La interfaz abre la página exacta con `#page=N`.
- **Regla del agente:** no puede afirmar nada que no tenga una de estas cuatro citas. Si no la encuentra, dice que la normativa recuperada no lo cubre.

### 3.5 Costos estimados

Precios publicados en OpenRouter y por los proveedores el 2026-11-09. Son estimaciones.

Revisado el 2026-11-09 con lo gastado de verdad. El primer número (USD 40) era un techo redondeado. Usaba dos modelos para todo, el modelo caro para las figuras y contexto generado por modelo, y queda descartado.

**Gastado hasta hoy:** USD 1,85. Se va en el piloto de 3 páginas (USD 0,07), los dos cuadros completos (51 páginas, USD 1,78) y los embeddings de 30 búsquedas (centavos).

| Concepto | Cómo se abarata | Estimado |
|---|---|---|
| Tablas que faltan (Cuadro de Usos del cuerpo principal y fichas de catalogación, unas 50 páginas) | Dos modelos solo en tablas, que es donde el error importa. Medido: unos USD 0,035 por página con los dos | USD 2 |
| Figuras y planos (unas 1.000 en CE, RT y CUR) | Primero se descartan sellos, logos y repetidos sin gastar nada. Las que quedan pasan por un solo modelo barato (`gemini-3.5-flash-lite` o `claude-haiku-5.5`), y la revisión humana cubre el resto | USD 2–5 |
| Embeddings: corpus completo con 3 o 4 modelos para compararlos | Ya es barato | USD 1–3 |
| Contexto generado por modelo | No se hace por ahora. El encabezado con la jerarquía del documento es gratis y se mide primero | USD 0 |
| **Total de la ingesta** | | **USD 5–10, una vez** |
| Por consulta | Embedding, reordenador y búsqueda: fracciones de centavo. La redacción, como hoy | — |

## 4. La interfaz («el panel»)

Hoy no existe. Es una aplicación web, en el mismo repo de Norma, con estas pantallas:

1. **Consulta:** el chat, con citas que abren la página del PDF y las imágenes.
2. **Documentos:** lista de documentos y versiones, estado de ingesta y botón para subir uno nuevo.
3. **Revisión:** a la izquierda la página del PDF y a la derecha lo extraído (texto, tabla o figura con su descripción). Botones para aprobar o corregir. Con esto se arma el conjunto de datos validado.
4. **Probador:** una pregunta, y los fragmentos que vuelven con su puntaje y su página, sin redactar respuesta.
5. **Examen:** el porcentaje de aciertos de cada versión del índice y la comparación entre versiones.
6. **Consultas:** qué se preguntó, qué se devolvió, tiempo de respuesta y opiniones.

Antes había recomendado poner el panel dentro de la plataforma FOMO. Para que el proyecto se pueda mostrar en GitHub conviene que viva en el repo de Norma. La plataforma sigue consumiendo la API como hoy.

## 5. El examen (preguntas de control)

Es una lista de preguntas con la ubicación de la respuesta correcta. Ejemplo: «ancho mínimo de escalera principal» → CE 3.4.6.1. Cada cambio en la ingesta o en la búsqueda corre el examen y mide en qué porcentaje la ubicación correcta aparece entre los primeros resultados. Así se sabe si un cambio mejora o empeora, en vez de suponerlo.

- Borrador: las 15 preguntas de la sección 1.1, más unas 60 generadas a partir del propio texto (por artículo, tabla e imagen).
- Revisión: alguien de el cliente marca cada una como correcta, incorrecta o a corregir. Calculo una o dos horas.
- Se repite con el CUR: rubros del Cuadro de Usos, parcelas reales y planos.

## 6. Orden de trabajo

| Etapa | Entrega | Cómo se sabe que está |
|---|---|---|
| 0. Base | Repo en git, CI y examen v0. Se mide el índice actual como línea base | El examen corre en CI y da un número |
| 1. Ingesta nueva de CE y RT desde PDF | RT por encabezado, árbol por marcadores, limpieza por geometría, figuras recortadas y descritas | Atribución de RT verificada, cero rastros incoherentes y el examen igual o mejor |
| 2. Base de datos y búsqueda | Búsqueda híbrida, reordenador, API (`retrieve`, `chat`, `stats`), registro de consultas | El examen mejora contra la línea base |
| 3. Panel | Las seis pantallas de la sección 4 | Mariano revisa un documento entero desde el panel |
| 4. Código Urbanístico | Texto, tablas con doble extracción y revisión, mapas y la herramienta de parcela | Examen del CUR revisado por el cliente |
| 5. Agente y despliegue | Herramientas, imágenes en las respuestas, `buscar_normativa` en el conector, versión nueva en el servidor (con confirmación) | Prueba con usuarios de el cliente |
| 6. Portfolio | README con diagrama y resultados medidos antes y después, video corto, demo pública | Repo público listo |

### Avance al 2026-11-09 (solo local, nada desplegado ni commiteado)

- **Examen v0:** `eval/examen-v0.json` tiene las 15 preguntas con su respuesta esperada; 3 están marcadas «por revisar». Se corre con `npx tsx eval/correr-examen.mts`.
- **Línea base del índice actual:** acierto@8 de 11/15 (73 %) y MRR 0,526; sin las «por revisar», 83 %. El resultado está en `eval/resultados/`.
- **Servicio:** `POST /api/retrieve`, `GET /api/stats`, `GET /api/fragmentos` y `GET /api/examen`, todos con la misma clave que `/api/chat`.
  - Cada consulta (`chat` y `retrieve`) se registra en `data/consultas.jsonl`.
  - Typecheck sin errores; probado en el puerto 8799.
- **Panel v0** en `/panel` (`public/panel.html`) con cuatro pantallas:
  - Documentos, con el explorador de fragmentos;
  - Probador;
  - Examen;
  - Consultas.
- **Falta para el despliegue:** sacar `data/` de la imagen a un volumen; sin eso, el registro de consultas se pierde en cada redespliegue.

### Etapa 1 empezada: ingesta desde los PDF (2026-11-09, local)

**Extracción.** `ingest_v2/extraer_pdf.py` pasa de los PDF a `data/v2/chunks.jsonl`. No llama a ninguna API y tarda alrededor de 1 minuto. Chequeos (`data/v2/validacion.txt`):

**Código de Edificación**
- Se encontraron en el texto los 736 artículos numerados de los marcadores del PDF (736/736).
- Hay 25 artículos en el texto que no tienen marcador.
- 23 artículos derogados quedan como registro propio, marcados.
- El Título sale del primer número del artículo. Los marcadores de título del PDF están corridos de página: por eso el 5.1.2 caía en el Título 4.

**Reglamentos Técnicos**
- 120 códigos distintos, leídos del encabezado de cada página.
- 135 hojas de firmas descartadas, porque eran ruido.
- 12 páginas de índice de vigencias, separadas como «Índice de RT».
- 5 páginas heredan el código de la anterior.
- La banda del encabezado se mide hasta la última fila de las columnas del encabezado, porque el título del RT puede ocupar un renglón más que la versión.
- Los artículos numerados «7.3.-» se reconocen (54 casos).
- 4 páginas quedan sin código: su código está mal impreso en el PDF (por ejemplo «RT-03090-020204-01- 06» o «RT-030806-020306- 05/06») y van a revisión.
- «RT-030902-020201-8» se normaliza a `-08`, marcado.

**Texto**
- Encabezados y pies recortados por geometría.
- Las palabras cortadas con guion se vuelven a unir.
- Un fragmento por artículo; solo se corta si el artículo pasa de 1.100 caracteres.

**Índice.** `ingest_v2/indexar.mts` arma el índice `normativa_v2`, aparte del actual, que no se tocó y quedó respaldado en `data/respaldo-2026-11-09/`. Datos de la corrida:
- 4.267 fragmentos;
- alrededor de 1,15 M de tokens;
- USD 0,023 por corrida con `text-embedding-3-small`; se corrió cuatro veces mientras se corregía la extracción, unos USD 0,09 en total.
- Se mantuvo el mismo modelo de embeddings para que la comparación mida solo el cambio de ingesta.

**Búsqueda exacta por artículo** (`src/rag.ts`): si la pregunta nombra un artículo («artículo 2.1.2», o un número de tres niveles como 3.4.6.1), sus fragmentos van primero. No usa ninguna API.

**Examen v0 (acierto@8):**

| Corrida | Acierto | MRR | Sin «por revisar» |
|---|---|---|---|
| Índice actual | 11/15 | 0,526 | 10/12 |
| Índice actual + búsqueda por artículo | 12/15 | 0,593 | 11/12 |
| Ingesta desde PDF, sin búsqueda por artículo | 12/15 | 0,517 | 11/12 |
| **Ingesta desde PDF + búsqueda por artículo** | **13/15** | **0,583** | **12/12** |

- Fachadas pasa por la atribución correcta del código RT.
- El 2.1.2 pasa por la búsqueda exacta.
- Las 2 que fallan son «por revisar»: no está confirmado cuál es el artículo correcto.
- Con 15 preguntas armadas por nosotros, la diferencia es indicativa, no concluyente; hace falta el examen de 30 a 50 revisado por el cliente.

**Para probarlo:**
1. `PORT=8799 VECTOR_INDEX=normativa_v2 npx tsx src/server.ts`
2. Abrir http://localhost:8799/panel.

El valor por defecto del servicio sigue siendo el índice actual: el índice v2 no reemplaza nada hasta que Mariano lo decida.

### Figuras vinculadas a la cita (2026-11-09, local)

La idea de Mariano, implementada para el Código de Edificación y los RT: cada figura se guarda como imagen, se vincula a su artículo y se muestra junto a la cita.

1. **Recorte**, con `ingest_v2/extraer_figuras.py`, sin costo:
   - quedan 402 figuras útiles: 89 del CE y 313 de los RT;
   - se descartan 1.603 logos y sellos (misma imagen en más de 3 páginas) y 242 imágenes muy chicas;
   - cada figura queda en un PNG en `data/v2/figuras/`, con su página y su recuadro en el PDF.
2. **Vínculo con el artículo:** el del título más cercano por encima de la figura en la misma página. Si no hay ninguno, el que venía de la página anterior.
   - La primera versión («el último artículo que empezó en la página») ubicaba mal 40 figuras.
   - Ejemplo verificado a la vista: el dibujo del ensanchamiento de corredores es del art. 3.4.7.3, no del 3.4.7.2.5 derogado que está arriba en la misma página.
3. **Descripción:** `google/gemini-3.8-flash` devuelve tipo, descripción y rótulos legibles.
   - Costo: USD 1,67 por 402 figuras, unos 0,4 centavos cada una, con tope de gasto en el script.
   - No se paga dos veces la misma figura: se reconoce por su huella digital.
   - Muestra revisada: los rótulos de la figura del art. 3.1.4.7.1 (L.O., S, 3.00, 2.30, NIVEL CORDÓN) coinciden exactamente.
4. **Búsqueda:** cada figura entra al índice como un fragmento más, con su descripción y sus rótulos («describe y embebe»). Una pregunta como «esquema de local semienterrado» encuentra el dibujo.
5. **Cita y muestra:**
   - cada fuente de `/api/chat` y `/api/retrieve` trae `figuras` (id, página, tipo, descripción y URL);
   - las imágenes se sirven en `GET /api/figura/<id>.png`; el id se valida y solo se aceptan nombres de figura;
   - el chat muestra «Figuras de la normativa citada» debajo de la respuesta, y el panel muestra miniaturas en cada fragmento;
   - el prompt indica que una medida que aparezca solo en la descripción de una figura no es un dato normativo: manda el texto del artículo.
6. **Prueba de punta a punta:** a la pregunta «ancho de pasillo para 40 personas y cuándo hace falta ensanchamiento», la respuesta es correcta (1,20 m; 1,10 m en lotes de hasta 8,66 m; círculo de 1,50 m), cita el art. 3.4.7.3 y muestra su figura.
7. **Examen:** 13/15 y MRR 0,628 con figuras; sin figuras, 0,583. No hubo retroceso.
8. **Para el despliegue:** los PNG ocupan 80 MB. Van a un volumen o a almacenamiento de objetos, no dentro de la imagen de Docker.

El mismo script sirve para los planos del Código Urbanístico. Para las planchetas, que son mapas con texto chico, se recorta por zonas antes de describir (ver 1.5).

**Gasto acumulado del presupuesto aprobado (USD 5):** alrededor de USD 1,80. Se va en las figuras (USD 1,67) y en los embeddings de las 6 corridas de índice (unos USD 0,14).

### Código Urbanístico: en curso (2026-11-09)

- **Extractor:** `ingest_v2/extraer_cur.py`. Cubre:
  - la prosa del cuerpo principal, ubicada con el índice del propio PDF: 231 de 234 entradas, y las 3 que faltan caen en páginas de tabla;
  - el Cuadro de Usos 3.3 (págs. 67–88) y los cuadros de depósitos (101–112), transcritos con visión y controlados contra la capa de texto;
  - los Anexos II y III, por área;
  - las filas ya extraídas de los dos cuadros;
  - los planos de los Anexos I, II y IV, como imagen de página con descripción.
- **Conectado sin costo:**
  - el CUR como tercer cuerpo normativo en el índice, las citas, el prompt y el chat;
  - la búsqueda exacta de artículo o rubro según el cuerpo que nombre la pregunta;
  - la imagen de la página del cuadro en cada fila citada;
  - el examen v1 (`eval/examen-v1.json`): v0 más 4 preguntas del CUR, todas «por revisar».
- **Dato para el cliente:** el texto consolidado ya incluye la ley modificatoria. Por ejemplo, cita «Art. 3.13.1.1 suprimido por el Art. 24 de la ley modificatoria, Boletín Oficial Nº 7026 del 26/12/2024». El PDF de la ley modificatoria sería redundante, pero lo tiene que confirmar el cliente.
- **Resultado de la carga** (relanzada a pedido de Mariano después de un corte por falta de memoria):

  | Parte | Estado |
  |---|---|
  | Tablas del cuerpo principal (32 págs.) | Todas transcritas. 371 rubros del Cuadro de Usos 3.3 y 85 del cuadro de depósitos, que reinicia la numeración y por eso va aparte. Control contra la capa de texto: ninguna página por debajo del 95 % |
  | Cruce de dos fuentes independientes del Cuadro de Usos | El cuerpo principal (transcrito hoy) contra la planilla «Usos y referencias» (extraída con otros dos modelos): **293 de 297 rubros idénticos (98,7 %)**. Difieren 2.3.11, 2.4.11, 6.1.5 y 6.2.20, que van a revisión. En el índice queda la versión del cuerpo principal |
  | Prosa del cuerpo principal (211 págs.) | Las 211 transcritas y controladas: mediana de coincidencia con la capa de texto 0,998. Las 6 páginas por debajo del umbral (1, 46, 176, 180, 182 y 244) usan la capa de texto. Las últimas 83 se hicieron con Claude Haiku 5.5 (ver «Qué modelo de visión usar») |
  | Planos (116 págs. de los Anexos I, II y IV) | Los 116 descritos: 6 con Gemini y 110 con Haiku, después de que Mariano cargara saldo. Cada plano se muestra en el chat junto a su cita |
  | Anexo II (608 págs.) | 227 áreas |
  | Anexo III | 101 de 166 fragmentos sin área. Las «Zona UP N» son un listado dentro del texto, no títulos |

- **Índice v2 completo:** 7.958 registros (CE, RT, CUR y 407 figuras), USD 0,041 en embeddings.
- **Examen v1** (19 preguntas): **17/19**, MRR 0,68.
  - Las 4 del CUR aciertan: el art. 3.13.1 en el puesto 1, el rubro 1.1 en el 2, el salón de milonga (rubro 2.4.4, con la imagen de su página) en el 1 y el Lago de Regatas en el 1.
  - Las 2 que fallan son del examen v0, «por revisar».
- **Carga terminada el 2026-11-09:** la última tanda (83 páginas de prosa y 110 planos) costó USD 0,14 con Haiku 5.5. Índice final: 8.060 registros, de los cuales 514 son figuras. Examen v1: 17/19, MRR 0,68.
- **Chat de punta a punta probado:**
  - «salón de milonga» responde con el rubro 2.4.4 (C, C, SI, SI, verificado contra la tabla) y muestra la imagen de la página 74;
  - «artículo 3.13.1» trae el artículo y menciona que la ley modificatoria suprimió el 3.13.1.1;
  - «plano de la Villa 20» trae el Plano Nº 2.1.1 con su imagen.
- **Gasto real:** según OpenRouter, esta clave gastó USD 5,89 en el día, de los que USD 1,85 son anteriores a la aprobación de los USD 5. Desde la aprobación: unos USD 4,04, más unos USD 0,25 de embeddings en OpenAI. Las estimaciones del script quedaban unos USD 0,40 por debajo, porque no cuentan las llamadas que ya estaban en curso al llegar al tope.
- **Pendiente:**
  - el Anexo III tiene 101 de 166 fragmentos sin área, porque sus zonas tienen otro formato («Zona UP 7»);
  - Catalogados (488 págs.) queda para la API de la Ciudad.

**Próximo dentro de la etapa 1:**
- búsqueda híbrida (palabras y significado);
- cortar las páginas de tabla de versiones de cada RT como metadato (versión y fecha de vigencia) en vez de fragmento;
- enlace a la página del PDF en cada cita.

## 7. Lo que hace falta de Mariano

1. Si el repo va a ser público, con qué nombre, y si se puede nombrar a el cliente.
2. Una o dos horas de un arquitecto de el cliente para revisar el examen.
3. Presupuesto de APIs para la ingesta, unos USD 10 (sección 3.5), y permiso para usar una base Postgres en el servidor.
4. Confirmar con el cliente que el texto consolidado al 31/12/2024 es el que usan, o si tienen uno más nuevo.
5. Si se quiere una demo pública, un dominio o subdominio para la demo.

## 8. Sin verificar

- Si la API de parcelas está al día con la ley modificatoria. Tampoco cuál de las dos fuentes oficiales manda cuando difieren (sección 1.4).
- Si hubo modificaciones al CUR posteriores a 2024 (no se pudo consultar el buscador del Boletín Oficial).
- La calidad de los modelos de visión sobre estas tablas y planos: se mide con una prueba de 10 páginas antes de procesar todo.
- Los costos: son estimaciones con los precios publicados en OpenRouter el 2026-11-09.

## Qué modelo de visión usar, y para qué (comparación del 2026-11-09)

**Para qué se usa.** El modelo de visión trabaja **una sola vez, durante la carga**: lee cada página escaneada o con texto roto y la convierte en texto, filas de tabla o una descripción del plano. Ese resultado se guarda y se indexa. Las imágenes recortadas se guardan como PNG y la interfaz las muestra junto a la cita (`/api/figura/<id>.png`). Al responder, el chat (DeepSeek V3.2, que no ve imágenes) lee el texto y las descripciones: no se paga visión por cada pregunta.

**Cómo se eligió.** Se pasaron las mismas páginas del CUR por 8 modelos y cada resultado se puntuó con una regla automática:

- **texto:** coincidencia de letras con la capa de texto del PDF, que trae bien las letras aunque no los espacios;
- **tablas:** filas idénticas a la extracción ya cruzada entre dos fuentes.

Muestra: 6 páginas de prosa y 2 de tablas. Costo de la prueba: USD 0,21.

| Modelo | Texto (promedio) | Texto (peor página) | Tablas | USD por página | Seg. por página |
|---|---|---|---|---|---|
| google/gemini-3.8-flash (el que se usaba) | 0,995 | 0,983 | 1,000 | 0,0115 | 19 |
| google/gemini-3.5-flash-lite | 0,995 | 0,983 | 1,000 | 0,0024 | 4 |
| **anthropic/claude-haiku-5.5** | **0,995** | **0,983** | **1,000** | **0,0009** | **6** |
| z-ai/glm-5.3-flash | 0,994 | 0,982 | 1,000 | 0,0013 | 22 |
| qwen/qwen3.7-flash | 0,957 | 0,773 | 1,000 | 0,0005 | 25 |
| openai/gpt-5-nano | 0,959 | 0,798 | 0,540 | 0,0025 | 71 |
| deepseek/deepseek-v4.1-flash | 0,958 | 0,777 | 1,000 | 0,0076 | 78 |
| google/gemini-2.5-flash-lite | 0,449 | 0,000 | 0,500 | 0,0001 | 14 |

**Elegido: Claude Haiku 5.5.** Es el más barato que no falla en ninguna página: la misma calidad que el modelo anterior, 12 veces más barato. Qwen sale la mitad, pero en una página perdió casi un cuarto del texto.

**Planos.** No tienen capa de texto (solo el sello), así que no hay control automático. Haiku describió los 5 planos ya hechos con el mismo contenido que Gemini (polígono, zonas, manzanas), a USD 0,00065 por plano. Además, cuando un rótulo no se lee lo dice en vez de inventarlo.

**Cómo buscar alternativas más baratas más adelante:**

1. Consultar precios en `https://openrouter.ai/api/v1/models`, filtrando los que aceptan imagen.
2. Correr la misma prueba con los candidatos (`python -I eval/comparar_modelos_vision.py`, después de editar la lista `MODELOS`).
3. Cambiar `--modelo` solo si el candidato iguala la peor página.

Las variantes `:batch` cuestan la mitad, pero son asíncronas.

## Examen v2: 44 preguntas (2026-11-09)

El examen pasó de 19 a **44 preguntas**:

| Cuerpo | Preguntas |
|---|---|
| Código de Edificación | 22 |
| Reglamentos Técnicos | 10 |
| Código Urbanístico | 12 |

**Cómo se armaron las 25 nuevas.** Se eligieron artículos útiles para habilitaciones comerciales: cocina, ventilación mecánica, salidas, panadería, gimnasio, patio gastronómico, fútbol 5, mixturas de usos, fachadas activas, balcones y planos. Se leyó cada uno en el texto antes de escribir la pregunta, y la pregunta se redactó sin copiar las palabras del artículo, para no facilitar la búsqueda. Todas quedan «por revisar» hasta que las valide un arquitecto. Cada una se armó a partir de un artículo concreto, así que el examen mide si la búsqueda encuentra el lugar correcto, no si la respuesta completa es correcta.

**Resultado con el índice v2 completo: 40/44 (91 %), MRR 0,767** (`eval/resultados/2026-11-09_v2_v2-CUR-completo.json`).

Las 4 que fallan:

- **ce-sanitario-pcd-cuando** y **ascensor-obligatorio** (del examen v0): no está claro cuál es el artículo correcto; lo tiene que decidir un arquitecto.
- **ce-cocina-requisitos:** la pregunta dice «local comercial» y la búsqueda trae el 3.8.1.3 (Gastronomía). Ese artículo regula la cocina de los locales gastronómicos y remite al 3.3.1.6.5, que es el esperado. Puede ser un error de la pregunta más que de la búsqueda. No se cambió la respuesta esperada después de ver el resultado: lo decide el arquitecto.
- **ce-dos-escaleras:** el art. 3.4.7.6 aparece entre el puesto 7 y el 9, según la corrida. Los artículos de escaleras (3.4.6.x, 3.4.7.8) lo tapan. Es una debilidad real de la búsqueda.

**Para el cliente:** revisar las 44 preguntas en el panel (`/panel`, pestaña Examen) y marcar cuáles están bien.

## Modelo de respuesta: DeepSeek V3.2 contra GPT-6 Luna y Claude Haiku 5.5 (2026-11-09)

**Cómo se probó.** Los tres modelos respondieron las mismas 44 preguntas del examen v2 con los mismos fragmentos recuperados (`eval/comparar_modelos_respuesta.mts`).

- **Controles automáticos:** si hubo error, si respetó el formato, si citó bien y si mencionó números de artículo o de RT que no están en el contexto.
- **Juez:** Gemini 3.8 Flash, de otra empresa que los tres modelos para no favorecer a ninguno. Revisó cada afirmación contra el contexto.
- **Revisión a mano:** se verificó cada error que marcó el juez.

| Modelo | Errores / formato | Errores graves verificados | Respaldo medio (juez) | USD por respuesta | Segundos (mediana) |
|---|---|---|---|---|---|
| deepseek/deepseek-v3.2 (actual) | 0 / 44 de 44 | **2**: dice que el gimnasio solo tiene límite de superficie en mixtura 1, pero el cuadro dice 1000 en la 2; y en la panadería pide solado «liso e impermeable», cuando la norma dice antideslizante | 0,984 | 0,00138 | 26 |
| anthropic/claude-haiku-5.5 | 0 / 44 de 44 | **1**: puertas de caja de escalera «F60 en todos los casos»; leyó mal la tabla aplanada, donde la columna de la caja llega a F90. El juez marcó un segundo error, en la milonga, que no lo es: es un condicional bien apoyado | 0,989 | 0,00143 | 8 |
| **openai/gpt-6-luna** | 0 / 44 de 44 | **0**. El control automático marcó «7,5 cm», que es la conversión correcta de 0,075 m | **1,000** | **0,00071** | **6** |

**Recomendación:** GPT-6 Luna como modelo principal y Claude Haiku 5.5 como respaldo, que es de otro proveedor y rápido. GPT-6 Luna:

- es el único sin errores;
- cuando el contexto no alcanza, lo dice (sanitario PcD, la «C» del cuadro);
- cuesta la mitad;
- es 4 veces más rápido.

Límites de la prueba: son 44 preguntas, hubo un solo juez y las preguntas todavía no las revisó un arquitecto. Gasto de la prueba: USD 0,15 en respuestas y USD 0,72 en el juez. El juez revisó también las 2 preguntas de la prueba de humo de los otros 7 modelos.

### Primer error de GPT-6 Luna en producción (2026-11-09)

Pregunta: «¿Cómo tienen que ser los baños?». En la primera respuesta en producción, Luna invirtió las columnas del cuadro del art. 3.5.2.1. Dijo «tipo I: 1,50 m² y lado mínimo de 3,00 m», cuando la norma dice lado 1,50 m y superficie 3,00 m².

Repetida 3 veces con cada modelo y el mismo contexto (USD 0,01), las 9 respuestas leyeron bien el cuadro. Es intermitente.

La causa es la misma que el «F60 en todas» de Haiku: el cuadro llega aplanado en el texto del PDF («Superficie Tipo de Local … Lado mínimo mínima … (m) (m 2 ) Baño tipo I 1,50 3,00») y el modelo tiene que adivinar qué número va con qué columna. Cambiar de modelo no lo arregla. Hay que reescribir los cuadros del CE y de los RT como filas con nombre de columna, como ya se hizo con el CUR (transcripción por visión, contrastada con la capa de texto).
