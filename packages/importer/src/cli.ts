import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type AnnotationFile,
  type Catalog,
  mergeAnnotations,
  parseAnnotationFile,
  plainText,
  type Question,
  type QuestionAnnotation,
  type RichText,
} from "@exam/core";
import { detectDocument, importCatalog, importFormulas } from "./index.ts";
import { extractPage } from "./pdf/page.ts";
import { nodePdfJs, openPdf } from "./node.ts";

const USAGE = `Usage:
  node packages/importer/src/cli.ts dump <pdf> [fromPage] [toPage]   print lines, fields and solutions per page
  node packages/importer/src/cli.ts import <outDir> <pdf>...          write <catalog>-<part>.json per catalogue, formeln.json
  node packages/importer/src/cli.ts bundle <outDir> <pdf>...          like import, plus the PDFs and manifest.json for the app
  node packages/importer/src/cli.ts report <pdf>... [--verbose]       import and print coverage / issues
  node packages/importer/src/cli.ts show <pdf> <code>...              print imported questions as JSON
  node packages/importer/src/cli.ts formulas <pdf>                    list the formula collection index
  node packages/importer/src/cli.ts merge-reviews <file>...           merge exported review files into annotations/annotations.json
  node packages/importer/src/cli.ts reviews <file> [pdf...]           list corrections, notes and outdated reviews (default PDFs: private/pdfs)
  node packages/importer/src/cli.ts baseline <name> <pdf>...          record question hashes of a build handed out for review`;

const ROOT = join(import.meta.dirname, "../../..");
const ANNOTATIONS = join(ROOT, "annotations/annotations.json");
const BASELINE = join(ROOT, "annotations/review-baseline.json");

/**
 * Question hashes of the build a reviewer has. Reviews only apply while the
 * importer produces the same hashes, so this is checked when merging and in tests.
 */
interface Baseline {
  build: string;
  createdAt: string;
  pdfs: Record<string, { name: string; sha256: string }>;
  questions: Record<string, string>;
}

async function dump(file: string, from = 1, to = Infinity) {
  const doc = await openPdf(file);
  for (let p = from; p <= Math.min(to, doc.numPages); p++) {
    const page = await extractPage(nodePdfJs, doc, p);
    console.log(`\n######## page ${p}`);
    for (const l of page.lines) console.log(`${fmt(l.y)} ${fmt(l.x0)} ${fmt(l.size)} | ${l.text}`);
    for (const f of page.fields) {
      const kind = f.radioButton ? "radio" : f.checkBox ? "check" : f.fieldType === "Ch" ? "choice" : f.fieldType === "Tx" ? "text" : f.fieldType;
      const opts = f.options ? " " + JSON.stringify(f.options.map((o) => o.displayValue)) : "";
      const value = f.radioButton || f.checkBox ? ` =${f.buttonValue}` : "";
      console.log(`  [${kind}] y=${fmt(f.rect[1])}-${fmt(f.rect[3])} x=${fmt(f.rect[0])}-${fmt(f.rect[2])} ${JSON.stringify(f.fieldName)}${value}${opts}`);
    }
    for (const b of page.solutionButtons) console.log(`  [solution-button] y=${fmt(b.rect[1])}-${fmt(b.rect[3])}`);
    for (const s of page.solutions) {
      console.log(`  [solution ${s.key}] y=${fmt(s.rect[1])}-${fmt(s.rect[3])}`);
      for (const l of s.lines) console.log(`      ${fmt(l.x0)} | ${l.text}`);
    }
  }
}

async function load(file: string): Promise<Catalog> {
  const doc = await openPdf(file);
  const kind = await detectDocument(doc);
  if (kind.kind !== "questions") throw new Error(`${file}: kein Fragenkatalog (${kind.kind})`);
  return importCatalog(nodePdfJs, doc, kind.catalog);
}

