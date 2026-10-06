import { joinRuns, type Line } from "../layout/lines.ts";
import type { TextRun, WidgetData } from "../pdf/types.ts";
import type { BodyItem } from "./segment.ts";

export type Cell =
  | { kind: "text"; x: number; xEnd: number; text: string; plain: string }
  | { kind: "field"; x: number; xEnd: number; field: WidgetData };

/** One visual row of a question body: text interleaved with form fields. */
export interface BodyRow {
  page: number;
  /** Baseline (or field bottom for field-only rows). */
  y: number;
  top: number;
  bottom: number;
  x0: number;
  size: number;
  cells: Cell[];
}

/** Max. baseline distance (in font sizes) between lines of one paragraph. */
const PARAGRAPH_LINE_SPACING = 1.32;
/** Aligned fields starting right of this x without text after them form a right-hand answer column. */
const ANSWER_COLUMN_X = 250;

/**
 * Attaches form fields to text and splits the text into cells.
 *
 * - Inline fields (text continues to their right) belong to the line they sit on.
 * - Fields in a right-hand answer column ("Statement … [Richtig/Falsch]") are
 *   vertically centred on multi-line statements, so they belong to a paragraph.
 */
export function buildRows(body: BodyItem[]): BodyRow[] {
  const rows: BodyRow[] = [];
  const pages = [...new Set(body.map((i) => i.page))];
  for (const page of pages) {
    const lines = body.flatMap((i) => (i.kind === "line" && i.page === page ? [i.line] : []));
    const fields = body.flatMap((i) => (i.kind === "field" && i.page === page ? [i.field] : []));

    const fieldsByLine = new Map<Line, WidgetData[]>();
    const attach = (line: Line, f: WidgetData) => fieldsByLine.set(line, [...(fieldsByLine.get(line) ?? []), f]);
    const column: WidgetData[] = [];
    const loose: WidgetData[] = [];
    // An answer column has several fields aligned at the same x.
    const inColumn = (f: WidgetData) =>
      f.rect[0] > ANSWER_COLUMN_X && fields.some((o) => o !== f && Math.abs(o.rect[0] - f.rect[0]) < 4);
    for (const f of fields) {
      const line = bandLine(f, lines);
      const textAfter = line?.runs.some((r) => r.x >= f.rect[2] - 1) ?? false;
      if (line && textAfter) attach(line, f);
      else if (inColumn(f)) column.push(f);
      else if (line) attach(line, f);
      else loose.push(f);
    }

    const paragraphFields = new Map<Line[], WidgetData[]>();
    if (column.length) {
      const paragraphs = buildParagraphs(lines.filter((l) => !fieldsByLine.has(l)));
      for (const f of column) {
        const p = nearestParagraph(f, paragraphs);
        if (p) paragraphFields.set(p, [...(paragraphFields.get(p) ?? []), f]);
        else {
          const line = bandLine(f, lines);
          if (line) attach(line, f);
          else loose.push(f);
        }
      }
    }
    const inParagraph = new Set([...paragraphFields.keys()].flat());

    for (const [paragraph, pFields] of paragraphFields) {
      pFields.sort((a, b) => a.rect[0] - b.rect[0]);
      const first = paragraph[0]!;
      const last = paragraph.at(-1)!;
      let text = "";
      let plain = "";
      for (const l of paragraph) {
        text = text ? joinWrapped(text, l.text) : l.text;
        plain = plain ? joinWrapped(plain, l.plain) : l.plain;
      }
      rows.push({
        page,
        y: first.y,
        top: Math.max(first.y + first.size * 0.8, ...pFields.map((f) => f.rect[3])),
        bottom: Math.min(last.y - last.size * 0.25, ...pFields.map((f) => f.rect[1])),
        x0: Math.min(...paragraph.map((l) => l.x0)),
        size: first.size,
        cells: [
          { kind: "text", x: first.x0, xEnd: Math.max(...paragraph.map((l) => l.x1)), text, plain },
          ...pFields.map((field): Cell => ({ kind: "field", x: field.rect[0], xEnd: field.rect[2], field })),
        ],
      });
    }

    for (const line of lines) {
      if (inParagraph.has(line)) continue;
      const lineFields = (fieldsByLine.get(line) ?? []).sort((a, b) => a.rect[0] - b.rect[0]);
      const top = Math.max(line.y + line.size * 0.8, ...lineFields.map((f) => f.rect[3]));
      const bottom = Math.min(line.y - line.size * 0.25, ...lineFields.map((f) => f.rect[1]));
      rows.push({
        page,
        y: line.y,
        top,
        bottom,
        x0: Math.min(line.x0, ...lineFields.map((f) => f.rect[0])),
        size: line.size,
        cells: splitLine(line, lineFields),
      });
    }

    // Fields without text on their line (e.g. a row of input boxes) form their own rows.
    const looseRows: WidgetData[][] = [];
    for (const f of loose.sort((a, b) => b.rect[1] - a.rect[1])) {
      const row = looseRows.find((r) => Math.abs(r[0]!.rect[1] - f.rect[1]) < 3);
      if (row) row.push(f);
      else looseRows.push([f]);
    }
    for (const r of looseRows) {
      r.sort((a, b) => a.rect[0] - b.rect[0]);
      rows.push({
        page,
        y: r[0]!.rect[1] + 4,
        top: Math.max(...r.map((f) => f.rect[3])),
        bottom: Math.min(...r.map((f) => f.rect[1])),
        x0: r[0]!.rect[0],
        size: 12,
        cells: r.map((field) => ({ kind: "field", x: field.rect[0], xEnd: field.rect[2], field })),
      });
    }
  }
  return rows.sort((a, b) => a.page - b.page || b.y - a.y || a.x0 - b.x0);
}

