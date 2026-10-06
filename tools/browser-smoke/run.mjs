// Usage: node tools/browser-smoke/run.mjs [pdf names…]
// Imports the given PDFs in headless Chromium and compares the answer keys
// with the Node import (private/golden snapshots).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = join(import.meta.dirname, "../..");
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["nwg1.pdf", "formelsammlung.pdf"];

// Uses a Chromium from the local Playwright cache (or CHROME=/path/to/chrome).
const cache = join(homedir(), ".cache/ms-playwright");
const dir = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1) : undefined;
const executablePath =
  process.env.CHROME ??
  ["chrome-linux64/chrome", "chrome-linux/chrome"].map((p) => dir && join(cache, dir, p)).find((p) => p && existsSync(p));
if (!executablePath) throw new Error("Kein Chromium gefunden – CHROME=/pfad/zu/chrome setzen");

const server = await createServer({ root, logLevel: "error", server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`http://localhost:5199/tools/browser-smoke/index.html?${files.map((f) => `file=${f}`).join("&")}`);
  const result = await page.waitForFunction(() => window.__result, null, { timeout: 120_000 }).then((h) => h.jsonValue());
  if (result.error) throw new Error(result.error);
  console.log(`Import im Browser: ${Math.round(result.ms)} ms`);
  let failed = false;
  for (const r of result.results) {
    if (r.formulas !== undefined) {
      console.log(`${r.file}: ${r.formulas} Formeln`);
      continue;
    }
    const c = r.catalog;
    const key = Object.fromEntries(
      c.questions.map((q) => {
        const i = q.interaction;
        const a = i.kind === "single" ? i.correct : i.kind === "gaps" ? i.gaps.map((g) => (g.kind === "choice" ? g.correct : g.expected)) : "open";
        return [q.key, a];
      }),
    );
    const golden = JSON.parse(readFileSync(join(root, `private/golden/${c.catalog}-${c.part}.answers.json`), "utf8"));
    const same = JSON.stringify(key) === JSON.stringify(golden);
    failed ||= !same;
    console.log(`${r.file}: ${c.questions.length} Fragen, Antwortschlüssel ${same ? "identisch mit Node-Import" : "WEICHT AB"}`);
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  await server.close();
}
