import { useEffect, useState } from "react";

/** Minimal hash router: "#/learn/WG-1?mode=due" → { path: ["learn", "WG-1"], query }. */
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const [p = "", q = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { path: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(path: string, query?: Record<string, string>): string {
  const q = query ? `?${new URLSearchParams(query)}` : "";
  return `#/${path}${q}`;
}

export function navigate(path: string, query?: Record<string, string>) {
  location.hash = href(path, query);
}
