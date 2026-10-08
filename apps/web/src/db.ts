import type { Catalog, FormulaIndex, QuestionAnnotation, QuestionProgress } from "@exam/core";
import { type DBSchema, openDB } from "idb";

/** Id of a stored PDF: "WG-1" … "NWG-3" or "formeln". */
export type DocId = string;

export interface StoredFile {
  id: DocId;
  name: string;
  bytes: Uint8Array;
  importedAt: number;
}

export interface Settings {
  /** Shows the review panel for subject-matter experts. */
  reviewMode: boolean;
  catalog: "WG" | "NWG";
  /** When review results were last exported (ms). */
  exportedAt?: number;
}

interface Schema extends DBSchema {
  files: { key: DocId; value: StoredFile };
  catalogs: { key: DocId; value: Catalog };
  formulas: { key: "index"; value: FormulaIndex };
  progress: { key: string; value: QuestionProgress };
  reviews: { key: string; value: QuestionAnnotation };
  /** Questions the learner marked as difficult (value: when). */
  marks: { key: string; value: number };
  settings: { key: "settings"; value: Settings };
}

const db = openDB<Schema>("energieberatung", 2, {
  upgrade(d, oldVersion) {
    if (oldVersion < 1) {
      d.createObjectStore("files");
      d.createObjectStore("catalogs");
      d.createObjectStore("formulas");
      d.createObjectStore("progress");
      d.createObjectStore("reviews");
      d.createObjectStore("settings");
    }
    if (oldVersion < 2) d.createObjectStore("marks");
  },
});

export const DEFAULT_SETTINGS: Settings = { reviewMode: false, catalog: "WG" };

export async function loadAll() {
  const d = await db;
  const [catalogs, catalogIds, formulas, progressKeys, progressValues, reviewKeys, reviewValues, marks, settings] =
    await Promise.all([
      d.getAll("catalogs"),
      d.getAllKeys("catalogs"),
      d.get("formulas", "index"),
      d.getAllKeys("progress"),
      d.getAll("progress"),
      d.getAllKeys("reviews"),
      d.getAll("reviews"),
      d.getAllKeys("marks"),
      d.get("settings", "settings"),
    ]);
  return {
    catalogs: catalogIds.map((id, i) => ({ id, catalog: catalogs[i]! })),
    formulas: formulas ?? null,
    progress: Object.fromEntries(progressKeys.map((k, i) => [k, progressValues[i]!])),
    reviews: Object.fromEntries(reviewKeys.map((k, i) => [k, reviewValues[i]!])),
    marks: new Set(marks),
    settings: { ...DEFAULT_SETTINGS, ...settings },
  };
}

export async function saveImport(file: StoredFile, content: { catalog: Catalog } | { formulas: FormulaIndex }) {
  const d = await db;
  const tx = d.transaction(["files", "catalogs", "formulas"], "readwrite");
  await tx.objectStore("files").put(file, file.id);
  if ("catalog" in content) await tx.objectStore("catalogs").put(content.catalog, file.id);
  else await tx.objectStore("formulas").put(content.formulas, "index");
  await tx.done;
}

export async function loadFile(id: DocId): Promise<StoredFile | undefined> {
  return (await db).get("files", id);
}

export async function saveProgress(key: string, p: QuestionProgress) {
  await (await db).put("progress", p, key);
}

export async function saveReview(key: string, a: QuestionAnnotation | null) {
  const d = await db;
  if (a) await d.put("reviews", a, key);
  else await d.delete("reviews", key);
}

export async function saveMark(key: string, marked: boolean) {
  const d = await db;
  if (marked) await d.put("marks", Date.now(), key);
  else await d.delete("marks", key);
}

export async function saveSettings(s: Settings) {
  await (await db).put("settings", s, "settings");
}

export async function clearProgress() {
  await (await db).clear("progress");
}
