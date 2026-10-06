import { useState } from "react";
import { catalogLabel, type ImportProgress, type ImportResult, useStore } from "../store.tsx";
import { href, navigate } from "../router.ts";

const BAFA_URL =
  "https://www.bafa.de/DE/Energie/Energieberatung/Qualifikationspruefung_Energieberatung/qualifikationspruefung_energieberatung_node.html";

const EXPECTED = ["WG-1", "WG-2", "WG-3", "NWG-1", "NWG-2", "NWG-3"];

export function ImportScreen() {
  const { catalogs, formulas, importPdfs, settings, updateSettings } = useStore();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const have = new Set(catalogs.map((c) => c.id));
  const missing = [...EXPECTED.filter((id) => !have.has(id)).map(catalogLabel), ...(formulas ? [] : ["Formelsammlung"])];

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    // Stay on this screen after the first catalogue is stored, to show the results.
    if (!location.hash.startsWith("#/import")) navigate("import");
    setBusy(true);
    setResults([]);
    try {
      setResults(await importPdfs([...list], setProgress));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="screen">
      <h1>Fragenkataloge importieren</h1>
      <p>
        Die Übungsfragen und die Formelsammlung stellt das BAFA als PDF bereit. Laden Sie die Dateien dort herunter
        und wählen Sie sie hier aus – sie werden nur auf diesem Gerät verarbeitet und gespeichert.
      </p>
      <ol className="steps">
        <li>
          <a href={BAFA_URL} target="_blank" rel="noreferrer">
            BAFA-Seite zur Qualifikationsprüfung öffnen
          </a>{" "}
          und die Übungsfragen (Wohngebäude und/oder Nichtwohngebäude, Teil 1–3) sowie die Formelsammlung herunterladen.
        </li>
        <li>Alle heruntergeladenen PDFs hier auswählen (mehrere auf einmal möglich).</li>
      </ol>

      <label className={`file-button ${busy ? "disabled" : ""}`}>
        PDFs auswählen …
        <input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(e) => onFiles(e.target.files)} />
      </label>

      {progress && (
        <div className="import-progress">
          <div className="small">
            {progress.file}: Seite {progress.page} von {progress.total}
          </div>
          <progress value={progress.page} max={progress.total} />
        </div>
      )}

      {results.length > 0 && (
        <ul className="results">
          {results.map((r, n) => (
            <li key={n} className={r.ok ? "ok" : "error"}>
              <strong>{r.file}</strong>: {r.message}
            </li>
          ))}
        </ul>
      )}

      <h2>Stand</h2>
      <ul className="checklist">
        {EXPECTED.map((id) => (
          <li key={id} className={have.has(id) ? "ok" : ""}>
            {have.has(id) ? "✓" : "○"} {catalogLabel(id)}
          </li>
        ))}
        <li className={formulas ? "ok" : ""}>
          {formulas ? "✓" : "○"} Formelsammlung{formulas && ` (${formulas.entries.length} Formeln)`}
        </li>
      </ul>
      {catalogs.length > 0 && !busy && (
        <section className="card next-step">
          {missing.length > 0 && (
            <p>
              Es fehlen noch: <strong>{missing.join(", ")}</strong>. Laden Sie diese PDFs ebenfalls herunter und wählen Sie
              sie oben aus – oder machen Sie ohne sie weiter.
            </p>
          )}
          {settings.reviewMode ? (
            <a className="button primary" href={href("review")}>
              Weiter zur Prüfung der Antworten
            </a>
          ) : (
            <div className="buttons">
              <a className="button primary" href={href("")}>
                Zum Lernen
              </a>
              <button
                onClick={() => {
                  updateSettings({ reviewMode: true });
                  navigate("review");
                }}
              >
                Antworten als Fachperson prüfen
              </button>
            </div>
          )}
        </section>
      )}
      <p className="muted small">
        Hinweis: Die Inhalte gehören dem BAFA und dürfen nicht verändert oder vervielfältigt werden. Diese App liest
        sie nur auf Ihrem Gerät aus.
      </p>
    </div>
  );
}
