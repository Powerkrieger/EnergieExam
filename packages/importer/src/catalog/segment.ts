import type { Line } from "../layout/lines.ts";
import type { PageData, SolutionBlock } from "../pdf/page.ts";
import type { Rect, WidgetData } from "../pdf/types.ts";

export type BodyItem =
  | { kind: "line"; page: number; line: Line }
  | { kind: "field"; page: number; field: WidgetData };

/** A question as laid out in the PDF, before interpretation. */
export interface RawQuestion {
  number: number;
  code: string | null;
  topic: string;
  chapter: string;
  header: { page: number; top: number; bottom: number };
  body: BodyItem[];
  /** "Lösung anzeigen" buttons; multi-part questions have one per part. */
  buttons: { page: number; rect: Rect }[];
  solutions: (SolutionBlock & { page: number })[];
  issues: string[];
}

export interface SegmentResult {
  questions: RawQuestion[];
  version: string | null;
  title: string | null;
}

const HEADER = /^Frage\s+(\d+)\s*:\s*(.*)$/;
const CODE = /\((\d+(?:\.\d+){1,4}(?:[a-z]|-[A-Z]\d*)?)\)\s*$/;
const HEADING_SIZE = 17;
const HEADER_MIN_SIZE = 13;
const FOOTER_MAX_Y = 30;

type StreamItem =
  | { kind: "line"; page: number; top: number; line: Line }
  | { kind: "field"; page: number; top: number; field: WidgetData }
  | { kind: "button"; page: number; top: number; rect: Rect }
  | { kind: "solution"; page: number; top: number; block: SolutionBlock };

function toStream(page: PageData): StreamItem[] {
  const items: StreamItem[] = [
    ...page.lines.map((line): StreamItem => ({ kind: "line", page: page.page, top: line.y + line.size * 0.8, line })),
    ...page.fields.map((field): StreamItem => ({ kind: "field", page: page.page, top: field.rect[3], field })),
    ...page.solutionButtons.map((b): StreamItem => ({ kind: "button", page: page.page, top: b.rect[3], rect: b.rect })),
    ...page.solutions.map((block): StreamItem => ({ kind: "solution", page: page.page, top: block.rect[3], block })),
  ];
  // Fields sit slightly above the baseline of the text they belong to; order by top edge.
  return items.sort((a, b) => b.top - a.top);
}

/** Splits the pages of a question catalogue into raw questions. */
export function segment(pages: PageData[]): SegmentResult {
  const questions: RawQuestion[] = [];
  let version: string | null = null;
  let title: string | null = null;
  let chapter = "";
  let headingBuffer: string[] | null = null;
  let current: RawQuestion | null = null;
  let phase: "header" | "body" | "afterButton" | "afterSolution" = "body";
  // Items after a solution: part of the body if another part (button) follows, otherwise dropped.
  let pending: BodyItem[] = [];

  const close = () => {
    if (!current) return;
    const lastSolutionPage = current.solutions.at(-1)?.page;
    for (const item of pending) {
      if (item.kind === "field") current.issues.push(`Formularfeld nach der Lösung ignoriert (S. ${item.page}): ${item.field.fieldName}`);
      // Text on later pages is the imprint, not part of the question.
      else if (item.page === lastSolutionPage) current.issues.push(`Text nach der Lösung ignoriert (S. ${item.page}): "${item.line.plain.slice(0, 60)}"`);
    }
    pending = [];
    questions.push(finish(current));
    current = null;
  };

  for (const page of pages) {
    for (const item of toStream(page)) {
      if (item.kind === "line") {
        const { line } = item;
        // Page footer: "Fragenpool … (Version 01.07.25)" and page number.
        if (line.y < FOOTER_MAX_Y && line.size < 10) {
          version ??= /Version\s+([\d.]+\d)/.exec(line.plain)?.[1] ?? null;
          continue;
        }
        if (line.size >= HEADING_SIZE) {
          if (/^Übungsfragen\s*:/.test(line.plain)) headingBuffer = [line.plain.replace(/^Übungsfragen\s*:\s*/, "")];
          else if (headingBuffer) headingBuffer.push(line.plain);
          else title ??= line.plain;
          chapter = headingBuffer?.join(" ") ?? chapter;
          continue;
        }
        headingBuffer = null;
        if (/^Änderungen zu Version/.test(line.plain)) continue;

        const header = line.size >= HEADER_MIN_SIZE ? HEADER.exec(line.plain) : null;
        if (header) {
          close();
          current = {
            number: Number(header[1]),
            code: null,
            topic: header[2] ?? "",
            chapter,
            header: { page: item.page, top: item.top, bottom: line.y },
            body: [],
            buttons: [],
            solutions: [],
            issues: [],
          };
          phase = "header";
          if (takeCode(current, line)) phase = "body";
          continue;
        }
        if (current && phase === "header" && line.size >= HEADER_MIN_SIZE) {
          current.topic += " " + line.plain;
          current.header.bottom = line.y;
          if (takeCode(current, line)) phase = "body";
          continue;
        }
        if (current && phase === "header") {
          current.issues.push("Kein Fragencode in der Überschrift gefunden");
          phase = "body";
        }
      }

      if (!current) continue;
      if (phase === "header") phase = "body";

      switch (item.kind) {
        case "button":
          if (phase === "afterButton") current.issues.push(`Zwei Lösungsschaltflächen ohne Lösung (S. ${item.page})`);
          current.body.push(...pending);
          pending = [];
          current.buttons.push({ page: item.page, rect: item.rect });
          phase = "afterButton";
          break;
        case "solution":
          if (phase === "body") current.issues.push("Lösung ohne vorherige Lösungsschaltfläche");
          if (phase === "afterSolution") current.issues.push(`Zusätzliches Lösungsfeld "${item.block.fieldName}" (S. ${item.page})`);
          current.solutions.push({ ...item.block, page: item.page });
          phase = "afterSolution";
          break;
        case "line":
        case "field": {
          const bodyItem: BodyItem =
            item.kind === "line"
              ? { kind: "line", page: item.page, line: item.line }
              : { kind: "field", page: item.page, field: item.field };
          if (phase === "body") current.body.push(bodyItem);
          else pending.push(bodyItem);
          break;
        }
      }
    }
  }
  close();

  // Solutions are matched by position because field names are often stale
  // (copied from older versions). A name pointing at another question is suspicious though.
  const codes = new Set(questions.flatMap((q) => (q.code ? [normalizeCode(q.code)] : [])));
  for (const q of questions) {
    for (const sol of q.solutions) {
      const named = normalizeCode(sol.key);
      if (q.code && named !== normalizeCode(q.code) && codes.has(named)) {
        q.issues.push(`Lösungsfeld "${sol.fieldName}" trägt den Code einer anderen Frage`);
      }
    }
  }
  return { questions, version, title };
}

function takeCode(q: RawQuestion, line: Line): boolean {
  const m = CODE.exec(line.plain);
  if (!m) return false;
  q.code = m[1]!;
  q.topic = q.topic.replace(CODE, "").trim();
  return true;
}

function finish(q: RawQuestion): RawQuestion {
  if (q.buttons.length === 0) q.issues.push("Keine Lösungsschaltfläche gefunden");
  if (q.solutions.length === 0) q.issues.push("Keine Lösung gefunden");
  return q;
}

/** "1.1.1.011" and "1.1.1.11" denote the same question. */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .split(".")
    .map((p) => p.replace(/^0+(?=\d)/, ""))
    .join(".");
}
