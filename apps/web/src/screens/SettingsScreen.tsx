import { href } from "../router.ts";
import { useStore } from "../store.tsx";

export function SettingsScreen() {
  const { settings, updateSettings, resetProgress } = useStore();
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
      <p className="small muted">
        Die Fragen und die Formelsammlung stammen vom Bundesamt für Wirtschaft und Ausfuhrkontrolle (BAFA). Die App ist kein
        Angebot des BAFA; die richtigen Antworten wurden automatisch aus den Musterlösungen abgeleitet und können Fehler
        enthalten.
      </p>
    </div>
  );
}
