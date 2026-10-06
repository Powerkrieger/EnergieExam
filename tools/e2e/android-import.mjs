// Imports PDFs (already pushed to /data/local/tmp/pdfs on the device) in the app's WebView.
import { connect } from "./cdp.mjs";
const files = process.argv.slice(2).map((f) => `/data/local/tmp/pdfs/${f}`);
const cdp = await connect();
const log = [];
cdp.on((m) => m.method === "Runtime.exceptionThrown" && log.push(m.params.exceptionDetails.exception?.description));
await cdp.send("Runtime.enable");
await cdp.send("DOM.enable");
const { root } = await cdp.send("DOM.getDocument");
const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
const started = Date.now();
await cdp.send("DOM.setFileInputFiles", { nodeId, files });
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const n = await cdp.evaluate("document.querySelectorAll('.results li').length");
  if (n >= files.length) break;
}
console.log(`Dauer ${Math.round((Date.now() - started) / 1000)} s`);
console.log(await cdp.evaluate("document.querySelector('.results')?.innerText ?? 'keine Ergebnisse'"));
console.log(log.join("\n"));
cdp.close();
