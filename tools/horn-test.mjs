// The horn (H in a race), in a real browser. Needs node serve.mjs running.
//   1. every horn sound is audible, not clipped, and none is wildly louder than the others;
//   2. over ?localnet, a horn pressed in one tab is heard in the other (the press travels with the car's updates),
//      even a very short tap, and the winner's fanfare plays;
//   3. with the room's Horn switched Off, pressing H does nothing and nobody hears anything.
//   node tools/horn-test.mjs
import puppeteer from "puppeteer";

const base = "http://localhost:3000/";
const browser = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"], protocolTimeout: 60000 });
const errors = [], problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open(url, w = 1100, h = 700){
	const page = await browser.newPage();
	await page.setViewport({ width: w, height: h });
	page.on("pageerror", e => errors.push("pageerror: " + e.message));
	page.on("console", m => { if(m.type() === "error" && !/tailwind|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
	await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
	return page;
}
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
// Loudest and average level of what is going to the speakers, sampled every 15 ms for `ms`.
const listen = (page, ms) => page.evaluate(async ms => {
	const a = await import("/js/audio.js");
	let peak = 0, sum = 0, n = 0;
	const end = performance.now() + ms;
	while(performance.now() < end){ const m = a._test.meter(); if(m){ peak = Math.max(peak, m.peak); sum += m.rms; n++; } await new Promise(r => setTimeout(r, 15)); }
	return { peak, rms: n ? sum / n : 0 };
}, ms);

// ---------- 1. every sound ----------
console.log("the sounds");
{
	const p = await open(base);
	await p.click("#btnBots");
	await p.evaluate(async () => { const a = await import("/js/audio.js"); a.unlock(); a.setLevel("music", 0); a.setLevel("engine", 0); });
	await wait(800);
	const kinds = await p.evaluate(async () => (await import("/js/audio.js")).HORN_KINDS);
	const rows = [];
	for(const kind of kinds){
		await p.evaluate(async k => (await import("/js/audio.js")).hornPreview(k), kind);
		rows.push({ kind, ...(await listen(p, 1500)) });
		await wait(300);
	}
	for(const r of rows) console.log(`    ${r.kind.padEnd(8)} peak ${r.peak.toFixed(3)}  average ${r.rms.toFixed(4)}`);
	ok(rows.length >= 6, rows.length + " horns");
	ok(rows.every(r => r.peak > 0.03), "every horn is audible");
	ok(rows.every(r => r.peak < 0.95), "none clips");
	const loud = rows.map(r => r.rms).sort((a, b) => a - b), med = loud[Math.floor(loud.length / 2)];
	ok(rows.every(r => r.rms > med / 4 && r.rms < med * 4), "none is more than 4 times louder or quieter than the middle one");
	await p.close();
}

// ---------- 2 and 3. between two players ----------
async function twoPlayers(hornOn){
	console.log(hornOn ? "a horn in a room with the horn on" : "a room with the horn switched off");
	const host = await open(base + "?localnet");
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "guest", "popup,width=1100,height=700"), base + "?localnet");
	const guest = await popup;
	guest.on("pageerror", e => errors.push("guest pageerror: " + e.message));
	await guest.setViewport({ width: 1100, height: 700 });
	await guest.waitForFunction(() => window.__game, { timeout: 60000 });
	await wait(1200);
	for(const p of [host, guest]) await p.evaluate(async () => { const a = await import("/js/audio.js"); a.unlock(); a.setLevel("music", 0); a.setLevel("engine", 0); });
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	await click(guest, "#btnOnline"); await wait(400);
	await guest.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
	await click(guest, "#joinBtn"); await wait(1200);
	await click(guest, "#lobbyGo"); await wait(500);
	if(!hornOn){
		await host.evaluate(() => [...document.querySelectorAll("#lobbyHorn button")].find(b => b.dataset.v === "0").click());
		await wait(600);
		const seen = await guest.evaluate(() => ({ room: window.__game.room.settings.horn, locked: document.getElementById("lobbyHorn").dataset.locked, off: document.querySelector('#lobbyHorn [data-v="0"]').getAttribute("aria-checked") }));
		ok(seen.room === false && seen.locked === "1" && seen.off === "true", "the guest sees Horn: Off, and can't change it");
	}
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 1, track: "figure8" }));
	await wait(600);
	await click(host, "#lobbyGo");
	// Wait for the lights to go out, then give the cars a moment.
	for(let i = 0; i < 40; i++){ const ph = await guest.evaluate(() => window.__game.race && window.__game.race.phase).catch(() => null); if(ph === "racing") break; await wait(500); }
	await wait(4500);   // (the cheer at "go" has died away)
	const hostId = await host.evaluate(() => window.__game.net.uid);
	const hornState = p => p.evaluate(async id => {
		const c = window.__game.race.cars.find(x => x.id === id), a = await import("/js/audio.js");
		return { n: c.hornN, held: c.hornHeld, listed: (window.__game.hornCars || []).filter(h => h.id === id).length, voice: a._test.horns().find(h => h.id === id) || null };
	}, hostId);
	const base0 = await listen(guest, 500);
	ok(base0.peak < 0.03, "quiet before the horn (peak " + base0.peak.toFixed(3) + ")");
	// A long press. (The cars are not steered, so they may crash and make noise: the speaker level is only printed.)
	await host.keyboard.down("KeyH");
	await wait(500);
	const during = await hornState(guest);
	await host.keyboard.up("KeyH");
	await wait(700);
	const after = await hornState(guest);
	const mine = await hornState(host);
	if(hornOn){
		ok(mine.n >= 1, "pressing H counts a horn press on your own car (" + mine.n + ")");
		ok(during.n >= 1 && during.held, "the other tab sees it held (press count " + during.n + ")");
		ok(during.voice && during.voice.holding && during.voice.kind === "classic", "and is sounding the horn (" + JSON.stringify(during.voice) + ")");
		ok(!after.held && after.voice && !after.voice.holding, "it lets go when the key is up");
		// A very short tap: shorter than the gap between updates.
		const n0 = after.n, s0 = after.voice.starts;
		await host.keyboard.down("KeyH"); await wait(15); await host.keyboard.up("KeyH");
		await wait(700);
		const tap = await hornState(guest);
		ok(tap.n !== n0 && tap.voice.starts === s0 + 1, "a 15 ms tap still sounds on the other tab (press count " + n0 + " to " + tap.n + ", sounded " + (tap.voice.starts - s0) + " time)");
		// The winner's fanfare plays on the other tab when someone wins. Force it directly.
		const fan = await guest.evaluate(async () => { const a = await import("/js/audio.js"); a.hornFanfare("classic", 1, 0); let peak = 0; const end = performance.now() + 1200; while(performance.now() < end){ const m = a._test.meter(); if(m) peak = Math.max(peak, m.peak); await new Promise(r => setTimeout(r, 15)); } return peak; });
		ok(fan > 0.03, "the winner's fanfare is audible (peak " + fan.toFixed(3) + ")");
	}else{
		ok(mine.n === 0, "pressing H does nothing in this room (press count " + mine.n + ")");
		ok(during.n === 0 && during.listed === 0 && !during.voice, "the other tab sees no horn and has no horn voice");
	}
	await host.close(); await guest.close();
}
await twoPlayers(true);
await twoPlayers(false);

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
await browser.close();
if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nhorn-test: OK");
