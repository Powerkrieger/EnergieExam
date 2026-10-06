import {
  type AnnotatedQuestion,
  emptyResponse,
  type Gap,
  type Grade,
  grade,
  plainText,
  reflowLines,
  type Response,
  type Verdict,
} from "@exam/core";
import { useEffect, useState } from "react";
import { catalogLabel, useStore } from "../store.tsx";
import { FormulaCard } from "./FormulaCard.tsx";
import { PdfRegion } from "./PdfRegion.tsx";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { RichText } from "./RichText.tsx";

interface Props {
  question: AnnotatedQuestion;
  /** Called once the learner's result is known (graded or self-assessed). */
  onResult?: (right: boolean) => void;
  onNext?: () => void;
}

export function QuestionView({ question: q, onResult, onNext }: Props) {
  const { docOf, record, settings, formulas } = useStore();
  const doc = docOf(q.key);
  const [response, setResponse] = useState<Response>(() => emptyResponse(q));
  const [result, setResult] = useState<Grade | null>(null);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [showOriginal, setShowOriginal] = useState(!!q.preferOriginal?.body);
  const [showSolutionOriginal, setShowSolutionOriginal] = useState(!!q.preferOriginal?.solution);

  // Reset when moving to another question.
  useEffect(() => {
    setResponse(emptyResponse(q));
    setResult(null);
    setVerdict(null);
    setShowOriginal(!!q.preferOriginal?.body);
    setShowSolutionOriginal(!!q.preferOriginal?.solution);
  }, [q.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const checked = result !== null;

  const finish = (right: boolean) => {
    setVerdict(right);
    record(q.key, right);
    onResult?.(right);
  };

  const check = () => {
    const g = grade(q, response);
    setResult(g);
    if (g.overall !== null) finish(g.overall);
  };

  const i = q.interaction;
  const linked = (q.annotation && !q.stale ? q.annotation.formulas ?? [] : [])
    .map((id) => formulas?.entries.find((e) => e.id === id))
    .filter((e) => e !== undefined);

  return (
    <article className="question">
      <header className="question-head">
        <div className="muted small">
          {catalogLabel(doc)} · Frage {q.number} ({q.code})
        </div>
        <h2>{q.topic}</h2>
      </header>

      {showOriginal ? (
        q.source.map((r, n) => <PdfRegion key={n} doc={doc} region={r} />)
      ) : (
        <>
          {q.stem.map((p, n) => (
            <p key={n} className="stem">
              <RichText text={p} />
            </p>
          ))}
          {q.figures.map((r, n) => (
            <PdfRegion key={n} doc={doc} region={r} />
          ))}
        </>
      )}
      <button className="link small" onClick={() => setShowOriginal(!showOriginal)}>
        {showOriginal ? "Als Text anzeigen" : "Frage im Original anzeigen"}
      </button>

      <section className="interaction">
        {i.kind === "single" && (
          <div className="options">
            {i.options.map((o, n) => {
              const chosen = response.kind === "single" && response.choice === n;
              const state = !checked ? "" : n === i.correct ? "right" : chosen ? "wrong" : "";
              return (
                <label key={n} className={`option ${chosen ? "chosen" : ""} ${state}`}>
                  <input
                    type="radio"
                    name={`q-${q.key}`}
                    checked={chosen}
                    disabled={checked}
                    onChange={() => setResponse({ kind: "single", choice: n })}
                  />
                  <span>
                    <RichText text={o} />
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {i.kind === "gaps" && response.kind === "gaps" && (
          <div className="gap-rows">
            {i.rows.map((row, r) => (
              <div key={r} className="gap-row">
                {row.map((s, n) =>
                  "text" in s ? (
                    <span key={n} className="gap-text">
                      <RichText text={s.text} />
                    </span>
                  ) : (
                    <GapInput
                      key={n}
                      gap={i.gaps[s.gap]!}
                      value={response.values[s.gap] ?? null}
                      verdict={result?.gaps[s.gap]}
                      disabled={checked}
                      onChange={(v) =>
                        setResponse({ kind: "gaps", values: response.values.map((x, k) => (k === s.gap ? v : x)) })
                      }
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        )}

        {i.kind === "open" && !checked && (
          <p className="muted">Beantworten Sie die Frage für sich und vergleichen Sie dann mit der Lösung.</p>
        )}
      </section>

      {!checked ? (
        <button className="primary" onClick={check}>
          {i.kind === "open" ? "Lösung anzeigen" : "Prüfen"}
        </button>
      ) : (
        <ResultBanner overall={result.overall} verdict={verdict} onSelfAssess={finish} />
      )}

      {checked && (
        <section className="solution">
          <h3>Lösung</h3>
          {showSolutionOriginal
            ? q.solutionSource.map((r, n) => <PdfRegion key={n} doc={doc} region={r} reveal />)
            : reflowLines(q.solution).map((l, n) => (
                <p key={n}>
                  <RichText text={l} />
                </p>
              ))}
          {q.solutionSource.length > 0 && (
            <button className="link small" onClick={() => setShowSolutionOriginal(!showSolutionOriginal)}>
              {showSolutionOriginal ? "Als Text anzeigen" : "Lösung im Original anzeigen"}
            </button>
          )}
          {linked.length > 0 && (
            <div className="formulas">
              <h3>Formeln dazu</h3>
              {linked.map((e) => (
                <FormulaCard key={e.id} entry={e} />
              ))}
            </div>
          )}
        </section>
      )}

      {checked && onNext && (verdict !== null || result.overall !== null) && (
        <button className="primary next" onClick={onNext}>
          Weiter
        </button>
      )}

      {settings.reviewMode && <ReviewPanel question={q} />}
    </article>
  );
}

function GapInput({
  gap,
  value,
  verdict,
  disabled,
  onChange,
}: {
  gap: Gap;
  value: number | string | null;
  verdict: Verdict | undefined;
  disabled: boolean;
  onChange: (v: number | string | null) => void;
}) {
  const state = verdict === undefined ? "" : verdict === true ? "right" : verdict === false ? "wrong" : "unknown";
  const solution =
    verdict === false || verdict === null
      ? gap.kind === "choice"
        ? gap.correct !== null
          ? plainText(gap.options[gap.correct]!)
          : "?"
        : gap.expected ?? "?"
      : null;

  return (
    <span className={`gap ${state}`}>
      {gap.kind === "choice" ? (
        <select
          value={typeof value === "number" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">–</option>
          {gap.options.map((o, n) => (
            <option key={n} value={n}>
              {plainText(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          inputMode={gap.numeric ? "decimal" : "text"}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          size={Math.max(6, Math.min(30, (gap.expected ?? "").length + 2))}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {solution !== null && <span className="gap-solution">{solution}</span>}
    </span>
  );
}

function ResultBanner({
  overall,
  verdict,
  onSelfAssess,
}: {
  overall: Verdict;
  verdict: boolean | null;
  onSelfAssess: (right: boolean) => void;
}) {
  if (overall === true) return <div className="banner right">Richtig!</div>;
  if (overall === false) return <div className="banner wrong">Leider nicht ganz richtig.</div>;
  if (verdict !== null) return <div className={`banner ${verdict ? "right" : "wrong"}`}>{verdict ? "Als richtig gewertet" : "Als falsch gewertet"}</div>;
  return (
    <div className="banner unknown">
      <p>Vergleichen Sie Ihre Antwort mit der Lösung. Lagen Sie richtig?</p>
      <div className="buttons">
        <button onClick={() => onSelfAssess(true)}>Ja, richtig</button>
        <button onClick={() => onSelfAssess(false)}>Nein, falsch</button>
      </div>
    </div>
  );
}
