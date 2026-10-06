import type { Catalog, CatalogId, Part } from "@exam/core";
import { buildQuestion, type PageSize } from "./catalog/build.ts";
import { segment } from "./catalog/segment.ts";
import { extractPage, type PageData } from "./pdf/page.ts";
import type { PdfDocument, PdfJs } from "./pdf/types.ts";

export { importFormulas } from "./formulas/index.ts";
export type { PdfDocument, PdfJs } from "./pdf/types.ts";

export type DocumentKind =
  | { kind: "questions"; catalog: CatalogId }
  | { kind: "formulas" }
  | { kind: "unknown" };

/** Identifies a BAFA PDF by its cover page. */
export async function detectDocument(doc: PdfDocument): Promise<DocumentKind> {
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("").normalize("NFC");
  if (/Formelsammlung/.test(text)) return { kind: "formulas" };
  if (/Übungsfragen/.test(text)) {
    if (/Nichtwohngebäude/.test(text)) return { kind: "questions", catalog: "NWG" };
    if (/Wohngebäude/.test(text)) return { kind: "questions", catalog: "WG" };
  }
  return { kind: "unknown" };
}

export interface ImportOptions {
  onProgress?: (page: number, total: number) => void;
}

export async function extractPages(pdfjs: PdfJs, doc: PdfDocument, options: ImportOptions = {}): Promise<PageData[]> {
  const pages: PageData[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    pages.push(await extractPage(pdfjs, doc, p));
    options.onProgress?.(p, doc.numPages);
  }
  return pages;
}

/** Parses one question catalogue (e.g. "Nichtwohngebäude – Teil 1 Gebäudehülle"). */
export async function importCatalog(
  pdfjs: PdfJs,
  doc: PdfDocument,
  catalog: CatalogId,
  options: ImportOptions = {},
): Promise<Catalog> {
  const pages = await extractPages(pdfjs, doc, options);
  return catalogFromPages(pages, catalog);
}

export function catalogFromPages(pages: PageData[], catalog: CatalogId): Catalog {
  const sizes = new Map<number, PageSize>(pages.map((p) => [p.page, { width: p.width, height: p.height }]));
  const raw = segment(pages);
  const questions = raw.questions.map((q) => buildQuestion(q, catalog, sizes));
  // The catalogue's part is the one most of its question codes start with.
  const counts = new Map<Part, number>();
  for (const q of questions) counts.set(q.part, (counts.get(q.part) ?? 0) + 1);
  const part = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
  return {
    catalog,
    part,
    title: raw.title ?? "",
    version: raw.version,
    questions,
  };
}
