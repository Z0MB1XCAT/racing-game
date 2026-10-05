// The menu music, in a real browser: each song (the normal menu loop and October's spooky one) is audible, never clips, isn't
// silent for long, and the two are about as loud as each other. Needs node serve.mjs running.
//   node tools/music-test.mjs
import puppeteer from "puppeteer";

const b = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
const errors = [], problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
p.on("pageerror", e => errors.push(e.message));
await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
await p.evaluate(async () => { const a = await import("/js/audio.js"); a.unlock(); a.setLevel("sfx", 0); a.setLevel("engine", 0); a.setLevel("music", 1); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(600);
const results = {};
for(const song of ["menu", "spooky"]){
	await p.evaluate(async s => (await import("/js/audio.js")).playMusic(s), song);
	await wait(2500);       // (it fades in)
	const r = await p.evaluate(async () => {
		const a = await import("/js/audio.js");
		const peaks = [], rms = []; const end = performance.now() + 20000;
		while(performance.now() < end){ const m = a._test.meter(); if(m){ peaks.push(m.peak); rms.push(m.rms); } await new Promise(r => setTimeout(r, 25)); }
		return { peak: Math.max(...peaks), avg: rms.reduce((x, y) => x + y, 0) / rms.length, quiet: rms.filter(x => x < 0.002).length / rms.length, bad: peaks.some(x => !Number.isFinite(x)), song: a._test.song() };
	});
	results[song] = r;
	console.log(`    ${song.padEnd(7)} peak ${r.peak.toFixed(3)}  average ${r.avg.toFixed(4)}  silent ${(100 * r.quiet).toFixed(0)}% of the time`);
	ok(r.song === song && !r.bad, song + " plays with no broken values");
	ok(r.peak > 0.02 && r.peak < 0.95, song + " is audible and doesn't clip");
	ok(r.quiet < 0.5, song + " isn't silent for long");
}
const ratio = results.spooky.avg / results.menu.avg;
ok(ratio > 0.4 && ratio < 2.5, "the spooky loop is about as loud as the usual one (" + ratio.toFixed(2) + " times)");
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await b.close();
if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nmusic-test: OK");
