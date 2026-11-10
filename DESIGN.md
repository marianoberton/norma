---
name: Norma
description: A sober, evidence-first interface for a building-regulation assistant; one system shared by the operator panel and the public chat, in light and dark.
colors:
  bg: "#f6f7f8"
  surface: "#ffffff"
  sunk: "#f0f2f4"
  rail: "#f1f2f4"
  line: "#e3e6ea"
  line-2: "#cfd4da"
  text: "#15181d"
  text-2: "#3d434d"
  muted: "#626a77"
  accent: "#3451c7"
  accent-weak: "#eef1fd"
  ok: "#157347"
  ok-weak: "#e5f3ea"
  warn: "#9a5700"
  warn-weak: "#fbf0db"
  bad: "#b3261e"
  bad-weak: "#fbe8e6"
  paper: "#ffffff"
  bg-dark: "#0b0c0e"
  surface-dark: "#121417"
  sunk-dark: "#0e1013"
  rail-dark: "#0e1013"
  line-dark: "#24272d"
  line-2-dark: "#343840"
  text-dark: "#eceef1"
  text-2-dark: "#b9bec7"
  muted-dark: "#8c929c"
  accent-dark: "#93a6ff"
  accent-weak-dark: "#1a1f35"
  ok-dark: "#4fc58c"
  ok-weak-dark: "#0f261a"
  warn-dark: "#e3a54a"
  warn-weak-dark: "#2a1f0c"
  bad-dark: "#ff8077"
  bad-weak-dark: "#2d1513"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.011em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.011em"
  title-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.011em"
  lead:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: "-0.006em"
  body-chat:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"ss01\", \"cv11\""
  body-panel:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"ss01\", \"cv11\""
  reading:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.65
  small:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  data:
    fontFamily: "Geist Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  data-tag:
    fontFamily: "Geist Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "4px"
  sm: "6px"
  card-panel: "8px"
  card-chat: "10px"
  bubble: "14px"
  full: "999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  inset: "14px"
  block: "16px"
  section: "20px"
  gutter-panel: "36px"
  turn: "40px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.sunk}"
  button-small:
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
    height: "34px"
  nav-item:
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  block:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card-panel}"
  answer-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card-chat}"
    padding: "20px 22px 18px"
  table-header:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "9px 14px"
  row-selected:
    backgroundColor: "{colors.accent-weak}"
  article-tag:
    backgroundColor: "{colors.accent-weak}"
    textColor: "{colors.accent}"
    typography: "{typography.data-tag}"
    rounded: "{rounded.xs}"
    padding: "1px 6px"
  cite:
    backgroundColor: "{colors.accent-weak}"
    textColor: "{colors.accent}"
    typography: "{typography.data-tag}"
    rounded: "5px"
    padding: "0 5px"
    height: "18px"
  cite-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
  pill:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.full}"
    padding: "1px 8px"
  pill-ok:
    backgroundColor: "{colors.ok-weak}"
    textColor: "{colors.ok}"
  pill-warn:
    backgroundColor: "{colors.warn-weak}"
    textColor: "{colors.warn}"
  pill-bad:
    backgroundColor: "{colors.bad-weak}"
    textColor: "{colors.bad}"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.bubble}"
    padding: "8px 8px 8px 16px"
  send:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.card-chat}"
    size: "36px"
  plate:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "10px"
---

# Design System: Norma

## Overview

**Creative North Star: "The Evidence Desk"**

Norma is a working desk where the source document is always on the table. Every surface is arranged so that a claim and its proof sit side by side: the short answer above, the exact article text and the original table image directly beneath it; the list of tables on the left, the original scan and the rows that entered the index on the right. The interface itself stays quiet so that the regulation, its numbers and its scanned pages carry the visual weight. The register is the sober AI-product line of Linear and Vercel, chosen by the owner: cool grays, a single indigo accent, Geist, one-pixel hairlines, and no decoration that is not doing a job.

