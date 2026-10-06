// Runs the importer in a real browser with the modern pdf.js build and a worker.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { detectDocument, importCatalog, importFormulas } from "@exam/importer";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

async function run(file: string) {
  const data = new Uint8Array(await (await fetch(`/private/pdfs/${file}`)).arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const kind = await detectDocument(doc);
  if (kind.kind === "formulas") return { file, formulas: (await importFormulas(pdfjs, doc)).entries.length };
  if (kind.kind !== "questions") throw new Error(`${file}: ${kind.kind}`);
  const catalog = await importCatalog(pdfjs, doc, kind.catalog);
  return { file, catalog };
}

const files = new URLSearchParams(location.search).getAll("file");
const started = performance.now();
Promise.all(files.map(run))
  .then((results) => Object.assign(window, { __result: { results, ms: performance.now() - started } }))
  .catch((e) => Object.assign(window, { __result: { error: String(e?.stack ?? e) } }));
