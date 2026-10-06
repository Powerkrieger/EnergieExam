import { describe, expect, it } from "vitest";
import { buildLines } from "../src/layout/lines.ts";
import type { TextRun } from "../src/pdf/types.ts";

const run = (str: string, x: number, y: number, size = 12, width = str.length * size * 0.5): TextRun => ({
  str,
  x,
  xEnd: x + width,
  y,
  size,
});

describe("buildLines", () => {
  it("marks subscripts relative to the run they belong to", () => {
    // Table cells sit 1.6pt higher than the label; the subscript must still attach to "R".
    const [line] = buildLines([run("R", 33, 90.9, 12, 7), run("si", 40, 85.6, 9.3, 6), run("[m²K/W]", 49, 90.9), run("0,10", 167, 92.5)]);
    expect(line?.text).toBe("R_{si} [m²K/W]\t0,10");
    expect(line?.plain).toBe("Rsi [m²K/W]\t0,10");
  });

  it("marks superscripts", () => {
    const [line] = buildLines([run("W/m", 10, 100, 12, 20), run("2", 30, 104, 8, 4)]);
    expect(line?.text).toBe("W/m^{2}");
  });

  it("orders lines top to bottom", () => {
    const lines = buildLines([run("unten", 10, 100), run("oben", 10, 120)]);
    expect(lines.map((l) => l.text)).toEqual(["oben", "unten"]);
  });
});
