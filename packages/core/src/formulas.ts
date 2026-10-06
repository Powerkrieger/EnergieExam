import type { FormulaEntry, FormulaIndex, Question } from "./model.ts";
import { plainText } from "./text.ts";

/**
 * Suggests rows of the Formelsammlung that a question probably needs, by
 * comparing formula symbols (U, R_si, λ …) and title words with the question
 * and its solution. Only a starting point for the reviewer.
 */
export function suggestFormulas(q: Question, index: FormulaIndex, limit = 5): FormulaEntry[] {
  const text = questionText(q);
  const symbols = symbolsIn(text);
  const words = new Set(wordsIn(text));
  return index.entries
    .map((e) => {
      let score = 0;
      for (const s of e.symbols) if (symbols.has(symbolKey(s.symbol))) score += symbolKey(s.symbol).length > 1 ? 3 : 1.5;
      for (const w of wordsIn(e.title)) if (w.length >= 6 && words.has(w)) score += 2;
      return { e, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

function questionText(q: Question): string {
  const i = q.interaction;
  const parts = [q.topic, ...q.stem, ...q.solution];
  if (i.kind === "single") parts.push(...i.options);
  if (i.kind === "gaps") for (const row of i.rows) for (const s of row) if ("text" in s) parts.push(s.text);
  return parts.join("\n");
}

const SYMBOL = /(?<![\p{L}\d])([A-Za-zΑ-Ωα-ωΦφΨψθΘλΔΔηεμρτ][a-zA-Z]?(?:_\{[^}]+\})?)(?![\p{L}])/gu;

function symbolsIn(text: string): Set<string> {
  return new Set([...text.matchAll(SYMBOL)].map((m) => symbolKey(m[1]!)));
}

const symbolKey = (s: string) => plainText(s).replace(/\s/g, "").replace(/[:.]+$/, "");

function wordsIn(text: string): string[] {
  return plainText(text)
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

export function searchFormulas(index: FormulaIndex, query: string): FormulaEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.entries;
  return index.entries.filter((e) =>
    [e.title, e.chapter, ...e.symbols.map((s) => `${plainText(s.symbol)} ${s.description}`)].some((t) =>
      plainText(t).toLowerCase().includes(q),
    ),
  );
}
