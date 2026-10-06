// Math alphanumerics (U+1D400–U+1D7FF) from typeset formulas.
const MATH_RUN = /([\u{1D400}-\u{1D7FF}])\1{1,3}/gu;
const MATH_CHAR = /[\u{1D400}-\u{1D7FF}]/gu;

/**
 * Normalizes extracted text. Formula fonts in the catalogues map each glyph to
 * several copies of a math-italic character ("𝑅𝑅𝑅𝑅"); these are collapsed and
 * folded to plain letters ("R").
 */
export function cleanText(s: string): string {
  return s
    .normalize("NFC")
    .replace(MATH_RUN, "$1")
    .replace(MATH_CHAR, (c) => c.normalize("NFKC"));
}

/** True if the raw text shows signs of a typeset formula whose text is unreliable. */
export function looksGarbled(s: string): boolean {
  return /�/.test(s) || MATH_RUN.test(s);
}
