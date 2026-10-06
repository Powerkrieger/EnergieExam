import type { CatalogId, Gap, Interaction, PageRegion, Part, Question, Rect, Row, Segment } from "@exam/core";
import type { WidgetData } from "../pdf/types.ts";
import { resolveAnswers } from "./answers.ts";
import { type BodyRow, type Cell, buildRows, hasFields, joinWrapped } from "./rows.ts";
import type { RawQuestion } from "./segment.ts";

export interface PageSize {
  width: number;
  height: number;
}

/** Vertical whitespace (pt) inside a question body that is treated as a figure. */
const FIGURE_MIN_GAP = 36;
const PAGE_TOP_MARGIN = 25;
const PAGE_BOTTOM_MARGIN = 30;

export function buildQuestion(raw: RawQuestion, catalog: CatalogId, pages: Map<number, PageSize>): Question {
  const issues = [...raw.issues];
  const code = raw.code ?? `?${raw.header.page}-${raw.number}`;
  const part = Number(code.split(".")[0]);
  if (part !== 1 && part !== 2 && part !== 3) issues.push(`Unerwarteter Teil im Fragencode: ${code}`);

  const rows = buildRows(raw.body);
  const { interaction, stem } = buildInteraction(rows, issues);
  const solutionLines = raw.solutions.flatMap((s) => s.lines);
  const solution = solutionLines.map((l) => l.text);
  resolveAnswers(interaction, solution, stem, issues);

  const { source, figures } = regions(raw, rows, pages);
  const question: Question = {
    key: `${catalog}/${code}`,
    catalog,
    part: (part >= 1 && part <= 3 ? part : 1) as Part,
    code,
    number: raw.number,
    chapter: raw.chapter,
    topic: raw.topic,
    stem,
    interaction,
    solution,
    source,
    solutionSource: raw.solutions.map((s) => ({ page: s.page, rect: s.rect })),
    figures,
    issues,
    hash: "",
  };
  const bodyGarbled = raw.body.some((i) => i.kind === "line" && i.line.garbled);
  const solutionGarbled = solutionLines.some((l) => l.garbled);
  if (bodyGarbled || solutionGarbled) {
    question.preferOriginal = { ...(bodyGarbled && { body: true }), ...(solutionGarbled && { solution: true }) };
  }
  question.hash = contentHash(question);
  return question;
}

// ---------------------------------------------------------------------------
// Interaction

function buildInteraction(rows: BodyRow[], issues: string[]): { interaction: Interaction; stem: string[] } {
  const fields = rows.flatMap((r) => r.cells.flatMap((c) => (c.kind === "field" ? [c.field] : [])));
  if (fields.length === 0) return { interaction: { kind: "open" }, stem: reflow(rows).map(rowToText) };

  const optionRows = assignOptionRows(rows, new Set(fields.filter((f) => f.radioButton)));
  const radioGroups = groupRadios(rows, fields, optionRows);
  const onlyOneRadioGroup = radioGroups.size === 1 && fields.every((f) => f.radioButton);

  if (onlyOneRadioGroup) {
    const [buttons] = [...radioGroups.values()];
    const options = buttons!.map((b) => optionText(optionRows.get(b) ?? []));
    options.forEach((o, i) => o || issues.push(`Antworttext für Option ${i + 1} nicht gefunden`));
    const inOption = new Set([...optionRows.values()].flat());
    const stem = reflow(rows.filter((r) => !inOption.has(r))).map(rowToText);
    return { interaction: { kind: "single", options, correct: null }, stem };
  }

  if (fields.some((f) => f.checkBox)) issues.push("Kontrollkästchen werden noch nicht unterstützt");

  // Generic gap form. Radio groups become a single choice gap on their own row.
  const gaps: Gap[] = [];
  const gapIndex = new Map<WidgetData, number>();
  const radioRow = new Map<BodyRow, number>();
  const skip = new Set<BodyRow>();
  for (const buttons of radioGroups.values()) {
    const index = gaps.length;
    gaps.push({ kind: "choice", options: buttons.map((b) => optionText(optionRows.get(b) ?? [])), correct: null });
    buttons.forEach((b) => gapIndex.set(b, index));
    const groupRows = buttons.flatMap((b) => optionRows.get(b) ?? []);
    groupRows.forEach((r) => skip.add(r));
    if (groupRows[0]) radioRow.set(groupRows[0], index);
  }

  const out: { row: BodyRow; segments: Segment[] }[] = [];
  for (const row of reflow(rows)) {
    const radio = radioRow.get(row) ?? (row.merged ?? []).map((r) => radioRow.get(r)).find((i) => i !== undefined);
    if (radio !== undefined) {
      out.push({ row, segments: [{ gap: radio }] });
      continue;
    }
    if (skip.has(row) || (row.merged ?? []).some((r) => skip.has(r))) continue;
    const segments: Segment[] = [];
    for (const cell of row.cells) {
      if (cell.kind === "text") segments.push({ text: cell.text });
      else {
        let index = gapIndex.get(cell.field);
        if (index === undefined) {
          index = gaps.length;
          gaps.push(fieldGap(cell.field));
          gapIndex.set(cell.field, index);
        }
        segments.push({ gap: index });
      }
    }
    out.push({ row, segments });
  }

  // Leading plain paragraphs are the question text; everything from the first
  // gap or table row on is rendered line by line.
  const firstInteractive = out.findIndex(
    (o) => o.segments.some((s) => "gap" in s) || o.segments.some((s) => "text" in s && s.text.includes("\t")),
  );
  const split = firstInteractive < 0 ? out.length : firstInteractive;
  const stem = out.slice(0, split).map((o) => o.segments.map((s) => ("text" in s ? s.text : "")).join(" "));
  const formRows: Row[] = out.slice(split).map((o) => o.segments);
  return { interaction: { kind: "gaps", ...inReadingOrder(formRows, gaps) }, stem };
}

