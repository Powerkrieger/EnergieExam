// Usage: node tools/rescue-progress/run.mjs [package] [out.json]
//
// Copies the learning progress out of an app install that has no backup button
// yet (review builds up to review-4, package de.energieberatung.pruefungstrainer).
// Those were debug builds, so their WebView can be read over USB: phone with USB
// debugging on, connected, `adb devices` lists it. The result is a progress
// backup file to load in the new app under Einstellungen → Sicherung laden.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const pkg = process.argv[2] ?? "de.energieberatung.pruefungstrainer";
const date = new Date().toISOString().slice(0, 10);
const out = process.argv[3] ?? join(import.meta.dirname, `../../private/backups/fortschritt-${pkg}-${date}.json`);
const PORT = 9333;
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

if (!adb("shell", "pm", "list", "packages", pkg).split("\n").includes(`package:${pkg}`)) {
  throw new Error(`${pkg} ist auf dem Gerät nicht installiert`);
}
// Start the app (if needed) so its WebView and devtools socket exist.
let pid = "";
try {
  pid = adb("shell", "pidof", pkg);
} catch {}
if (!pid) {
  adb("shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1");
  for (let i = 0; i < 30 && !pid; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      pid = adb("shell", "pidof", pkg);
    } catch {}
  }
}
if (!pid) throw new Error(`${pkg} startet nicht`);
const socket = `webview_devtools_remote_${pid.split(" ")[0]}`;
let pages = [];
for (let i = 0; i < 30 && !pages.length; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (!adb("shell", "cat", "/proc/net/unix").includes(socket)) continue;
  adb("forward", `tcp:${PORT}`, `localabstract:${socket}`);
  try {
    pages = (await (await fetch(`http://localhost:${PORT}/json`)).json()).filter((p) => p.type === "page");
  } catch {}
}
if (!pages.length) throw new Error("Kein WebView zum Auslesen gefunden – ist es ein Debug-Build der App?");

try {
  const backup = await evaluate(pages[0].webSocketDebuggerUrl, readProgress);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(backup));
  console.log(`${Object.keys(backup.progress).length} beantwortete Fragen, ${Object.keys(backup.marks).length} markierte → ${out}`);
} finally {
  adb("forward", "--remove", `tcp:${PORT}`);
}

/** Runs in the app: reads progress and marks from its IndexedDB, in the format of apps/web/src/backup.ts. */
async function readProgress() {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("energieberatung");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const all = (store) =>
    new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) return resolve({});
      const s = db.transaction(store).objectStore(store);
      const keys = s.getAllKeys();
      const values = s.getAll();
      values.onsuccess = () => resolve(Object.fromEntries(keys.result.map((k, i) => [k, values.result[i]])));
      values.onerror = () => reject(values.error);
    });
  return {
    format: "energieexam-progress",
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await all("progress"),
    marks: await all("marks"),
  };
}

async function evaluate(url, fn) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("Verbindung zum WebView fehlgeschlagen"));
  });
  const reply = new Promise((resolve) => (ws.onmessage = (m) => resolve(JSON.parse(m.data))));
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: `(${fn})()`, awaitPromise: true, returnByValue: true },
    }),
  );
  const { result, error } = await reply;
  ws.close();
  if (error || result.exceptionDetails) throw new Error(JSON.stringify(error ?? result.exceptionDetails));
  return result.result.value;
}
