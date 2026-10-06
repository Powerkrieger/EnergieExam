import { buildLines, type Line } from "../layout/lines.ts";
import { annotationTextRuns } from "./annotationText.ts";
import { pageTextRuns } from "./pageText.ts";
import type { PdfDocument, PdfJs, Rect, WidgetData } from "./types.ts";

export interface SolutionBlock {
  /** Field name without the "lösung"/"Lösung" prefix, e.g. "1.1.1.11". */
  key: string;
  fieldName: string;
  rect: Rect;
  lines: Line[];
}

export interface PageData {
  /** 1-based page number. */
  page: number;
  width: number;
  height: number;
  lines: Line[];
  /** Visible, user-fillable form fields (radio buttons, combos, text fields, checkboxes). */
  fields: WidgetData[];
  /** "Lösung anzeigen" buttons; their position marks the end of a question's body. */
  solutionButtons: WidgetData[];
  solutions: SolutionBlock[];
}

const SOLUTION_FIELD = /^l[öo]sung\s*(.+)$/i;
const SOLUTION_BUTTON = /^l[öo]sungBtn/i;

export async function extractPage(pdfjs: PdfJs, doc: PdfDocument, pageNo: number): Promise<PageData> {
  const page = await doc.getPage(pageNo);
  const [, , width, height] = page.view as Rect;
  const annots = (await page.getAnnotations()) as WidgetData[];

  const fields: WidgetData[] = [];
  const solutionButtons: WidgetData[] = [];
  const solutionFields: WidgetData[] = [];
  for (const a of annots) {
    if (!a.fieldType || !a.fieldName) continue;
    const solution = SOLUTION_FIELD.exec(a.fieldName);
    if (a.pushButton && SOLUTION_BUTTON.test(a.fieldName)) solutionButtons.push(a);
    else if (a.pushButton && a.hidden && solution) solutionFields.push(a);
    else if (!a.pushButton && !a.hidden) fields.push(a);
  }

  const solutionRuns = await annotationTextRuns(
    pdfjs,
    page,
    doc.annotationStorage,
    solutionFields.map((a) => a.id),
  );

  const solutions = solutionFields.map((a) => ({
    key: SOLUTION_FIELD.exec(a.fieldName)![1]!.trim(),
    fieldName: a.fieldName,
    rect: a.rect,
    lines: buildLines(solutionRuns.get(a.id) ?? []),
  }));

  const lines = buildLines(await pageTextRuns(page));
  page.cleanup();
  return { page: pageNo, width, height, lines, fields, solutionButtons, solutions };
}
