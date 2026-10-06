import {
  type AnnotatedQuestion,
  type AnswerOverride,
  type AnswerSource,
  plainText,
  type QuestionAnnotation,
  searchFormulas,
  suggestFormulas,
} from "@exam/core";
import { useMemo, useState } from "react";
import { resolved } from "../selection.ts";
import { useStore } from "../store.tsx";
import { FormulaCard } from "./FormulaCard.tsx";
import { RichText } from "./RichText.tsx";

const SOURCE: Record<AnswerSource, string> = {
  inline: "aus dem Lösungstext (Lückentext)",
  arrow: "aus der Aussagenliste der Lösung",
  verdict: "aus der Aussagenliste der Lösung",
  table: "aus einer Tabelle der Lösung",
  numeric: "aus dem Rechenweg der Lösung",
  mention: "Lösung nennt diese Antwort",
  annotation: "von Ihnen geprüft",
};

const STATUS = {
  confirmed: "✓ Stimmt",
  wrong: "✗ Fehler",
  unclear: "? Unklar",
} as const;

/**
 * Lets a subject-matter expert confirm or correct the answer key that the
 * importer derived, add a note and link rows of the Formelsammlung.
 */
export function ReviewPanel({ question: q }: { question: AnnotatedQuestion }) {
  const { annotations, setReview, formulas } = useStore();
  const saved = annotations[q.key];
  const base: QuestionAnnotation = saved && saved.hash === q.hash ? saved : { hash: q.hash };
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");

  const save = (patch: Partial<QuestionAnnotation>) =>
    setReview(q.key, { ...base, ...patch, hash: q.hash, reviewedAt: new Date().toISOString() });

  const i = q.interaction;
  const current = currentAnswer(q);
  const linked = base.formulas ?? [];
  const suggestions = useMemo(
    () => (formulas ? suggestFormulas(q, formulas).filter((e) => !linked.includes(e.id)) : []),
    [q, formulas, linked],
  );
  const results = formulas && search.trim() ? searchFormulas(formulas, search).filter((e) => !linked.includes(e.id)) : [];

  return (
    <section className="review">
      <h3>Prüfung durch Fachperson</h3>
      <p className={`instruction ${base.status ? "saved" : ""}`}>{instruction(q, base)}</p>
      {saved && saved.hash !== q.hash && (
        <p className="warn">Eine frühere Prüfung bezog sich auf eine ältere Fassung dieser Frage und wird ignoriert.</p>
      )}

      <h4>Hinterlegte richtige Antwort</h4>
      {i.kind === "open" && <p className="muted">Offene Frage – keine Eingabefelder, nur die Musterlösung.</p>}
      {i.kind === "single" && (
        <p>
          {i.correct === null ? <span className="warn">Nicht erkannt</span> : <RichText text={i.options[i.correct]!} />}
          {i.via && <span className="muted small"> – {SOURCE[i.via]}</span>}
        </p>
      )}
      {i.kind === "gaps" && (
        <ol className="answer-key">
          {i.gaps.map((g, n) => (
            <li key={n}>
              {g.kind === "choice" ? (
                g.correct === null ? <span className="warn">Nicht erkannt</span> : <RichText text={g.options[g.correct]!} />
              ) : g.expected === null ? (
                <span className="warn">Nicht erkannt</span>
              ) : (
                g.expected
              )}
              {g.via && <span className="muted small"> – {SOURCE[g.via]}</span>}
            </li>
          ))}
        </ol>
      )}
      {q.issues.length > 0 && (
        <details>
          <summary className="muted small">Hinweise des Imports ({q.issues.length})</summary>
          <ul className="small">
            {q.issues.map((s, n) => (
              <li key={n}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="buttons status">
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
          <button
            key={s}
            className={base.status === s ? `selected ${s}` : ""}
            disabled={s === "confirmed" && !resolved(q)}
            onClick={() => save({ status: s, ...(s === "confirmed" && i.kind !== "open" && { answer: current }) })}
          >
            {STATUS[s]}
          </button>
        ))}
      </div>

      {i.kind !== "open" &&
        (editing ? (
          <AnswerEditor
            question={q}
            onSave={(answer) => {
              save({ answer, status: "confirmed" });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button className="link" onClick={() => setEditing(true)}>
            Richtige Antwort korrigieren …
          </button>
        ))}

      <label className="note">
        Anmerkung
        <textarea
          defaultValue={base.note ?? ""}
          key={q.key}
          placeholder="z. B. was an der Frage oder Lösung nicht stimmt"
          onBlur={(e) => e.target.value !== (base.note ?? "") && save({ note: e.target.value })}
        />
      </label>

      {formulas && (
        <div className="formula-links">
          <h4>Passende Formeln aus der Formelsammlung</h4>
          {linked.length === 0 && <p className="muted small">Noch keine Formel zugeordnet.</p>}
          {linked.map((id) => {
            const e = formulas.entries.find((x) => x.id === id);
            return e ? (
              <FormulaCard
                key={id}
                entry={e}
                actions={
                  <button className="small" onClick={() => save({ formulas: linked.filter((x) => x !== id) })}>
                    Entfernen
                  </button>
                }
              />
            ) : null;
          })}
          {suggestions.length > 0 && <h5>Vorschläge</h5>}
          {suggestions.map((e) => (
            <FormulaCard
              key={e.id}
              entry={e}
              actions={
                <button className="small" onClick={() => save({ formulas: [...linked, e.id] })}>
                  + Zuordnen
                </button>
              }
            />
          ))}
          <input
            type="search"
            placeholder="Formel suchen (Name oder Formelzeichen) …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.slice(0, 8).map((e) => (
            <FormulaCard
              key={e.id}
              entry={e}
              actions={
                <button className="small" onClick={() => save({ formulas: [...linked, e.id] })}>
                  + Zuordnen
                </button>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** What the reviewer should do with this question right now. */
function instruction(q: AnnotatedQuestion, a: QuestionAnnotation): string {
  const next = "Danach weiter zur nächsten Frage.";
  switch (a.status) {
    case "confirmed":
      return `✓ Gespeichert. Falls es eine Rechenaufgabe ist, ordnen Sie bitte unten noch die passende Formel zu. ${next}`;
    case "wrong":
      return a.answer || a.note?.trim()
        ? `✓ Gespeichert. ${next}`
        : "Bitte tragen Sie über „Richtige Antwort korrigieren …“ die richtige Antwort ein oder beschreiben Sie den Fehler in der Anmerkung.";
    case "unclear":
      return `✓ Gespeichert. Notieren Sie gern kurz in der Anmerkung, was unklar ist. ${next}`;
  }
  if (q.interaction.kind === "open") return "Offene Frage: Passt die Musterlösung? Tippen Sie auf ✓ Stimmt, ✗ Fehler oder ? Unklar.";
  if (!resolved(q)) {
    return "Die App hat hier keine richtige Antwort gefunden. Bitte tippen Sie auf „Richtige Antwort korrigieren …“ und tragen Sie sie ein. Wenn Sie es nicht beurteilen können: „? Unklar“.";
  }
  return "Stimmt die hinterlegte richtige Antwort? Tippen Sie auf ✓ Stimmt, ✗ Fehler oder ? Unklar.";
}

/** The answer key as currently in effect, in annotation form. */
function currentAnswer(q: AnnotatedQuestion): AnswerOverride | undefined {
  const i = q.interaction;
  if (i.kind === "single") return i.correct === null ? undefined : { kind: "single", correct: i.correct };
  if (i.kind === "gaps") {
    return {
      kind: "gaps",
      gaps: i.gaps.map((g) =>
        g.kind === "choice"
          ? g.correct === null
            ? null
            : { correct: g.correct }
          : g.expected === null
            ? null
            : { expected: g.expected },
      ),
    };
  }
  return undefined;
}

function AnswerEditor({
  question: q,
  onSave,
  onCancel,
}: {
  question: AnnotatedQuestion;
  onSave: (a: AnswerOverride) => void;
  onCancel: () => void;
}) {
  const i = q.interaction;
  const [single, setSingle] = useState(i.kind === "single" ? i.correct : null);
  const [gaps, setGaps] = useState<(number | string | null)[]>(
    i.kind === "gaps" ? i.gaps.map((g) => (g.kind === "choice" ? g.correct : g.expected)) : [],
  );

  const submit = () => {
    if (i.kind === "single" && single !== null) onSave({ kind: "single", correct: single });
    if (i.kind === "gaps") {
      onSave({
        kind: "gaps",
        gaps: gaps.map((v) =>
          typeof v === "number" ? { correct: v } : typeof v === "string" && v.trim() ? { expected: v.trim() } : null,
        ),
      });
    }
  };

  return (
    <div className="answer-editor">
      {i.kind === "single" &&
        i.options.map((o, n) => (
          <label key={n} className="option">
            <input type="radio" checked={single === n} onChange={() => setSingle(n)} />
            <span>
              <RichText text={o} />
            </span>
          </label>
        ))}
      {i.kind === "gaps" && (
        <ol>
          {i.gaps.map((g, n) => (
            <li key={n}>
              {g.kind === "choice" ? (
                <select
                  value={typeof gaps[n] === "number" ? (gaps[n] as number) : ""}
                  onChange={(e) =>
                    setGaps(gaps.map((x, k) => (k === n ? (e.target.value === "" ? null : Number(e.target.value)) : x)))
                  }
                >
                  <option value="">– unbekannt –</option>
                  {g.options.map((o, k) => (
                    <option key={k} value={k}>
                      {plainText(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={typeof gaps[n] === "string" ? (gaps[n] as string) : ""}
                  placeholder="richtige Eingabe, z. B. 4,2 kW"
                  onChange={(e) => setGaps(gaps.map((x, k) => (k === n ? e.target.value : x)))}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="buttons">
        <button className="primary" onClick={submit}>
          Speichern
        </button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
