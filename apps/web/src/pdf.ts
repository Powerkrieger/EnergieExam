// pdf.js setup for the app. The legacy build supports older Android WebViews.
import type { PageRegion } from "@exam/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { type DocId, loadFile } from "./db.ts";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Decoders and data files copied to public/pdfjs by the Vite config.
const asset = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;
const ASSETS = {
  wasmUrl: asset("wasm"),
  iccUrl: asset("iccs"),
  cMapUrl: asset("cmaps"),
  standardFontDataUrl: asset("standard_fonts"),
};

export { pdfjs };
export type PdfDocument = pdfjs.PDFDocumentProxy;

export function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  // pdf.js transfers the buffer to its worker; keep the caller's copy intact.
  return pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, ...ASSETS }).promise;
}

/**
 * Two instances per file: one renders the question as printed, the other one
 * has the hidden solution fields switched visible. They can't share an
 * instance because field visibility is document-wide state.
 */
const cache = new Map<string, Promise<PdfDocument>>();

function getDoc(id: DocId, reveal: boolean): Promise<PdfDocument> {
  const key = `${id}:${reveal}`;
  let doc = cache.get(key);
  if (!doc) {
    doc = loadFile(id).then((f) => {
      if (!f) throw new Error(`PDF ${id} ist nicht importiert`);
      return openPdf(f.bytes);
    });
    doc.catch(() => cache.delete(key));
    cache.set(key, doc);
  }
  return doc;
}

export function forgetDocs() {
  for (const d of cache.values()) d.then((doc) => doc.loadingTask.destroy()).catch(() => {});
  cache.clear();
}

const revealed = new WeakSet<object>();

/**
 * Renders a region of a PDF page into the canvas, `cssWidth` pixels wide.
 * With `reveal`, the hidden "Lösung" fields of that page are shown.
 * Resolves to false if the render was aborted, "blank" if the area is empty.
 */
export async function renderRegion(
  canvas: HTMLCanvasElement,
  id: DocId,
  region: PageRegion,
  cssWidth: number,
  reveal: boolean,
  signal: AbortSignal,
): Promise<boolean | "blank"> {
  const doc = await getDoc(id, reveal);
  const page = await doc.getPage(region.page);
  if (reveal && !revealed.has(page)) {
    for (const a of await page.getAnnotations()) {
      if (a.hidden && /^l[öo]sung/i.test(a.fieldName ?? "")) doc.annotationStorage.setValue(a.id, { noView: false });
    }
    revealed.add(page);
  }
  const [x0, y0, x1, y1] = region.rect;
  const [, , , pageHeight] = page.view as [number, number, number, number];
  const scale = (cssWidth / (x1 - x0)) * Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale, offsetX: -x0 * scale, offsetY: -(pageHeight - y1) * scale });
  if (signal.aborted) return false;
  canvas.width = Math.ceil((x1 - x0) * scale);
  canvas.height = Math.ceil((y1 - y0) * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * (y1 - y0)) / (x1 - x0)}px`;
  const task = page.render({
    canvas,
    viewport,
    annotationMode: reveal ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE,
  });
  signal.addEventListener("abort", () => task.cancel(), { once: true });
  try {
    await task.promise;
    return isBlank(canvas) ? "blank" : true;
  } catch (e) {
    if (e instanceof pdfjs.RenderingCancelledException) return false;
    throw e;
  }
}

/** True if (a sample of) the canvas is plain white – e.g. whitespace mistaken for a figure. */
function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const step = 4 * 7; // every 7th pixel is plenty
  for (let i = 0; i < data.length; i += step) {
    if (data[i]! < 235 || data[i + 1]! < 235 || data[i + 2]! < 235) return false;
  }
  return true;
}
