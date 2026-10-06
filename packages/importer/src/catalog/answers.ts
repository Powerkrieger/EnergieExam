import {
  type ChoiceGap,
  type Gap,
  type Interaction,
  normalize,
  parseGermanNumber,
  plainText,
  type RichText,
  type Row,
  type TextGap,
} from "@exam/core";

/**
 * The PDFs contain no answer key, only a human-readable solution text. This
 * derives the correct answers from that text with a cascade of strategies;
 * anything that cannot be determined reliably stays `null` and is reported.
 */
export function resolveAnswers(
  interaction: Interaction,
  solution: RichText[],
  stem: RichText[],
  issues: string[],
): void {
  if (solution.length === 0 || interaction.kind === "open") return;
  if (interaction.kind === "single") {
    const correct = resolveSingle(interaction.options, solution);
    if (correct === null) issues.push("Richtige Antwort nicht aus der Lösung ableitbar");
    else Object.assign(interaction, { correct, via: "mention" });
    return;
  }

  const { rows, gaps } = interaction;
  if (solution.some((l) => l.includes("→"))) resolveArrows(rows, gaps, solution);
  resolveVerdicts(rows, gaps, solution);
  resolveInline(rows, gaps, solution, stem.at(-1) ?? "");
  resolveTable(rows, gaps, solution);
  resolveNumeric(rows, gaps, solution);
  resolveMentions(gaps, solution);
  resolveSentenceChoices(gaps, solution);

  for (const g of gaps) {
    if (g.kind === "text" && g.expected !== null && !g.numeric) {
      const value = /^[-−]?[\d.,]+$/.test(g.expected.trim()) ? parseGermanNumber(g.expected) : null;
      if (value !== null) g.numeric = { value };
    }
  }
  const open = gaps.filter((g) => (g.kind === "choice" ? g.correct === null : g.expected === null)).length;
  if (open > 0) issues.push(`${open} von ${gaps.length} Lücken ohne abgeleitete Lösung`);
}

// ---------------------------------------------------------------------------
// Normalized matching with a map back to the original string.

/** Matching form: `normalize` minus trailing punctuation. */
const key = (s: string) => normalize(s).replace(/[.,;:!]+$/, "");

interface Mapped {
  norm: string;
  /** Index into the original (plain) string for each character of `norm`. */
  map: number[];
  raw: string;
}

function mapped(text: string): Mapped {
  const raw = plainText(text);
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = normalize(raw[i]!);
    for (const ch of n) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map, raw };
}

/** Original text for the normalized range [from, to). */
function rawSlice(m: Mapped, from: number, to: number): string {
  if (to <= from) return "";
  const start = m.map[from] ?? m.raw.length;
  let end = (m.map[to - 1] ?? m.raw.length - 1) + 1;
  // Brackets are ignored when matching; keep a closing one that belongs to the slice.
  while (m.raw[end] && /[)\]]/.test(m.raw[end]!) && unbalanced(m.raw.slice(start, end))) end++;
  return m.raw.slice(start, end).trim();
}

const unbalanced = (s: string) =>
  (s.match(/[([]/g)?.length ?? 0) > (s.match(/[)\]]/g)?.length ?? 0);

function words(s: string): string[] {
  return plainText(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N},]+/u)
    .map((w) => w.replace(/^,+|,+$/g, "")) // keep decimal commas, drop punctuation
    .filter((w) => w.length > 1);
}

/**
 * Options mentioned in a normalized text. Longer options are matched first and
 * removed, so "erfüllt" only counts if it occurs outside "nicht erfüllt".
 */
