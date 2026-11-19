import { useRef, useState } from "react";
import { href } from "../router.ts";
import { saveFile } from "../share.ts";
import { useStore } from "../store.tsx";

export function SettingsScreen() {
  const { settings, updateSettings, resetProgress, exportProgress, importProgress, progress, marks } = useStore();
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFile = async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const how = await saveFile(`energieberatung-fortschritt-${date}.json`, JSON.stringify(await exportProgress()));
      setMessage(how === "shared" ? "Sicherung erstellt." : "Sicherung heruntergeladen.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage(`Sichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const n = await importProgress(JSON.parse(await f.text()));
      setMessage(
        n.progress || n.marks
          ? `Übernommen: ${n.progress} beantwortete Fragen, ${n.marks} als schwer markierte.`
          : "Nichts Neues in dieser Datei – Ihr Fortschritt hier ist schon aktueller.",
      );
    } catch (e) {
      setMessage(`Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : e}`);
    }
    if (fileInput.current) fileInput.current.value = "";
  };
  return (
    <div className="screen">
      <h1>Einstellungen</h1>
      <label className="toggle">
        <input type="checkbox" checked={settings.reviewMode} onChange={(e) => updateSettings({ reviewMode: e.target.checked })} />
        <span>
          <strong>Prüfmodus für Fachleute</strong>
          <br />
          <span className="small muted">
            Zeigt bei jeder Frage die hinterlegte richtige Antwort und erlaubt, sie zu bestätigen, zu korrigieren und Formeln
            zuzuordnen.
          </span>
        </span>
      </label>
      {settings.reviewMode && (
        <a className="button primary" href={href("review")}>
          Zur Prüfung der Antworten
        </a>
      )}
      <div className="buttons">
        <a className="button" href={href("import")}>
          PDFs (neu) importieren
        </a>
        <button
          onClick={() => {
            if (confirm("Lernfortschritt wirklich zurücksetzen?")) resetProgress();
          }}
        >
          Lernfortschritt zurücksetzen
        </button>
      </div>
      <section className="card">
        <h2>Lernfortschritt sichern</h2>
        <p className="small muted">
          {Object.keys(progress).length} beantwortete Fragen, {marks.size} als schwer markiert. Mit der Sicherung nehmen Sie
          Ihren Fortschritt auf ein anderes Gerät oder in eine neue Version der App mit. Beim Laden bleibt neuerer
          Fortschritt erhalten.
        </p>
        <div className="buttons">
          <button onClick={exportFile}>Fortschritt sichern</button>
          <button onClick={() => fileInput.current?.click()}>Sicherung laden</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => importFile(e.target.files?.[0])}
          />
        </div>
        {message && <p className="banner">{message}</p>}
      </section>
      <p className="small muted">
        Die Fragen und die Formelsammlung stammen vom Bundesamt für Wirtschaft und Ausfuhrkontrolle (BAFA). Die App ist kein
        Angebot des BAFA; die richtigen Antworten wurden automatisch aus den Musterlösungen abgeleitet und können Fehler
        enthalten.
      </p>
    </div>
  );
}
