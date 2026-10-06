import type { FormulaEntry } from "@exam/core";
import { useState } from "react";
import { FORMULA_DOC } from "../store.tsx";
import { PdfRegion } from "./PdfRegion.tsx";
import { RichText } from "./RichText.tsx";

/** A row of the Formelsammlung, rendered from the user's own PDF on demand. */
export function FormulaCard({ entry, open = false, actions }: { entry: FormulaEntry; open?: boolean; actions?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <div className="formula-card">
      <div className="formula-head">
        <button className="link" onClick={() => setExpanded(!expanded)}>
          {expanded ? "▾" : "▸"} <RichText text={entry.title} />
        </button>
        {actions}
      </div>
      <div className="muted small">
        {entry.chapter} · Formelsammlung S. {entry.printedPage ?? `${entry.region.page} (PDF)`}
        {entry.symbols.length > 0 && (
          <>
            {" · "}
            {entry.symbols.slice(0, 6).map((s, n) => (
              <span key={n}>
                {n > 0 && ", "}
                <RichText text={s.symbol} />
              </span>
            ))}
          </>
        )}
      </div>
      {expanded && <PdfRegion doc={FORMULA_DOC} region={entry.region} />}
    </div>
  );
}
