# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operator (primary for the panel):** the person who builds and runs Norma. Uses the creator panel to inspect ingested documents, review table verification, probe retrieval, read exam results and watch real queries. It must also present well in screenshots and live demos to technical recruiters and hiring engineers.
- **Demo visitor (primary for the chat page):** someone trying the agent through the standalone chat at `/`. The client firm's staff do not use this page day to day; they query Norma through a separate platform that calls the API.

## Product Purpose

Norma answers questions about building and zoning regulations and cites the exact article, table row or drawing behind every claim. Success is an answer a permit professional can verify in seconds against the original document.

## Positioning

The input is made trustworthy before the model sees it: tables are read three times (PDF grid, vision model, arbiter from another vendor) and a row is indexed only when two readings match cell by cell; what is not confirmed is shown as the original image, never transcribed. Every number in the project comes from a run committed to the repo.

## Operating Context

- Corpus: official regulation PDFs (building code, technical regulations, urban code), roughly 3,800 pages, in Spanish.
- The chat and panel are served by the same Node service (`src/server.ts`) as static HTML with inline CSS and JS (`public/index.html`, `public/panel.html`), no framework, no build step.
- The panel reads `/api/*` endpoints; some require an API key entered in the panel.

## Capabilities and Constraints

- Chat: streamed answers, a short summary then detail, numbered citations grouped by article, the exact source text, figures and original table images, a feedback form (thumbs, stars, comment).
- Panel tabs: Documents, Tables (Cuadros), Probe (Probador), Exam (Examen), Queries (Consultas).
- UI language is Spanish (rioplatense). The repo and README are in English.
- Jurisdiction (city, code names, prompt) is moving to configuration; surfaces must not hardcode a city name.
- Every current piece of information and function must survive a redesign.

## Brand Commitments

- Name: Norma.
- Visual direction chosen by the owner: a sober AI-product interface in the register of Linear and Vercel, one design system shared by chat and panel, light and dark, no emojis.

## Evidence on Hand

- Real metrics: 454 tables found, 329 verified (315 plus 14 text boxes), 27 partial, 98 image only, 2,044 rows confirmed; 44-question exam at 40/44, MRR 0.765; 8,466 index records.
- Real original table crops and drawings in `data/v2/figuras` (sample in `demo/data`).
- No client testimonials, usage figures or customer names may be shown or invented.

## Product Principles

1. Evidence stays in view: the exact text, the original table image and the citations are never hidden behind extra clicks.
2. A value that is not verified is not shown as text; the original is shown instead.
3. Every metric shown is traceable to a committed run.
4. Operate first: the panel is a working tool, and its clarity is what makes it demo well.
