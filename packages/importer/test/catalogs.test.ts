// Integration tests against the real BAFA PDFs. They are not part of the
// repository (see README); put them into private/pdfs/ to run these tests.
// Snapshots contain BAFA content and are therefore written to private/golden/.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, Question } from "@exam/core";
import { describe, expect, it } from "vitest";
import { detectDocument, importCatalog, importFormulas } from "../src/index.ts";
import { nodePdfJs, openPdf } from "../src/node.ts";

const PDFS = join(import.meta.dirname, "../../../private/pdfs");
const GOLDEN = join(import.meta.dirname, "../../../private/golden");

const CATALOGS = [
  { file: "wg1.pdf", catalog: "WG", part: 1, minQuestions: 220, minResolved: 0.95 },
  { file: "wg2.pdf", catalog: "WG", part: 2, minQuestions: 255, minResolved: 0.88 },
  { file: "wg3.pdf", catalog: "WG", part: 3, minQuestions: 240, minResolved: 0.8 },
  { file: "nwg1.pdf", catalog: "NWG", part: 1, minQuestions: 99, minResolved: 0.98 },
  { file: "nwg2.pdf", catalog: "NWG", part: 2, minQuestions: 255, minResolved: 0.88 },
  { file: "nwg3.pdf", catalog: "NWG", part: 3, minQuestions: 210, minResolved: 0.85 },
] as const;

function resolved(q: Question): boolean {
  const i = q.interaction;
  if (i.kind === "single") return i.correct !== null;
  if (i.kind === "gaps") return i.gaps.every((g) => (g.kind === "choice" ? g.correct !== null : g.expected !== null));
  return true;
}

/** Compact answer key: what the importer derived for every question. */
function answerKey(c: Catalog) {
  return Object.fromEntries(
    c.questions.map((q) => {
      const i = q.interaction;
      const answer =
        i.kind === "single"
          ? i.correct
          : i.kind === "gaps"
            ? i.gaps.map((g) => (g.kind === "choice" ? g.correct : g.expected))
            : "open";
      return [q.key, answer];
    }),
  );
}

describe.skipIf(!existsSync(PDFS))("BAFA catalogues", () => {
  for (const spec of CATALOGS) {
    describe(spec.file, () => {
      let catalog: Catalog;

      it("imports", async () => {
        const doc = await openPdf(join(PDFS, spec.file));
        expect(await detectDocument(doc)).toEqual({ kind: "questions", catalog: spec.catalog });
        catalog = await importCatalog(nodePdfJs, doc, spec.catalog);
        expect(catalog.part).toBe(spec.part);
        expect(catalog.version).toMatch(/^\d\d\.\d\d\.\d\d$/);
      });

      it("finds every question with a unique key and a solution", () => {
        expect(catalog.questions.length).toBeGreaterThanOrEqual(spec.minQuestions);
        const keys = catalog.questions.map((q) => q.key);
        expect(new Set(keys).size).toBe(keys.length);
        const withoutSolution = catalog.questions.filter((q) => q.solution.length === 0).map((q) => q.key);
        expect(withoutSolution.length).toBeLessThanOrEqual(3);
      });

      it("derives answers for most questions", () => {
        const share = catalog.questions.filter(resolved).length / catalog.questions.length;
        expect(share).toBeGreaterThanOrEqual(spec.minResolved);
      });

      it("matches the answer-key snapshot", async () => {
        await expect(JSON.stringify(answerKey(catalog), null, 1)).toMatchFileSnapshot(
          join(GOLDEN, `${spec.catalog}-${spec.part}.answers.json`),
        );
      });
    });
  }

  it("indexes the formula collection", async () => {
    const doc = await openPdf(join(PDFS, "formelsammlung.pdf"));
    expect(await detectDocument(doc)).toEqual({ kind: "formulas" });
    const index = await importFormulas(nodePdfJs, doc);
    expect(index.version).toBe("Juli 2025");
    expect(index.entries.length).toBeGreaterThanOrEqual(85);
    const ids = index.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const u = index.entries.find((e) => e.id === "waermetransport-waermeschutz/waermedurchgangskoeffizient-spezifisch-bezogen-auf-1-m2");
    expect(u?.symbols.map((s) => s.symbol)).toContain("U");
    expect(u?.region.page).toBe(4);
    await expect(JSON.stringify(index.entries.map((e) => [e.id, e.region]), null, 1)).toMatchFileSnapshot(
      join(GOLDEN, "formeln.index.json"),
    );
  });
});
