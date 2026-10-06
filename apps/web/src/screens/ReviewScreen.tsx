import { useRef, useState } from "react";
import { href } from "../router.ts";
import { reviewed, reviewPriority } from "../selection.ts";
import { catalogLabel, useStore } from "../store.tsx";
import { saveFile } from "../share.ts";

export function ReviewScreen() {
  const { questions, docOf, catalogs, exportReviews, importReviews } = useStore();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const done = questions.filter(reviewed);
  const count = (status: string) => done.filter((q) => q.annotation?.status === status).length;
  const unsure = questions.filter((q) => !reviewed(q) && reviewPriority(q) >= 2).length;
  const linked = questions.filter((q) => !q.stale && q.annotation?.formulas?.length).length;

  const exportFile = async () => {
    const file = exportReviews();
    const n = Object.keys(file.questions).length;
    const name = `pruefung-energieberatung-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const how = await saveFile(name, JSON.stringify(file, null, 1));
      setMessage(`${n} geprüfte Fragen ${how === "shared" ? "geteilt" : "gespeichert"} (${name}).`);
    } catch {
      // Share sheet dismissed.
    }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const n = importReviews(JSON.parse(await f.text()));
      setMessage(`${n} Prüfungen übernommen.`);
    } catch (e) {
      setMessage(`Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="screen">
      <h1>Prüfung der Antworten</h1>
      <p>
        Die richtigen Antworten hat die App aus den Musterlösungen des BAFA abgeleitet. Bitte prüfen Sie stichprobenartig
        – besonders die als unsicher markierten Fragen – und ordnen Sie, wo sinnvoll, Formeln aus der Formelsammlung zu.
      </p>
      <div className="stats">
        <div>
          <strong>{done.length}</strong> von {questions.length} geprüft
        </div>
        <div>
          ✓ {count("confirmed")} · ✗ {count("wrong")} · ? {count("unclear")}
        </div>
        <div>{linked} mit Formeln</div>
        <div>{unsure} noch unsicher</div>
      </div>

      <h2>Prüfen</h2>
      <div className="buttons">
        <a className="button primary" href={href("learn", { mode: "review", filter: "unsure" })}>
          Unsichere zuerst
        </a>
        <a className="button" href={href("learn", { mode: "review", filter: "all" })}>
          Alle ungeprüften der Reihe nach
        </a>
        {count("wrong") > 0 && (
          <a className="button" href={href("learn", { mode: "review", filter: "wrong" })}>
            Als Fehler markiert ({count("wrong")})
          </a>
        )}
        {count("unclear") > 0 && (
          <a className="button" href={href("learn", { mode: "review", filter: "unclear" })}>
            Unklar ({count("unclear")})
          </a>
        )}
      </div>
      <h3>Nach Katalog</h3>
      <ul className="chapters">
        {catalogs.map(({ id }) => {
          const qs = questions.filter((q) => docOf(q.key) === id);
          return (
            <li key={id}>
              <a href={href("learn", { mode: "review", filter: "unsure", doc: id })}>{catalogLabel(id)}</a>{" "}
              <span className="muted small">
                {qs.filter(reviewed).length} / {qs.length} geprüft
              </span>
            </li>
          );
        })}
      </ul>

      <h2>Ergebnisse weitergeben</h2>
      <p className="small">
        Die Prüfergebnisse enthalten nur Ihre Bewertungen, Korrekturen und Formelzuordnungen – keine BAFA-Inhalte. Senden
        Sie die Datei an den Entwickler, damit die Korrekturen in die App übernommen werden.
      </p>
      <div className="buttons">
        <button className="primary" onClick={exportFile}>
          Prüfergebnisse exportieren
        </button>
        <button onClick={() => fileInput.current?.click()}>Prüfdatei laden …</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      {message && <p className="banner">{message}</p>}
    </div>
  );
}
