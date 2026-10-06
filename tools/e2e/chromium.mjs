import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** A Chromium from the local Playwright cache (or CHROME=/path/to/chrome). */
export function chromiumPath() {
  const cache = join(homedir(), ".cache/ms-playwright");
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1) : undefined;
  const path =
    process.env.CHROME ??
    ["chrome-linux64/chrome", "chrome-linux/chrome"].map((p) => dir && join(cache, dir, p)).find((p) => p && existsSync(p));
  if (!path) throw new Error("Kein Chromium gefunden – CHROME=/pfad/zu/chrome setzen");
  return path;
}
