import { cleanText, looksGarbled } from "./cleanText.ts";
import type { PdfJs, PdfPage, TextRun } from "./types.ts";

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2 in PDF row-vector convention: apply m1 first, then m2. */
function mul(m1: Matrix, m2: Matrix): Matrix {
  const [a, b, c, d, e, f] = m1;
  const [A, B, C, D, E, F] = m2;
  return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

function toMatrix(v: unknown): Matrix {
  const arr = Array.from((Array.isArray(v) && v.length === 1 ? v[0] : v) as ArrayLike<number>);
  return arr.length >= 6 ? (arr.slice(0, 6) as Matrix) : IDENTITY;
}

interface Glyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}

interface TextState {
  tm: Matrix;
  tlm: Matrix;
  font: string;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
}

/**
 * Extracts positioned text from the appearance of the given (typically hidden)
 * widget annotations. pdf.js only exposes text of a few annotation types, so we
 * replay the operator list and track the text state ourselves.
 *
 * The page's annotation storage is used to force hidden annotations visible;
 * it is reset afterwards.
 */
export async function annotationTextRuns(
  pdfjs: PdfJs,
  page: PdfPage,
  storage: { setValue(key: string, value: object): void; remove?(key: string): void },
  annotationIds: string[],
): Promise<Map<string, TextRun[]>> {
  const result = new Map<string, TextRun[]>();
  if (annotationIds.length === 0) return result;
  const wanted = new Set(annotationIds);
  for (const id of wanted) storage.setValue(id, { noView: false });

  const { OPS, AnnotationMode } = pdfjs;
  const ops = await page.getOperatorList({ annotationMode: AnnotationMode.ENABLE_FORMS });
  for (const id of wanted) storage.remove?.(id);

  const fontMatrixCache = new Map<string, number>();
  const fontScale = (name: string): number => {
    let v = fontMatrixCache.get(name);
    if (v === undefined) {
      try {
        const font = page.commonObjs.get(name) as { fontMatrix?: number[] } | undefined;
        v = font?.fontMatrix?.[0] ?? 0.001;
      } catch {
        v = 0.001;
      }
      fontMatrixCache.set(name, v);
    }
    return v;
  };

  let current: string | null = null;
  let runs: TextRun[] = [];
  let ctm: Matrix = IDENTITY;
  const ctmStack: Matrix[] = [];
  const freshState = (): TextState => ({
    tm: IDENTITY, tlm: IDENTITY, font: "", fontSize: 1, charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0,
  });
  let ts = freshState();
  const tsStack: TextState[] = [];

  const moveText = (tx: number, ty: number) => {
    ts.tlm = mul([1, 0, 0, 1, tx, ty], ts.tlm);
    ts.tm = ts.tlm;
  };

  const showText = (glyphs: (Glyph | number | null)[]) => {
    if (!current) return;
    const scale = fontScale(ts.font);
    let x = 0;
    let str = "";
    let startX: number | null = null;
    for (const g of glyphs) {
      if (typeof g === "number") {
        // TJ adjustment in thousandths of text space; large negative values act as spaces.
        if (g < -250 && str && !str.endsWith(" ")) str += " ";
        x += (-g / 1000) * ts.fontSize * ts.hScale;
        continue;
      }
      if (!g) continue;
      if (startX === null) startX = x;
      str += g.unicode ?? "";
      const w = (g.width ?? 0) * scale * ts.fontSize;
      x += (w + ts.charSpacing + (g.isSpace ? ts.wordSpacing : 0)) * ts.hScale;
    }
    const trm = mul(ts.tm, ctm);
    if (str.trim() && startX !== null) {
      const [x0, y0] = apply(trm, startX, ts.rise);
      const [x1] = apply(trm, x, ts.rise);
      const size = Math.hypot(trm[2], trm[3]) * ts.fontSize;
      runs.push({ str: cleanText(str), garbled: looksGarbled(str) || undefined, x: x0, xEnd: x1, y: y0, size });
    }
    ts.tm = mul([1, 0, 0, 1, x, 0], ts.tm);
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as any[];
    switch (fn) {
      case OPS.beginAnnotation: {
        const id = args[0] as string;
        current = wanted.has(id) ? id : null;
        runs = [];
        ctmStack.length = 0;
        ctm = mul(toMatrix(args[3]), toMatrix(args[2]));
        ts = freshState();
        break;
      }
      case OPS.endAnnotation:
        if (current) result.set(current, runs);
        current = null;
        ctm = IDENTITY;
        break;
      case OPS.save:
        ctmStack.push(ctm);
        tsStack.push({ ...ts });
        break;
      case OPS.restore:
        ctm = ctmStack.pop() ?? ctm;
        ts = tsStack.pop() ?? ts;
        break;
      case OPS.transform:
        ctm = mul(toMatrix(args), ctm);
        break;
      case OPS.paintFormXObjectBegin:
        ctmStack.push(ctm);
        if (args[0]) ctm = mul(toMatrix(args[0]), ctm);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = ctmStack.pop() ?? ctm;
        break;
      case OPS.beginText:
        ts.tm = IDENTITY;
        ts.tlm = IDENTITY;
        break;
      case OPS.setFont:
        ts.font = args[0];
        ts.fontSize = args[1];
        break;
      case OPS.setCharSpacing:
        ts.charSpacing = args[0];
        break;
      case OPS.setWordSpacing:
        ts.wordSpacing = args[0];
        break;
      case OPS.setHScale:
        ts.hScale = args[0] / 100;
        break;
      case OPS.setLeading:
        ts.leading = args[0];
        break;
      case OPS.setTextRise:
        ts.rise = args[0];
        break;
      case OPS.setTextMatrix:
        ts.tlm = toMatrix(args);
        ts.tm = ts.tlm;
        break;
      case OPS.moveText:
        moveText(args[0], args[1]);
        break;
      case OPS.setLeadingMoveText:
        ts.leading = -args[1];
        moveText(args[0], args[1]);
        break;
      case OPS.nextLine:
        moveText(0, -ts.leading);
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        showText(args[0]);
        break;
      case OPS.nextLineShowText:
        moveText(0, -ts.leading);
        showText(args[0]);
        break;
      case OPS.nextLineSetSpacingShowText:
        ts.wordSpacing = args[0];
        ts.charSpacing = args[1];
        moveText(0, -ts.leading);
        showText(args[2]);
        break;
    }
  }
  return result;
}