Density is that of an operating tool, not a marketing page. The panel runs at 14px body with tight tables, inline status and a fixed side rail; the chat opens up to 15px body in a 780px reading column. Both share one token set, one theme switch (stored as `norma-tema`) and the same marks for citations, article numbers and original images, so a screenshot of either reads as the same product. Light and dark are equal citizens; the scanned original stays on white paper in both.

The build rejects the dashboard of equal KPI tiles with big numbers, decorative capsules for status, and chat bubbles dressed in institutional ornament. Figures are a line of text, status is a dot and a word, and the answer is a document, not a bubble.

**Key Characteristics:**
- One indigo accent, spent only on things that point at evidence or show focus and selection.
- Primary actions are ink (text color on page color), never accent-filled.
- Hairline (1px) structure, tonal layers, and one soft shadow token.
- Original images on white paper in both themes; unverified values are shown as the original, never as text.
- Geist for language, Geist Mono only for data.
- Spanish (rioplatense) UI copy in sentence case; no emojis.

## Colors

A near-neutral, slightly cool gray field with one saturated indigo and three quiet status hues; every color has a light and a dark value, and the `-dark` siblings are applied both by `[data-theme="dark"]` and by `prefers-color-scheme: dark` when no theme is forced.

### Primary
- **Ledger Indigo** (`accent` / `accent-dark`): the only accent. Focus rings, the active nav icon, selected-row and open-source tint (via Indigo Wash), article tags, citation numbers, data bars in tables and probe scores, the closing rule step of the three-reading flow, and the "Preguntar por este cuadro" link. It never fills a primary action button.
- **Indigo Wash** (`accent-weak` / `accent-weak-dark`): the selection tint for rows and opened sources, the ground of article tags and citation chips, and the 3px focus halo on inputs and the composer.

### Neutral
- **Desk Gray** (`bg`): the page field. In dark, **Night Desk** (`bg-dark`).
- **Sheet White** (`surface`): blocks, the answer card, inputs, the active nav item and the selected theme segment.
- **Recessed Gray** (`sunk`): table headers, code, excerpt wells, the user's question, the sources tray, hover fills on secondary controls.
- **Rail Gray** (`rail`): the panel's side rail only.
- **Hairline** (`line`) and **Firm Hairline** (`line-2`): dividers and container borders; `line-2` for control borders, flow arrows and empty-state icons.
- **Ink** (`text`), **Graphite** (`text-2`), **Slate** (`muted`): primary text, secondary body (excerpts, answer detail), and labels, captions and metadata.
- **Plate White** (`paper`): the ground behind every original table crop and drawing. It has no dark sibling by design.

### Status
- **Confirmed Green** (`ok`, `ok-weak`): verified tables, the healthy-service dot, a first-place hit, a helpful rating, the sent-feedback confirmation. Text boxes ("Recuadro de texto") use the same green mixed 70% with `muted`, and 45% with `surface` in the composition bar.
- **Partial Amber** (`warn`, `warn-weak`): something was left out or needs review: partial tables, "sin artículo", "por revisar", rows dropped from the text, the not-helpful rating.
- **Failure Red** (`bad`, `bad-weak`): real failures only: a service error, a query that errored, an exam question whose article is not found ("no está").

### Named Rules
**The Ink Action Rule.** The primary button and the send button are ink on page color (`text` on `bg`), inverting with the theme. Accent marks evidence and focus; it never becomes the call to action.

**The White Plate Rule.** Original scans and drawings sit on `paper` (#ffffff) inside a hairline frame in both themes. Never invert, dim or blend an original into a dark surface; the plate is what a professional verifies against.

**The Neutral Original Rule.** "Solo imagen" is a gray status (`muted`; `muted` 55% on `surface` in the composition bar). Showing the original image is the designed outcome for an unconfirmed table, not an error, so it never takes amber or red.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui, Segoe UI)
**Body Font:** Geist, with stylistic sets `ss01` and `cv11` on
**Label/Mono Font:** Geist Mono (with ui-monospace, Cascadia Mono, Consolas), for data only

