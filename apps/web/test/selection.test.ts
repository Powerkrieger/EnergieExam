import type { AnnotatedQuestion, Question } from "@exam/core";
import { describe, expect, it } from "vitest";
import { reviewStep, SAMPLE, selectQuestions } from "../src/selection.ts";

const question = (n: number, priority: number): AnnotatedQuestion =>
  ({ key: `WG/${n}`, hash: "h", priority }) as unknown as Question;
const priorityOf = (qs: AnnotatedQuestion[]) => (key: string) =>
  (qs.find((q) => q.key === key) as unknown as { priority: number }).priority;
const none = () => false;
/** The first n questions of the test set changed since the last export. */
const some = (n: number) => {
  const keys = new Set(["WG/1", "WG/2", ...Array.from({ length: n }, (_, k) => `WG/${100 + k}`)].slice(0, n));
  return (key: string) => keys.has(key);
};
const review = (q: AnnotatedQuestion): AnnotatedQuestion => ({ ...q, annotation: { hash: "h", status: "confirmed" } });

describe("guided review", () => {
  const must = [question(1, 3), question(2, 2)];
  const heuristic = Array.from({ length: 30 }, (_, n) => question(100 + n, 1));
  const sure = [question(200, 0)];
  const all = [...must, ...heuristic, ...sure];
  const priority = priorityOf(all);

  it("starts with the uncertain questions", () => {
    expect(reviewStep(all, priority, none)).toEqual({ kind: "unsure", open: 2, total: 2 });
    expect(selectQuestions(all, {}, "review", { review: "unsure", priority })).toEqual(["WG/1", "WG/2"]);
  });

  it("then asks for the rest of the sample", () => {
    const qs = [...must.map(review), ...heuristic.slice(0, 5).map(review), ...heuristic.slice(5), ...sure];
    expect(reviewStep(qs, priority, some(7))).toEqual({ kind: "sample", done: 5 });
    const sample = selectQuestions(qs, {}, "review", { review: "sample", priority });
    expect(sample).toHaveLength(SAMPLE - 5);
    expect(sample.every((k) => priority(k) === 1 && !["WG/100", "WG/104"].includes(k))).toBe(true);
  });

  it("then asks to send the results, and is done once they are sent", () => {
    const qs = [...must.map(review), ...heuristic.slice(0, SAMPLE).map(review), ...heuristic.slice(SAMPLE), ...sure];
    expect(reviewStep(qs, priority, some(22))).toEqual({ kind: "export", changed: 22 });
    expect(reviewStep(qs, priority, (key) => key.startsWith("NWG/"))).toEqual({ kind: "done" });
    expect(reviewStep(qs, priority, none)).toEqual({ kind: "done" });
  });
});

describe("learning sessions", () => {
  const qs = [question(1, 0), question(2, 0), question(3, 0)];

  it("collects the questions answered wrong last time", () => {
    const progress = {
      "WG/1": { box: 0, seen: 1, right: 0, last: "wrong", lastAt: 0, dueAt: 0 },
      "WG/2": { box: 1, seen: 2, right: 1, last: "right", lastAt: 0, dueAt: 0 },
    } as const;
    expect(selectQuestions(qs, progress, "wrong", {})).toEqual(["WG/1"]);
  });

  it("collects the questions marked as difficult", () => {
    expect(selectQuestions(qs, {}, "marked", { marks: new Set(["WG/3", "WG/1"]) })).toEqual(["WG/1", "WG/3"]);
    expect(selectQuestions(qs, {}, "marked", {})).toEqual([]);
  });
});
