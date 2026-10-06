import type { RichText as Rich } from "@exam/core";
import { Fragment, type ReactNode } from "react";

/** Renders `_{…}` / `^{…}` markup as sub/superscript and `\t` as a cell gap. */
export function RichText({ text }: { text: Rich }) {
  return <>{renderRich(text)}</>;
}

export function renderRich(text: Rich): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /([_^])\{([^}]*)\}|\t/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(<Fragment key={n++}>{text.slice(last, m.index)}</Fragment>);
    if (m[0] === "\t") out.push(<span key={n++} className="tab" />);
    else if (m[1] === "_") out.push(<sub key={n++}>{m[2]}</sub>);
    else out.push(<sup key={n++}>{m[2]}</sup>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={n++}>{text.slice(last)}</Fragment>);
  return out;
}
