import type { Gap, Question } from "./model.ts";
import { parseGermanNumber } from "./text.ts";

/**
 * Our own data about a question (never BAFA content): a reviewed answer key,
 * linked formula rows and the reviewer's verdict. Keyed by question key.
 */
export interface QuestionAnnotation {
  /** Content hash of the question the annotation refers to; a mismatch means BAFA changed it. */
  hash: string;
  /** Reviewer's verdict on the imported question. */
  status?: "confirmed" | "wrong" | "unclear";
  /** Corrected answer key; overrides what the importer derived. */
  answer?: AnswerOverride;
  /** Linked rows of the Formelsammlung (FormulaEntry ids). */
  formulas?: string[];
  note?: string;
  reviewedAt?: string;
}

export type AnswerOverride =
  | { kind: "single"; correct: number }
  /** One entry per gap; null keeps the imported answer. */
  | { kind: "gaps"; gaps: (GapAnswer | null)[] };

export type GapAnswer = { correct: number } | { expected: string; tolerance?: number };

export interface AnnotationFile {
  format: "bafa-trainer-annotations";
  version: 1;
  exportedAt: string;
  questions: Record<string, QuestionAnnotation>;
}

export function emptyAnnotationFile(): AnnotationFile {
  return { format: "bafa-trainer-annotations", version: 1, exportedAt: new Date().toISOString(), questions: {} };
}

export function parseAnnotationFile(json: unknown): AnnotationFile {
  const f = json as Partial<AnnotationFile>;
  if (f?.format !== "bafa-trainer-annotations" || f.version !== 1 || typeof f.questions !== "object") {
    throw new Error("Keine gültige Prüfdatei");
  }
  return f as AnnotationFile;
}

/** Later layers win per question (e.g. bundled file, then the reviewer's local changes). */
export function mergeAnnotations(...layers: Record<string, QuestionAnnotation>[]): Record<string, QuestionAnnotation> {
  return Object.assign({}, ...layers);
}

export interface AnnotatedQuestion extends Question {
  annotation?: QuestionAnnotation;
  /** The annotation was made for an older version of the question and is ignored. */
  stale?: boolean;
}

/** Applies a reviewed answer key to a question (if it still refers to the same content). */
export function applyAnnotation(q: Question, a: QuestionAnnotation | undefined): AnnotatedQuestion {
  if (!a) return q;
  if (a.hash !== q.hash) return { ...q, annotation: a, stale: true };
  const i = q.interaction;
  let interaction = i;
  if (a.answer?.kind === "single" && i.kind === "single") {
    interaction = { ...i, correct: a.answer.correct, via: "annotation" };
  } else if (a.answer?.kind === "gaps" && i.kind === "gaps") {
    const overrides = a.answer.gaps;
    interaction = { ...i, gaps: i.gaps.map((g, n) => overrideGap(g, overrides[n] ?? null)) };
  }
  return { ...q, interaction, annotation: a };
}

function overrideGap(g: Gap, o: GapAnswer | null): Gap {
  if (!o) return g;
  if (g.kind === "choice" && "correct" in o) return { ...g, correct: o.correct, via: "annotation" };
  if (g.kind === "text" && "expected" in o) {
    // Only answers that start with a number are numeric ("4,2 kW", not "Klasse B1").
    const value = /^\s*[-−]?\d/.test(o.expected) ? parseGermanNumber(o.expected) : null;
    return {
      kind: "text",
      expected: o.expected,
      via: "annotation",
      ...(value !== null && { numeric: { value, ...(o.tolerance !== undefined && { tolerance: o.tolerance }) } }),
    };
  }
  return g;
}