**Character:** One neutral grotesque carries every word, with tight negative tracking on headings; its mono sibling marks the things a reader copies or checks: article numbers, citation numbers, ids, scores, dates, counts and commands.

### Hierarchy
- **Display** (600, 30px, 1.2, -0.025em, balanced, max 26ch): the chat welcome heading only.
- **Headline** (600, 1.375rem, 1.25): the view title in each panel screen.
- **Title** (600, 16px, 1.35): detail headings and block titles in the panel; **Title small** (600, 14px) for block headers and flow step headings.
- **Lead** (500, 17px, 1.55): the short answer at the top of a chat response.
- **Body** (400, 15px/1.55 in chat; 14px/1.5 in the panel): the two surfaces keep their own base size; the panel is denser by design.
- **Reading** (400, 14.5px, 1.65): the answer's detail; source excerpts run 14px/1.7.
- **Small** (13px): table cells, notes, empty-state text, source summaries (13.5px in chat).
- **Label** (500, 12px, normal tracking, sentence case): table headers, evidence labels ("Original del PDF", "Así entra al índice"), status text, captions.
- **Data** (Geist Mono 400, 12px; tags 500, 11.5px): ids, article tags, citation chips, counts, scores, dates, code and keyboard keys.

Intro paragraphs under a view title hold to 78ch; the welcome paragraph to 62ch; empty-state text to 44ch. Numbers in tables and stats use tabular figures.

### Named Rules
**The Data-Only Mono Rule.** Mono is for values a reader checks or copies: article numbers, citation numbers, ids, scores, dates, counts, code. Labels, headings, buttons, status words and navigation are always Geist.

**The Heading Speaks Rule.** No small label sits above a heading. When order matters, the number goes inside the heading itself ("1 · Grilla del PDF", "2 · Visión", "3 · Árbitro"), and a conclusion is written into the heading ("Entra al índice: dos de tres").

## Layout

**Panel.** A two-column grid: a fixed 232px side rail and a fluid main column (padding 28px top, 36px sides, 72px bottom). Each view is a vertical stack with 20px gaps, capped at 1760px. A view opens with its title and one explanatory paragraph, then the stat line, then the working blocks. Master and detail sit side by side from 1280px (list `minmax(440px, 5fr)`, detail `7fr`); below that they stack and the detail scrolls into view on selection. Inside the detail, the evidence pair (original on the left, confirmed rows and index text on the right) splits into two columns when the detail container itself reaches 1180px (a container query, not a viewport query). At 860px and below the rail becomes a sticky horizontal top bar (brand and nav only; counts, theme and key field hide), main padding drops to 20px/16px, and the three-reading flow stacks vertically with its arrows rotated down.

**Chat.** A 56px top bar (content capped at 1080px), a scrolling conversation in a 780px column (padding 40px 24px), and the composer pinned in the footer at the same width. Turns are 40px apart; the question sits right-aligned above the answer. At 640px and below the subtitle and model name hide, and the sample-table card stacks image over text.

**Rhythm.** Spacing runs on small, even steps: 2px inside segmented controls and nav lists, 8px between controls, 12–16px block insets, 20px between blocks in a view, 40px between chat turns. Tight inside a group, generous between groups.

### Named Rules
**The One Stat Line Rule.** Figures are a single wrapping line of text: a bold tabular number followed by its words ("454 cuadros encontrados"), 22px apart. Never equal tiles, never a big-number hero.

## Elevation & Depth

