import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type Catalog, mergeAnnotations, parseAnnotationFile, type Question } from "@exam/core";
import { detectDocument, importCatalog, importFormulas } from "./index.ts";
import { extractPage } from "./pdf/page.ts";
import { nodePdfJs, openPdf } from "./node.ts";

const USAGE = `Usage:
  node packages/importer/src/cli.ts dump <pdf> [fromPage] [toPage]   print lines, fields and solutions per page
  node packages/importer/src/cli.ts import <outDir> <pdf>...          write <catalog>-<part>.json per catalogue, formeln.json
  node packages/importer/src/cli.ts report <pdf>... [--verbose]       import and print coverage / issues
  node packages/importer/src/cli.ts show <pdf> <code>...              print imported questions as JSON
  node packages/importer/src/cli.ts formulas <pdf>                    list the formula collection index
  node packages/importer/src/cli.ts merge-reviews <file>...           merge exported review files into annotations/annotations.json`;

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

async function importTo(outDir: string, files: string[]) {
  await mkdir(outDir, { recursive: true });
  for (const file of files) {
    const doc = await openPdf(file);
    if ((await detectDocument(doc)).kind === "formulas") {
      const index = await importFormulas(nodePdfJs, doc);
      const out = join(outDir, "formeln.json");
      await writeFile(out, JSON.stringify(index, null, 2));
      console.log(`${basename(file)} → ${out} (${index.entries.length} Formeln)`);
      continue;
    }
    const catalog = await load(file);
    const out = join(outDir, `${catalog.catalog}-${catalog.part}.json`);
    await writeFile(out, JSON.stringify(catalog, null, 2));
    console.log(`${basename(file)} → ${out} (${catalog.questions.length} Fragen)`);
  }
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
  case "merge-reviews": {
    // Later files win per question; the bundled file is shipped with the app.
    const target = join(import.meta.dirname, "../../../annotations/annotations.json");
    const base = parseAnnotationFile(JSON.parse(await readFile(target, "utf8")));
    const incoming = await Promise.all(args.map(async (f) => parseAnnotationFile(JSON.parse(await readFile(f, "utf8")))));
    const questions = mergeAnnotations(base.questions, ...incoming.map((f) => f.questions));
    const sorted = Object.fromEntries(Object.entries(questions).sort(([a], [b]) => a.localeCompare(b, "de", { numeric: true })));
    await writeFile(target, JSON.stringify({ ...base, exportedAt: new Date().toISOString(), questions: sorted }, null, 2) + "\n");
    const counts = incoming.map((f, i) => `${basename(args[i]!)}: ${Object.keys(f.questions).length}`).join(", ");
    console.log(`${counts} → ${Object.keys(sorted).length} Fragen in annotations/annotations.json`);
    break;
  }
  case "report":
    await report(args.filter((a) => !a.startsWith("--")), args.includes("--verbose"));
    break;
  default:
    console.error(USAGE);
    process.exitCode = 1;
}
