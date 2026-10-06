import { isDue, isLearned } from "@exam/core";
import { href } from "../router.ts";
import { reviewed } from "../selection.ts";
import { CATALOG_NAMES, PART_NAMES, useStore } from "../store.tsx";

export function HomeScreen() {
  const { questions, progress, docOf, settings, updateSettings, catalogs, formulas } = useStore();
  const available = (["WG", "NWG"] as const).filter((c) => catalogs.some((x) => x.id.startsWith(`${c}-`)));
  const catalog = available.includes(settings.catalog) ? settings.catalog : available[0]!;
  const wrong = questions.filter((q) => docOf(q.key).startsWith(`${catalog}-`) && progress[q.key]?.last === "wrong");

  return (
    <div className="screen">
      {available.length > 1 && (
        <div className="segmented">
          {available.map((c) => (
            <button key={c} className={c === catalog ? "selected" : ""} onClick={() => updateSettings({ catalog: c })}>
              {CATALOG_NAMES[c]}
            </button>
          ))}
        </div>
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
          {wrong.length > 0 && (
            <a className="button" href={href("learn", { mode: "wrong", catalog })}>
              Fehlerfragen ({wrong.length})
            </a>
          )}
          {formulas && (
            <a className="button" href={href("formulas")}>
              Formelsammlung
            </a>
          )}
          {settings.reviewMode && (
            <a className="button" href={href("review")}>
              Prüfung der Antworten
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
