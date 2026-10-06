import { cleanText, looksGarbled } from "./cleanText.ts";
import type { PdfPage, TextRun } from "./types.ts";

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Static page text (excludes form fields and annotations). */
export async function pageTextRuns(page: PdfPage): Promise<TextRun[]> {
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const raw of content.items) {
    const item = raw as Partial<PdfTextItem>;
    if (typeof item.str !== "string" || !item.transform || item.str.length === 0) continue;
    const [, , c = 0, d = 0, e = 0, f = 0] = item.transform;
    const size = Math.hypot(c, d) || item.height || 0;
    runs.push({ str: cleanText(item.str), garbled: looksGarbled(item.str) || undefined, x: e, xEnd: e + (item.width ?? 0), y: f, size });
  }
  return runs;
}
