/**
 * Rich text: plain string with `_{…}` (subscript) and `^{…}` (superscript)
 * markup and `\t` as a table-cell separator.
 */
export type RichText = string;

export type CatalogId = "WG" | "NWG";
export type Part = 1 | 2 | 3;

export const CATALOGS: Record<CatalogId, string> = {
  WG: "Wohngebäude",
  NWG: "Nichtwohngebäude",
};

export const PARTS: Record<Part, string> = {
  1: "Gebäudehülle",
  2: "Gebäudetechnik",
  3: "Rechtliches, Bilanzierung und Beratung",
};

/** Area on a PDF page in PDF user space (origin bottom-left): [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];

export interface PageRegion {
  /** 1-based page number in the source PDF. */
  page: number;
  rect: Rect;
}

/** A row of a question body: text interleaved with gaps (indices into `gaps`). */
export type Segment = { text: RichText } | { gap: number };
export type Row = Segment[];

export type Gap = ChoiceGap | TextGap;

/** How an answer was determined: by an importer strategy or a manual annotation. */
export type AnswerSource = "inline" | "arrow" | "verdict" | "table" | "numeric" | "mention" | "annotation";

export interface ChoiceGap {
  kind: "choice";
  options: RichText[];
  /** Index into `options`, or null when the importer could not determine it. */
  correct: number | null;
  via?: AnswerSource;
}

export interface TextGap {
  kind: "text";
  /** Expected answer as printed in the solution, or null if unknown. */
  expected: string | null;
  /** Parsed numeric value if the expected answer is a number. */
  numeric?: { value: number; unit?: string; tolerance?: number };
  via?: AnswerSource;
}

export type Interaction =
  | { kind: "single"; options: RichText[]; correct: number | null; via?: AnswerSource }
  | { kind: "gaps"; rows: Row[]; gaps: Gap[] }
  /** No input fields: the learner reads the official solution and rates themselves. */
  | { kind: "open" };

export interface Question {
  /** Globally unique key, e.g. "NWG/1.1.1.07". */
  key: string;
  catalog: CatalogId;
  part: Part;
  /** Code as printed in the catalogue, e.g. "1.1.1.07". */
  code: string;
  /** "Frage N" number within the chapter. */
  number: number;
  /** Chapter heading, e.g. "Gebäudehülle – Bauphysikalische Grundlagen". */
  chapter: string;
  /** Topic from the question header, e.g. "Grundlagen Wärmeschutz - Wärmeübergangswiderstand". */
  topic: string;
  /** Non-interactive text before/around the interaction, one entry per line. */
  stem: RichText[];
  interaction: Interaction;
  /** Official solution text, one entry per line. */
  solution: RichText[];
  /** Where the question body lives in the PDF (one region per page). */
  source: PageRegion[];
  /** Where the (normally hidden) official solution is drawn. */
  solutionSource: PageRegion[];
  /** Areas without text inside the body, typically figures or drawn tables. */
  figures: PageRegion[];
  /**
   * Parts whose extracted text is unreliable (typeset formulas); the app should
   * show the original PDF rendering for them.
   */
  preferOriginal?: { body?: boolean; solution?: boolean };
  /** Import problems that need review. Empty when everything was resolved. */
  issues: string[];
  /** Hash of the extracted content; annotations use it to detect changed questions. */
  hash: string;
}

export interface Catalog {
  catalog: CatalogId;
  part: Part;
  title: string;
  /** Version string from the PDF footer, e.g. "01.07.25". */
  version: string | null;
  questions: Question[];
}

/** One row of the BAFA Formelsammlung (formula collection). */
export interface FormulaEntry {
  /** Stable id derived from chapter and title, e.g. "waermetransport-waermeschutz/waermemenge". */
  id: string;
  chapter: string;
  /** Name column, e.g. "Wärmedurchgangskoeffizient (spezifisch bezogen auf 1 m²)". */
  title: string;
  /** The row's area in the PDF, for rendering it from the user's copy. */
  region: PageRegion;
  /** Page number printed in the footer ("Seite 1 / 23"), if found. */
  printedPage?: number;
  /** Symbol legend: "Q" → "Wärmemenge [Wh]". */
  symbols: { symbol: string; description: string }[];
  /** All text of the row (formula and legend), for search and matching. Approximate for typeset formulas. */
  text: string;
}

export interface FormulaIndex {
  /** Version string from the footer, e.g. "Juli 2025". */
  version: string | null;
  entries: FormulaEntry[];
}
