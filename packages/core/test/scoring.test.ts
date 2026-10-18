import { describe, expect, it } from "vitest";
import { applyAnnotation, mergeAnnotations } from "../src/annotations.ts";
import { suggestFormulas } from "../src/formulas.ts";
import type { FormulaIndex, Question } from "../src/model.ts";
import { isDue, recordResult } from "../src/progress.ts";
import { grade, gradeGap, parseUserNumber } from "../src/scoring.ts";

const question = (interaction: Question["interaction"], extra: Partial<Question> = {}): Question => ({
  key: "WG/1.1.1.01",
  catalog: "WG",
  part: 1,
  code: "1.1.1.01",
  number: 1,
  chapter: "",
  topic: "",
  stem: [],
  interaction,
  solution: [],
  source: [],
  solutionSource: [],
  figures: [],
  issues: [],
  hash: "h1",
  ...extra,
});

describe("grading", () => {
  it("grades single choice", () => {
    const q = question({ kind: "single", options: ["a", "b"], correct: 1 });
    expect(grade(q, { kind: "single", choice: 1 }).overall).toBe(true);
    expect(grade(q, { kind: "single", choice: 0 }).overall).toBe(false);
  });

  it("leaves unknown answers to the learner", () => {
    const q = question({ kind: "single", options: ["a", "b"], correct: null });
    expect(grade(q, { kind: "single", choice: 0 }).overall).toBeNull();
  });

  it("combines gaps: any wrong → wrong, unknown → null", () => {
    const q = question({
      kind: "gaps",
      rows: [],
      gaps: [
        { kind: "choice", options: ["x", "y"], correct: 0 },
        { kind: "choice", options: ["x", "y"], correct: null },
      ],
    });
    expect(grade(q, { kind: "gaps", values: [0, 1] })).toEqual({ overall: null, gaps: [true, null] });
    expect(grade(q, { kind: "gaps", values: [1, 1] }).overall).toBe(false);
  });

  it("accepts numbers within rounding tolerance", () => {
    const g = { kind: "text" as const, expected: "29,7 °C", numeric: { value: 29.7, unit: "°C" } };
    expect(gradeGap(g, "29,68")).toBe(true);
    expect(gradeGap(g, "29.7")).toBe(true);
    expect(gradeGap(g, "31")).toBe(false);
    expect(gradeGap(g, "")).toBe(false);
  });

  it("compares text answers loosely", () => {
    const g = { kind: "text" as const, expected: "Kork-Dämmstoff" };
    expect(gradeGap(g, " kork-dämmstoff ")).toBe(true);
    expect(gradeGap(g, "Beton")).toBe(false);
  });

  it("parses user numbers", () => {
    expect(parseUserNumber("1.234,5")).toBe(1234.5);
    expect(parseUserNumber("36.000")).toBe(36000);
    expect(parseUserNumber("0.72")).toBe(0.72);
    expect(parseUserNumber("abc")).toBeNull();
  });
});

describe("annotations", () => {
  const q = question({
    kind: "gaps",
    rows: [],
    gaps: [
      { kind: "choice", options: ["x", "y"], correct: null },
      { kind: "text", expected: null },
    ],
  });

  it("overrides imported answers", () => {
    const a = applyAnnotation(q, { hash: "h1", answer: { kind: "gaps", gaps: [{ correct: 1 }, { expected: "4,2 kW" }] } });
    expect(a.interaction).toMatchObject({
      gaps: [
        { correct: 1, via: "annotation" },
        { expected: "4,2 kW", numeric: { value: 4.2 }, via: "annotation" },
      ],
    });
  });

  it("ignores annotations for changed questions", () => {
    const a = applyAnnotation(q, { hash: "old", answer: { kind: "gaps", gaps: [{ correct: 1 }, null] } });
    expect(a.stale).toBe(true);
    expect(a.interaction).toBe(q.interaction);
  });

  it("keeps our hint when a later review replaces the annotation", () => {
    const merged = mergeAnnotations(
      { "WG/1.1.1.01": { hash: "h1", hint: "Feld fehlt" }, "WG/1.1.1.02": { hash: "h2", note: "alt" } },
      { "WG/1.1.1.01": { hash: "h1", status: "confirmed" }, "WG/1.1.1.02": { hash: "h2", status: "wrong" } },
    );
    expect(merged).toEqual({
      "WG/1.1.1.01": { hash: "h1", status: "confirmed", hint: "Feld fehlt" },
      "WG/1.1.1.02": { hash: "h2", status: "wrong" },
    });
  });
});

describe("progress", () => {
  it("moves through boxes and resets on mistakes", () => {
    const now = 1_000_000;
    const p1 = recordResult(undefined, true, now);
    expect(p1.box).toBe(1);
    expect(isDue(p1, now)).toBe(false);
    expect(recordResult(p1, false, now).box).toBe(0);
  });
});

describe("formula suggestions", () => {
  it("ranks formulas by shared symbols and words", () => {
    const index: FormulaIndex = {
      version: null,
      entries: [
        { id: "u", chapter: "", title: "Wärmedurchgangskoeffizient", region: { page: 1, rect: [0, 0, 1, 1] }, symbols: [{ symbol: "U", description: "" }, { symbol: "R_{si}", description: "" }, { symbol: "R_{se}", description: "" }], text: "" },
        { id: "q", chapter: "", title: "Wärmemenge", region: { page: 1, rect: [0, 0, 1, 1] }, symbols: [{ symbol: "Q", description: "" }], text: "" },
      ],
    };
    const q = question({ kind: "open" }, { stem: ["Berechnen Sie den Wärmedurchgangskoeffizienten mit R_{si} und R_{se}."], solution: ["U = 1 / (R_{si} + R + R_{se})"] });
    expect(suggestFormulas(q, index).map((e) => e.id)).toEqual(["u"]);
  });
});
