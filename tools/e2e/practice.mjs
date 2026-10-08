// Checks skipping, marking difficult questions and repeating wrong ones in headless
// Chromium. Needs a build with bundled PDFs in apps/web/dist:
//   npm run build -w @exam/web && node packages/importer/src/cli.ts bundle apps/web/dist/bundled private/pdfs/*.pdf
import { join } from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { chromiumPath } from "./chromium.mjs";

const root = join(import.meta.dirname, "../..");
const shots = join(root, "private/screens");
const url = "http://localhost:5199/";

const server = await preview({ root: join(root, "apps/web"), configFile: join(root, "apps/web/vite.config.ts"), logLevel: "error", preview: { port: 5199 } });
const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
const expect = (ok, what) => {
  if (!ok) throw new Error(`Erwartet: ${what}`);
  console.log(`• ${what}`);
};
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
  /** Checks the empty answer and says it was wrong. */
  const answerWrong = async () => {
    await page.getByRole("button", { name: /Prüfen|Lösung anzeigen/ }).click();
    const self = page.getByRole("button", { name: "Nein, falsch" });
    if (await self.count()) await self.click();
    await page.getByRole("button", { name: "Weiter" }).click();
  };

  await page.goto(url);
  await page.getByText("Teil 1: Gebäudehülle").waitFor({ timeout: 120_000 });
  expect((await page.getByText("Wiederholen", { exact: true }).count()) === 0, "anfangs nichts zu wiederholen");

  await page.goto(`${url}#/learn?doc=WG-1&mode=order`);
  await page.locator(".question").waitFor();
  const first = await page.locator(".question-meta .muted").innerText();
  await page.getByRole("button", { name: "☆ Schwer" }).click();
  expect((await page.getByRole("button", { name: "★ Schwer" }).count()) === 1, "Frage als schwer markiert");
  await shot("practice-01-marked");
  await page.getByRole("button", { name: "Überspringen →" }).click();
  expect((await page.locator(".question-meta .muted").innerText()) !== first, "Überspringen geht zur nächsten Frage");
  await page.getByRole("button", { name: "☆ Schwer" }).click();
  await answerWrong();

  await page.goto(url);
  await page.getByText("Wiederholen", { exact: true }).waitFor();
  expect((await page.getByText("Fehlerfragen (1)").count()) === 1, "Fehlerfragen (1) auf der Übersicht");
  expect((await page.getByText("★ Schwere Fragen (2)").count()) === 1, "Schwere Fragen (2) auf der Übersicht");
  await shot("practice-02-home");

  await page.reload();
  await page.getByText("★ Schwere Fragen (2)").waitFor();
  expect(true, "Markierungen bleiben nach Neuladen");

  await page.getByText("★ Schwere Fragen (2)").click();
  await page.getByText("Schwere Fragen", { exact: true }).waitFor();
  expect((await page.locator(".question-meta .muted").innerText()) === first, "Sitzung zeigt die markierten Fragen");
  await page.getByRole("button", { name: "Überspringen →" }).click();
  await answerWrong();
  const summary = await page.locator(".screen p").first().innerText();
  expect(summary.includes("0 von 2") && summary.includes("1 falsch") && summary.includes("1 übersprungen"), `Ergebnis: ${summary}`);
  await shot("practice-03-end");

  await page.getByRole("button", { name: "Falsche wiederholen (1)" }).click();
  expect((await page.locator(".session-head").innerText()).includes("Wiederholung"), "Wiederholungsrunde mit der falschen Frage");
  await shot("practice-04-repeat");
  await page.getByRole("button", { name: /Prüfen|Lösung anzeigen/ }).click();
  const self = page.getByRole("button", { name: "Ja, richtig" });
  if (await self.count()) await self.click();
  else await page.getByText("Leider nicht ganz richtig").waitFor(); // graded automatically: stays wrong
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Übersprungene beantworten (1)" }).waitFor();
  expect(true, `danach: ${await page.locator(".screen p").first().innerText()}`);

  expect(errors.length === 0, `keine Fehler in der Konsole ${errors.join(" | ")}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
