// Checks what picking a track in a menu does (js/main.js previewTrack): the click returns at once with a
// "Loading ..." chip showing, the preview is built a moment later, a quick run of picks builds only the last, and
// starting a race straight after a pick doesn't rebuild the world under the race.
// Needs node serve.mjs running.
//   node tools/preview-test.mjs
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: "new" });
const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(){
	const p = await browser.newPage();
	const errors = [];
	p.on("pageerror", e => errors.push(e.message));
	p.on("console", m => { if(m.type() === "error" && !/tailwind|apple-mobile|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
	await p.setViewport({ width: 1100, height: 700 });
	await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	await p.click("#btnBots"); await wait(2500);
	// Count the worlds that get built: the game's world object changes with each one.
	await p.evaluate(() => { const seen = window.__worlds = new Set(); const look = () => { if(window.__game.world) seen.add(window.__game.world); }; look(); setInterval(look, 5); });
	return { p, errors };
}
const pick = (p, id) => p.evaluate(id => { const t = performance.now(); document.querySelector(`#setupTracks [data-id="${id}"]`).click(); return performance.now() - t; }, id);
const chip = p => p.evaluate(() => { const c = document.getElementById("trackLoading"); return c.hidden ? null : c.textContent; });
// (Track keys carry a version: "monaco-v3".)
const state = p => p.evaluate(() => ({ key: String(window.__game.trackKey).replace(/-v\d+$/, ""), screen: window.__game.screen, worlds: window.__worlds.size }));

console.log("one pick");
{
	const { p, errors } = await open();
	const before = (await state(p)).worlds;
	const ms = await pick(p, "monaco");
	ok(ms < 50, "the click returns at once (" + ms.toFixed(1) + " ms)");
	await wait(40);
	const c = await chip(p);
	ok(c && /Monaco/.test(c), "a chip says what's loading: " + JSON.stringify(c));
	await wait(3500);
	const s = await state(p);
	ok(s.key === "monaco", "the preview is Monaco's (" + s.key + ")");
	ok(await chip(p) === null, "the chip has gone");
	ok(s.worlds === before + 1, "one world was built (" + (s.worlds - before) + ")");
	// Picking what's already on show is instant and shows no chip.
	await pick(p, "monaco"); await wait(40);
	ok(await chip(p) === null, "picking the track that's already showing shows no chip");
	ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
	await p.close();
}
console.log("a quick run of picks");
{
	const { p, errors } = await open();
	const before = (await state(p)).worlds;
	for(const id of ["spa", "monza", "suzuka"]){ await pick(p, id); await wait(30); }
	await wait(4000);
	const s = await state(p);
	ok(s.key === "suzuka", "it ends on the last one (" + s.key + ")");
	ok(s.worlds === before + 1, "only that one was built (" + (s.worlds - before) + " worlds)");
	ok(await chip(p) === null, "the chip has gone");
	ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
	await p.close();
}
console.log("starting a race straight after a pick");
{
	const { p, errors } = await open();
	await pick(p, "spa"); await wait(30);
	await p.evaluate(() => document.getElementById("setupGo").click());
	await wait(2500);
	const a = await state(p);
	ok(a.screen === "race" && a.key === "spa", "the race is on Spa (" + a.screen + ", " + a.key + ")");
	ok(await chip(p) === null, "no chip over the race");
	await wait(2500);
	const b = await state(p);
	ok(b.worlds === a.worlds, "the world isn't rebuilt under the race (" + a.worlds + " -> " + b.worlds + ")");
	ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
	await p.close();
}
await browser.close();
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\ntrack previews ok");
