import type * as PdfJsModule from "pdfjs-dist";

/**
 * The pdf.js module is injected so the importer runs unchanged in Node
 * (legacy build) and in browsers / WebViews (modern build + worker).
 */
export type PdfJs = Pick<typeof PdfJsModule, "OPS" | "AnnotationMode">;
export type PdfDocument = PdfJsModule.PDFDocumentProxy;
export type PdfPage = PdfJsModule.PDFPageProxy;

/** Axis-aligned box in PDF user space (origin bottom-left): [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];

/** A horizontal run of text with its baseline position in page coordinates. */
export interface TextRun {
  str: string;
  x: number;
  xEnd: number;
  /** Baseline y. */
  y: number;
  /** Effective font size in page units. */
  size: number;
  /** Text came from a typeset formula and may be inaccurate. */
  garbled?: boolean;
}

/** Subset of pdf.js widget annotation data that the importer relies on. */
export interface WidgetData {
  id: string;
  fieldName: string;
  fieldType: "Btn" | "Ch" | "Tx" | "Sig";
  rect: Rect;
  hidden: boolean;
  radioButton?: boolean;
  checkBox?: boolean;
  pushButton?: boolean;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  combo?: boolean;
  multiSelect?: boolean;
  comb?: boolean;
  multiLine?: boolean;
}
