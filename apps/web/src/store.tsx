import {
  type AnnotatedQuestion,
  type AnnotationFile,
  applyAnnotation,
  type Catalog,
  emptyAnnotationFile,
  type FormulaIndex,
  mergeAnnotations,
  parseAnnotationFile,
  type QuestionAnnotation,
  type QuestionProgress,
  recordResult,
} from "@exam/core";
import { detectDocument, importCatalog, importFormulas } from "@exam/importer";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import bundled from "../../../annotations/annotations.json";
import * as db from "./db.ts";
import { forgetDocs, openPdf, pdfjs } from "./pdf.ts";

export const FORMULA_DOC = "formeln";

interface Data {
  catalogs: { id: db.DocId; catalog: Catalog }[];
  formulas: FormulaIndex | null;
  progress: Record<string, QuestionProgress>;
  reviews: Record<string, QuestionAnnotation>;
  settings: db.Settings;
}

export interface ImportProgress {
  file: string;
  page: number;
  total: number;
}

export interface ImportResult {
  file: string;
  ok: boolean;
  message: string;
}

interface Store extends Data {
  questions: AnnotatedQuestion[];
  byKey: Map<string, AnnotatedQuestion>;
  /** PDF a question was imported from. */
  docOf: (key: string) => db.DocId;
  /** Review data: bundled file plus local changes. */
  annotations: Record<string, QuestionAnnotation>;
  importPdfs(files: File[], onProgress: (p: ImportProgress) => void): Promise<ImportResult[]>;
  record(key: string, right: boolean): void;
  setReview(key: string, a: QuestionAnnotation | null): void;
  updateSettings(s: Partial<db.Settings>): void;
  exportReviews(): AnnotationFile;
  importReviews(json: unknown): number;
  resetProgress(): void;
}

const bundledAnnotations = parseAnnotationFile(bundled).questions;
const Context = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Context);
  if (!s) throw new Error("StoreProvider fehlt");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => db.loadAll().then(setData, (e) => setError(String(e))), []);
  useEffect(() => void reload(), [reload]);

  const store = useMemo<Store | null>(() => {
    if (!data) return null;
    const annotations = mergeAnnotations(bundledAnnotations, data.reviews);
    const docs = new Map<string, db.DocId>();
    const questions: AnnotatedQuestion[] = [];
    for (const { id, catalog } of data.catalogs.sort((a, b) => a.id.localeCompare(b.id))) {
      for (const q of catalog.questions) {
        docs.set(q.key, id);
        questions.push(applyAnnotation(q, annotations[q.key]));
      }
    }

    return {
      ...data,
      questions,
      byKey: new Map(questions.map((q) => [q.key, q])),
      docOf: (key) => docs.get(key) ?? "",
      annotations,

      async importPdfs(files, onProgress) {
        const results: ImportResult[] = [];
        for (const file of files) {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const doc = await openPdf(bytes);
            try {
              const kind = await detectDocument(doc);
              const progress = { onProgress: (page: number, total: number) => onProgress({ file: file.name, page, total }) };
              if (kind.kind === "formulas") {
                const formulas = await importFormulas(pdfjs, doc);
                await db.saveImport({ id: FORMULA_DOC, name: file.name, bytes, importedAt: Date.now() }, { formulas });
                results.push({ file: file.name, ok: true, message: `Formelsammlung: ${formulas.entries.length} Formeln` });
              } else if (kind.kind === "questions") {
                const catalog = await importCatalog(pdfjs, doc, kind.catalog, progress);
                const id = `${catalog.catalog}-${catalog.part}`;
                await db.saveImport({ id, name: file.name, bytes, importedAt: Date.now() }, { catalog });
                results.push({ file: file.name, ok: true, message: `${catalogLabel(id)}: ${catalog.questions.length} Fragen` });
              } else {
                results.push({ file: file.name, ok: false, message: "Kein BAFA-Fragenkatalog und keine Formelsammlung" });
              }
            } finally {
              await doc.loadingTask.destroy();
            }
          } catch (e) {
            results.push({ file: file.name, ok: false, message: `Fehler: ${e instanceof Error ? e.message : e}` });
          }
        }
        forgetDocs();
        await reload();
        return results;
      },

      record(key, right) {
        const p = recordResult(data.progress[key], right);
        setData((d) => d && { ...d, progress: { ...d.progress, [key]: p } });
        void db.saveProgress(key, p);
      },

      setReview(key, a) {
        setData((d) => {
          if (!d) return d;
          const reviews = { ...d.reviews };
          if (a) reviews[key] = a;
          else delete reviews[key];
          return { ...d, reviews };
        });
        void db.saveReview(key, a);
      },

      updateSettings(s) {
        const settings = { ...data.settings, ...s };
        setData((d) => d && { ...d, settings });
        void db.saveSettings(settings);
      },

      exportReviews() {
        return { ...emptyAnnotationFile(), questions: annotations };
      },

      importReviews(json) {
        const file = parseAnnotationFile(json);
        const entries = Object.entries(file.questions);
        setData((d) => d && { ...d, reviews: { ...d.reviews, ...file.questions } });
        for (const [k, a] of entries) void db.saveReview(k, a);
        return entries.length;
      },

      resetProgress() {
        setData((d) => d && { ...d, progress: {} });
        void db.clearProgress();
      },
    };
  }, [data, reload]);

  if (error) return <div className="screen error">Speicher konnte nicht geöffnet werden: {error}</div>;
  if (!store) return <div className="screen loading">Lade …</div>;
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export const CATALOG_NAMES = { WG: "Wohngebäude", NWG: "Nichtwohngebäude" } as const;
export const PART_NAMES = { 1: "Gebäudehülle", 2: "Gebäudetechnik", 3: "Recht, Bilanzierung, Beratung" } as const;

export function catalogLabel(id: db.DocId): string {
  const [c, p] = id.split("-") as ["WG" | "NWG", string];
  return `${CATALOG_NAMES[c] ?? c} Teil ${p}`;
}
