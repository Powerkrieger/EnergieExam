import { isDue, isLearned } from "@exam/core";
import { CatalogSwitch, useCatalog } from "../components/CatalogSwitch.tsx";
import { ReviewNextStep } from "../components/ReviewNextStep.tsx";
import { href, navigate } from "../router.ts";
import { type RepeatCount, repeatByChapter, reviewed } from "../selection.ts";
import { PART_NAMES, useStore } from "../store.tsx";

export function HomeScreen() {
  const { questions, progress, docOf, settings, updateSettings, formulas, marks } = useStore();
  const { catalog } = useCatalog();
  const startReview = () => {
    updateSettings({ reviewMode: true });
    navigate("review");
  };
  // Wrong and difficult questions per part and chapter, so they can be repeated in small batches.
  const repeat = ([1, 2, 3] as const)
    .map((part) => {
      const id = `${catalog}-${part}`;
      const chapters = repeatByChapter(
        questions.filter((q) => docOf(q.key) === id),
        progress,
        marks,
      );
      const sum = (k: keyof RepeatCount) => chapters.reduce((n, c) => n + c.count[k], 0);
      return { part, id, chapters, wrong: sum("wrong"), marked: sum("marked") };
    })
    .filter((p) => p.chapters.length > 0);

  return (
    <div className="screen">
      <CatalogSwitch />
      {settings.reviewMode && <ReviewNextStep catalog={catalog} />}

      {repeat.length > 0 && (
        <section className="card">
          <h2>Wiederholen</h2>
          {repeat.map(({ part, id, chapters, wrong, marked }) => (
            <div key={id} className="repeat-part">
              <h3>
                Teil {part}: {PART_NAMES[part]}
              </h3>
              <div className="buttons">
                {wrong > 0 && (
                  <a className="button" href={href("learn", { doc: id, mode: "wrong" })}>
                    Fehlerfragen ({wrong})
                  </a>
                )}
                {marked > 0 && (
                  <a className="button" href={href("learn", { doc: id, mode: "marked" })}>
                    ★ Schwere Fragen ({marked})
                  </a>
                )}
              </div>
              <details>
                <summary className="small">Nach Kapitel</summary>
                <ul className="chapters">
                  {chapters.map(({ chapter, count }) => (
                    <li key={chapter}>
                      {chapter || "Ohne Kapitel"}
                      <span className="repeat-links">
                        {count.wrong > 0 && (
                          <a href={href("learn", { doc: id, mode: "wrong", chapter })}>{count.wrong} Fehler</a>
                        )}
                        {count.marked > 0 && (
                          <a href={href("learn", { doc: id, mode: "marked", chapter })}>★ {count.marked} schwer</a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          <p className="small muted">
            Fehlerfragen bleiben hier, bis Sie sie richtig beantworten. Mit ☆ markieren Sie eine Frage als schwer.
          </p>
        </section>
      )}

      {([1, 2, 3] as const).map((part) => {
        const id = `${catalog}-${part}`;
        const qs = questions.filter((q) => docOf(q.key) === id);
        if (qs.length === 0) return null;
        const learned = qs.filter((q) => isLearned(progress[q.key])).length;
        const due = qs.filter((q) => progress[q.key] && isDue(progress[q.key])).length;
        const fresh = qs.filter((q) => !progress[q.key]).length;
        const chapters = [...new Set(qs.map((q) => q.chapter))];
        const checked = qs.filter(reviewed).length;
        return (
          <section key={id} className="card">
            <h2>
              Teil {part}: {PART_NAMES[part]}
            </h2>
            <div className="bar">
              <div style={{ width: `${(100 * learned) / qs.length}%` }} />
            </div>
            <p className="small muted">
              {learned} von {qs.length} gelernt · {due} fällig · {fresh} neu
              {settings.reviewMode && ` · ${checked} geprüft`}
            </p>
            <div className="buttons">
              <a className="button primary" href={href("learn", { doc: id, mode: "due" })}>
                Lernen
              </a>
              <a className="button" href={href("learn", { doc: id, mode: "order" })}>
                Alle der Reihe nach
              </a>
            </div>
            <details>
              <summary className="small">Kapitel</summary>
              <ul className="chapters">
                {chapters.map((c) => (
                  <li key={c}>
                    <a href={href("learn", { doc: id, mode: "order", chapter: c })}>{c || "Ohne Kapitel"}</a>{" "}
                    <span className="muted small">({qs.filter((q) => q.chapter === c).length})</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        );
      })}

      <section className="card">
        <div className="buttons">
          {formulas && (
            <a className="button" href={href("formulas")}>
              Formelsammlung
            </a>
          )}
          {settings.reviewMode ? (
            <a className="button" href={href("review")}>
              Prüfung der Antworten
            </a>
          ) : (
            <button onClick={startReview}>Antworten als Fachperson prüfen</button>
          )}
        </div>
      </section>
    </div>
  );
}
