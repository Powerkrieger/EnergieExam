import { useMemo, useState } from "react";
import { QuestionView } from "../components/QuestionView.tsx";
import { href, type Route } from "../router.ts";
import { type Mode, type ReviewFilter, selectQuestions } from "../selection.ts";
import { useStore } from "../store.tsx";

const TITLES: Record<Mode, string> = {
  due: "Lernen",
  order: "Alle Fragen",
  wrong: "Fehlerfragen",
  review: "Prüfung",
};

export function LearnScreen({ route }: { route: Route }) {
  const store = useStore();
  const mode = (route.query.get("mode") ?? "due") as Mode;
  const docId = route.query.get("doc") ?? undefined;
  const catalog = route.query.get("catalog");
  const chapter = route.query.get("chapter") ?? undefined;
  const review = (route.query.get("filter") ?? "unsure") as ReviewFilter;

  // The question list is fixed when the session starts, so answering doesn't reshuffle it.
  const keys = useMemo(() => {
    const pool = catalog ? store.questions.filter((q) => store.docOf(q.key).startsWith(`${catalog}-`)) : store.questions;
    return selectQuestions(pool, store.progress, mode, { doc: store.docOf, docId, chapter, review });
  }, [route.query.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);

  const q = store.byKey.get(keys[index] ?? "");
  if (keys.length === 0) {
    return (
      <div className="screen">
        <h1>{TITLES[mode]}</h1>
        <p>Hier gibt es gerade keine Fragen. 🎉</p>
        <a className="button" href={href(mode === "review" ? "review" : "")}>
          Zurück
        </a>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="screen">
        <h1>Geschafft!</h1>
        {mode !== "review" && (
          <p>
            {right} von {keys.length} Fragen richtig.
          </p>
        )}
        <div className="buttons">
          <a className="button primary" href={href(mode === "review" ? "review" : "")}>
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
          {TITLES[mode]}
          {chapter && ` · ${chapter}`}
        </span>
        <span className="muted">
          {index + 1} / {keys.length}
        </span>
      </div>
      <QuestionView
        question={q}
        onResult={(ok) => ok && setRight((n) => n + 1)}
        onNext={() => setIndex((n) => n + 1)}
      />
      {mode === "review" && (
        <div className="buttons spaced">
          <button onClick={() => setIndex((n) => Math.max(0, n - 1))} disabled={index === 0}>
            ← Zurück
          </button>
          <button onClick={() => setIndex((n) => n + 1)}>Überspringen →</button>
        </div>
      )}
    </div>
  );
}
