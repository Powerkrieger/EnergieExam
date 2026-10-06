// End-to-end check of the web app in headless Chromium: imports the PDFs from
// private/pdfs through the UI, answers questions, uses the review mode and
// stores screenshots in private/screens/.
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { chromiumPath } from "./chromium.mjs";

const root = join(import.meta.dirname, "../..");
const shots = join(root, "private/screens");
const pdfs = ["wg1", "wg2", "wg3", "nwg1", "nwg2", "nwg3", "formelsammlung"].map((f) => join(root, `private/pdfs/${f}.pdf`));

const server = await createServer({ root: join(root, "apps/web"), configFile: join(root, "apps/web/vite.config.ts"), logLevel: "error", server: { port: 5198 } });
await server.listen();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
  const step = (s) => console.log(`• ${s}`);

  await page.goto("http://localhost:5198/");
  await page.getByText("PDFs auswählen").waitFor();
  await shot("01-import");
  step("Import-Bildschirm");

  const started = Date.now();
  await page.setInputFiles('input[type="file"]', pdfs);
  await page.locator(".results li").nth(pdfs.length - 1).waitFor({ timeout: 600_000 });
  console.log((await page.locator(".results").innerText()).split("\n").map((l) => "    " + l).join("\n"));
  step(`Import fertig in ${Math.round((Date.now() - started) / 1000)} s`);
  await shot("02-import-done");

  await page.getByText("Zum Lernen").click();
  await page.getByText("Teil 1: Gebäudehülle").waitFor();
  await shot("03-home");
  step("Übersicht");

  // Learn: answer the first questions of WG Teil 1 in order.
  await page.goto("http://localhost:5198/#/learn?doc=NWG-1&mode=order");
  await page.locator(".question").waitFor();
  await shot("04-question");
  for (let n = 0; n < 3; n++) {
    const selects = page.locator(".gap select");
    const count = await selects.count();
    for (let k = 0; k < count; k++) await selects.nth(k).selectOption({ index: 1 });
    const radios = page.locator(".option input");
    if (await radios.count()) await radios.first().check();
    await page.getByRole("button", { name: /Prüfen|Lösung anzeigen/ }).click();
    if (n === 0) await shot("05-checked");
    const self = page.getByRole("button", { name: "Ja, richtig" });
    if (await self.count()) await self.click();
    await page.getByRole("button", { name: "Weiter" }).click();
  }
  step("3 Fragen beantwortet");

  // Question with figures and calculation.
  await page.goto("http://localhost:5198/#/q/NWG/1.5.12");
  await page.locator(".pdf-region.ok canvas").first().waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector(".pdf-region.loading"), null, { timeout: 30_000 });
  const failed = await page.locator(".pdf-region.error").count();
  if (failed) errors.push(`${failed} Ausschnitte nicht darstellbar`);
  await shot("06-figures");
  await page.getByRole("button", { name: "Prüfen" }).click();
  await page.getByRole("button", { name: "Lösung im Original anzeigen" }).click();
  await page.locator(".solution .pdf-region.ok").first().waitFor({ timeout: 30_000 });
  await shot("07-solution-original");
  step("Abbildungen und Originallösung");

  // Review mode.
  await page.goto("http://localhost:5198/#/settings");
  await page.locator(".toggle input").check();
  await page.goto("http://localhost:5198/#/review");
  await page.getByText("Unsichere zuerst").waitFor();
  await shot("08-review-overview");
  await page.goto("http://localhost:5198/#/q/WG/1.1.1.06");
  await page.locator(".review").waitFor();
  await page.getByRole("button", { name: "✓ Stimmt" }).click();
  await page.locator('.review input[type="search"]').fill("Wärmedurchgangskoeffizient");
  await page.getByRole("button", { name: "+ Zuordnen" }).first().click();
  await page.locator(".review .formula-card .link").first().click();
  await page.locator(".review .pdf-region.ok").first().waitFor({ timeout: 30_000 });
  await shot("09-review-panel");
  step("Prüfmodus: bestätigt und Formel zugeordnet");

  await page.goto("http://localhost:5198/#/formulas");
  await page.locator(".formula-card").first().waitFor();
  await shot("10-formulas");
  step("Formelsammlung");

  // Reload: data must persist.
  await page.reload();
  await page.goto("http://localhost:5198/#/review");
  const stats = await page.locator(".stats").innerText();
  step(`Nach Neuladen: ${stats.replace(/\s+/g, " ")}`);
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.log("Fehler im Browser:\n" + [...new Set(errors)].join("\n"));
  process.exitCode = 1;
}
