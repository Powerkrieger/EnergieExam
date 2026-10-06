import { searchFormulas } from "@exam/core";
import { useState } from "react";
import { FormulaCard } from "../components/FormulaCard.tsx";
import { href } from "../router.ts";
import { useStore } from "../store.tsx";

export function FormulasScreen() {
  const { formulas, questions } = useStore();
  const [query, setQuery] = useState("");
  if (!formulas) return <div className="screen">Die Formelsammlung ist noch nicht importiert.</div>;
  const entries = searchFormulas(formulas, query);

  return (
    <div className="screen">
      <h1>Formelsammlung</h1>
      <input type="search" placeholder="Suchen: Name oder Formelzeichen …" value={query} onChange={(e) => setQuery(e.target.value)} />
      {entries.map((e) => {
        const used = questions.filter((q) => !q.stale && q.annotation?.formulas?.includes(e.id));
        return (
          <div key={e.id}>
            <FormulaCard entry={e} />
            {used.length > 0 && (
              <p className="small used-by">
                Gebraucht in:{" "}
                {used.map((q, n) => (
                  <span key={q.key}>
                    {n > 0 && ", "}
                    <a href={href(`q/${q.key}`)}>{q.code}</a>
                  </span>
                ))}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
