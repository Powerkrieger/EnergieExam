import { useState } from "react";
import { href, navigate } from "../router.ts";
import { reviewStep, SAMPLE } from "../selection.ts";
import { saveFile } from "../share.ts";
import { CATALOG_NAMES, useStore } from "../store.tsx";
import { type CatalogId, useCatalog } from "./CatalogSwitch.tsx";

/** Exports the review results and remembers when, so the guide knows they were sent. */
export function useExportReviews() {
  const { exportReviews, updateSettings } = useStore();
  return async (): Promise<string | null> => {
    const file = exportReviews();
    const n = Object.keys(file.questions).length;
    const name = `pruefung-energieberatung-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const how = await saveFile(name, JSON.stringify(file, null, 1));
      updateSettings({ exportedAt: Date.now() });
      return `${n} geprüfte Fragen ${how === "shared" ? "geteilt" : "gespeichert"} (${name}).`;
    } catch {
      return null; // Share sheet dismissed.
    }
  };
}

/** Tells the reviewer what to do next for one building type, with a button that does it. */
export function ReviewNextStep({ catalog }: { catalog: CatalogId }) {
  const { questions, docOf, priorityOf, unexported, updateSettings } = useStore();
  const { available } = useCatalog();
  const exportReviews = useExportReviews();
  const [message, setMessage] = useState<string | null>(null);
  const inSet = (c: CatalogId) => questions.filter((q) => docOf(q.key).startsWith(`${c}-`));
  const step = reviewStep(inSet(catalog), priorityOf, unexported);
  const name = CATALOG_NAMES[catalog];
  const link = (filter: string) => href("learn", { mode: "review", filter, catalog });
  const other = available.find((c) => c !== catalog);
  const otherOpen = other && reviewStep(inSet(other), priorityOf, unexported).kind !== "done";

  if (step.kind === "unsure") {
    const started = step.open < step.total;
    return (
      <section className="card next-step">
        <p className="step-label">{name} · Schritt 1 von 3</p>
        <h2>Unsichere Fragen prüfen</h2>
        <p>
          {started
            ? `Noch ${step.open} von ${step.total} Fragen offen.`
            : `Bei ${step.total} Fragen ist sich die App nicht sicher. Bitte prüfen Sie diese – gern in mehreren Etappen, alles wird sofort gespeichert.`}
        </p>
        <a className="button primary" href={link("unsure")}>
          {started ? "Weiter prüfen" : "Mit der Prüfung beginnen"}
        </a>
      </section>
    );
  }
  if (step.kind === "sample") {
    return (
      <section className="card next-step">
        <p className="step-label">{name} · Schritt 2 von 3</p>
        <h2>Stichprobe</h2>
        <p>
          Die unsicheren Fragen sind geschafft. Prüfen Sie jetzt noch {SAMPLE - step.done} zufällig ausgewählte Fragen,
          deren Antwort die App für sicher hält. So sehen wir, ob man den übrigen Antworten trauen kann.
        </p>
        <a className="button primary" href={link("sample")}>
          {step.done > 0 ? "Stichprobe fortsetzen" : "Stichprobe starten"}
        </a>
      </section>
    );
  }
  if (step.kind === "export") {
    return (
      <section className="card next-step">
        <p className="step-label">{name} · Schritt 3 von 3</p>
        <h2>Ergebnisse zurückschicken</h2>
        <p>
          {name}: alles geprüft! Tippen Sie auf den Knopf und schicken Sie die Datei per Messenger oder E-Mail an die
          Person, von der Sie die App haben. Die Datei enthält nur Ihre Bewertungen.
        </p>
        <button className="primary" onClick={async () => setMessage(await exportReviews())}>
          Ergebnisse exportieren und senden
        </button>
        {message && <p className="small">{message}</p>}
      </section>
    );
  }
  return (
    <section className="card next-step done">
      <p className="step-label">{name}</p>
      <h2>✓ Fertig – vielen Dank!</h2>
      <p>
        Alle unsicheren Fragen und die Stichprobe sind geprüft und die Ergebnisse verschickt. Mehr ist nicht nötig.
      </p>
      {other && otherOpen && (
        <p>
          Wenn Sie mögen, können Sie auch die {CATALOG_NAMES[other]} prüfen – das ist freiwillig.{" "}
          <button
            onClick={() => {
              updateSettings({ catalog: other });
              navigate("review");
            }}
          >
            {CATALOG_NAMES[other]} prüfen
          </button>
        </p>
      )}
      {message && <p className="small">{message}</p>}
      <p className="small muted">
        Falls die Datei nicht angekommen ist:{" "}
        <button className="link" onClick={async () => setMessage(await exportReviews())}>
          erneut senden
        </button>
        . Wer mag, kann freiwillig eine{" "}
        <a href={link("sample")}>weitere Stichprobe</a> prüfen.
      </p>
    </section>
  );
}
