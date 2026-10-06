import type { Gap, Question, TextGap } from "./model.ts";
import { normalize } from "./text.ts";

export type Response =
  | { kind: "single"; choice: number | null }
  /** Per gap: option index for choice gaps, typed text for text gaps. */
  | { kind: "gaps"; values: (number | string | null)[] }
  | { kind: "open" };

/** true/false, or null when the answer key is unknown and the learner must judge. */
export type Verdict = boolean | null;

export interface Grade {
  overall: Verdict;
  gaps: Verdict[];
}

export function emptyResponse(q: Question): Response {
  const i = q.interaction;
  if (i.kind === "single") return { kind: "single", choice: null };
  if (i.kind === "gaps") return { kind: "gaps", values: i.gaps.map(() => null) };
  return { kind: "open" };
}

export function grade(q: Question, r: Response): Grade {
  const i = q.interaction;
  if (i.kind === "single" && r.kind === "single") {
    const overall = i.correct === null ? null : r.choice === i.correct;
    return { overall, gaps: [] };
  }
  if (i.kind === "gaps" && r.kind === "gaps") {
    const gaps = i.gaps.map((g, n) => gradeGap(g, r.values[n] ?? null));
    return { overall: combine(gaps), gaps };
  }
  return { overall: null, gaps: [] };
}

/** All right → right; any wrong → wrong; otherwise unknown. */
export function combine(verdicts: Verdict[]): Verdict {
  if (verdicts.some((v) => v === false)) return false;
  if (verdicts.every((v) => v === true)) return true;
  return null;
}

export function gradeGap(g: Gap, value: number | string | null): Verdict {
  if (g.kind === "choice") {
    if (g.correct === null) return null;
    return value === g.correct;
  }
  if (g.expected === null) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return false;
  return g.numeric ? numericMatch(g, text) : textMatch(g.expected, text);
}

function numericMatch(g: TextGap, input: string): boolean {
  const value = parseUserNumber(input);
  if (value === null) return false;
  const expected = g.numeric!.value;
  return Math.abs(value - expected) <= tolerance(g);
}

/**
 * Allowed deviation: an explicit relative tolerance, otherwise 2 % (rounding of
 * intermediate results) or half a unit of the last printed decimal.
 */
export function tolerance(g: TextGap): number {
  const expected = g.numeric!.value;
  if (g.numeric!.tolerance !== undefined) return Math.abs(expected) * g.numeric!.tolerance;
  const decimals = /,(\d+)/.exec(g.expected ?? "")?.[1]?.length ?? 0;
  return Math.max(Math.abs(expected) * 0.02, 0.5 * 10 ** -decimals);
}

/** Accepts "1.234,5", "1234,5", "1234.5" and "0,72". */
export function parseUserNumber(input: string): number | null {
  let s = input.trim().replace(/\s/g, "").replace("−", "-");
  const m = /^[-+]?[\d.,]+/.exec(s);
  if (!m) return null;
  s = m[0];
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function textMatch(expected: string, input: string): boolean {
  const a = normalize(expected).replace(/[.,;:]+$/, "");
  const b = normalize(input).replace(/[.,;:]+$/, "");
  return a === b;
}
