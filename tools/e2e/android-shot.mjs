// Navigates the app's WebView to a hash route, optionally clicks buttons by text, then waits.
import { connect } from "./cdp.mjs";
const [hash, ...clicks] = process.argv.slice(2);
const cdp = await connect();
await cdp.evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
await new Promise((r) => setTimeout(r, 1500));
for (const text of clicks) {
  await cdp.evaluate(`(() => { const b = [...document.querySelectorAll("button, a, label")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
  await new Promise((r) => setTimeout(r, 1500));
}
await new Promise((r) => setTimeout(r, 2500));
console.log(await cdp.evaluate("[...document.querySelectorAll('.pdf-region')].map((e) => e.className).join(' | ')"));
cdp.close();
