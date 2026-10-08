import { type AnnotatedQuestion, isDue, type Question, type QuestionProgress } from "@exam/core";

export type Mode = "due" | "order" | "wrong" | "marked" | "review";
export type ReviewFilter = "unsure" | "sample" | "wrong" | "unclear" | "all";

export function resolved(q: Question): boolean {
  const i = q.interaction;
  if (i.kind === "single") return i.correct !== null;
  if (i.kind === "gaps") return i.gaps.every((g) => (g.kind === "choice" ? g.correct !== null : g.expected !== null));
  return true;
}

/**
 * How much an imported question (before annotations) needs an expert's eye:
 * 3 unresolved, 2 flagged by the importer, 1 heuristic answer, 0 read directly.
 */
export function reviewPriority(q: Question): number {
  if (!resolved(q)) return 3;
  if (q.issues.length || q.preferOriginal) return 2;
  const i = q.interaction;
  const vias = i.kind === "single" ? [i.via] : i.kind === "gaps" ? i.gaps.map((g) => g.via) : [];
  return vias.some((v) => v === "numeric" || v === "mention") ? 1 : 0;
}

export function reviewed(q: AnnotatedQuestion): boolean {
  return !!q.annotation?.status && !q.stale;
}

/** Priority 2+ must be reviewed; of the heuristic answers (priority 1) a sample of this size is enough. */
export const SAMPLE = 20;

export type ReviewStep =
  | { kind: "unsure"; open: number; total: number }
  | { kind: "sample"; done: number }
  | { kind: "export"; changed: number }
  | { kind: "done" };

/**
 * What the reviewer should do next with these questions (one building type):
 * uncertain questions, then the sample, then send the results.
 */
export function reviewStep(
  questions: AnnotatedQuestion[],
  priority: (key: string) => number,
  /** Reviewed on this device since the last export. */
  unexported: (key: string) => boolean,
): ReviewStep {
  const must = questions.filter((q) => priority(q.key) >= 2);
  const open = must.filter((q) => !reviewed(q)).length;
  if (open > 0) return { kind: "unsure", open, total: must.length };
  const done = sampleDone(questions, priority);
  if (done < SAMPLE && questions.some((q) => priority(q.key) === 1 && !reviewed(q))) return { kind: "sample", done };
  const changed = questions.filter((q) => unexported(q.key)).length;
  if (changed > 0) return { kind: "export", changed };
  return { kind: "done" };
}

export function sampleDone(questions: AnnotatedQuestion[], priority: (key: string) => number): number {
  return questions.filter((q) => priority(q.key) === 1 && reviewed(q)).length;
}

const SESSION = 20;

/** Question keys for a learning or review session. */
export function selectQuestions(
  all: AnnotatedQuestion[],
  progress: Record<string, QuestionProgress>,
  mode: Mode,
  filter: {
    doc?: (key: string) => string;
    docId?: string;
    chapter?: string;
    review?: ReviewFilter;
    priority?: (key: string) => number;
    marks?: Set<string>;
  },
): string[] {
  let qs = all;
  if (filter.docId && filter.doc) qs = qs.filter((q) => filter.doc!(q.key) === filter.docId);
  if (filter.chapter) qs = qs.filter((q) => q.chapter === filter.chapter);

  switch (mode) {
    case "order":
      return qs.map((q) => q.key);
    case "wrong":
      return qs.filter((q) => progress[q.key]?.last === "wrong").map((q) => q.key);
    case "marked":
      return qs.filter((q) => filter.marks?.has(q.key)).map((q) => q.key);
    case "due": {
      // Due repetitions (lowest box first), then new questions in catalogue order.
      const seen = qs.filter((q) => progress[q.key] && isDue(progress[q.key]));
      seen.sort((a, b) => progress[a.key]!.box - progress[b.key]!.box || progress[a.key]!.dueAt - progress[b.key]!.dueAt);
      const fresh = qs.filter((q) => !progress[q.key]);
      return [...seen, ...fresh].slice(0, SESSION).map((q) => q.key);
    }
    case "review": {
      const f = filter.review ?? "unsure";
      if (f === "wrong" || f === "unclear") return qs.filter((q) => !q.stale && q.annotation?.status === f).map((q) => q.key);
      const priority = filter.priority ?? (() => 0);
      const open = qs.filter((q) => !reviewed(q));
      if (f === "all") return open.map((q) => q.key);
      if (f === "sample") {
        // The rest of the sample, or another full one once it is complete.
        const done = sampleDone(all, priority);
        const size = done < SAMPLE ? SAMPLE - done : SAMPLE;
        return shuffle(open.filter((q) => priority(q.key) === 1)).slice(0, size).map((q) => q.key);
      }
      return open
        .filter((q) => priority(q.key) >= 2)
        .sort((a, b) => priority(b.key) - priority(a.key))
        .map((q) => q.key);
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
