import { describe, expect, it } from "vitest";
import { normalize, parseGermanNumber, plainText } from "../src/text.ts";

describe("text helpers", () => {
  it("strips sub/superscript markup", () => {
    expect(plainText("R_{si} und m^{2}")).toBe("Rsi und m2");
  });

  it("normalizes for comparison", () => {
    expect(normalize("(m²K)/W")).toBe(normalize("m²K/W"));
    expect(normalize("Rse ")).toBe(normalize("R_{se}"));
    expect(normalize("„Trifft zu“")).toBe("trifftzu");
  });

  it("parses German numbers", () => {
    expect(parseGermanNumber("0,8")).toBe(0.8);
    expect(parseGermanNumber("36.000 kWh")).toBe(36000);
    expect(parseGermanNumber("1.234,5")).toBe(1234.5);
    expect(parseGermanNumber("−3,5")).toBe(-3.5);
    expect(parseGermanNumber("keine Zahl")).toBeNull();
  });
});
