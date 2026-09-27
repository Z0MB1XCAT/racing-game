// Checks the sound survives bad values and rebuilds itself if it breaks. Needs node serve.mjs running.
//   node tools/audio-test.mjs
import puppeteer from "puppeteer";
const b = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", e => errors.push(e.message));
p.on("console", m => { if((m.type() === "warn" || m.type() === "error") && !/tailwind|apple-mobile/.test(m.text())) errors.push("console: " + m.text()); });
await p.setViewport({ width: 1200, height: 800 });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
await p.click("#btnBots"); await new Promise(r => setTimeout(r, 400));
await p.click("#setupGo");
await new Promise(r => setTimeout(r, 7000));
const res = await p.evaluate(async () => {
	const a = await import("/js/audio.js");
	const out = { start: a.soundState(), engine: a.engineMode() };
	// Bad values straight into the engine and effects: must not throw.
	try {
		a.updateEngines([{ id: "x", body: "gt", speed: NaN, gain: Infinity, pan: NaN, pitch: undefined, rev: null }, { id: "y", body: "stock", speed: 0.2, gain: 0.5, pan: 0, pitch: 1 }], { speed: NaN, slip: NaN, draft: undefined }, 0.016);
		a.thud(NaN, NaN, "wall"); a.setRain(NaN); a.setVolume(NaN);
		out.badValues = "no error";
	} catch(e){ out.badValues = "THREW " + e.message; }
	// Kill the sound and see it come back on its own.
	a._test.close();
	await new Promise(r => setTimeout(r, 20));
	out.afterClose = a.soundState();
	await new Promise(r => setTimeout(r, 2500));
	out.recovered = a.soundState();
	out.engineAfter = a.engineMode();
	return out;
});
console.log(JSON.stringify(res));
console.log(errors.length ? errors : "no page errors");
await b.close();
