import { describe, expect, it } from "vitest";
import { createBackup, mergeBackup, parseBackup } from "../src/backup.ts";

const answered = (lastAt: number, last: "right" | "wrong" = "wrong") =>
  ({ box: 0, seen: 1, right: 0, last, lastAt, dueAt: 0 }) as const;

describe("progress backup", () => {
  it("survives a round trip through JSON", () => {
    const b = createBackup({ "WG/1": answered(5) }, { "WG/2": 7 });
    expect(parseBackup(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it("rejects other files and drops broken entries", () => {
    expect(() => parseBackup({ version: 1, questions: {} })).toThrow(/keine Sicherung/);
    expect(() => parseBackup({ format: "energieexam-progress", version: 2 })).toThrow(/Version 2/);
    const b = parseBackup({
      format: "energieexam-progress",
      version: 1,
      progress: { "WG/1": answered(1), "WG/2": { box: "x" } },
      marks: { "WG/3": 1, "WG/4": "yes" },
    });
    expect(Object.keys(b.progress)).toEqual(["WG/1"]);
    expect(Object.keys(b.marks)).toEqual(["WG/3"]);
  });

  it("keeps newer progress and adds marks", () => {
    const current = { progress: { "WG/1": answered(10, "right"), "WG/2": answered(10, "right") }, marks: new Set(["WG/5"]) };
    const backup = createBackup(
      { "WG/1": answered(5), "WG/2": answered(20), "WG/3": answered(1) },
      { "WG/5": 1, "WG/6": 2 },
    );
    expect(mergeBackup(current, backup)).toEqual({
      progress: { "WG/2": answered(20), "WG/3": answered(1) },
      marks: { "WG/6": 2 },
    });
  });
});
