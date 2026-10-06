import type { FormulaEntry, FormulaIndex, Rect } from "@exam/core";
import { joinWrapped } from "../catalog/rows.ts";
import { joinRuns, type Line } from "../layout/lines.ts";
import { extractPage } from "../pdf/page.ts";
import type { PdfDocument, PdfJs, TextRun } from "../pdf/types.ts";

// The Formelsammlung is a table: name | formula | symbol legend. Column
// positions differ between pages and are detected per page.
const NAME_X = 40;
const FOOTER_TOP = 65;
const PAGE_TITLE_SIZE = 13.5;
const CHAPTER_MIN_SIZE = 11.5;

interface Draft {
  chapter: string;
  page: number;
  printedPage?: number;
  top: number;
  bottom: number;
  title: string[];
  lastTitleY: number;
  formula: string[];
  legend: string[];
}

/** Indexes the rows of the formula collection so questions can link to them. */
export async function importFormulas(pdfjs: PdfJs, doc: PdfDocument): Promise<FormulaIndex> {
  let version: string | null = null;
  let chapter = "";
  const drafts: Draft[] = [];

  // Page 1 is the cover with instructions.
  for (let p = 2; p <= doc.numPages; p++) {
    const page = await extractPage(pdfjs, doc, p);
    if (page.lines.some((l) => /^Herausgeber/.test(l.plain))) break; // imprint
    const { nameEnd, legendStart } = columns(page.lines, page.width);
    const onPage: Draft[] = [];
    const printed = page.lines.map((l) => /Seite\s+(\d+)\s*\/\s*\d+/.exec(l.plain)?.[1]).find(Boolean);
    let current: Draft | null = null;
    const close = (bottom: number) => {
      if (current) current.bottom = Math.max(current.bottom, bottom);
      current = null;
    };

    for (const line of page.lines) {
      if (line.y < FOOTER_TOP) {
        version ??= /Version\s+([^)]+)\)/.exec(line.plain)?.[1]?.trim() ?? null;
        continue;
      }
      if (line.size >= PAGE_TITLE_SIZE) continue;
      if (line.x0 < 31 && line.size >= CHAPTER_MIN_SIZE) {
        close(line.y + line.size);
        chapter = line.plain;
        continue;
      }
      if (!chapter) continue; // instructions before the first chapter

      const name = text(line, line.runs.filter((r) => r.x < nameEnd));
      const formula = text(line, line.runs.filter((r) => r.x >= nameEnd && r.x < legendStart));
      const legend = text(line, line.runs.filter((r) => r.x >= legendStart));

      const draft: Draft | null = current;
      // Title lines of one row are ≤ ~2× the font size apart; an open bracket always continues.
      const gap = draft ? draft.lastTitleY - line.y : Infinity;
      const continuesTitle =
        draft !== null && (gap <= line.size * 2.6 || (gap <= line.size * 4 && unbalanced(draft.title.join(" "))));
      if (name && !continuesTitle) {
        close(line.y + line.size * 1.2);
        current = {
          chapter,
          page: p,
          top: line.y + line.size * 1.2,
          bottom: FOOTER_TOP,
          title: [name],
          lastTitleY: line.y,
          formula: [],
          legend: [],
        };
        onPage.push(current);
      } else if (name && draft) {
        draft.title.push(name);
        draft.lastTitleY = line.y;
      }
      const target: Draft | null = current;
      if (!target) continue;
      if (formula) target.formula.push(formula);
      if (legend) target.legend.push(legend);
    }
    // Each row ends where the next one starts; the last one at the footer.
    onPage.forEach((d, i) => {
      d.bottom = onPage[i + 1]?.top ?? FOOTER_TOP;
      if (printed) d.printedPage = Number(printed);
    });
    drafts.push(...onPage);
  }

  const used = new Set<string>();
  const entries = drafts.map((d): FormulaEntry => {
    const title = d.title.reduce((a, b) => (a ? joinWrapped(a, b) : b), "");
    let id = `${slug(d.chapter)}/${slug(title)}`;
    for (let n = 2; used.has(id); n++) id = `${slug(d.chapter)}/${slug(title)}-${n}`;
    used.add(id);
    const rect: Rect = [28, d.bottom, 567, d.top];
    return {
      id,
      chapter: d.chapter,
      title,
      region: { page: d.page, rect },
      ...(d.printedPage !== undefined && { printedPage: d.printedPage }),
      symbols: parseLegend(d.legend),
      text: [...d.formula, ...d.legend].join("\n"),
    };
  });
  return { version, entries };
}

/** Column boundaries of the table on one page. */
function columns(lines: Line[], width: number): { nameEnd: number; legendStart: number } {
  // The name column ends after its widest text; names start at the left margin.
  const nameRuns = lines
    .filter((l) => !(l.x0 < 31 && l.size >= CHAPTER_MIN_SIZE) && l.y >= FOOTER_TOP)
    .flatMap((l) => l.runs.filter((r) => r.x < NAME_X && r.str.trim()));
  const nameEnd = Math.max(width * 0.2, ...nameRuns.map((r) => r.xEnd)) + 3;
  // Legend lines start with "Symbol:".
  let legendStart = width * 0.66;
  for (const l of lines) {
    const right = l.runs.filter((r) => r.x > width * 0.55 && r.str.trim());
    const head = right.slice(0, 4).map((r) => r.str).join("");
    if (right[0] && /^[^:]{1,14}:/.test(head)) legendStart = Math.min(legendStart, right[0].x - 1);
  }
  return { nameEnd, legendStart };
}

const unbalanced = (s: string) => (s.match(/\(/g)?.length ?? 0) > (s.match(/\)/g)?.length ?? 0);

function text(line: Line, runs: TextRun[]): string {
  const real = runs.filter((r) => r.str.trim());
  return real.length ? joinRuns(real, line).text.trim() : "";
}

/** "Q: Wärmemenge [Wh]" lines, with wrapped descriptions continuing on the next lines. */
function parseLegend(lines: string[]): FormulaEntry["symbols"] {
  const symbols: FormulaEntry["symbols"] = [];
  for (const l of lines) {
    const m = /^([^:]{1,24}?)\s*:\s*(.*)$/.exec(l);
    if (m && !/\s{2,}/.test(m[1]!)) symbols.push({ symbol: m[1]!.trim(), description: m[2]!.trim() });
    else if (symbols.length) symbols.at(-1)!.description = joinWrapped(symbols.at(-1)!.description, l.trim());
  }
  return symbols;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[_^]\{([^}]*)\}/g, "$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
