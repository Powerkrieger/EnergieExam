import { useMemo, useState } from "react";
import { QuestionView } from "../components/QuestionView.tsx";
import { type CatalogId, useCatalog } from "../components/CatalogSwitch.tsx";
import { ReviewNextStep } from "../components/ReviewNextStep.tsx";
import { href, type Route } from "../router.ts";
import { type Mode, reviewed, type ReviewFilter, selectQuestions } from "../selection.ts";
import { CATALOG_NAMES, useStore } from "../store.tsx";

const REVIEW_TITLES: Record<ReviewFilter, string> = {
  unsure: "Schritt 1: Unsichere Fragen",
  sample: "Schritt 2: Stichprobe",
  wrong: "Als Fehler markiert",
  unclear: "Unklar",
  all: "Alle ungeprüften",
};

const TITLES: Record<Mode, string> = {
  due: "Lernen",
  order: "Alle Fragen",
  wrong: "Fehlerfragen",
  marked: "Schwere Fragen",
  review: "Prüfung",
};

export function LearnScreen({ route }: { route: Route }) {
  const store = useStore();
  const mode = (route.query.get("mode") ?? "due") as Mode;
  const docId = route.query.get("doc") ?? undefined;
  const catalog = route.query.get("catalog");
  const chapter = route.query.get("chapter") ?? undefined;
  const review = (route.query.get("filter") ?? "unsure") as ReviewFilter;
  const current = useCatalog().catalog;

  // The question list is fixed when the session starts, so answering doesn't reshuffle it.
  const initial = useMemo(() => {
    const pool = catalog ? store.questions.filter((q) => store.docOf(q.key).startsWith(`${catalog}-`)) : store.questions;
    return selectQuestions(pool, store.progress, mode, {
      doc: store.docOf,
      docId,
      chapter,
      review,
      priority: store.priorityOf,
      marks: store.marks,
    });
  }, [route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  // A repeat round of this session's wrong or skipped questions.
  const [repeat, setRepeat] = useState<string[] | null>(null);
  const keys = repeat ?? initial;
  const [index, setIndex] = useState(0);
  /** Latest result per question of this session; skipped questions have none. */
  const [results, setResults] = useState<Record<string, boolean>>({});
  const startRepeat = (k: string[]) => {
    setRepeat(k);
    setIndex(0);
  };

  const q = store.byKey.get(keys[index] ?? "");
  const title =
    mode === "review"
      ? `${REVIEW_TITLES[review]}${catalog ? ` · ${CATALOG_NAMES[catalog as CatalogId]}` : ""}`
      : TITLES[mode];
  if (mode === "review" && !q) {
    // End of a review session: say what was left out and what comes next.
    const skipped = keys.filter((k) => !reviewed(store.byKey.get(k)!)).length;
    return (
      <div className="screen">
        <h1>{keys.length === 0 ? title : "Runde beendet"}</h1>
        {skipped > 0 && (
          <p className="banner unknown">
            {skipped === 1 ? "1 Frage wurde" : `${skipped} Fragen wurden`} übersprungen und{" "}
            {skipped === 1 ? "kommt" : "kommen"} beim nächsten Mal wieder. Wenn Sie eine Frage nicht beurteilen können,
            wählen Sie einfach „? Unklar“.
          </p>
        )}
        <ReviewNextStep catalog={(catalog as CatalogId | null) ?? current} />
        <a className="button" href={href("review")}>
          Zur Übersicht der Prüfung
        </a>
      </div>
    );
  }
  if (keys.length === 0) {
    return (
      <div className="screen">
        <h1>{TITLES[mode]}</h1>
        <p>Hier gibt es gerade keine Fragen. 🎉</p>
        <a className="button" href={href("")}>
          Zurück
        </a>
      </div>
    );
  }
  if (!q) {
    // Sums up the whole session, including repeat rounds.
    const wrong = initial.filter((k) => results[k] === false);
    const skipped = initial.filter((k) => !(k in results));
    const right = initial.length - wrong.length - skipped.length;
    return (
      <div className="screen">
        <h1>Geschafft!</h1>
        <p>
          {right} von {initial.length} Fragen richtig
          {wrong.length > 0 && ` · ${wrong.length} falsch`}
          {skipped.length > 0 && ` · ${skipped.length} übersprungen`}.
        </p>
        {wrong.length > 0 && (
          <p className="small muted">Falsch beantwortete Fragen finden Sie auch später unter „Fehlerfragen“.</p>
        )}
        <div className="buttons">
          {wrong.length > 0 && (
            <button className="primary" onClick={() => startRepeat(wrong)}>
              Falsche wiederholen ({wrong.length})
            </button>
          )}
          {skipped.length > 0 && (
            <button className={wrong.length ? "" : "primary"} onClick={() => startRepeat(skipped)}>
              Übersprungene beantworten ({skipped.length})
            </button>
          )}
          <a className={`button ${wrong.length || skipped.length ? "" : "primary"}`} href={href("")}>
            Zur Übersicht
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="session-head">
        <span>
          {title}
          {chapter && ` · ${chapter}`}
          {repeat && " · Wiederholung"}
        </span>
        <span className="muted">
          {index + 1} / {keys.length}
        </span>
      </div>
      {mode === "review" && index === 0 && (
        <p className="banner small">
          Bewerten Sie die Antwort unten im gestrichelten Kasten. Die Eingabefelder der Frage brauchen Sie dafür nicht.
        </p>
      )}
      <QuestionView
        question={q}
        onResult={(ok) => setResults((r) => ({ ...r, [q.key]: ok }))}
        onNext={() => setIndex((n) => n + 1)}
        onSkip={mode === "review" ? undefined : () => setIndex((n) => n + 1)}
      />
      {mode === "review" && (
        <div className="buttons spaced">
          <button onClick={() => setIndex((n) => Math.max(0, n - 1))} disabled={index === 0}>
            ← Zurück
          </button>
          {reviewed(q) ? (
            <button className="primary" onClick={() => setIndex((n) => n + 1)}>
              {index + 1 < keys.length ? "Nächste Frage →" : "Runde abschließen →"}
            </button>
          ) : (
            <button onClick={() => setIndex((n) => n + 1)}>Überspringen →</button>
          )}
        </div>
      )}
    </div>
  );
}