/** With `withPdfs`, also copies each PDF as <id>.pdf and lists them in manifest.json (built-in PDFs of a private build). */
async function importTo(outDir: string, files: string[], withPdfs = false) {
  await mkdir(outDir, { recursive: true });
  const manifest: { id: string; name: string }[] = [];
  for (const file of files) {
    const doc = await openPdf(file);
    let id: string;
    if ((await detectDocument(doc)).kind === "formulas") {
      const index = await importFormulas(nodePdfJs, doc);
      id = "formeln";
      await writeFile(join(outDir, `${id}.json`), JSON.stringify(index, null, 2));
      console.log(`${basename(file)} → ${id}.json (${index.entries.length} Formeln)`);
    } else {
      const catalog = await load(file);
      id = `${catalog.catalog}-${catalog.part}`;
      await writeFile(join(outDir, `${id}.json`), JSON.stringify(catalog, null, 2));
      console.log(`${basename(file)} → ${id}.json (${catalog.questions.length} Fragen)`);
    }
    if (withPdfs) {
      await copyFile(file, join(outDir, `${id}.pdf`));
      manifest.push({ id, name: basename(file) });
    }
  }
  if (withPdfs) await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function baseline(build: string, files: string[]) {
  const result: Baseline = { build, createdAt: new Date().toISOString(), pdfs: {}, questions: {} };
  for (const file of files) {
    const doc = await openPdf(file);
    const kind = await detectDocument(doc);
    if (kind.kind !== "questions") continue;
    const c = await importCatalog(nodePdfJs, doc, kind.catalog);
    const sha256 = createHash("sha256").update(await readFile(file)).digest("hex");
    result.pdfs[`${c.catalog}-${c.part}`] = { name: basename(file), sha256 };
    for (const q of c.questions) result.questions[q.key] = q.hash;
  }
  await writeFile(BASELINE, JSON.stringify(result, null, 1) + "\n");
  console.log(`${Object.keys(result.questions).length} Fragen aus ${Object.keys(result.pdfs).length} Katalogen → ${BASELINE}`);
}

async function readReviewFile(f: string): Promise<AnnotationFile> {
  return parseAnnotationFile(JSON.parse(await readFile(f, "utf8")));
}

async function mergeReviews(files: string[]) {
  // Every export contains all reviews so far; merge oldest first so the newest wins.
  const incoming = await Promise.all(files.map(async (f) => ({ f, file: await readReviewFile(f) })));
  incoming.sort((a, b) => a.file.exportedAt.localeCompare(b.file.exportedAt));
  const base = parseAnnotationFile(JSON.parse(await readFile(ANNOTATIONS, "utf8")));
  const questions = mergeAnnotations(base.questions, ...incoming.map((x) => x.file.questions));
  const sorted = Object.fromEntries(Object.entries(questions).sort(([a], [b]) => a.localeCompare(b, "de", { numeric: true })));
  await writeFile(ANNOTATIONS, JSON.stringify({ ...base, exportedAt: new Date().toISOString(), questions: sorted }, null, 2) + "\n");
  for (const { f, file } of incoming) console.log(`${basename(f)} (exportiert ${file.exportedAt}): ${summary(file.questions)}`);
  console.log(`→ ${Object.keys(sorted).length} Fragen in annotations/annotations.json`);

  if (!existsSync(BASELINE)) return;
  const b: Baseline = JSON.parse(await readFile(BASELINE, "utf8"));
  const off = Object.entries(sorted).filter(([k, a]) => b.questions[k] !== undefined && b.questions[k] !== a.hash);
  const unknown = Object.keys(sorted).filter((k) => b.questions[k] === undefined);
  if (off.length || unknown.length) {
    console.warn(
      `WARNUNG: ${off.length} Prüfungen passen nicht zu Build "${b.build}", ${unknown.length} Fragen sind dort unbekannt:\n  ` +
        [...off.map(([k]) => k), ...unknown].join(" "),
    );
  } else {
    console.log(`Alle Prüfungen passen zu Build "${b.build}".`);
  }
}

function summary(qs: Record<string, QuestionAnnotation>): string {
  const all = Object.values(qs);
  const n = (p: (a: QuestionAnnotation) => boolean) => all.filter(p).length;
  return (
    `${n((a) => a.status === "confirmed")} ✓, ${n((a) => a.status === "wrong")} ✗, ${n((a) => a.status === "unclear")} ?, ` +
    `${n((a) => !!a.answer)} mit Antwort, ${n((a) => !!a.note?.trim())} mit Anmerkung, ${n((a) => !!a.formulas?.length)} mit Formeln`
  );
}

/** Readable list of what the reviewer changed or remarked, against the current import. */
async function listReviews(file: string, pdfs: string[]) {
  const { questions: reviews, exportedAt } = await readReviewFile(file);
  if (pdfs.length === 0) {
    const dir = join(ROOT, "private/pdfs");
    pdfs = (await readdir(dir)).filter((f) => f.endsWith(".pdf")).map((f) => join(dir, f));
  }
  const byKey = new Map<string, Question>();
  for (const f of pdfs) {
    const doc = await openPdf(f);
    const kind = await detectDocument(doc);
    if (kind.kind === "questions") for (const q of (await importCatalog(nodePdfJs, doc, kind.catalog)).questions) byKey.set(q.key, q);
  }
  console.log(`${basename(file)}, exportiert ${exportedAt}: ${summary(reviews)}\n`);
  for (const [key, a] of Object.entries(reviews).sort(([x], [y]) => x.localeCompare(y, "de", { numeric: true }))) {
    const q = byKey.get(key);
    const remarkable = a.status !== "confirmed" || a.note?.trim() || (a.answer && q && answerText(q, a) !== importedText(q));
    if (!remarkable && q?.hash === a.hash) continue;
    console.log(`${key}  ${q?.topic ?? "(Frage nicht gefunden)"}  [${a.status ?? "–"}]`);
    if (q && q.hash !== a.hash) console.log("  ACHTUNG: Frage hat sich seit der Prüfung geändert – Prüfung wird ignoriert");
    if (q && a.answer) console.log(`  Antwort: ${importedText(q)}  →  ${answerText(q, a)}`);
    if (a.note?.trim()) console.log(`  Anmerkung: ${a.note.trim()}`);
  }
}

function importedText(q: Question): string {
  const i = q.interaction;
  if (i.kind === "single") return i.correct === null ? "?" : plainText(i.options[i.correct]!);
  if (i.kind === "gaps") {
    return i.gaps
      .map((g) => (g.kind === "choice" ? (g.correct === null ? "?" : plainText(g.options[g.correct]!)) : (g.expected ?? "?")))
      .join(" | ");
  }
  return "(offen)";
}

function answerText(q: Question, a: QuestionAnnotation): string {
  const i = q.interaction;
  const o = a.answer;
  const option = (opts: RichText[], n: number) => (opts[n] ? plainText(opts[n]) : "?");
  if (o?.kind === "single" && i.kind === "single") return option(i.options, o.correct);
  if (o?.kind === "gaps" && i.kind === "gaps") {
    return i.gaps
      .map((g, n) => {
        const x = o.gaps[n];
        if (!x) return g.kind === "choice" ? (g.correct === null ? "?" : plainText(g.options[g.correct]!)) : (g.expected ?? "?");
        return "correct" in x && g.kind === "choice" ? option(g.options, x.correct) : "expected" in x ? x.expected : "?";
      })
      .join(" | ");
  }
  return importedText(q);
}

function isResolved(q: Question): boolean {
  const i = q.interaction;
  if (i.kind === "single") return i.correct !== null;
  if (i.kind === "gaps") return i.gaps.every((g) => (g.kind === "choice" ? g.correct !== null : g.expected !== null));
  return true;
}

async function report(files: string[], verbose: boolean) {
  for (const file of files) {
    const c = await load(file);
    const qs = c.questions;
    const by = (k: string) => qs.filter((q) => q.interaction.kind === k).length;
    const vias = new Map<string, number>();
    for (const q of qs) {
      const i = q.interaction;
      const list = i.kind === "single" ? [i.via ?? "–"] : i.kind === "gaps" ? i.gaps.map((g) => g.via ?? "–") : [];
      for (const v of list) vias.set(v, (vias.get(v) ?? 0) + 1);
    }
    console.log(
      `\n${basename(file)}: ${c.catalog} Teil ${c.part}, Version ${c.version}, ${qs.length} Fragen ` +
        `(single ${by("single")}, gaps ${by("gaps")}, open ${by("open")}), ` +
        `vollständig gelöst ${qs.filter(isResolved).length}, mit Hinweisen ${qs.filter((q) => q.issues.length).length}, ` +
        `Abbildungen ${qs.filter((q) => q.figures.length).length}`,
    );
    console.log(`  Antwortquellen: ${[...vias].map(([k, v]) => `${k}=${v}`).join(" ")}`);
    if (verbose) for (const q of qs) for (const issue of q.issues) console.log(`  ${q.key} S.${q.source[0]?.page}: ${issue}`);
  }
}

const fmt = (n: number) => n.toFixed(0).padStart(3);

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "dump":
    if (!args[0]) throw new Error(USAGE);
    await dump(args[0], args[1] ? +args[1] : 1, args[2] ? +args[2] : Infinity);
    break;
  case "import":
    if (args.length < 2) throw new Error(USAGE);
    await importTo(args[0]!, args.slice(1));
    break;
  case "bundle":
    if (args.length < 2) throw new Error(USAGE);
    await importTo(args[0]!, args.slice(1), true);
    break;
  case "formulas": {
    const index = await importFormulas(nodePdfJs, await openPdf(args[0]!));
    console.log(`Version ${index.version}, ${index.entries.length} Einträge`);
    for (const e of index.entries) {
      console.log(`S.${e.region.page} ${e.id}  [${e.symbols.map((s) => s.symbol).join(", ")}]`);
    }
    break;
  }
  case "show": {
    const c = await load(args[0]!);
    for (const code of args.slice(1)) {
      const q = c.questions.find((q) => q.code === code || q.key.endsWith("/" + code));
      console.log(q ? JSON.stringify(q, null, 1) : `${code}: nicht gefunden`);
    }
    break;
  }
  case "merge-reviews":
    if (args.length === 0) throw new Error(USAGE);
    await mergeReviews(args);
    break;
  case "reviews":
    if (!args[0]) throw new Error(USAGE);
    await listReviews(args[0], args.slice(1));
    break;
  case "baseline":
    if (args.length < 2) throw new Error(USAGE);
    await baseline(args[0]!, args.slice(1));
    break;
  case "report":
    await report(args.filter((a) => !a.startsWith("--")), args.includes("--verbose"));
    break;
  default:
    console.error(USAGE);
    process.exitCode = 1;
}
