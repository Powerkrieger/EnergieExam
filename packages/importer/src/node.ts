// Node-only entry point (CLI, tests). Browsers use the modern pdf.js build instead.
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfDocument, PdfJs } from "./pdf/types.ts";

export const nodePdfJs: PdfJs = pdfjs;

export async function openPdf(path: string): Promise<PdfDocument> {
  const data = new Uint8Array(await readFile(path));
  return pdfjs.getDocument({ data, verbosity: 0 }).promise;
}
