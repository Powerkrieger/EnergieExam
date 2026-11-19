import type { QuestionProgress } from "@exam/core";

/**
 * Learning progress as a file, to move it to another device or app install.
 * tools/rescue-progress writes the same format from the old app.
 */
export interface ProgressBackup {
  format: "energieexam-progress";
  version: 1;
  exportedAt: string;
  progress: Record<string, QuestionProgress>;
  /** Questions marked as difficult (value: when, ms). */
  marks: Record<string, number>;
}

export function createBackup(progress: Record<string, QuestionProgress>, marks: Record<string, number>): ProgressBackup {
  return { format: "energieexam-progress", version: 1, exportedAt: new Date().toISOString(), progress, marks };
}

const isProgress = (p: unknown): p is QuestionProgress => {
  const o = p as QuestionProgress;
  return (
    typeof o === "object" &&
    o !== null &&
    [o.box, o.seen, o.right, o.lastAt, o.dueAt].every((n) => typeof n === "number") &&
    (o.last === "right" || o.last === "wrong" || o.last === null)
  );
};

export function parseBackup(json: unknown): ProgressBackup {
  const b = json as ProgressBackup;
  if (b?.format !== "energieexam-progress") throw new Error("Das ist keine Sicherung des Lernfortschritts.");
  if (b.version !== 1) throw new Error(`Unbekannte Version ${b.version}; bitte die App aktualisieren.`);
  const progress = Object.fromEntries(Object.entries(b.progress ?? {}).filter(([, p]) => isProgress(p)));
  const marks = Object.fromEntries(Object.entries(b.marks ?? {}).filter(([, t]) => typeof t === "number"));
  return { ...b, progress, marks };
}

/**
 * What loading a backup changes: per question the more recently answered
 * progress wins, so loading an old file never undoes newer learning; marks are
 * added.
 */
export function mergeBackup(
  current: { progress: Record<string, QuestionProgress>; marks: Set<string> },
  backup: ProgressBackup,
): { progress: Record<string, QuestionProgress>; marks: Record<string, number> } {
  const progress = Object.fromEntries(
    Object.entries(backup.progress).filter(([k, p]) => !current.progress[k] || p.lastAt > current.progress[k].lastAt),
  );
  const marks = Object.fromEntries(Object.entries(backup.marks).filter(([k]) => !current.marks.has(k)));
  return { progress, marks };
}
