import {
  type AnnotatedQuestion,
  emptyResponse,
  type Gap,
  type Grade,
  grade,
  plainText,
  reflowLines,
  type Response,
  type Row,
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
  /** Offers to skip the question without answering it. */
  onSkip?: () => void;
  /** Offers to go back to the previous question, e.g. a skipped one. */
  onBack?: () => void;
}

export function QuestionView({ question: q, onResult, onNext, onSkip, onBack }: Props) {
  const { docOf, record, settings, formulas, marks, toggleMark } = useStore();
  const marked = marks.has(q.key);
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
        <div className="question-meta">
          <span className="muted small">
            {catalogLabel(doc)} · Frage {q.number} ({q.code})
          </span>
          <button
            className={`mark ${marked ? "on" : ""}`}
            aria-pressed={marked}
            title={marked ? "Markierung entfernen" : "Als schwer markieren"}
            onClick={() => toggleMark(q.key)}
          >
            {marked ? "★ Schwer" : "☆ Schwer"}
          </button>
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
            {layoutRows(i.rows, i.gaps).map((block, r) => {
              const input = (gap: number) => (
                <GapInput
                  gap={i.gaps[gap]!}
                  value={response.values[gap] ?? null}
                  verdict={result?.gaps[gap]}
                  disabled={checked}
                  onChange={(v) =>
                    setResponse({ kind: "gaps", values: response.values.map((x, k) => (k === gap ? v : x)) })
                  }
                />
              );
              return block.kind === "statement" ? (
                <div key={r} className="statement">
                  <p>
                    <RichText text={block.text} />
                  </p>
                  {input(block.gap)}
                </div>
              ) : (
                <div key={r} className="gap-row">
                  {block.row.map((s, n) =>
                    "text" in s ? (
                      <span key={n} className="gap-text">
                        <RichText text={s.text} />
                      </span>
                    ) : (
                      <span key={n}>{input(s.gap)}</span>
                    ),
                  )}
                </div>
              );
            })}
          </div>
        )}

        {i.kind === "open" && !checked && (
          <p className="muted">Beantworten Sie die Frage für sich und vergleichen Sie dann mit der Lösung.</p>
        )}
      </section>

      {!checked ? (
        <div className="buttons spaced">
          <button className="primary wide" onClick={check}>
            {i.kind === "open" ? "Lösung anzeigen" : "Prüfen"}
          </button>
          {onBack && <button onClick={onBack}>← Zurück</button>}
          {onSkip && <button className="push-right" onClick={onSkip}>Überspringen →</button>}
        </div>
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
        <div className="buttons next">
          {onBack && <button onClick={onBack}>← Zurück</button>}
          <button className="primary" onClick={onNext}>
            Weiter
          </button>
        </div>
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
      {isVerdict(gap) ? (
        <span className="verdict" role="radiogroup">
          {gap.options.map((o, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              className={value === n ? "on" : solution !== null && n === gap.correct ? "solution" : ""}
              disabled={disabled}
              onClick={() => onChange(value === n ? null : n)}
            >
              {plainText(o)}
            </button>
          ))}
        </span>
      ) : gap.kind === "choice" ? (
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
      {solution !== null && !(isVerdict(gap) && gap.correct !== null) && <span className="gap-solution">{solution}</span>}
    </span>
  );
}

const POSITIVE = ["richtig", "ja", "trifft zu", "zutreffend", "korrekt", "wahr"];
const NEGATIVE = ["falsch", "nein", "trifft nicht zu", "nicht zutreffend", "unzutreffend"];

/** A choice between two opposite verdicts ("Trifft zu" / "Trifft nicht zu", "Ja" / "Nein" …). */
function isVerdict(gap: Gap): gap is Extract<Gap, { kind: "choice" }> {
  if (gap.kind !== "choice" || gap.options.length !== 2) return false;
  const words = gap.options.map((o) => plainText(o).toLowerCase().replace(/[.,;!]+$/, "").trim());
  return words.some((w) => POSITIVE.includes(w)) && words.some((w) => NEGATIVE.includes(w));
}

type Block = { kind: "row"; row: Row } | { kind: "statement"; text: string; gap: number };

/**
 * Statement rows ("text … [Trifft zu ▾]") become a statement with its verdict
 * buttons below. A statement the PDF wrapped onto gap-less lines (the
 * sentence goes on in lower case) gets those lines back, so the buttons come after it.
 */
function layoutRows(rows: Row[], gaps: Gap[]): Block[] {
  const blocks: Block[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const last = row.at(-1);
    const texts = row.slice(0, -1);
    if (!last || !("gap" in last) || texts.length === 0 || !texts.every((s) => "text" in s) || !isVerdict(gaps[last.gap]!)) {
      blocks.push({ kind: "row", row });
      continue;
    }
    let text = texts.map((s) => s.text).join(" ");
    for (let next = rows[r + 1]; next && isContinuation(text, next); next = rows[r + 1]) {
      text += " " + next.flatMap((s) => ("text" in s ? [s.text] : [])).join(" ");
      r++;
    }
    blocks.push({ kind: "statement", text, gap: last.gap });
  }
  return blocks;
}

function isContinuation(text: string, next: Row): boolean {
  const first = next[0];
  return (
    !/[.?!:]\s*$/.test(text) &&
    next.every((s) => "text" in s) &&
    first !== undefined &&
    "text" in first &&
    /^\p{Ll}/u.test(plainText(first.text).trim())
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
