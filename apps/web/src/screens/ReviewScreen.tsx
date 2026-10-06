import { useRef, useState } from "react";
import { href } from "../router.ts";
import { CatalogSwitch, useCatalog } from "../components/CatalogSwitch.tsx";
import { ReviewNextStep, useExportReviews } from "../components/ReviewNextStep.tsx";
import { reviewed } from "../selection.ts";
import { catalogLabel, useStore } from "../store.tsx";

export function ReviewScreen() {
  const store = useStore();
  const { docOf, catalogs, importReviews, priorityOf } = store;
  const { catalog } = useCatalog();
  const questions = store.questions.filter((q) => docOf(q.key).startsWith(`${catalog}-`));
  const exportReviews = useExportReviews();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const done = questions.filter(reviewed);
  const count = (status: string) => done.filter((q) => q.annotation?.status === status).length;
  const needsReview = (q: (typeof questions)[number]) => !reviewed(q) && priorityOf(q.key) >= 2;
  const unsure = questions.filter(needsReview).length;
  const linked = questions.filter((q) => !q.stale && q.annotation?.formulas?.length).length;

  const exportFile = async () => setMessage(await exportReviews());

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
        Die richtigen Antworten hat die App aus den Musterlösungen des BAFA abgeleitet. Nötig ist nur die Prüfung der
        unsicheren Fragen; bei allen übrigen genügt eine kleine Stichprobe. Die App führt Sie Schritt für Schritt:
      </p>
      <CatalogSwitch />
      <ReviewNextStep catalog={catalog} />
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

      <h2>Gezielt prüfen</h2>
      <div className="buttons">
        <a className="button" href={href("learn", { mode: "review", catalog, filter: "unsure" })}>
          Unsichere Fragen ({unsure})
        </a>
        <a className="button" href={href("learn", { mode: "review", catalog, filter: "sample" })}>
          Stichprobe: 20 zufällige
        </a>
        <a className="button" href={href("learn", { mode: "review", catalog, filter: "all" })}>
          Alle ungeprüften der Reihe nach
        </a>
        {count("wrong") > 0 && (
          <a className="button" href={href("learn", { mode: "review", catalog, filter: "wrong" })}>
            Als Fehler markiert ({count("wrong")})
          </a>
        )}
        {count("unclear") > 0 && (
          <a className="button" href={href("learn", { mode: "review", catalog, filter: "unclear" })}>
            Unklar ({count("unclear")})
          </a>
        )}
      </div>
      <h3>Nach Katalog</h3>
      <ul className="chapters">
        {catalogs.filter(({ id }) => id.startsWith(`${catalog}-`)).map(({ id }) => {
          const qs = questions.filter((q) => docOf(q.key) === id);
          return (
            <li key={id}>
              <a href={href("learn", { mode: "review", catalog, filter: "unsure", doc: id })}>{catalogLabel(id)}</a>{" "}
              <span className="muted small">
                {qs.filter(reviewed).length} / {qs.length} geprüft · {qs.filter(needsReview).length} unsicher
              </span>
            </li>
          );
        })}
      </ul>

      <h2>Ergebnisse weitergeben</h2>
      <p className="small">
        Die Prüfergebnisse enthalten nur Ihre Bewertungen, Korrekturen und Formelzuordnungen – keine BAFA-Inhalte. Sie
        können auch zwischendurch einen Zwischenstand schicken.
      </p>
      <div className="buttons">
        <button onClick={exportFile}>
          Prüfergebnisse exportieren
        </button>
        <button onClick={() => fileInput.current?.click()}>Prüfdatei laden …</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
      </div>
      {message && <p className="banner">{message}</p>}
    </div>
  );
}
