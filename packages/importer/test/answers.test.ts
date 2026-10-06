import type { Gap, Interaction, Row } from "@exam/core";
import { describe, expect, it } from "vitest";
import { resolveAnswers } from "../src/catalog/answers.ts";

const choice = (...options: string[]): Gap => ({ kind: "choice", options, correct: null });
const text = (): Gap => ({ kind: "text", expected: null });

function solve(rows: Row[], gaps: Gap[], solution: string[], stem: string[] = []) {
  const interaction: Interaction = { kind: "gaps", rows, gaps };
  const issues: string[] = [];
  resolveAnswers(interaction, solution, stem, issues);
  return { gaps, issues };
}

const answers = (gaps: Gap[]) => gaps.map((g) => (g.kind === "choice" ? g.correct : g.expected));

describe("single choice", () => {
  const single = (options: string[], solution: string[]) => {
    const interaction: Interaction = { kind: "single", options, correct: null };
    resolveAnswers(interaction, solution, [], []);
    return interaction.correct;
  };

  it("finds the option quoted in the solution", () => {
    expect(single(["Kapillarität", "Konvektion", "Diffusion"], ["Konvektion"])).toBe(1);
  });

  it("prefers the longest contained option", () => {
    expect(single(["ausreichend", "nicht ausreichend"], ["Die Leistung ist nicht ausreichend."])).toBe(1);
  });

  it("decides between near-identical sentences by their distinguishing words", () => {
    const options = [
      "Ja, denn laut GEG muss mindestens ein Wert von n = 3,0 h^{-1} eingehalten werden.",
      "Nein, denn laut GEG muss mindestens ein Wert von n = 1,5 h^{-1} eingehalten werden.",
    ];
    expect(single(options, ["Nein, laut GEG muss mindestens ein Wert von n = 1,5 h^{-1} eingehalten werden."])).toBe(1);
  });

  it("tolerates a different word form", () => {
    const options = ["blauer Wasserstoff", "grüner Wasserstoff", "orangefarbener Wasserstoff"];
    expect(single(options, ["orangener Wasserstoff"])).toBe(2);
  });
});

describe("cloze texts", () => {
  it("aligns the solution sentence with the gaps", () => {
    const opts = ["Wärmedurchgangswiderstand", "Wärmeübergangswiderstand", "Wärmedurchlasswiderstand"];
    const { gaps } = solve(
      [
        [{ text: "Der" }, { gap: 0 }, { text: "beschreibt den Übergang." }],
        [{ text: "Der" }, { gap: 1 }, { text: "fasst alle Widerstände zusammen." }],
      ],
      [choice(...opts), choice(...opts)],
      ["Der Wärmeübergangswiderstand beschreibt den Übergang.", "Der Wärmedurchgangswiderstand fasst alle", "Widerstände zusammen."],
    );
    expect(answers(gaps)).toEqual([1, 0]);
  });

  it("uses the question text when a row starts with a gap", () => {
    const { gaps } = solve(
      [[{ gap: 0 }, { text: "Polystyrol (EPS) und" }, { gap: 1 }, { text: "Polystyrol (XPS)." }]],
      [choice("expandiertem", "extrudiertem"), choice("expandiertem", "extrudiertem")],
      ["Man unterscheidet zwischen expandiertem Polystyrol (EPS) und extrudiertem Polystyrol (XPS)."],
      ["Man unterscheidet zwischen"],
    );
    expect(answers(gaps)).toEqual([0, 1]);
  });

  it("fills adjacent table cells from consecutive values", () => {
    const values = ["0,04", "0,10", "0,13", "0,17"];
    const { gaps } = solve(
      [[{ text: "R_{si} [m²K/W]" }, { gap: 0 }, { gap: 1 }, { gap: 2 }]],
      [choice(...values), choice(...values), choice(...values)],
      ["R_{si} [m²K/W]\t0,10\t0,13\t0,17"],
    );
    expect(answers(gaps)).toEqual([1, 2, 3]);
  });

  it("extracts free-text answers between anchors", () => {
    const { gaps } = solve(
      [[{ gap: 0 }, { text: "<" }, { gap: 1 }, { text: "<" }, { gap: 2 }]],
      [text(), text(), text()],
      ["Luft < Kork-Dämmstoff < Metall"],
    );
    expect(answers(gaps)).toEqual(["Luft", "Kork-Dämmstoff", "Metall"]);
  });
});

