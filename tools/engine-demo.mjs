import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "node:fs";
// Renders a 9 s clip of each engine (idle, a blip on the grid, then flat out through the
// gears) to WAV files, plus a spectrogram of each. Needs node serve.mjs running.
//   node tools/engine-demo.mjs [output folder]
const out = process.argv[2] || "temporary screenshots/engines";
mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if(m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
await p.goto("http://localhost:3000/tools/engine-demo.html");
await p.waitForFunction("window.ready");
for(const body of ["formula", "gt", "stock", "classic"]){
	const r = await p.evaluate(b => window.render(b), body);
	writeFileSync(`${out}/engine-${body}.wav`, Buffer.from(r.wav, "base64"));
	writeFileSync(`${out}/spec-${body}.png`, Buffer.from(await p.evaluate((w, l) => window.spectro(w, l), r.wav, body), "base64"));
	console.log(body.padEnd(8), "idle", JSON.stringify(r.idle), "rev", JSON.stringify(r.rev), "launch", JSON.stringify(r.launch), "top", JSON.stringify(r.top));
}
console.log(errs.length ? errs : "no errors");
await b.close();
