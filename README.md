# Prüfungstrainer Energieberatung

Exam trainer for the BAFA *Qualifikationsprüfung Energieberatung*
(Wohngebäude and Nichtwohngebäude), modelled on driving-test apps.

## BAFA content stays out of this repository

BAFA states that the practice questions and the Formelsammlung must not be
changed or reproduced without its consent. So this repository contains **no
BAFA content**. The app imports the PDFs that the user downloads from
[bafa.de/qpeb](https://www.bafa.de/DE/Energie/Energieberatung/Qualifikationspruefung_Energieberatung/qualifikationspruefung_energieberatung_node.html)
on their own device. For development, put the PDFs into `private/pdfs/`
(git-ignored):

| File | BAFA document |
|---|---|
| `wg1.pdf`, `wg2.pdf`, `wg3.pdf` | Übungsfragen Wohngebäude Teil 1–3 |
| `nwg1.pdf`, `nwg2.pdf`, `nwg3.pdf` | Übungsfragen Nichtwohngebäude Teil 1–3 |
| `formelsammlung.pdf` | Formelsammlung |

## Structure

```
packages/core        data model (Question, Gap, FormulaEntry …), text helpers
packages/importer    PDF → questions / formula index (pdf.js; runs in browser and Node)
tools/browser-smoke  runs the importer in headless Chromium, compares with the Node import
tools/dev            review helpers (pretty-print, random audit, compare two imports)
private/             git-ignored: PDFs, imports, golden snapshots
```

## How the importer works

The catalogues are interactive PDF forms. pdf.js provides the static text,
the form fields and their options. The official solution of each question is
the icon of a hidden button, and its text is reconstructed from the drawing
operators (`pdf/annotationText.ts`).

1. **Layout** (`layout/lines.ts`): text runs → lines, with sub/superscripts as `R_{si}` / `m^{2}`.
2. **Segmentation** (`catalog/segment.ts`): pages → questions (header "Frage N: … (code)",
   body, "Lösung anzeigen" buttons, solutions; multi-part questions included).
   Field names in the PDFs are often stale, so everything is matched by position.
3. **Rows** (`catalog/rows.ts`): fields are attached to the text they belong to
   (inline gaps, or answer columns centred on multi-line statements).
4. **Answers** (`catalog/answers.ts`): the PDFs contain no answer key, only solution
   text. A cascade of strategies (statement → verdict lists, inline alignment of cloze
   texts, tables, calculation results by unit, unique mentions) derives the
   answers. Anything ambiguous stays `null` and is listed in `issues`; the app
   then lets the learner judge that part themselves against the official solution.
5. **Formula index** (`formulas/index.ts`): rows of the Formelsammlung with a
   stable id, page area and symbol legend, so questions can link to them.

Current state (BAFA version 01.07.25): 1,301 questions, of which 92% have a
fully derived answer key. Random samples were checked by hand against the
official solutions. 90 formula rows are indexed.

## Commands

```sh
npm test                                   # unit tests + integration tests (if private/pdfs exists)
npm run typecheck
npm run smoke:browser -- nwg1.pdf          # import in headless Chromium
npm run import -- report private/pdfs/*.pdf --verbose
npm run import -- show private/pdfs/nwg1.pdf 1.1.1.07 | python3 tools/dev/fmt.py
npm run import -- import private/out private/pdfs/*.pdf
npm run import -- formulas private/pdfs/formelsammlung.pdf
```

Integration tests store their answer-key snapshots in `private/golden/`. After an
importer change, compare with `tools/dev/compare.py` and, if the differences are
improvements, update them with `npx vitest run -u`.

## Known limitations

- Questions whose solution is only prose (e.g. "Abbildung 1 zeigt …") or whose
  values aren't stated as `= result` remain without a derived answer (~8%).
- Typeset formulas in some solutions extract as approximate text; these questions
  are flagged with `preferOriginal`, and the app should show the PDF rendering.
- The formula table's rows are detected from text layout; a few neighbouring
  rows on the "Heizlast" and "Lüftung" pages are merged into one entry.