function mentioned(text: string, options: string[]): string[] {
  let rest = text;
  const hits: string[] = [];
  for (const o of [...new Set(options)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (!rest.includes(o)) continue;
    hits.push(o);
    rest = rest.split(o).join("\u0000");
  }
  return hits;
}

/** Dice coefficient over word sets. */
function similarity(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (A.size === 0 || B.size === 0) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return (2 * common) / (A.size + B.size);
}

const isOpen = (g: Gap) => (g.kind === "choice" ? g.correct === null : g.expected === null);

function setChoice(g: ChoiceGap, normalizedValue: string, via: ChoiceGap["via"]): boolean {
  const index = g.options.findIndex((o) => key(o) === normalizedValue);
  if (index < 0) return false;
  g.correct = index;
  g.via = via;
  return true;
}

// ---------------------------------------------------------------------------
// Single choice

function resolveSingle(options: RichText[], solution: RichText[]): number | null {
  const sol = key(solution.join(" "));
  const opts = options.map(key);
  const hits = mentioned(sol, opts);
  if (hits.length === 1) return opts.indexOf(hits[0]!);

  const containing = opts.map((o, i) => ({ o, i })).filter(({ o }) => sol.length > 3 && o.includes(sol));
  if (containing.length === 1) return containing[0]!.i;

  // Options that differ in a few words only ("Ja … 3,0" vs. "Nein … 1,5"): score the distinguishing words.
  const solWords = new Set(words(solution.join(" ")));
  const optWords = options.map((o) => new Set(words(o)));
  const distinct = optWords.map((ws, i) => [...ws].filter((w) => optWords.every((o, j) => j === i || !o.has(w))));
  const byDistinct = distinct
    .map((ws, i) => ({ i, s: ws.length ? ws.filter((w) => solWords.has(w)).length / ws.length : 0 }))
    .sort((a, b) => b.s - a.s);
  if (byDistinct[0] && byDistinct[0].s >= 0.5 && byDistinct[0].s > (byDistinct[1]?.s ?? 0)) return byDistinct[0].i;

  const scored = options.map((o, i) => ({ i, s: similarity(o, solution.join(" ")) })).sort((a, b) => b.s - a.s);
  const [best, second] = scored;
  if (best && best.s >= 0.5 && best.s - (second?.s ?? 0) >= 0.15) return best.i;

  // Short answers with a different word form: "orangener" vs. "orangefarbener Wasserstoff".
  if (sol.length <= 80) {
    const solWordList = [...solWords];
    const byPrefix = distinct
      .map((ws, i) => ({ i, s: Math.max(0, ...ws.flatMap((w) => solWordList.map((v) => commonPrefix(w, v) / Math.min(w.length, v.length)))) }))
      .sort((a, b) => b.s - a.s);
    const [p1, p2] = byPrefix;
    if (p1 && p1.s >= 0.6 && p1.s - (p2?.s ?? 0) >= 0.3) return p1.i;
  }
  return null;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
}

// ---------------------------------------------------------------------------
// "Statement → Value" lists

function resolveArrows(rows: Row[], gaps: Gap[], solution: RichText[]): void {
  const values = [...new Set(gaps.flatMap((g) => (g.kind === "choice" ? g.options : [])))].sort(
    (a, b) => b.length - a.length,
  );
  if (values.length === 0) return;

  const parts = plainText(solution.join(" ")).split("→");
  const pairs: { label: string; value: string }[] = [];
  let label = parts[0]!.trim();
  for (let k = 1; k < parts.length; k++) {
    const rest = parts[k]!.trim();
    const value = values.find((v) => normalize(rest).startsWith(normalize(v)));
    if (!value) return; // Unknown format; let other strategies handle it.
    pairs.push({ label, value: key(value) });
    label = rest.slice(rawLengthOfPrefix(rest, value)).replace(/^[\s,;.]+/, "");
  }

  const labelled = labelledRows(rows);

  const candidates = labelled
    .flatMap((l) => pairs.map((p, pi) => ({ ...l, pi, value: p.value, s: similarity(l.label, p.label) })))
    .filter((c) => c.s >= 0.5)
    .sort((a, b) => b.s - a.s);
  const usedPairs = new Set<number>();
  for (const c of candidates) {
    const g = gaps[c.gap]!;
    if (g.kind !== "choice" || !isOpen(g) || usedPairs.has(c.pi)) continue;
    if (setChoice(g, c.value, "arrow")) usedPairs.add(c.pi);
  }
}

function rawLengthOfPrefix(raw: string, prefix: string): number {
  const target = normalize(prefix).length;
  for (let i = 0; i <= raw.length; i++) if (normalize(raw.slice(0, i)).length >= target) return i;
  return raw.length;
}

const rowText = (row: Row) => row.flatMap((s) => ("text" in s ? [s.text] : [])).join(" ");

// ---------------------------------------------------------------------------
// Statement lists in any notation: "Statement → Falsch,", "first line\t→ Ja"
// followed by continuation lines, "Statement  Trifft zu" … Each statement's
// region in the solution is located by its beginning; the verdict is the
// option word(s) in that region that aren't part of the statement itself.

const POSITIVE = ["richtig", "ja", "trifft zu", "zutreffend", "korrekt", "wahr"];
const NEGATIVE = ["falsch", "nein", "trifft nicht zu", "nicht zutreffend", "unzutreffend"];

function polarity(option: string): 1 | -1 | 0 {
  const k = plainText(option).toLowerCase().replace(/[.,;!]+$/, "").trim();
  return POSITIVE.includes(k) ? 1 : NEGATIVE.includes(k) ? -1 : 0;
}

/** Phrases that may express each option in a solution, longest first. */
function verdictPhrases(g: ChoiceGap): { phrase: string[]; index: number }[] {
  const phrases = g.options.map((o, index) => ({ phrase: words(o), index }));
  const pols = g.options.map(polarity);
  if (g.options.length === 2 && pols.includes(1) && pols.includes(-1)) {
    for (const syn of POSITIVE) phrases.push({ phrase: syn.split(" "), index: pols.indexOf(1) });
    for (const syn of NEGATIVE) phrases.push({ phrase: syn.split(" "), index: pols.indexOf(-1) });
  }
  return phrases.filter((p) => p.phrase.length > 0).sort((a, b) => b.phrase.length - a.phrase.length);
}

function resolveVerdicts(rows: Row[], gaps: Gap[], solution: RichText[]): void {
  // Statement rows end with their gap; options must be words ("Trifft zu"), not values ("3 - 4 m²").
  const endsWithGap = new Set(
    rows.flatMap((r) => {
      const last = r.at(-1);
      return r.length > 1 && "text" in r[0]! && last && "gap" in last ? [last.gap] : [];
    }),
  );
  const statements = labelledRows(rows).filter(({ gap }) => {
    const g = gaps[gap]!;
    return (
      g.kind === "choice" &&
      endsWithGap.has(gap) &&
      g.options.every((o) => words(o).length <= 3 && words(o).some((w) => /^\p{L}{3,}$/u.test(w)))
    );
  });
  if (!statements.some(({ gap }) => isOpen(gaps[gap]!))) return;

  const sol = mapped(solution.join(" "));
  // Locate each statement's beginning, in order.
  const starts: number[] = [];
  let from = 0;
  for (const st of statements) {
    const label = normalize(st.label);
    let at = -1;
    for (let offset = 0; offset + 15 <= label.length && offset <= 45 && at < 0; offset += 15) {
      const pos = sol.norm.indexOf(label.slice(offset, offset + 15), from);
      if (pos >= 0) at = Math.max(from, pos - offset);
    }
    starts.push(at);
    if (at >= 0) from = at + 1;
  }

  statements.forEach((st, k) => {
    const g = gaps[st.gap] as ChoiceGap;
    const start = starts[k]!;
    if (!isOpen(g) || start < 0) return;
    const nextStart = starts.slice(k + 1).find((s) => s >= 0) ?? sol.norm.length;
    // Only use a region if no statement in between went missing.
    if (starts.slice(k + 1).findIndex((s) => s >= 0) > 0) return;
    const region = words(rawSlice(sol, start, nextStart));
    const labelCounts = counts(words(st.label));
    const regionCounts = counts(region);

    const found = new Set<number>();
    for (const { phrase, index } of verdictPhrases(g)) {
      if (!containsSequence(region, phrase)) continue;
      // At least one occurrence must not be explained by the statement text itself.
      if (phrase.every((w) => (regionCounts.get(w) ?? 0) > (labelCounts.get(w) ?? 0))) {
        found.add(index);
        // A longer phrase ("trifft nicht zu") shadows its sub-phrases ("trifft zu" isn't contiguous anyway).
      }
    }
    if (found.size === 1) Object.assign(g, { correct: [...found][0]!, via: "verdict" } satisfies Partial<ChoiceGap>);
  });
}

/** Rows with exactly one gap, labelled by their text plus following rows without gaps. */
function labelledRows(rows: Row[]): { gap: number; label: string }[] {
  const out: { gap: number; label: string }[] = [];
  rows.forEach((row, r) => {
    const rowGaps = row.flatMap((s) => ("gap" in s ? [s.gap] : []));
    if (rowGaps.length !== 1) return;
    let text = rowText(row);
    for (let n = r + 1; n < rows.length && !rows[n]!.some((s) => "gap" in s); n++) text += " " + rowText(rows[n]!);
    out.push({ gap: rowGaps[0]!, label: text });
  });
  return out;
}

function counts(ws: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

function containsSequence(hay: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inline: the solution is the question text with the gaps filled in.

function resolveInline(rows: Row[], gaps: Gap[], solution: RichText[], stemTail: RichText): void {
  const sol = mapped(solution.join(" "));
  // Flatten to alternating text / gap groups: T0 [g…] T1 [g…] T2 …
  const texts: string[] = [""];
  const groups: number[][] = [];
  for (const row of rows) {
    for (const s of row) {
      if ("text" in s) texts[texts.length - 1] += normalize(s.text);
      else if (texts.at(-1) === "" && groups.length > 0 && texts.length === groups.length + 1) groups.at(-1)!.push(s.gap);
      else {
        groups.push([s.gap]);
        texts.push("");
      }
    }
  }
  if (groups.length === 0) return;
  // A row starting with a gap continues the sentence from the question text.
  if (!texts[0] && stemTail) texts[0] = normalize(stemTail);

  const results = new Map<number, { choice?: string; text?: string }>();
  let anchors = 0;
  let found = 0;
  let p = 0;
  const t0 = texts[0]!;
  let startAnchored = !t0;
  if (t0) {
    anchors++;
    const at = findAnchor(sol.norm, t0, 0);
    if (at && at.end >= 0) {
      found++;
      p = at.end;
      startAnchored = true;
    }
  }

  for (let k = 0; k < groups.length; k++) {
    const group = groups[k]!;
    const next = texts[k + 1]!;
    let q: number;
    let after = -1;
    if (next) {
      anchors++;
      const at = findAnchor(sol.norm, next, p);
      q = at?.start ?? -1;
      after = at?.end ?? -1;
      if (at) found++;
    } else q = sol.norm.length;
    // Without a following anchor the last gap extends to the end of the solution.
    const lastGroup = k === groups.length - 1;
    if (q < 0 && lastGroup) q = sol.norm.length;
    const end = q >= 0 ? q : Math.min(sol.norm.length, p + 80);
    const window = sol.norm.slice(p, end);
    const exactEnd = q >= 0 && !!next && q !== sol.norm.length;

    let offset = 0;
    let ok = true;
    for (const [n, gi] of group.entries()) {
      const g = gaps[gi]!;
      const rest = window.slice(offset);
      if (g.kind === "choice") {
        const opts = g.options.map(key).filter(Boolean).sort((a, b) => b.length - a.length);
        const lastOfGroup = n === group.length - 1;
        // Exact fill between anchors; otherwise the option the window starts with
        // (or, if the text before the first gap wasn't found, ends with).
        const restKey = rest.replace(/[.,;:!]+$/, "");
        const hit =
          opts.find((o) => (lastOfGroup && exactEnd ? restKey === o : rest.startsWith(o))) ??
          (k === 0 && !startAnchored && group.length === 1 && exactEnd ? opts.find((o) => rest.endsWith(o)) : undefined);
        if (!hit) {
          ok = false;
          break;
        }
        results.set(gi, { choice: hit });
        offset += hit.length;
      } else if (group.length === 1 && q >= 0 && window.length > 0 && window.length < (exactEnd ? 60 : 30)) {
        results.set(gi, { text: rawSlice(sol, p, end) });
        offset = window.length;
      } else {
        ok = false;
        break;
      }
    }
    if (after >= 0) p = after;
    else if (ok) p += offset;
    if (!ok) for (const gi of group) results.delete(gi);
  }

  // Only trust the alignment if the solution really mirrors the question text.
  if (anchors > 0 && found / anchors < 0.6) return;
  for (const [gi, r] of results) {
    const g = gaps[gi]!;
    if (!isOpen(g)) continue;
    if (g.kind === "choice" && r.choice) setChoice(g, r.choice, "inline");
    else if (g.kind === "text" && r.text) Object.assign(g, { expected: r.text, via: "inline" } satisfies Partial<TextGap>);
  }
}

/**
 * Finds an anchor text at or after `from`. Long anchors that differ slightly
 * from the solution (rephrased words) are located by their first and last
 * 12 characters; `end` is -1 if only the beginning could be located.
 */
function findAnchor(hay: string, anchor: string, from: number): { start: number; end: number } | null {
  const at = hay.indexOf(anchor, from);
  if (at >= 0) return { start: at, end: at + anchor.length };
  if (anchor.length < 24) return null;
  const head = hay.indexOf(anchor.slice(0, 12), from);
  if (head < 0) return null;
  const tailPiece = anchor.slice(-12);
  const tail = hay.indexOf(tailPiece, head + 12);
  // Accept the tail only if the matched span has roughly the anchor's length.
  if (tail >= 0 && Math.abs(tail + 12 - head - anchor.length) <= anchor.length * 0.2 + 4) {
    return { start: head, end: tail + tailPiece.length };
  }
  // The start is known but not the end (e.g. trailing text absent from the solution).
  return { start: head, end: -1 };
}

// ---------------------------------------------------------------------------
// Tables: solution lines with tab-separated cells, matched by row label.

function resolveTable(rows: Row[], gaps: Gap[], solution: RichText[]): void {
  const solRows = solution.filter((l) => l.includes("\t")).map((l) => l.split("\t").map((c) => c.trim()));
  if (solRows.length === 0) return;
  for (const row of rows) {
    const rowGaps = row.flatMap((s) => ("gap" in s ? [s.gap] : []));
    if (!rowGaps.some((gi) => isOpen(gaps[gi]!))) continue;
    const first = row[0];
    const label = first && "text" in first ? key(first.text.split("\t")[0]!) : "";
    if (!label) continue;
    const match = solRows.find((cells) => key(cells[0]!) === label && cells.length - 1 === rowGaps.length);
    if (!match) continue;
    rowGaps.forEach((gi, n) => {
      const g = gaps[gi]!;
      const cell = match[n + 1]!;
      if (!isOpen(g)) return;
      if (g.kind === "choice") setChoice(g, key(cell), "table");
      else Object.assign(g, { expected: cell, via: "table" } satisfies Partial<TextGap>);
    });
  }
}

// ---------------------------------------------------------------------------
// Calculations: "… beträgt [__] kW." ← "… = 1,15 kW" in the worked solution.

const NUMBER = String.raw`[-−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|[-−]?\d+(?:,\d+)?`;

function resolveNumeric(rows: Row[], gaps: Gap[], solution: RichText[]): void {
  const lines = solution.map(plainText);
  // The final result of each calculation line: "Φ = 1,8 kW : [42/29,7]^1,3 = 1,15 kW" → 1,15 kW.
  const results: { value: string; unit: string; line: number }[] = [];
  const re = new RegExp(String.raw`[=≈]\s*(${NUMBER})\s*([^\s\d=≈;:,]*)`, "g");
  lines.forEach((l, line) => {
    const last = [...l.matchAll(re)].at(-1);
    if (!last) return;
    const unit = cleanUnit(last[2] ?? "");
    if (/^[-+−·*/×÷(:]/.test(unit)) return;
    results.push({ value: last[1]!, unit, line });
  });
  // Any "number unit" mention, for results stated without "=" ("1,2 m²K/W < 1,853 m²K/W").
  const mentions: { value: string; unit: string; line: number }[] = [];
  const any = new RegExp(String.raw`(?<![\d,.])(${NUMBER})\s*([^\s\d=≈;:,]+)`, "g");
  lines.forEach((l, line) => {
    for (const m of l.matchAll(any)) mentions.push({ value: m[1]!, unit: cleanUnit(m[2] ?? ""), line });
  });

  const textGaps: { gap: TextGap; unit: string }[] = [];
  for (const row of rows) {
    row.forEach((s, n) => {
      if (!("gap" in s)) return;
      const g = gaps[s.gap]!;
      if (g.kind !== "text" || !isOpen(g)) return;
      const after = row[n + 1];
      const unit = after && "text" in after ? cleanUnit(plainText(after.text).trim().split(/\s+/)[0] ?? "") : "";
      textGaps.push({ gap: g, unit });
    });
  }

  const set = (g: TextGap, hit: { value: string; unit: string }, unit: string) => {
    const value = parseGermanNumber(hit.value);
    if (value === null) return;
    const u = unit || hit.unit;
    Object.assign(g, {
      expected: `${hit.value} ${u}`.trim(),
      numeric: u ? { value, unit: u } : { value },
      via: "numeric",
    } satisfies Partial<TextGap>);
  };

  // A single unitless answer field ("Antwort: [__]") takes the final result.
  if (textGaps.length === 1 && !textGaps[0]!.unit && results.length > 0) {
    set(textGaps[0]!.gap, results.at(-1)!, "");
    return;
  }

  let cursor = -1;
  for (const { gap, unit } of textGaps) {
    const hit =
      results.find((r) => r.line > cursor && unitsMatch(unit, r.unit)) ??
      (unit ? mentions.find((r) => r.line > cursor && unitsMatch(unit, r.unit)) : undefined);
    if (!hit) continue;
    cursor = hit.line;
    set(gap, hit, unit);
  }
}

/** "kWh" matches "kWh/d", "Liter" matches "l/a"; both empty match too. */
function unitsMatch(gapUnit: string, resultUnit: string): boolean {
  const n = (u: string) => u.toLowerCase().replace(/^liter$/, "l").replace(/^liter\//, "l/");
  const a = n(gapUnit);
  const b = n(resultUnit);
  return a === b || (a !== "" && (b.startsWith(a + "/") || a.startsWith(b + "/")));
}

function cleanUnit(u: string): string {
  let unit = u.replace(/[.,;]+$/, "").replace(/^\[|\]$/g, "").replace(/^[.,;:]+$/, "").trim();
  // "kWh/(m²a)" keeps its bracket, "(5 kW)" loses the stray one.
  while (/\)$/.test(unit) && !unbalanced(unit.slice(0, -1))) unit = unit.slice(0, -1).replace(/[.,;]+$/, "");
  // "… maximal [__] betragen." – a German word, not a unit.
  return /^[a-zäöüß]{4,}$/.test(unit) ? "" : unit;
}

// ---------------------------------------------------------------------------
// Last resort: exactly one option of a choice gap is mentioned in the solution.
// Only for gaps whose options no other open gap shares; otherwise a mention
// can't be attributed to a specific gap.

function resolveMentions(gaps: Gap[], solution: RichText[]): void {
  const sol = key(solution.join(" "));
  const open = gaps.filter((g): g is ChoiceGap => g.kind === "choice" && isOpen(g));
  for (const g of open) {
    const own = new Set(g.options.map(key));
    if (open.some((o) => o !== g && o.options.some((x) => own.has(key(x))))) continue;
    const hits = mentioned(sol, [...own]);
    if (hits.length === 1) setChoice(g, hits[0]!, "mention");
  }
}

// Choice gaps whose options are whole sentences (radio groups inside a form):
// pick the option most similar to the solution, as for single-choice questions.

function resolveSentenceChoices(gaps: Gap[], solution: RichText[]): void {
  for (const g of gaps) {
    if (g.kind !== "choice" || !isOpen(g)) continue;
    const avg = g.options.reduce((n, o) => n + o.length, 0) / Math.max(1, g.options.length);
    if (avg < 25) continue;
    const correct = resolveSingle(g.options, solution);
    if (correct !== null) Object.assign(g, { correct, via: "mention" } satisfies Partial<ChoiceGap>);
  }
}
