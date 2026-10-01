// Plays a short race in a real browser and listens to the mix: the recorded effects and the voices load, the engineer and
// the commentators speak (the subtitles say what), the level is never clipped or silent, and the sound survives.
// Needs node serve.mjs running.
//   node tools/sound-test.mjs [trackId]
import puppeteer from "puppeteer";

const track = process.argv[2] || "figure8";
const b = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
const errors = [], problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
p.on("pageerror", e => errors.push(e.message));
p.on("console", m => { if((m.type() === "warn" || m.type() === "error") && !/tailwind|apple-mobile|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
await p.setViewport({ width: 1280, height: 720 });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
await p.click("#btnBots"); await new Promise(r => setTimeout(r, 500));
await p.evaluate(id => document.querySelector(`#setupTracks [data-id="${id}"]`).click(), track);
await new Promise(r => setTimeout(r, 2500));
// Record every subtitle that appears, and the level every 100 ms.
await p.evaluate(() => {
	window.__caps = []; window.__lev = [];
	const el = document.getElementById("voiceCap");
	new MutationObserver(() => { if(!el.hidden) window.__caps.push({ kind: el.dataset.kind, who: document.getElementById("vcWho").textContent, text: document.getElementById("vcText").textContent, t: Math.round(performance.now()) }); }).observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden"] });
	setInterval(async () => { const a = await import("/js/audio.js"); const m = a._test.meter(); if(m) window.__lev.push(m); }, 100);
});
await p.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 3; });
await p.click("#setupGo");
await new Promise(r => setTimeout(r, 2500));
// A bot drives the player's car, so the race finishes and there's something to talk about.
await p.evaluate(async () => {
	const { Bot } = await import("/js/bots.js");
	const g = window.__game, me = g.race.me;
	me.bot = new Bot("hard"); me.local = true;
	const orig = g.race.update.bind(g.race);
	g.race.update = (dt, steer) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
});
for(let i = 0; i < 100; i++){
	const s = await p.evaluate(() => window.__game.screen);
	if(s === "results") break;
	await new Promise(r => setTimeout(r, 1000));
}
const res = await p.evaluate(async () => {
	const a = await import("/js/audio.js");
	return { caps: window.__caps, lev: window.__lev, loaded: a._test.loaded(), state: a.soundState() };
});
console.log("what was said:");
const seen = new Set();
for(const c of res.caps){ const k = c.kind + c.text; if(seen.has(k)) continue; seen.add(k); console.log(`    ${c.kind === "radio" ? "RADIO" : c.who.slice(0, 5).toUpperCase().padEnd(5)}  ${c.text}`); }
ok(res.loaded.sfx, "the recorded effects loaded");
ok(res.state === "running", "the sound is running (" + res.state + ")");
ok(res.caps.some(c => c.kind === "radio"), "the engineer spoke on the radio");
ok(res.caps.some(c => c.kind === "cast"), "the commentators spoke");
const peak = Math.max(0, ...res.lev.map(l => l.peak)), loud = res.lev.filter(l => l.rms > 0.003).length;
ok(res.lev.every(l => Number.isFinite(l.peak) && Number.isFinite(l.rms)), "no broken values in the mix");
ok(peak <= 1.0, "never clipped (loudest peak " + peak.toFixed(2) + ")");
ok(peak > 0.05 && loud > res.lev.length * 0.5, "it isn't silent: loud for " + Math.round(100 * loud / Math.max(1, res.lev.length)) + "% of the time, peak " + peak.toFixed(2));
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await b.close();
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\nsound ok");