/** The line whose baseline lies within the field's vertical extent (closest to its text baseline). */
function bandLine(f: WidgetData, lines: Line[]): Line | undefined {
  const [, y0, , y1] = f.rect;
  let best: Line | undefined;
  let bestDist = Infinity;
  for (const l of lines) {
    if (l.y < y0 - 1.5 || l.y > y1 + 1.5) continue;
    const dist = Math.abs(l.y - (y0 + 4));
    if (dist < bestDist) {
      best = l;
      bestDist = dist;
    }
  }
  return best;
}

function buildParagraphs(lines: Line[]): Line[][] {
  const paragraphs: Line[][] = [];
  for (const line of [...lines].sort((a, b) => b.y - a.y)) {
    const current = paragraphs.at(-1);
    const prev = current?.at(-1);
    if (
      prev &&
      prev.y - line.y <= line.size * PARAGRAPH_LINE_SPACING &&
      Math.abs(prev.x0 - line.x0) < 8 &&
      !prev.text.includes("\t") &&
      !line.text.includes("\t")
    ) {
      current!.push(line);
    } else paragraphs.push([line]);
  }
  return paragraphs;
}

/** The paragraph left of the field whose vertical extent contains (or is closest to) the field's centre. */
function nearestParagraph(f: WidgetData, paragraphs: Line[][]): Line[] | undefined {
  const cy = (f.rect[1] + f.rect[3]) / 2;
  let best: Line[] | undefined;
  let bestDist = Infinity;
  for (const p of paragraphs) {
    if (p.some((l) => l.x1 > f.rect[0] + 2)) continue;
    const top = p[0]!.y + p[0]!.size * 0.8;
    const bottom = p.at(-1)!.y - p.at(-1)!.size * 0.25;
    const dist = cy > top ? cy - top : cy < bottom ? bottom - cy : 0;
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best && bestDist < (best[0]!.size ?? 12) * 1.2 ? best : undefined;
}

export function joinWrapped(a: string, b: string): string {
  // "rela-" + "tiven" → "relativen"; "Wasserdampf-" + "Diffusion" keeps the hyphen.
  if (/[a-zäöüß]-$/.test(a) && /^[a-zäöüß]/.test(b)) return a.slice(0, -1) + b;
  if (/-$/.test(a) && /^[A-ZÄÖÜ]/.test(b)) return a + b;
  return `${a} ${b}`;
}

function splitLine(line: Line, fields: WidgetData[]): Cell[] {
  const slots: TextRun[][] = fields.map(() => []);
  slots.push([]);
  for (const run of line.runs) {
    const mid = (run.x + run.xEnd) / 2;
    const slot = fields.filter((f) => (f.rect[0] + f.rect[2]) / 2 <= mid).length;
    slots[slot]!.push(run);
  }
  const cells: Cell[] = [];
  slots.forEach((runs, i) => {
    if (runs.length) {
      const { text, plain } = joinRuns(runs, line);
      if (plain) {
        cells.push({ kind: "text", x: runs[0]!.x, xEnd: Math.max(...runs.map((r) => r.xEnd)), text, plain });
      }
    }
    const f = fields[i];
    if (f) cells.push({ kind: "field", x: f.rect[0], xEnd: f.rect[2], field: f });
  });
  return cells;
}

export const rowText = (row: BodyRow): string =>
  row.cells.map((c) => (c.kind === "text" ? c.text : "")).join(" ").trim();

export const rowPlain = (row: BodyRow): string =>
  row.cells.map((c) => (c.kind === "text" ? c.plain : "")).join(" ").trim();

export const hasFields = (row: BodyRow): boolean => row.cells.some((c) => c.kind === "field");