describe("statement lists", () => {
  const rows: Row[] = [
    [{ text: "Schimmel wächst sichtbar als Flecken auf Wänden." }, { gap: 0 }],
    [{ text: "Schimmel ist immer mit bloßem Auge erkennbar." }, { gap: 1 }],
  ];

  it("reads 'Statement → Value' lists", () => {
    const { gaps } = solve(rows, [choice("Trifft zu", "Trifft nicht zu"), choice("Trifft zu", "Trifft nicht zu")], [
      "Schimmel wächst sichtbar als Flecken auf",
      "Wänden. → Trifft zu,",
      "Schimmel ist immer mit bloßem Auge erkennbar. → Trifft nicht zu",
    ]);
    expect(answers(gaps)).toEqual([0, 1]);
  });

  it("reads verdicts in a right-hand column after the first line", () => {
    const { gaps } = solve(rows, [choice("Richtig", "Falsch"), choice("Richtig", "Falsch")], [
      "Schimmel wächst sichtbar als\tRichtig",
      "Flecken auf Wänden.",
      "Schimmel ist immer mit bloßem Auge erkennbar.  Falsch",
    ]);
    expect(answers(gaps)).toEqual([0, 1]);
  });

  it("maps Ja/Nein onto Richtig/Falsch options", () => {
    const { gaps } = solve(rows, [choice("Falsch", "Richtig"), choice("Falsch", "Richtig")], [
      "Schimmel wächst sichtbar als Flecken auf Wänden. → Ja,",
      "Schimmel ist immer mit bloßem Auge erkennbar. → Nein",
    ]);
    expect(answers(gaps)).toEqual([1, 0]);
  });
});

describe("calculations", () => {
  it("takes the final result of each calculation line, matched by unit", () => {
    const { gaps } = solve(
      [
        [{ text: "Die Temperaturdifferenz beträgt" }, { gap: 0 }, { text: "°C." }],
        [{ text: "Die Leistung beträgt" }, { gap: 1 }, { text: "kW." }],
      ],
      [text(), text()],
      ["Δθ = (70 - 55) : ln[(70-20)/(55-20)] = 42 °C", "Φ = 1,8 kW : [42/29,7]^{1,3} = 1,15 kW"],
    );
    expect(gaps.map((g) => (g.kind === "text" ? g.numeric : null))).toEqual([
      { value: 42, unit: "°C" },
      { value: 1.15, unit: "kW" },
    ]);
  });

  it("uses the final result for a single unitless answer field", () => {
    const { gaps } = solve([[{ text: "Antwort:" }, { gap: 0 }]], [text()], ["g = 540 / 750 = 0,72"]);
    expect(gaps[0]).toMatchObject({ expected: "0,72", numeric: { value: 0.72 } });
  });

  it("accepts per-period units and keeps brackets", () => {
    const { gaps } = solve(
      [
        [{ text: "täglich" }, { gap: 0 }, { text: "kWh benötigt." }],
        [{ text: "Bedarf" }, { gap: 1 }, { text: "kWh/(m²a)." }],
      ],
      [text(), text()],
      ["Q = 200 · 1 · 1,16 · 35 = 8,12 kWh/d", "q_{p} = 38 · 1,8 = 68,4 kWh/(m²a)"],
    );
    expect(answers(gaps)).toEqual(["8,12 kWh", "68,4 kWh/(m²a)"]);
  });
});

it("reports gaps it cannot resolve instead of guessing", () => {
  const { gaps, issues } = solve(
    [[{ text: "Die Anforderung ist" }, { gap: 0 }]],
    [choice("erfüllt", "nicht erfüllt")],
    ["Die Anforderung ist sowohl erfüllt als auch nicht erfüllt."],
  );
  expect(answers(gaps)).toEqual([null]);
  expect(issues).toEqual(["1 von 1 Lücken ohne abgeleitete Lösung"]);
});
