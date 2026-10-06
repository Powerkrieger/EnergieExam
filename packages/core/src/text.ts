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
