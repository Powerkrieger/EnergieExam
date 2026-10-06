import type { RichText } from "./model.ts";

/** Removes sub/superscript markup: "R_{si}" → "Rsi". */
export function plainText(text: RichText): string {
  return text.replace(/[_^]\{([^}]*)\}/g, "$1");
}

/**
 * Normalization for comparing answers: case-, whitespace- and bracket-insensitive,
 * so "(m²K)/W" matches "m²K/W" and "Rse " matches "R_{se}".
 */
export function normalize(text: string): string {
  return plainText(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/[„“”"'‚‘’«»]/g, "")
    .replace(/[\s()[\]{}]/g, "");
}

/** Parses German-formatted numbers: "1.234,5" → 1234.5, "0,8" → 0.8. */
export function parseGermanNumber(text: string): number | null {
  const m = /[-−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|[-−]?\d+(?:,\d+)?/.exec(text.trim());
  if (!m) return null;
  const v = Number(m[0].replace(/−/, "-").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/**
 * Joins lines wrapped by the PDF layout into paragraphs. A line ends a paragraph
 * after sentence punctuation, an enumerated item starts a new one, and table
 * rows (with tabs) stay as they are.
 */
export function reflowLines(lines: RichText[]): RichText[] {
  const out: RichText[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    // "→ Ja," on its own line belongs to the statement above.
    const verdict = prev !== undefined && /^→/.test(line) && !prev.includes("→");
    const breaks =
      !verdict &&
      (prev === undefined ||
      /[.:!?;]$/.test(prev) ||
      (/,$/.test(prev) && prev.includes("→")) ||
      prev.includes("\t") ||
      line.includes("\t") ||
      /^([a-z]\)|[A-Z]\)|\d+[.)]\s|[-•·▪]\s|→)/.test(line));
    if (breaks || prev === undefined) out.push(line);
    else if (/[a-zäöüß]-$/.test(prev) && /^[a-zäöüß]/.test(line)) out[out.length - 1] = prev.slice(0, -1) + line;
    else out[out.length - 1] = `${prev} ${line}`;
  }
  return out;
}