/** Renumbers gaps by first appearance so gap 0 is the first one the learner sees. */
function inReadingOrder(rows: Row[], gaps: Gap[]): { rows: Row[]; gaps: Gap[] } {
  const order: number[] = [];
  for (const row of rows) for (const s of row) if ("gap" in s && !order.includes(s.gap)) order.push(s.gap);
  const index = new Map(order.map((old, i) => [old, i]));
  return {
    rows: rows.map((row) => row.map((s) => ("gap" in s ? { gap: index.get(s.gap)! } : s))),
    gaps: order.map((old) => gaps[old]!),
  };
}

function fieldGap(field: WidgetData): Gap {
  if (field.fieldType === "Ch") {
    return { kind: "choice", options: (field.options ?? []).map((o) => o.displayValue.trim()), correct: null };
  }
  return { kind: "text", expected: null };
}

/**
 * Radio buttons grouped by field name, in visual order. Some PDFs reuse one
 * name for two visually separate groups ("Abbildung 1: … Abbildung 2: …");
 * a text row between two buttons that isn't part of an option splits the group.
 */
function groupRadios(rows: BodyRow[], fields: WidgetData[], optionRows: Map<WidgetData, BodyRow[]>): Map<string, WidgetData[]> {
  const radios = new Set(fields.filter((f) => f.radioButton));
  const inOption = new Set([...optionRows.values()].flat());
  const groups = new Map<string, WidgetData[]>();
  const part = new Map<string, number>();
  const interrupted = new Set<string>();
  for (const row of rows) {
    const buttons = row.cells.flatMap((c) => (c.kind === "field" && radios.has(c.field) ? [c.field] : []));
    if (buttons.length === 0) {
      if (!inOption.has(row)) for (const name of part.keys()) interrupted.add(name);
      continue;
    }
    for (const b of buttons) {
      if (interrupted.has(b.fieldName)) {
        part.set(b.fieldName, (part.get(b.fieldName) ?? 0) + 1);
        interrupted.delete(b.fieldName);
      }
      if (!part.has(b.fieldName)) part.set(b.fieldName, 0);
      const key = `${b.fieldName}#${part.get(b.fieldName)}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
  }
  return groups;
}

/** Rows that make up each radio option: the row with the button plus indented continuation lines. */
function assignOptionRows(rows: BodyRow[], radios: Set<WidgetData>): Map<WidgetData, BodyRow[]> {
  const result = new Map<WidgetData, BodyRow[]>();
  let current: { radio: WidgetData; last: BodyRow } | null = null;
  for (const row of rows) {
    const radio = row.cells.find((c): c is Extract<Cell, { kind: "field" }> => c.kind === "field" && radios.has(c.field));
    if (radio) {
      result.set(radio.field, [row]);
      current = { radio: radio.field, last: row };
      continue;
    }
    if (
      current &&
      !hasFields(row) &&
      row.page === current.last.page &&
      row.x0 > current.radio.rect[2] - 1 &&
      current.last.y - row.y <= row.size * 1.6
    ) {
      result.get(current.radio)!.push(row);
      current.last = row;
      continue;
    }
    current = null;
  }
  return result;
}

function optionText(rows: BodyRow[]): string {
  return reflow(rows)
    .map((r) => r.cells.flatMap((c) => (c.kind === "text" ? [c.text] : [])).join(" "))
    .join(" ")
    .trim();
}

// ---------------------------------------------------------------------------
// Reflow: join wrapped lines so text can flow on narrow screens.

type FlowRow = BodyRow & { merged?: BodyRow[] };

function reflow(rows: BodyRow[]): FlowRow[] {
  const out: FlowRow[] = [];
  for (const row of rows) {
    const prev = out.at(-1);
    if (prev && continues(prev, row)) {
      const a = prev.cells.at(-1) as Extract<Cell, { kind: "text" }>;
      const [b, ...rest] = row.cells as [Extract<Cell, { kind: "text" }>, ...Cell[]];
      const joined: Cell = { ...a, xEnd: b.xEnd, text: joinWrapped(a.text, b.text), plain: joinWrapped(a.plain, b.plain) };
      out[out.length - 1] = {
        ...prev,
        y: row.y,
        bottom: row.bottom,
        cells: [...prev.cells.slice(0, -1), joined, ...rest],
        merged: [...(prev.merged ?? [prev]), row],
      };
    } else out.push(row);
  }
  return out;
}

function continues(prev: FlowRow, row: BodyRow): boolean {
  const a = prev.cells.at(-1);
  const b = row.cells[0];
  if (a?.kind !== "text" || b?.kind !== "text") return false;
  // A row with its own field starts a new statement/sentence part.
  if (hasFields(row)) return false;
  if (row.page !== prev.page || prev.y - row.y > row.size * 1.45) return false;
  if (a.text.includes("\t") || b.text.includes("\t")) return false;
  if (row.x0 > prev.x0 + 25) return false;
  if (/[:?]$/.test(a.plain)) return false;
  if (/^([a-z]\)|\d+[.)]\s|[-•–]\s|Antwort\b)/.test(b.plain)) return false;
  return true;
}

function rowToText(row: BodyRow): string {
  return row.cells.flatMap((c) => (c.kind === "text" ? [c.text] : [])).join(" ");
}

// ---------------------------------------------------------------------------
// Source regions and figures

function regions(raw: RawQuestion, rows: BodyRow[], pages: Map<number, PageSize>) {
  const source: PageRegion[] = [];
  const figures: PageRegion[] = [];
  const lastButton = raw.buttons.at(-1);
  // Every page from the header to the last part's button belongs to the question,
  // including pages that only hold images (no text, no fields).
  const used = [raw.header.page, ...rows.map((r) => r.page), ...raw.buttons.map((b) => b.page)];
  const first = Math.min(...used);
  const last = Math.max(...used);
  for (let page = first; page <= last; page++) {
    const size = pages.get(page) ?? { width: 595, height: 842 };
    const top = page === raw.header.page ? raw.header.top + 2 : size.height - PAGE_TOP_MARGIN;
    const bodyTop = page === raw.header.page ? raw.header.bottom - 4 : top;
    const bottom = lastButton?.page === page ? lastButton.rect[3] + 2 : PAGE_BOTTOM_MARGIN;
    source.push({ page, rect: [20, bottom, size.width - 20, top] });

    // Whitespace between rows is where figures (images, drawings) live. Buttons
    // and (hidden) solutions of earlier parts occupy space too.
    const occupied = [
      ...rows.filter((r) => r.page === page).map((r) => ({ top: r.top, bottom: r.bottom })),
      ...raw.buttons.filter((b) => b.page === page).map((b) => ({ top: b.rect[3], bottom: b.rect[1] })),
      ...raw.solutions.filter((s) => s.page === page).map((s) => ({ top: s.rect[3], bottom: s.rect[1] })),
    ].sort((a, b) => b.top - a.top);
    let cursor = bodyTop;
    for (const o of [...occupied, null]) {
      const nextTop = o ? Math.max(o.top, bottom) : bottom;
      if (cursor - nextTop > FIGURE_MIN_GAP) {
        figures.push({ page, rect: [20, nextTop + 1, size.width - 20, cursor - 1] satisfies Rect });
      }
      if (o) cursor = Math.min(cursor, o.bottom);
      if (cursor <= bottom) break;
    }
  }
  return { source, figures };
}

// ---------------------------------------------------------------------------

function contentHash(q: Question): string {
  const i = q.interaction;
  const content = JSON.stringify([
    q.code,
    q.stem,
    i.kind === "single" ? i.options : i.kind === "gaps" ? [i.rows, i.gaps.map((g) => (g.kind === "choice" ? g.options : "text"))] : null,
    q.solution,
  ]);
  // 64-bit FNV-1a; only used for change detection.
  let h = 0xcbf29ce484222325n;
  for (let k = 0; k < content.length; k++) {
    h ^= BigInt(content.charCodeAt(k));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