Depth is mostly tonal: page (`bg`), sheet (`surface`), recess (`sunk`), with 1px hairlines doing the structural work. A single soft shadow token lifts top-level containers (panel blocks, the answer card, the welcome list, the sample card, the composer); it carries a real offset and blur and darkens for the dark theme. Rings are not depth: focus is a 2px accent outline at 2px offset, input focus a 3px `accent-weak` halo, and the active nav item a 1px `line` ring with a hairline drop.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 1px 2px rgb(16 24 40 / .05), 0 4px 12px -4px rgb(16 24 40 / .08)`; dark: `0 1px 2px rgb(0 0 0 / .4), 0 8px 24px -8px rgb(0 0 0 / .6)`): top-level containers at rest; also the hover lift on chat figures.
- **Active item** (`box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(0 0 0 / .04)`): the current nav item and selected theme segment.

### Named Rules
**The One Shadow Rule.** There is one shadow token. Nested elements (tables, excerpt wells, figures, notes) are framed by hairlines and tone, never by a second shadow.

## Shapes

Gently rounded, never pill-shaped except for inline flags. Small marks (code, article tags, keycaps, skeleton bars) use 4px; controls, inner wells, notes and figures 6px; top-level containers 8px in the panel and 10px in the chat (the chat's softer card is a deliberate per-surface value, not drift to be "fixed" toward one number). The composer and the user's question use 14px; the question bubble drops to 4px at its bottom-right corner, toward the speaker. Data bars and the composition bar round at half their height. Borders are always 1px; the only vertical rule is the 1px divider before the flow's closing step.

## Components

### Buttons
Quiet, compact and ink-colored.
- **Shape:** gently curved (6px), 34px tall in the panel, 36px in the chat.
- **Primary:** ink background, page-color text, 500 weight, 14px horizontal padding. Hover drops opacity to 0.88; disabled to 0.45 (0.4 in chat).
- **Secondary:** sheet background with an inset 1px `line-2` ring; hover fills with `sunk`.
- **Small:** 28px tall, 10px padding, 12px text; used for pagination ("Anteriores", "Siguientes").
- **Icon button:** 32px square, muted icon, `sunk` on hover (chat theme toggle). **Send:** 36px ink square at 10px radius with an up arrow.

### Chips and tags
- **Article tag:** "art. 3.5.2.1" in data-tag mono, accent on Indigo Wash, 4px radius. The same mark in panel rows, chat sources and the sample card.
- **Citation chip:** a bracket-free number in data-tag mono, accent on Indigo Wash, 18px tall; hover fills solid accent. It is a button: click or Enter opens and scrolls to its source group.
- **Pill:** a 999px-radius inline flag for a row-level fact ("figura", "por revisar", "sin artículo", "no está", a query type, an exam rank). Neutral by default (`sunk` with hairline), or colored ok / warn / bad with no border.

### Status
- **Record state:** a 7px dot in `currentColor` followed by the state word, 12px/500 ("Verificado", "Recuadro de texto", "Parcial", "Solo imagen"). No capsule.
- **Service state:** a 7px dot that gains a 3px `ok-weak` ring when the index is healthy, with the record count beside it.

### Cards / Containers
- **Corner Style:** 8px (panel blocks), 10px (chat answer, welcome list, sample card).
- **Background:** `surface`, with a 1px `line` border and the Sheet shadow; content clips to the radius.
- **Header row:** 12px/16px padding, a 14px title, actions or a muted count right-aligned, a hairline below.
- **Internal Padding:** 14–18px in the panel, 20px/22px in the answer card.

### Tables
- Header cells in Label type on `sunk`, sticky to the top; body cells 13px with 9px/14px padding and hairline row dividers.
- Numeric columns right-aligned with tabular figures; a percentage may carry a 96×6px inline data bar in accent beside its number.
- Clickable rows tint to 4% accent on hover; the selected row is Indigo Wash. **Selection is tint only:** no stripe, no colored edge.
- A row's secondary line (document, page, article) sits under the title in Data mono or 12px muted.
- In the exam table, bold marks the best value in each column (highest hit rate and MRR, lowest median latency), and the latest run carries the selected tint.

### Inputs / Fields
- **Style:** sheet background, 1px `line-2` border, 6px radius, 34px min height, 7px/10px padding; search fields carry a 16px muted magnifier inset at 10px.
- **Focus:** border turns accent with a 3px Indigo Wash halo. The chat composer applies the same treatment to the whole 14px-radius shell via `:focus-within`.

### Navigation
- **Panel rail:** brand mark and name on top; vertical 500-weight items with a 16px stroke icon, 7px/10px padding, 2px apart. Hover fills with `text` at 6%; the current item becomes a sheet with the Active item ring and an accent icon; a muted mono count sits right-aligned. The rail foot holds the service state, a three-way segmented theme control ("Claro / Sistema / Oscuro") and the API key field.
- **Chat header:** brand, a hairline separator, the subtitle, then right-aligned model name, service state and theme toggle; a 1px bottom hairline.

### Notices and empty states
- **Notice:** 13px text with an alert icon, 6px radius, 10px/12px padding; amber wash for rows left out of the text, red wash (`err`) for service failures. Copy names the problem and the recovery.
- **Empty state:** centered 28px stroke icon in `line-2`, a 500-weight one-line title in Ink, and up to 44ch of muted guidance (often with the command or file to run).
- **Loading:** skeleton bars in `sunk` with a 1.2s shimmer, shaped like the rows they replace; the streaming answer shows a blinking 7px accent caret.

### The Evidence Pair (signature)
The table detail places **Original del PDF** (the crop on a White Plate, max 440px tall) beside **Filas confirmadas por dos lecturas** (a bordered table) and **Así entra al índice** (the exact indexed text in a mono well). Each part is introduced by a 12px label with a 16px icon. When no row was confirmed, the right side carries no transcription, only the explanation, and the original stands alone.

### The Three-Reading Flow (signature)
An ordered list of four steps separated by 22px hairline arrows: three readings, then the rule. Each step is a 14px heading with its order inside it and a 12px muted explanation; the closing step is set off by a 1px left divider, its heading in accent and its text in Graphite. Below 860px it stacks and the arrows point down.

### Answer and sources (chat)
The answer card holds the Lead summary, the Reading detail with inline citation chips, and a "Respondido por" line; below it, the sources tray (`sunk`) lists each article as a disclosure row: citation numbers in mono accent, a 7px document marker, the topic, the article tag, a figure count and a chevron. The group that holds citation 1 opens by default; an open row takes Indigo Wash. Excerpts sit in a recessed well (max 340px, scrolling); figures in a 160px-min grid on White Plates. A feedback strip (Sí / No, five stars, optional comment, ink submit) closes the card.

### Motion
State changes fade in 0.12–0.15s (background, color, border, shadow). The one authored moment is a chat turn entering: 0.25s, `cubic-bezier(.16, 1, .3, 1)`, rising 6px from transparent. Arrows nudge 2px on hover. `prefers-reduced-motion` removes the entrance, the shimmer and all transitions.

## Do's and Don'ts

### Do:
- **Do** keep evidence in view: the exact text, the original image and the citation number travel together, at most one click from the claim.
- **Do** put every original table crop and drawing on the White Plate (#ffffff, hairline frame) in both themes.
- **Do** report figures as one stat line of bold tabular numbers with words.
- **Do** show record state as a 7px dot and a word; use colored pills only for inline row flags.
- **Do** mark selection with the Indigo Wash tint alone.
- **Do** keep primary actions ink and spend accent on focus, selection and evidence marks.
- **Do** use drawn SVG icons: 16px, 1.6 stroke, round caps and joins, `currentColor`.
- **Do** define every color on `:root` and its dark value in both `[data-theme="dark"]` and the `prefers-color-scheme: dark` block guarded by `:not([data-theme="light"])`.

### Don't:
- **Don't** build equal KPI tiles or a big-number hero; figures belong in the stat line.
- **Don't** add a colored stripe or edge to selected rows, list items or notes; the only vertical rule in the system is a 1px hairline.
- **Don't** color "Solo imagen" amber or red anywhere it appears as a status, legend or bar segment.
- **Don't** set labels, headings, buttons, status words or navigation in mono.
- **Don't** place a small label or kicker above a heading; write the order or the conclusion into the heading.
- **Don't** fill a button with accent or introduce a second accent hue.
- **Don't** invert or darken original images in dark mode.
- **Don't** use emojis or Unicode glyphs as icons.
- **Don't** transcribe an unverified table value as text; show the original instead.
