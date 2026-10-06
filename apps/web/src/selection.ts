import { type AnnotatedQuestion, isDue, type QuestionProgress } from "@exam/core";

export type Mode = "due" | "order" | "wrong" | "review";
export type ReviewFilter = "unsure" | "sample" | "wrong" | "unclear" | "all";

export function resolved(q: AnnotatedQuestion): boolean {
  const i = q.interaction;
  if (i.kind === "single") return i.correct !== null;
  if (i.kind === "gaps") return i.gaps.every((g) => (g.kind === "choice" ? g.correct !== null : g.expected !== null));
  return true;
}

/** How much a question needs an expert's eye: unresolved answers first, heuristic answers next. */
export function reviewPriority(q: AnnotatedQuestion): number {
  if (!resolved(q)) return 3;
  if (q.issues.length || q.preferOriginal) return 2;
  const i = q.interaction;
  const vias = i.kind === "single" ? [i.via] : i.kind === "gaps" ? i.gaps.map((g) => g.via) : [];
  return vias.some((v) => v === "numeric" || v === "mention") ? 1 : 0;
}

export function reviewed(q: AnnotatedQuestion): boolean {
  return !!q.annotation?.status && !q.stale;
}

/** Answers that need an expert: unresolved, or flagged by the importer. Everything else is only spot-checked. */
export function needsReview(q: AnnotatedQuestion): boolean {
  return !reviewed(q) && reviewPriority(q) >= 2;
}

const SESSION = 20;

/** Question keys for a learning or review session. */
export function selectQuestions(
  all: AnnotatedQuestion[],
  progress: Record<string, QuestionProgress>,
  mode: Mode,
  filter: { doc?: (key: string) => string; docId?: string; chapter?: string; review?: ReviewFilter },
): string[] {
  let qs = all;
  if (filter.docId && filter.doc) qs = qs.filter((q) => filter.doc!(q.key) === filter.docId);
  if (filter.chapter) qs = qs.filter((q) => q.chapter === filter.chapter);

  switch (mode) {
    case "order":
      return qs.map((q) => q.key);
    case "wrong":
      return qs.filter((q) => progress[q.key]?.last === "wrong").map((q) => q.key);
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
      const open = qs.filter((q) => !reviewed(q));
      if (f === "all") return open.map((q) => q.key);
      if (f === "sample") return shuffle(open.filter((q) => reviewPriority(q) === 1)).slice(0, SESSION).map((q) => q.key);
      return open.filter(needsReview).sort((a, b) => reviewPriority(b) - reviewPriority(a)).map((q) => q.key);
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
