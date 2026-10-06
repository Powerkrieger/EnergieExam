import { connect } from "./cdp.mjs";
const cdp = await connect();
const log = [];
cdp.on((m) => {
  if (m.method === "Runtime.exceptionThrown") log.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled") log.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Log.entryAdded") log.push(`log ${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
});
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Page.reload");
await new Promise((r) => setTimeout(r, 5000));
console.log("url", cdp.url);
console.log(log.join("\n") || "keine Meldungen");
console.log("root:", (await cdp.evaluate("document.getElementById('root')?.innerHTML.slice(0, 200)")) ?? "-");
cdp.close();
