/** Learning state of one question (Leitner boxes 0–5). */
export interface QuestionProgress {
  box: number;
  seen: number;
  right: number;
  last: "right" | "wrong" | null;
  lastAt: number;
  /** Timestamp from which the question is due again. */
  dueAt: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** Waiting time after reaching box n. */
const INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
export const MAX_BOX = INTERVALS.length - 1;

export function recordResult(p: QuestionProgress | undefined, right: boolean, now = Date.now()): QuestionProgress {
  const box = right ? Math.min(MAX_BOX, (p?.box ?? 0) + 1) : 0;
  return {
    box,
    seen: (p?.seen ?? 0) + 1,
    right: (p?.right ?? 0) + (right ? 1 : 0),
    last: right ? "right" : "wrong",
    lastAt: now,
    dueAt: now + INTERVALS[box]!,
  };
}

export function isDue(p: QuestionProgress | undefined, now = Date.now()): boolean {
  return !p || p.dueAt <= now;
}

/** A question counts as learned once it reached box 3 (answered right three times in a row). */
export const isLearned = (p: QuestionProgress | undefined) => (p?.box ?? 0) >= 3;
