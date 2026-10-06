import type { PageRegion } from "@exam/core";
import { useEffect, useRef, useState } from "react";
import { renderRegion } from "../pdf.ts";

/** A crop of the user's own PDF (figures, original layout, hidden solution). */
export function PdfRegion({ doc, region, reveal = false }: { doc: string; region: PageRegion; reveal?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "blank" | "error">("loading");
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    // Tap to zoom: render 2.5× wider inside a scrollable box (small tables, drawings).
    const width = Math.min(box.current?.clientWidth ?? 600, 900) * (zoomed ? 2.5 : 1);
    setState("loading");
    renderRegion(canvas.current!, doc, region, width, reveal, abort.signal).then(
      (done) => done && setState(done === "blank" ? "blank" : "ok"),
      (e) => {
        console.error(e);
        if (!abort.signal.aborted) setState("error");
      },
    );
    return () => abort.abort();
  }, [doc, region, reveal, zoomed]);

  return (
    <div
      className={`pdf-region ${state} ${zoomed ? "zoomed" : ""}`}
      ref={box}
      title={zoomed ? "Tippen zum Verkleinern" : "Tippen zum Vergrößern"}
      onClick={() => setZoomed(!zoomed)}
    >
      <canvas ref={canvas} />
      {state === "error" && <p className="muted">Ausschnitt konnte nicht dargestellt werden.</p>}
    </div>
  );
}
