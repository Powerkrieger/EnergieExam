import type { TextRun } from "../pdf/types.ts";

export interface Line {
  /** Baseline of the main-size text. */
  y: number;
  x0: number;
  x1: number;
  /** Font size of the main (largest) text on the line. */
  size: number;
  /** Text with `_{…}` / `^{…}` markup for sub- and superscripts. */
  text: string;
  /** Text without markup (sub/superscripts inlined). */
  plain: string;
  /** Some text on the line came from a typeset formula and may be inaccurate. */
  garbled: boolean;
  runs: TextRun[];
}

/** Gap (in multiples of the font size) above which runs on a line are treated as separate cells. */
export const CELL_GAP = 1.5;

/**
 * Groups text runs into visual lines. Smaller runs slightly above or below a
 * baseline (sub/superscripts such as R_si or m^2) are attached to that line.
 * Runs are sorted top-to-bottom, then left-to-right.
 */
export function buildLines(input: TextRun[]): Line[] {
  const runs = input.filter((r) => r.str.length > 0 && r.size > 0);
  // Largest text first so that sub/superscripts attach to an existing main line.
  const bySize = [...runs].sort((a, b) => b.size - a.size || b.y - a.y);
  const groups: { y: number; size: number; runs: TextRun[] }[] = [];

  for (const run of bySize) {
    let best: (typeof groups)[number] | undefined;
    let bestDist = Infinity;
    for (const g of groups) {
      const small = run.size < g.size * 0.85;
      // Scripts are positioned relative to the run they belong to, not the line's first baseline.
      const neighbor = small ? nearestRun(run, g.runs, g.size) : undefined;
      if (small && !neighbor) continue;
      const dy = run.y - (neighbor?.y ?? g.y);
      const fits = small ? dy > -0.5 * g.size && dy < 0.6 * g.size : Math.abs(dy) < 0.3 * g.size;
      if (!fits) continue;
      if (Math.abs(dy) < bestDist) {
        best = g;
        bestDist = Math.abs(dy);
      }
    }
    if (best) best.runs.push(run);
    else groups.push({ y: run.y, size: run.size, runs: [run] });
  }

  return groups
    .map((g) => toLine(g.y, g.size, g.runs))
    .sort((a, b) => b.y - a.y || a.x0 - b.x0);
}

/** The horizontally adjacent run a sub/superscript belongs to, if any. */
function nearestRun(run: TextRun, runs: TextRun[], size: number): TextRun | undefined {
  let best: TextRun | undefined;
  let bestDist = size * 0.6;
  for (const r of runs) {
    const dist = Math.max(0, run.x - r.xEnd, r.x - run.xEnd);
    if (dist <= bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best;
}

/** Joins runs that belong to one line (e.g. a slice of a line between two form fields). */
export function joinRuns(runs: TextRun[], line: Pick<Line, "y" | "size">): Pick<Line, "text" | "plain"> {
  const { text, plain } = toLine(line.y, line.size, runs);
  return { text, plain };
}

function toLine(y: number, size: number, runs: TextRun[]): Line {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  let text = "";
  let plain = "";
  let prevEnd: number | null = null;
  for (const r of sorted) {
    const str = r.str;
    if (prevEnd !== null) {
      const gap = r.x - prevEnd;
      const needsSpace = gap > size * 0.15 && !text.endsWith(" ") && !str.startsWith(" ");
      if (gap > size * CELL_GAP) {
        text = text.trimEnd() + "\t";
        plain = plain.trimEnd() + "\t";
      } else if (needsSpace) {
        text += " ";
        plain += " ";
      }
    }
    const small = r.size < size * 0.85;
    const base = small ? nearestRun(r, sorted.filter((o) => o.size >= size * 0.85), size)?.y ?? y : y;
    const dy = r.y - base;
    const trimmed = str.trim();
    if (small && trimmed && dy < -0.1 * size) {
      text = text.replace(/ $/, "") + `_{${trimmed}}`;
      plain = plain.replace(/ $/, "") + trimmed;
    } else if (small && trimmed && dy > 0.2 * size) {
      text = text.replace(/ $/, "") + `^{${trimmed}}`;
      plain = plain.replace(/ $/, "") + trimmed;
    } else {
      text += str;
      plain += str;
    }
    prevEnd = Math.max(prevEnd ?? -Infinity, r.xEnd);
  }
  return {
    y,
    x0: sorted[0]?.x ?? 0,
    x1: Math.max(...sorted.map((r) => r.xEnd)),
    size,
    text: normalizeSpaces(text),
    plain: normalizeSpaces(plain),
    garbled: sorted.some((r) => r.garbled),
    runs: sorted,
  };
}

function normalizeSpaces(s: string): string {
  return s.replace(/[  ]+/g, " ").replace(/ ?\t ?/g, "\t").trim();
}
