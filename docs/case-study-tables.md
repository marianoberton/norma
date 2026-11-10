# Case study: the model swapped two columns, and the bug was in the data

*Norma, 2026-11-09. Numbers come from the runs logged in this repo.*

## The symptom

A user asked in production: "How do bathrooms have to be?" The answer model, GPT-6 Luna, replied that a type I bathroom needs "1.50 m² and a minimum side of 3.00 m". The Building Code (art. 3.5.2.1) says the opposite: side 1.50 m, area 3.00 m². For a firm that files permits, that is the kind of error that gets a plan rejected.

## The investigation

**Is it the model?** The same question, with the same retrieved context, was asked 3 times to each of the three candidate models. All 9 answers read the table correctly. The error was intermittent, which points away from "this model can't read" and towards "this model is being asked to guess".

**What does the model actually see?** The indexed text for that article was the PDF text layer:

```
Superficie Tipo de Local … Lado mínimo mínima … (m) (m 2 ) Baño tipo I 1,50 3,00
```

The table was flattened. The column headers are split and interleaved, and the numbers follow in reading order. Nothing in the text says which number belongs to which column, so the model infers it, and usually gets it right.

**Is it isolated?** No. In the earlier model comparison, Claude Haiku 5.5 had said that stair-enclosure doors are "F60 in all cases". The fire-rating table actually reaches F90 for that column; it had been flattened the same way. Two models, two tables, one root cause. **Switching models would not fix it.**

## Why not just "use a vision model"

The obvious fix is to have a vision model transcribe every table. A sweep across 377 pages showed why one reading is not enough:

- **Rotated text:** the PDF grid reads vertical labels backwards (`.srep 04/c 1` instead of `1 c/40 pers.`), while vision reads them fine.
- **Font mappings:** some glyphs come out of the text layer wrong (`MΩ` read as `Mɏ`).
- **Merged and multi-level headers:** vision models often merge a parent header with its sub-header, or drop an empty corner cell. The grid keeps the structure.
- **Vision models misread too:** they occasionally misread digits, skip rows, or invent a header (`?`).

No single source is trustworthy on every table. But they fail in **different** ways.

## The design: three readings, two must agree

1. **Grid:** PyMuPDF's `find_tables()` rebuilds the cells from the lines drawn in the PDF. It costs nothing and returns the exact characters. Merged cells are filled by the direction of their span.
2. **Vision:** Claude Haiku 5.5 transcribes the page image, at USD 0.001 per page.
3. **Arbiter:** Gemini, from another vendor, reads only the pages where the first two disagree.

**Rule.** A row is indexed only if two readings match **cell by cell**.

Normalization only absorbs typography: decimal comma vs dot, `²` vs `2`, words hyphenated across a line break. Two tolerances are structural, not numeric:
- a horizontally merged cell that one reading leaves empty and the other repeats;
- a header that one reading extends ("Rubro" vs "Rubro (subrubro)").

A changed digit is always a mismatch. A header is accepted if two readings match, or if the table continues a verified one on the next page.

**Output.** Every confirmed row is written with its column names:

```
Cuadro · Tipo de Local destinado a Servicio de Salubridad: Baño tipo I(In-Lo-Ba) · Lado mínimo (m): 1,50 · Superficie mínima (m2): 3,00
```

**What is not confirmed is not written.** The chunk says the table could not be verified, lists its columns and row labels so search still finds it, and the UI shows the cropped original. The system prompt tells the model to send the user to the image rather than complete the value. Chunking was changed to cut only between rows, so a chunk never starts in the middle of one.

## Iterating on the rule, with numbers

Each change was measured with `tablas_pdf.py decidir`, which runs offline once the readings are cached:

| Step | Verified | Partial | Image only | Rows confirmed |
|---|---|---|---|---|
| Grid + vision, first rules | 198 | 34 | 222 | 940 |
| Two-level headers detected in the grid | 196 | 34 | 224 | 923 |
| + Arbiter on the 196 disputed pages | 312 | 27 | 115 | 1,824 |
| Cell-by-cell comparison with merged cells, framed text boxes | 325 | 21 | 108 | 1,913 |
| Header extensions accepted | 329 | 27 | 98 | 2,044 |

*Verified includes framed text boxes (14 in the last two rows), which have no columns to misassign.*

The two-level header change made things slightly worse on its own. It only paid off once the arbiter could confirm the corrected headers. It stays in the table because the trade-off is the point: a change can be right and still need the next one to pay off. Every row can be re-run offline from the cached readings.

**Cost:** USD 0.38 for vision on 377 pages, plus USD 0.43 for the arbiter on 196 pages.

## Verification

- **Retrieval did not regress.** The 44-question exam stayed at 40/44, with MRR going from 0.767 to 0.765. Removing the flattened text did not cost a single question.
- **Answers.** The two questions that had failed were asked 3 times each to GPT-6 Luna and Claude Haiku 5.5. The values were right in all 12 answers: side and area were not swapped, and the stair doors came out F60/F90 by risk and fire load.
- **Unit tests** reproduce the real failures with synthetic fixtures ([`tests/test_cuadros.py`](../tests/test_cuadros.py)):
  - swapped columns must not match;
  - backwards rotated text must lose to two agreeing readings;
  - a single reading is never enough;
  - a headerless table with more than two columns is never transcribed.
- **Creator panel.** The Tables tab shows every table's status, the reading that won, the confirmed rows next to the original image, and the exact text that went into the index.

## What is still open

- **98 tables are image only.** Many are forms, version histories or very wide tables. The next step is a human review queue in the panel: approve a reading, and the row goes in.
- **No expert review yet.** The exam measures whether search finds the right article; an architect has not yet validated the expected answers.

## What I took from it

- When a model gets a fact wrong intermittently, look at what it was given before you change the model.
- A model that is forced to guess will sometimes guess wrong. The fix is to stop asking it to guess.
- In a regulated domain, "we don't have this value verified, here is the original" is a correct answer. A confident wrong number is not.
- Independent readings that fail in different ways beat one better reading. Agreement is cheap to check, and disagreement tells you exactly where to look.
