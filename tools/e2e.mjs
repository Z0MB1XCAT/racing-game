// Drives the game in a headless browser and screenshots each step.
//   node tools/e2e.mjs solo [trackId]     race bots, hold right-ish steering, screenshot HUD + results
//   node tools/e2e.mjs online             two tabs over ?localnet: host, join, race
//   node tools/e2e.mjs codes              prize codes (right, wrong, expired, locked out) and look codes between two players
//   node tools/e2e.mjs announce           the admin's announcement bar: publish, show, dismiss, run out, clear
//   node tools/e2e.mjs halloween          October's look (clock faked): on 1 Oct, off 1 Nov, the challenge week, the limited paint
//   node tools/e2e.mjs whatsnew           the What's new popup after an update, and from How to play
//   node tools/e2e.mjs invite             copy the lobby's invite link and open it as a friend
//   node tools/e2e.mjs rematch            four tabs: race, then vote for a rematch on the results screen
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";

const [flow = "solo", trackId = "monza"] = process.argv.slice(2);
const base = "http://localhost:3000/";
const dir = "temporary screenshots";
await mkdir(dir, { recursive: true });
const browser = await puppeteer.launch({ args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"], protocolTimeout: 60000 });
const errors = [];
async function open(url, w = 1440, h = 900){
	const page = await browser.newPage();
	await page.setViewport({ width: w, height: h });
	page.on("pageerror", e => errors.push("pageerror: " + e.message));
	page.on("console", m => { if(m.type() === "error") errors.push("console: " + m.text()); });
	// NO_WORKLET=1 pretends to be a browser without AudioWorklet (simple engine sounds).
	if(process.env.NO_WORKLET) await page.evaluateOnNewDocument(() => { delete window.AudioWorkletNode; });
	await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
	return page;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const shot = async (page, name) => { await page.screenshot({ path: `${dir}/e2e-${name}.png` }); console.log(`${dir}/e2e-${name}.png`); };

if(flow === "solo"){
	const page = await open(base);
	await page.click("#btnBots");
	await wait(600);
	await page.evaluate(async id => { const { venueOf } = await import("/js/tracks.js"); document.querySelector(`#setupTracks [data-id="${venueOf(id)}"]`).click(); if(venueOf(id) !== id) document.querySelector(`#setupLayout [data-v="${id}"]`).click(); }, trackId);   // (a layout: its venue, then the Layout switch)
	await wait(900);
	await shot(page, "setup");
	// fewer laps so the test is quick
	await page.evaluate(() => { const g = window.__game; g.setup.laps = 1; });
	await page.click("#setupGo");
	await wait(2200);
	await shot(page, "countdown");
	// let a bot drive "me" so the race actually finishes
	await page.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game;
		const me = g.race.me;
		me.bot = new Bot("hard");
		me.local = true;
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt, steer) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	await wait(5000);
	await shot(page, "racing");
	const state = await page.evaluate(async () => ({ screen: window.__game.screen, lap: window.__game.race && window.__game.race.me.data.lap, engines: (await import("/js/audio.js")).engineMode() }));
	console.log("state", JSON.stringify(state));
	// wait for results (1 lap)
	for(let i = 0; i < 120; i++){
		const s = await page.evaluate(() => window.__game.screen);
		if(s === "results") break;
		await wait(1000);
	}
	await wait(800);
	await shot(page, "results");
}

if(flow === "tour"){
	// Time trial on every track, screenshot shortly after the start.
	const page = await open(base, 1280, 720);
	const ids = await page.evaluate(async () => { const m = await import("/js/tracks.js"); return [...m.TRACKS, ...m.LAYOUTS].map(t => t.id); });
	for(const id of (trackId === "all" || trackId === "monza" ? ids : trackId.split(","))){
		await click(page, "#btnTrial"); await wait(400);
		await page.evaluate(async id => { const { venueOf } = await import("/js/tracks.js"); document.querySelector(`#setupTracks [data-id="${venueOf(id)}"]`).click(); if(venueOf(id) !== id) document.querySelector(`#setupLayout [data-v="${id}"]`).click(); }, id);   // (a layout: its venue, then the Layout switch) await wait(700);
		await click(page, "#setupGo");
		await page.evaluate(async () => {
			const { Bot } = await import("/js/bots.js");
			const g = window.__game, me = g.race.me;
			me.bot = new Bot("hard");
			const orig = g.race.update.bind(g.race);
			g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
		});
		await wait(9000);
		await shot(page, "tour-" + id);
		await page.evaluate(() => document.getElementById("pauseBtn").click()); await wait(200);
		await click(page, "#quitBtn"); await wait(500);
	}
}

if(flow === "draft"){
	// Daytona with bots; screenshot the moment you're deep in someone's tow.
	const page = await open(base);
	await click(page, "#btnBots"); await wait(400);
	await click(page, '#setupTracks [data-id="daytona"]'); await wait(700);
	await click(page, "#setupGo");
	await page.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("medium");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	let best = 0;
	for(let i = 0; i < 400; i++){
		const d = await page.evaluate(() => window.__game.race && window.__game.race.me.draft || 0);
		best = Math.max(best, d);
		if(d > 0.55) break;
		await wait(100);
	}
	console.log("peak tow seen:", best.toFixed(2));
	await wait(150);
	await shot(page, "draft");
}

// Make "me" drive itself (Ace bot) in whatever race is running on this page.
const autodrive = page => page.evaluate(async () => {
	const { Bot } = await import("/js/bots.js");
	const g = window.__game, r = g.race, me = r.me;
	if(!me || r._auto) return;
	r._auto = true;
	me.bot = new Bot("hard");
	const orig = r.update.bind(r);
	r.update = (dt) => { r.tracker.update(me); return orig(dt, me.bot.steer(me, r.tracker, r.active, dt)); };
});
const waitScreen = async (page, name, secs = 150) => {
	for(let i = 0; i < secs; i++){
		if(await page.evaluate(() => window.__game.screen) === name) return true;
		await wait(1000);
	}
	return false;
};

if(flow === "tv"){
	// A short race: live TV after you finish, highlights, then the full replay.
	const page = await open(base);
	await click(page, "#btnBots"); await wait(400);
	await click(page, `#setupTracks [data-id="${trackId === "monza" ? "figure8" : trackId}"]`); await wait(500);
	await page.evaluate(() => { const g = window.__game; g.setup.laps = 2; g.setup.bots = 5; });
	await click(page, "#setupGo"); await wait(1500);
	await autodrive(page);
	// wait until you've finished and the TV has taken over
	for(let i = 0; i < 200; i++){
		const live = await page.evaluate(() => !document.getElementById("tv").hidden && document.getElementById("tvTag").textContent);
		if(live === "Live") break;
		await wait(500);
	}
	await wait(2500);
	await shot(page, "tv-live");
	for(let i = 0; i < 200; i++){
		if(await page.evaluate(() => window.__game.screen) === "replay") break;
		await wait(500);
	}
	await wait(4000);
	await shot(page, "tv-highlights");
	console.log("highlight clips:", await page.evaluate(() => { const r = window.__game.replay; return r && r.clips ? r.clips.map(c => c.type + ": " + c.text).join(" | ") : "none"; }));
	console.log("results after highlights:", await waitScreen(page, "results", 120));
	await page.evaluate(() => [...document.querySelectorAll("#resultsActions button")].find(b => b.textContent.includes("Full replay")).click());
	await wait(500);
	await page.evaluate(() => { const s = document.getElementById("tvScrub"); s.value = 550; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change")); });
	await wait(2500);
	await shot(page, "tv-replay");
}

if(flow === "admin"){
	const page = await open(base + "?localnet");
	await wait(600);
	// a player with a rude name and some stats, then sign in as the admin account
	await page.evaluate(async () => {
		const { connect } = await import("/js/net.js");
		const net = await connect();
		await net.store.set("stats/local-rudeguy", { n: "sh1thead", h: 30, races: 4, wins: 1, podiums: 2, titles: 0, last: "x", room: "ABCD" });
		await net.store.set("laps/monza/local-rudeguy", { n: "sh1thead", h: 30, t: 12000, at: Date.now() });
	});
	await click(page, "#acctBtn"); await wait(200);
	await page.evaluate(() => { document.getElementById("bvsId").value = "bvs-11018"; document.getElementById("bvsPw").value = "admin-pass"; });
	await click(page, "#bvsCreate"); await wait(900);
	await page.evaluate(() => document.querySelector("#account [data-close]").click());
	await wait(400);
	console.log("admin button visible:", await page.evaluate(() => !document.getElementById("btnAdmin").hidden));
	await click(page, "#btnAdmin"); await wait(1500);
	await shot(page, "admin-drivers");
	// rename the rude driver
	await page.evaluate(() => {
		const row = [...document.querySelectorAll("#adminBody tr")].find(tr => tr.textContent.includes("local-rudeguy"));
		row.querySelector(".admin-name").value = "Racer X";
		[...row.querySelectorAll("button")].find(b => b.textContent === "Rename").click();
	});
	await wait(1200);
	console.log("renamed:", JSON.stringify(await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); return [await n.store.get("stats/local-rudeguy/n"), await n.store.get("nameLock/local-rudeguy"), await n.store.get("laps/monza/local-rudeguy/n")]; })));
	await page.evaluate(() => document.querySelector('#adminTab [data-v="settings"]').click());
	await wait(1500);
	await page.evaluate(() => [...document.querySelectorAll("#adminBody button")].find(b => b.textContent.includes("Publish")).click());
	await wait(1200);
	console.log("published limits:", JSON.stringify(await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); return await n.store.get("config/minLap"); })));
	await shot(page, "admin-limits");
}

if(flow === "midjoin"){
	// Host races bots; a friend joins with the code while the race is running and watches live.
	const host = await open(base + "?localnet");
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	for(let i = 0; i < 4; i++){ await click(host, "#addBot"); await wait(300); }
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 2, track: "monza" }));
	await wait(500);
	await click(host, "#lobbyGo");
	await wait(1500);
	await autodrive(host);
	await wait(8000);
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "guest", "popup,width=1280,height=760"), base + "?localnet");
	const guest = await popup;
	guest.on("pageerror", e => errors.push("guest pageerror: " + e.message));
	await guest.setViewport({ width: 1280, height: 760 });
	await guest.waitForFunction(() => window.__game, { timeout: 60000 });
	await wait(1200);
	await click(guest, "#btnOnline"); await wait(400);
	await guest.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
	await click(guest, "#joinBtn");
	await wait(6000);
	const g = await guest.evaluate(() => ({ screen: window.__game.screen, spectating: !!window.__game.race && !window.__game.race.me, tv: document.getElementById("tvTag").textContent, sub: document.getElementById("tvSub").textContent, cars: window.__game.race ? window.__game.race.cars.length : 0 }));
	console.log("late joiner:", JSON.stringify(g));
	await shot(guest, "midjoin-live");
	await guest.evaluate(() => document.getElementById("tvShot").click());
	await wait(2500);
	await shot(guest, "midjoin-trackside");
}

if(flow === "quali"){
	const page = await open(base);
	await click(page, "#btnBots"); await wait(400);
	await click(page, '#setupTracks [data-id="figure8"]'); await wait(500);
	await click(page, '#setupQuali [data-v="1"]');
	await page.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 3; });
	await click(page, "#setupGo"); await wait(1500);
	await autodrive(page);
	await wait(6000);
	await shot(page, "quali-running");
	console.log("quali classification shown:", await waitScreen(page, "results", 200));
	await wait(800);
	await shot(page, "quali-results");
	const order = await page.evaluate(() => [...document.querySelectorAll("#resultsBody tr")].map(tr => tr.children[1].textContent.trim() + " " + tr.children[2].textContent.trim()));
	console.log("quali order:", order.join(" | "));
	await page.evaluate(() => document.querySelector("#resultsActions button").click());
	await wait(1500);
	const grid = await page.evaluate(() => window.__game.race.cars.map(c => c.name));
	console.log("race grid:", grid.join(", "), "| mode:", await page.evaluate(() => window.__game.race.mode));
	await autodrive(page);
	console.log("race done:", await waitScreen(page, "results", 200));
	await wait(800);
	await shot(page, "quali-race-results");
}

if(flow === "champ"){
	const page = await open(base);
	await click(page, "#btnBots"); await wait(400);
	await click(page, '#setupMode [data-v="champ"]'); await wait(300);
	await click(page, '#setupTracks [data-id="figure8"]'); await wait(200);   // monza is round 1 already
	await page.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 2; });
	await shot(page, "champ-setup");
	await click(page, "#setupGo"); await wait(1500);
	await autodrive(page);
	console.log("round 1 done:", await waitScreen(page, "results"));
	await wait(1200);
	await shot(page, "champ-round1");
	await page.evaluate(() => document.querySelector("#resultsActions button").click());
	await wait(1500);
	await autodrive(page);
	console.log("round 2 done:", await waitScreen(page, "results"));
	await wait(1200);
	await shot(page, "champ-final");
	console.log("title:", await page.$eval("#resultsTitle", e => e.textContent), "|", await page.$eval("#champRound", e => e.textContent));
}

if(flow === "p2p"){
	// Host + guest over ?localnet signalling. Guest can add &nop2p to force the Firebase fallback.
	const guestUrl = base + "?localnet" + (trackId === "fallback" ? "&nop2p" : "");
	const host = await open(base + "?localnet");
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "guest", "popup,width=1100,height=700"), guestUrl);
	const guest = await popup;
	guest.on("pageerror", e => errors.push("guest pageerror: " + e.message));
	await guest.setViewport({ width: 1100, height: 700 });
	await guest.waitForFunction(() => window.__game, { timeout: 60000 });
	await wait(1500);
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	await click(guest, "#btnOnline"); await wait(400);
	await guest.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
	await click(guest, "#joinBtn");
	await click(host, "#addBot");
	// Wait for the link (or the fallback timeout).
	for(let i = 0; i < 30; i++){
		const st = await host.evaluate(() => { const m = window.__game.net.mesh; return m ? [...m.peers.values()].map(p => p.status).join() : "none"; });
		if(st === "direct" || (trackId === "fallback" && st === "relay")) break;
		await wait(500);
	}
	const status = await Promise.all([host, guest].map(p => p.evaluate(() => { const m = window.__game.net.mesh; return m ? (m.enabled ? [...m.peers.values()].map(p => p.status).join() : "disabled") : "none"; })));
	console.log("link status host/guest:", status.join(" / "));
	await shot(host, "p2p-lobby");
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 1, track: "figure8" }));
	await wait(500);
	await click(host, "#lobbyGo");
	await wait(1500);
	await autodrive(host); await autodrive(guest);
	await wait(6000);
	const snap = await Promise.all([host, guest].map(p => p.evaluate(() => {
		const g = window.__game;
		return { sent: g.net.sent, cars: g.race.cars.map(c => [c.name.slice(0, 6), +c.data.x.toFixed(2), +c.data.y.toFixed(2)]) };
	})));
	console.log("host sent", JSON.stringify(snap[0].sent), "| guest sent", JSON.stringify(snap[1].sent));
	for(let i = 0; i < snap[0].cars.length; i++){
		const a = snap[0].cars[i], b = snap[1].cars[i];
		console.log(`  ${a[0].padEnd(7)} host sees (${a[1]}, ${a[2]})  guest sees (${b[1]}, ${b[2]})  diff ${Math.hypot(a[1] - b[1], a[2] - b[2]).toFixed(2)}`);
	}
	console.log("results:", await waitScreen(host, "results", 160) && await waitScreen(guest, "results", 40));
}

if(flow === "migrate"){
	// Host starts a race with a bot, then closes the tab. The guest should take over.
	const host = await open(base + "?localnet");
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "guest", "popup,width=1100,height=700"), base + "?localnet");
	const guest = await popup;
	guest.on("pageerror", e => errors.push("guest pageerror: " + e.message));
	await guest.setViewport({ width: 1100, height: 700 });
	await guest.waitForFunction(() => window.__game, { timeout: 60000 });
	await wait(1500);
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	await click(guest, "#btnOnline"); await wait(400);
	await guest.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
	await click(guest, "#joinBtn"); await wait(1200);
	await click(host, "#addBot"); await wait(500);
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 1, track: "figure8" }));
	await wait(600);
	await click(host, "#lobbyGo");
	await wait(1500);
	await autodrive(guest);
	await wait(6000);
	await host.close({ runBeforeUnload: true });
	await wait(2500);
	const g = await guest.evaluate(() => {
		const s = window.__game;
		return { host: s.room && s.room.host === s.net.uid, authority: s.race && s.race.authority, botLocal: s.race && s.race.cars.filter(c => c.isBot).map(c => c.local) };
	});
	console.log("after host left:", JSON.stringify(g));
	await shot(guest, "migrate-race");
	console.log("guest got results:", await waitScreen(guest, "results", 120));
	await wait(1000);
	await shot(guest, "migrate-results");
}

if(flow === "account"){
	const a = await open(base + "?localnet");
	await wait(800);
	await click(a, "#acctBtn"); await wait(300);
	await shot(a, "account-modal");
	await a.evaluate(() => { document.getElementById("bvsId").value = "BVS-12345"; document.getElementById("bvsPw").value = "racecar1"; });
	await click(a, "#bvsCreate"); await wait(800);
	console.log("after create:", await a.$eval("#acctErr", e => e.textContent), "|", await a.$eval("#acctText", e => e.textContent));
	await shot(a, "account-created");
	// Wrong format and wrong password messages.
	await click(a, "#acctSignOut"); await a.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
	await wait(800);
	await click(a, "#acctBtn"); await wait(200);
	await a.evaluate(() => { document.getElementById("bvsId").value = "12345"; document.getElementById("bvsPw").value = "racecar1"; });
	await click(a, "#bvsLogin"); await wait(400);
	console.log("bad id:", await a.$eval("#acctErr", e => e.textContent));
	await a.evaluate(() => { document.getElementById("bvsId").value = "bvs-12345"; document.getElementById("bvsPw").value = "nope123"; });
	await click(a, "#bvsLogin"); await wait(400);
	console.log("bad pw:", await a.$eval("#acctErr", e => e.textContent));
	await a.evaluate(() => { document.getElementById("bvsPw").value = "racecar1"; });
	await Promise.all([a.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), click(a, "#bvsLogin")]);
	await wait(800);
	console.log("logged back in:", await a.$eval("#acctText", e => e.textContent));
	await shot(a, "title-weekly");
}

// Ghosts and the live delta: time trial chases the best lap ever, the weekly challenge
// chases this week's best, and a slower lap never replaces the ghost.
if(flow === "ghost"){
	const page = await open(base);
	const botDrive = () => page.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("hard");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	const lapsDone = () => page.evaluate(() => window.__game.race ? window.__game.race.me.lapTimes.length : -1);
	const waitLaps = async n => { for(let i = 0; i < 150 && await lapsDone() < n; i++) await wait(1000); };
	// Pretend there's an all-time best ghost that is hard to beat, then check it stays.
	await page.click("#btnTrial"); await wait(500);
	await page.evaluate(async id => { const { venueOf } = await import("/js/tracks.js"); document.querySelector(`#setupTracks [data-id="${venueOf(id)}"]`).click(); if(venueOf(id) !== id) document.querySelector(`#setupLayout [data-v="${id}"]`).click(); }, trackId);   // (a layout: its venue, then the Layout switch) await wait(800);
	await page.click("#setupGo"); await wait(1500);
	await botDrive();
	await waitLaps(1);
	const first = await page.evaluate(() => { const r = window.__game.race; return { lap: r.me.lapTimes[0], ghost: r.ghostData && r.ghostData.ms, saved: !!localStorage.getItem("org-gp:ghost:" + r.key) }; });
	console.log("after lap 1:", JSON.stringify(first));
	const deltas = [];
	for(let k = 0; k < 6; k++){ await wait(1500); deltas.push(await page.evaluate(() => { const d = window.__game.race.liveDelta(); return d == null ? null : Math.round(d); })); }
	console.log("live delta during lap 2 (ms):", deltas.join(", "));
	await shot(page, "delta");
	// Make the ghost unbeatable: the next lap must not replace it.
	await page.evaluate(() => { const r = window.__game.race; r.ghostData = Object.assign({}, r.ghostData, { ms: 1000 }); });
	await waitLaps(3);
	console.log("ghost after slower laps:", await page.evaluate(() => window.__game.race.ghostData.ms), "(should be 1000)");
	console.log("delta label:", await page.$eval("#deltaLabel", e => e.textContent), "| shown:", await page.evaluate(() => document.body.classList.contains("delta-on")));
	// Weekly challenge: its own ghost slot.
	await page.evaluate(() => document.getElementById("quitBtn").click());
	await wait(800);
	const weeklyBefore = await page.evaluate(() => localStorage.getItem("org-gp:ghost:weekly"));
	await page.evaluate(() => document.getElementById("weeklyGo").click()); await wait(1500);
	await botDrive();
	const startGhost = await page.evaluate(() => window.__game.race.ghostData ? window.__game.race.ghostData.ms : null);
	await waitLaps(1);
	const weekly = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem("org-gp:ghost:weekly") || "null"); return g && { week: g.week, ms: g.ms, samples: g.s.length }; });
	console.log("weekly: ghost at start", startGhost, "(before any weekly lap:", weeklyBefore ? "had one" : "none", ") | saved:", JSON.stringify(weekly));
	console.log("weekly label:", await page.$eval("#deltaLabel", e => e.textContent));
}

// A best time with no ghost behind it (how older versions saved), sectors, and racing
// someone else's ghost from the leaderboard (two tabs on ?localnet).
if(flow === "rival"){
	const drive = p => p.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("hard");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	const laps = p => p.evaluate(() => window.__game.race ? window.__game.race.me.lapTimes.length : -1);
	const waitLaps = async (p, n) => { for(let i = 0; i < 150 && await laps(p) < n; i++) await wait(1000); };
	const a = await open(base + "?localnet");
	await wait(800);
	// Old save: a (very fast) best time but no ghost.
	await a.evaluate(k => { localStorage.setItem("org-gp:best:" + k, "20000"); localStorage.removeItem("org-gp:ghost:" + k); }, trackId);
	await a.click("#btnTrial"); await wait(500);
	await a.click(`#setupTracks [data-id="${trackId}"]`); await wait(800);
	await a.click("#setupGo"); await wait(1500);
	await drive(a);
	await waitLaps(a, 1);
	await wait(500);
	console.log("old best, no ghost -> ghost saved after a slower lap:", await a.evaluate(k => !!localStorage.getItem("org-gp:ghost:" + k), trackId));
	await wait(12000);
	console.log("sectors mid-lap 2:", JSON.stringify(await a.evaluate(() => { const r = window.__game.race, v = r.sectorView(r.me); return { cells: v.cells.map(c => c && [Math.round(c.ms), c.color]), cur: v.cur }; })));
	await shot(a, "sectors");
	await waitLaps(a, 2);
	console.log("sectors saved:", await a.evaluate(k => localStorage.getItem("org-gp:sectors:" + k), trackId));
	// Put a record on the shared board with its ghost (the stored best of 20 s blocked it above).
	await a.evaluate(async k => {
		const net = window.__game.net || await (await import("/js/net.js")).connect();
		const r = window.__game.race, g = r.lastLap;
		await net.submitLap(k, g.ms, { name: "Speedy Sam", hue: 200 });
		await net.uploadLapGhost(k, g, { name: "Speedy Sam", hue: 200, body: "formula" });
	}, trackId);
	// Second driver races that ghost from the leaderboard.
	const b = await open(base + "?localnet");
	await wait(1000);
	await b.click("#btnBoards"); await wait(600);
	await b.evaluate(() => document.querySelector('button[data-v="tracks"]').click());
	await wait(600);
	await b.evaluate(id => { const t = document.querySelector(`#boardTrackGrid [data-id="${id}"]`); if(t) t.click(); }, trackId);
	await wait(1500);
	const btn = await b.$("#lapBody .ghost-btn");
	console.log("race-ghost button on the board:", !!btn);
	if(btn){
		await btn.click(); await wait(2500);
		console.log("racing:", JSON.stringify(await b.evaluate(() => { const r = window.__game.race; return r && { rival: r.rival && r.rival.name, body: r.rival && r.rival.body, samples: r.rival && r.rival.s.length }; })));
		await drive(b);
		await wait(9000);
		console.log("delta label:", await b.$eval("#deltaLabel", e => e.textContent), "| delta:", await b.evaluate(() => Math.round(window.__game.race.liveDelta())));
		await shot(b, "rival");
	}
}

// BVS number and Hwb email on the same account, linked from either side.
if(flow === "link"){
	const a = await open(base + "?localnet");
	await wait(800);
	const fill = (sel, v) => a.evaluate((s, x) => { document.querySelector(s).value = x; }, sel, v);
	const msg = () => a.$eval("#acctErr", e => e.textContent);
	const who = () => a.$eval("#acctText", e => e.textContent);
	const relog = async (sel) => { await Promise.all([a.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), click(a, sel)]); await wait(900); };
	const signOut = async () => { await click(a, "#acctBtn"); await wait(300); await relog("#acctSignOut"); await click(a, "#acctBtn"); await wait(300); };

	// 1) BVS account adds an Hwb email.
	await click(a, "#acctBtn"); await wait(300);
	await fill("#bvsId", "bvs-22222"); await fill("#bvsPw", "racecar1");
	await click(a, "#bvsCreate"); await wait(900);
	console.log("link box shown for BVS:", await a.$eval("#linkBox", e => !e.hidden), "|", await a.$eval("#linkTitle", e => e.textContent));
	await shot(a, "link-form");
	await fill("#linkId", "kid@hwbcymru.net"); await fill("#linkPw", "wrongpw");
	await click(a, "#linkGo"); await wait(1200);
	console.log("wrong password:", await msg());
	await fill("#linkPw", "racecar1");
	await click(a, "#linkGo"); await wait(2500);
	console.log("linked:", await msg(), "|", await a.$eval("#linkedLabel", e => e.textContent));
	await shot(a, "link-done");
	await signOut();
	await fill("#bvsId", "bvs-22222"); await fill("#bvsPw", "nope123");
	await click(a, "#bvsLogin"); await wait(1500);
	console.log("BVS wrong pw:", await msg());
	await fill("#bvsPw", "racecar1");
	await relog("#bvsLogin");
	console.log("BVS login after link:", await who());
	await signOut();
	await fill("#hwbEmail", "kid@hwbcymru.net"); await fill("#hwbPw", "racecar1");
	await relog("#hwbLogin");
	console.log("Hwb login after link:", await who());
	await signOut();

	// 2) Hwb account adds a BVS number (and can't take one that's in use).
	await fill("#hwbEmail", "other@hwbmail.net"); await fill("#hwbPw", "pitstop9");
	await click(a, "#hwbCreate"); await wait(900);
	console.log("link box shown for Hwb:", await a.$eval("#linkTitle", e => e.textContent));
	await fill("#linkId", "bvs-22222"); await fill("#linkPw", "pitstop9");
	await click(a, "#linkGo"); await wait(1500);
	console.log("taken number:", await msg());
	await fill("#linkId", "BVS-33333");
	await click(a, "#linkGo"); await wait(1500);
	console.log("linked:", await msg());
	await signOut();
	await fill("#bvsId", "bvs-33333"); await fill("#bvsPw", "pitstop9");
	await relog("#bvsLogin");
	console.log("BVS login to Hwb account:", await who());
	await click(a, "#acctBtn"); await wait(800);
	await shot(a, "link-card");
	// 3) A new BVS account can't take a linked number.
	await signOut();
	await fill("#bvsId", "bvs-33333"); await fill("#bvsPw", "whatever1");
	await click(a, "#bvsCreate"); await wait(800);
	console.log("create on linked number:", await msg());
}

if(flow === "editor"){
	const page = await open(base + "editor/", 1440, 860);
	const { CLASSIC_CODE } = await import("../js/tracks.js");
	await click(page, "#importBtn"); await wait(200);
	await page.evaluate(c => { document.getElementById("codeText").value = c; }, CLASSIC_CODE);
	await click(page, "#codeOk"); await wait(300);
	await page.evaluate(() => { const i = document.getElementById("trackName"); i.value = "Classic copy"; i.dispatchEvent(new Event("input")); });
	await wait(300);
	await shot(page, "editor");
	await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), click(page, "#raceBtn")]);
	await wait(1200);
	console.log("after save:", await page.evaluate(() => [location.href, window.__game.screen, window.__game.setup.trackId]));
	await shot(page, "editor-setup");
}

if(flow === "online"){
	const host = await open(base + "?localnet");
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "guest", "popup,width=1100,height=700"), base + "?localnet");
	const guest = await popup;
	guest.on("pageerror", e => errors.push("guest pageerror: " + e.message));
	await guest.setViewport({ width: 1100, height: 700 });
	await guest.waitForFunction(() => window.__game, { timeout: 60000 });
	await wait(1500);
	// Each player customises their car first: everyone else must see it in the race.
	// (Things any new player has: a number, and the free livery.)
	await host.evaluate(() => { window.__game.profile.look = { livery: "factory", number: 7, glow: "none", smoke: "white", title: "rookie" }; });
	await guest.evaluate(() => { window.__game.profile.look = { livery: "factory", number: 42, glow: "none", smoke: "white", title: "rookie" }; });
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	console.log("room", code);
	await click(guest, "#btnOnline"); await wait(400);
	await guest.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
	await click(guest, "#joinBtn"); await wait(1200);
	await click(host, "#addBot"); await wait(500);
	await click(host, "#addBot"); await wait(500);
	await click(guest, "#lobbyGo"); await wait(600);
	await shot(host, "lobby-host");
	await shot(guest, "lobby-guest");
	await host.evaluate(() => { window.__game.room && window.__game.net.updateSettings({ laps: 1, track: "figure8" }); });
	await wait(800);
	await click(host, "#lobbyGo");
	await wait(1200);
	// Let an Ace bot steer each human car so both actually finish.
	for(const p of [host, guest]) await p.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("hard");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	await wait(5300);
	await shot(host, "online-host-race");
	await shot(guest, "online-guest-race");
	const info = await Promise.all([host, guest].map(p => p.evaluate(() => {
		const g = window.__game, r = g.race;
		return r ? { cars: r.cars.map(c => [c.name, c.local, +c.data.x.toFixed(1), +c.data.y.toFixed(1)]), phase: r.phase } : null;
	})));
	console.log(JSON.stringify(info));
	const looks = await Promise.all([host, guest].map(p => p.evaluate(() => {
		const r = window.__game.race;
		return r ? r.cars.filter(c => !c.isBot && !c.local).map(c => c.look && c.look.livery + " #" + c.look.number) : null;
	})));
	console.log("other player's car: host sees", JSON.stringify(looks[0]), "| guest sees", JSON.stringify(looks[1]));
	for(let i = 0; i < 150; i++){
		const s = await host.evaluate(() => window.__game.screen);
		if(s === "results") break;
		await wait(1000);
	}
	await wait(1500);
	await shot(host, "online-host-results");
	await shot(guest, "online-guest-results");
	console.log("stats:", JSON.stringify(await host.evaluate(async () => {
		const n = window.__game.net;
		return { host: await n.store.get("stats/" + n.uid), all: await n.topDrivers("wins", 5) };
	})));
	// Leaderboards screen from the title.
	await host.evaluate(() => [...document.querySelectorAll("#resultsActions button")].pop().click());
	await wait(800);
	await host.evaluate(() => document.querySelector('#screen-online [data-back]').click());
	await wait(500);
	await click(host, "#btnBoards");
	await wait(1500);
	await shot(host, "boards-drivers");
	await host.evaluate(() => document.querySelector('#boardTab [data-v="tracks"]').click());
	await wait(1200);
	await shot(host, "boards-laps");
}

if(flow === "bigtv"){
	// A classroom projector: a big screen joins a room, shows the waiting board, then the race as a broadcast, then the results.
	// It must never take a place on the grid.
	const host = await open(base + "?localnet");
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	for(let i = 0; i < 4; i++){ await click(host, "#addBot"); await wait(300); }
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 1, track: "figure8" }));
	await wait(500);
	const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
	await host.evaluate(u => window.open(u, "tvscreen", "popup,width=1600,height=900"), base + "?localnet&tv=" + code);
	const tv = await popup;
	tv.on("pageerror", e => errors.push("tv pageerror: " + e.message));
	tv.on("console", m => { if(m.type() === "error") errors.push("tv console: " + m.text()); });
	await tv.setViewport({ width: 1600, height: 900 });
	try{ await tv.waitForFunction(() => window.__game && window.__game.screen === "bigtv", { timeout: 30000 }); }
	catch(e){ console.log("the big screen never reached its waiting board:", JSON.stringify(await tv.evaluate(() => ({ url: location.href, screen: window.__game && window.__game.screen, msg: document.getElementById("onlineMsg").textContent }))), errors); throw e; }
	await wait(2500);
	const board = await tv.evaluate(() => ({ code: document.getElementById("tvRoomCode").textContent, track: document.getElementById("tvNextTrack").textContent, drivers: document.querySelectorAll("#tvRoster li").length, big: document.body.classList.contains("bigtv"), status: document.getElementById("tvStatus").textContent.trim() }));
	console.log("waiting board:", JSON.stringify(board));
	console.log("  shows the room's code:", board.code === code, "| the five drivers, not the screen:", board.drivers === 5, "| big-screen styling:", board.big);
	await shot(tv, "bigtv-board");
	const lobbyText = await host.$eval("#lobbyStatus", e => e.textContent);
	console.log("host's lobby counts the screen apart:", /big screen connected/.test(lobbyText), "(" + lobbyText + ")");
	await click(host, "#lobbyGo");
	await wait(1500);
	await autodrive(host);
	await wait(9000);
	const live = await tv.evaluate(() => ({ screen: window.__game.screen, watching: !window.__game.race.me, cars: window.__game.race.cars.length, tag: document.getElementById("tvTag").textContent, sub: document.getElementById("tvSub").textContent, big: document.body.classList.contains("bigtv"), tower: document.querySelectorAll("#tower .tower-row").length }));
	console.log("race on the big screen:", JSON.stringify(live));
	console.log("  watching with no car of its own:", live.watching, "| five cars on the grid:", live.cars === 5, "| live TV, no 'you'll race next time':", live.tag === "Live" && live.sub === "");
	await shot(tv, "bigtv-race");
	console.log("host's own race has the same five cars:", await host.evaluate(() => window.__game.race.cars.length) === 5);
	console.log("host gets results:", await waitScreen(host, "results", 150), "| big screen gets results:", await waitScreen(tv, "results", 60));
	await wait(1200);
	await shot(tv, "bigtv-results");
}

if(flow === "rematch"){
	// Four drivers race, then ask for a rematch on the results screen. More than half (the host counts as yes) starts it.
	const host = await open(base + "?localnet");
	const guests = [];
	for(let i = 0; i < 3; i++){
		const popup = new Promise(r => browser.once("targetcreated", t => r(t.page())));
		await host.evaluate((u, i) => window.open(u, "guest" + i, "popup,width=900,height=600"), base + "?localnet", i);
		const g = await popup;
		g.on("pageerror", e => errors.push("guest pageerror: " + e.message));
		await g.setViewport({ width: 900, height: 600 });
		await g.waitForFunction(() => window.__game, { timeout: 60000 });
		guests.push(g);
	}
	await wait(1200);
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	for(const g of guests){
		await click(g, "#btnOnline"); await wait(400);
		await g.evaluate(c => { const i = document.getElementById("codeInput"); i.value = c; i.dispatchEvent(new Event("input")); }, code);
		await click(g, "#joinBtn"); await wait(1000);
	}
	await host.evaluate(() => window.__game.net.updateSettings({ laps: 1, track: "figure8" }));
	await wait(700);
	await click(host, "#lobbyGo");
	await wait(1500);
	const all = [host, ...guests];
	for(const p of all) await autodrive(p);
	console.log("everyone reaches the results:", (await Promise.all(all.map(p => waitScreen(p, "results", 150)))).every(Boolean));
	await wait(1500);
	const view = p => p.evaluate(() => {
		const box = document.getElementById("rematchBox"), b = [...document.querySelectorAll("#resultsActions button")].map(x => x.textContent.trim());
		return { shown: !box.hidden, text: document.getElementById("rematchText").textContent, lit: box.querySelectorAll("i.on").length, dots: box.querySelectorAll("i").length, buttons: b, race: window.__game.room && window.__game.room.race && window.__game.room.race.id, screen: window.__game.screen };
	});
	const tap = p => p.evaluate(() => [...document.querySelectorAll("#resultsActions button")].find(b => /^(Rematch|Voted)/.test(b.textContent.trim())).click());
	let v = await Promise.all(all.map(view));
	console.log("box on every screen, one light lit (the host):", v.every(x => x.shown && x.dots === 4 && x.lit === 1), "|", v[1].text);
	console.log("guests have a Rematch button, the host has Race again:", v.slice(1).every(x => x.buttons[0] === "Rematch") && v[0].buttons.includes("Race again") && !v[0].buttons.includes("Rematch"));
	// ("Next unlock": the cheapest garage item still locked, with how far along you are.)
	const nu = await guests[0].evaluate(() => ({ shown: !document.getElementById("nextUnlock").hidden, name: document.getElementById("nuName").textContent, need: document.getElementById("nuNeed").textContent, bar: document.getElementById("nuBar").style.transform }));
	console.log("results show a next unlock:", nu.shown && !!nu.name && !!nu.need, "|", nu.name, "|", nu.need, "|", nu.bar);
	await guests[0].evaluate(() => document.getElementById("nextUnlock").scrollIntoView({ block: "end" }));
	await shot(guests[0], "rematch-before");
	await tap(guests[0]); await wait(900);
	await guests[1].evaluate(() => document.getElementById("rematchBox").scrollIntoView({ block: "end" }));
	await shot(guests[1], "rematch-one-vote");
	v = await Promise.all(all.map(view));
	console.log("one guest taps: two lights, still waiting (3 needed):", v.every(x => x.lit === 2 && x.screen === "results"), "|", v[0].text, "| their button:", v[1].buttons[0]);
	await tap(guests[0]); await wait(900);
	v = await Promise.all(all.map(view));
	console.log("tapping again takes the vote back:", v.every(x => x.lit === 1), "|", v[0].text, "| their button:", v[1].buttons[0]);
	await tap(guests[0]); await tap(guests[1]); await wait(400);
	await guests[2].evaluate(() => document.getElementById("rematchBox").scrollIntoView({ block: "end" }));
	await shot(guests[2], "rematch-go");
	await wait(1500);
	const rs = await Promise.all(all.map(p => p.evaluate(() => ({ screen: window.__game.screen, id: window.__game.room.race.id, phase: window.__game.room.phase }))));
	console.log("a majority starts the rematch for everyone (race 2):", rs.every(x => x.id === 2 && x.phase === "race"), JSON.stringify(rs.map(x => x.screen)));
}

if(flow === "invite"){
	// "Copy invite link" in the lobby, and a friend opening that link: Online opens with the code filled in and Join ready.
	await browser.defaultBrowserContext().overridePermissions("http://localhost:3000", ["clipboard-read", "clipboard-write"]);
	const host = await open(base + "?localnet");
	await click(host, "#btnOnline"); await wait(400);
	await click(host, "#hostBtn"); await wait(1200);
	const code = await host.$eval("#roomCode", e => e.textContent);
	await host.bringToFront();
	await click(host, "#copyInvite"); await wait(400);
	let link = await host.evaluate(() => navigator.clipboard.readText().catch(() => ""));
	const copied = await host.$eval("#copyInvite", e => e.textContent);
	if(!link){ link = await host.$eval("#lobbyStatus", e => (e.textContent.match(/https?:\S+/) || [""])[0]); console.log("(the clipboard was blocked here, so the link came from the fallback message)"); }
	console.log("link:", link, "| button says:", copied);
	console.log("  the link carries the room and keeps ?localnet:", link === base + "?localnet&room=" + code || link === base + "?room=" + code + "&localnet" || link === base + "?localnet=&room=" + code);
	// A friend opens it.
	const friend = await open(link);
	await wait(1200);
	const f = await friend.evaluate(() => ({ screen: window.__game.screen, code: document.getElementById("codeInput").value, note: document.getElementById("inviteNote").textContent, noteShown: !document.getElementById("inviteNote").hidden, joinIsPrimary: !document.getElementById("joinBtn").classList.contains("ghost"), focused: document.activeElement && document.activeElement.id, url: location.search }));
	console.log("friend lands on Online with the code in:", f.screen === "online" && f.code === code, "|", f.note);
	console.log("  Join is highlighted and focused:", f.joinIsPrimary && f.focused === "joinBtn", "| the address bar is tidied (no ?room):", !/room=/.test(f.url), JSON.stringify(f.url));
	await shot(friend, "invite-landing");
	await click(friend, "#joinBtn"); await wait(1500);
	const inLobby = await friend.evaluate(() => ({ screen: window.__game.screen, drivers: document.querySelectorAll("#playerList .player").length }));
	console.log("one press joins the room:", inLobby.screen === "lobby" && inLobby.drivers === 2, JSON.stringify(inLobby));
	// Going back to Online by hand has no leftover invite.
	await friend.evaluate(() => document.getElementById("leaveRoom").click()); await wait(800);
	console.log("after leaving, no invite note and Join is plain again:", await friend.evaluate(() => document.getElementById("inviteNote").hidden && document.getElementById("joinBtn").classList.contains("ghost")));
	// Not a room code, or a closed room.
	const bad = await open(base + "?localnet&room=abc");
	console.log("a bad code is ignored (stays on the title):", await bad.evaluate(() => window.__game.screen) === "title");
	const gone = await open(base + "?localnet&room=ZZZZ"); await wait(1000);
	await click(gone, "#joinBtn"); await wait(1200);
	console.log("a room that isn't there says so:", await gone.$eval("#onlineMsg", e => e.textContent));
}

if(flow === "whatsnew"){
	// "What's new": once after an update (not for a first visit, not for an invite link), and again from How to play.
	const { VERSION } = await import("../js/config.js");
	const seenOf = p => p.evaluate(() => JSON.parse(localStorage.getItem("org-gp:seenVersion")));
	const shown = p => p.evaluate(() => !document.getElementById("whatsnew").hidden);
	const first = await open(base);
	await wait(1500);
	console.log("a first visit shows nothing and notes the version:", !(await shown(first)) && await seenOf(first) === VERSION);
	// Someone who last played an older version.
	await first.evaluate(() => localStorage.setItem("org-gp:seenVersion", JSON.stringify("2026.10.01-4")));
	await first.reload({ waitUntil: "networkidle0" }); await wait(1500);
	const w = await first.evaluate(() => ({ open: !document.getElementById("whatsnew").hidden, heads: [...document.querySelectorAll("#wnBody h3")].map(x => x.textContent), items: document.querySelectorAll("#wnBody li").length }));
	console.log("an update shows What's new with the entries:", w.open && w.items >= 4, JSON.stringify(w.heads));
	await shot(first, "whatsnew");
	await first.evaluate(() => document.querySelector("#whatsnew [data-close]").click());
	console.log("Got it closes it and notes the version:", !(await shown(first)) && await seenOf(first) === VERSION);
	await first.reload({ waitUntil: "networkidle0" }); await wait(1500);
	console.log("it doesn't come back on the next visit:", !(await shown(first)));
	// How to play opens the latest entries again.
	await first.evaluate(() => document.querySelector('[data-open="help"]').click()); await wait(300);
	await first.evaluate(() => document.querySelector('#help [data-open="whatsnew"]').click()); await wait(300);
	console.log("How to play > What's new opens it by hand:", await shown(first) && await first.evaluate(() => document.querySelectorAll("#wnBody li").length > 0));
	// An invite link isn't interrupted, and the version isn't marked as seen.
	await first.evaluate(() => localStorage.setItem("org-gp:seenVersion", JSON.stringify("2026.10.01-4")));
	const inv = await open(base + "?localnet&room=ABCD"); await wait(1500);
	console.log("an invite link isn't interrupted, and it will show next time:", !(await shown(inv)) && await seenOf(inv) === "2026.10.01-4");
}

if(flow === "halloween"){
	// October's look comes on at the start of 1 October and goes off at the start of 1 November (by the clock), with the
	// Halloween challenge in the week with 31 October in it, and the limited paint earned by playing. The clock is faked.
	const fake = (page, iso) => page.evaluateOnNewDocument(iso => {
		const Real = Date, offset = new Real(iso).getTime() - Real.now();
		class Fake extends Real { constructor(...a){ if(a.length === 0) super(Real.now() + offset); else super(...a); } static now(){ return Real.now() + offset; } }
		window.Date = Fake;
	}, iso);
	const at = async iso => {
		const page = await browser.newPage();
		await page.setViewport({ width: 1440, height: 900 });
		page.on("pageerror", e => errors.push("pageerror: " + e.message));
		page.on("console", m => { if(m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
		await fake(page, iso);
		await page.goto(base, { waitUntil: "networkidle0", timeout: 60000 });
		await wait(3500);
		return page;
	};
	const look = p => p.evaluate(async () => { const a = await import("/js/audio.js"), g = window.__game; return { on: document.body.classList.contains("halloween"), edition: document.querySelector(".edition").textContent, tag: document.getElementById("weeklyTag").hidden ? "" : document.getElementById("weeklyTag").textContent, pumpkins: g.world.info.trackside.pumpkins, song: a._test.song(), fog: g.world.defaultAtmosphere().fog }; });
	const early = await at("2026-10-01T00:00:30"), l1 = await look(early);
	console.log("1 October, just after midnight, it's on:", l1.on && l1.edition === "Halloween edition" && l1.pumpkins > 0 && l1.song === "spooky" && l1.fog > 0, JSON.stringify(l1));
	const eve = await at("2026-09-30T23:59:30"), l2 = await look(eve);
	console.log("30 September, a minute before, it's off:", !l2.on && l2.edition === "Grand Prix edition" && l2.pumpkins === 0 && l2.song === "menu" && l2.fog === 0, JSON.stringify(l2));
	const late = await at("2026-10-31T23:59:30"), l3 = await look(late);
	console.log("31 October, a minute before midnight, still on:", l3.on, "| Halloween week card:", l3.tag);
	const nov = await at("2026-11-01T00:00:30"), l4 = await look(nov);
	console.log("1 November, just after midnight, it's off:", !l4.on && l4.pumpkins === 0 && l4.song === "menu", "| the challenge week runs on to Monday:", l4.tag, JSON.stringify(l4));
	const mid = await at("2026-10-28T12:00:00"), l5 = await look(mid);
	console.log("28 October: the weekly card says Halloween week, night and fog:", /Halloween week · Night · Fog/.test(l5.tag), "| the card is Spa:", await mid.$eval("#weeklyTitle", e => e.textContent));
	await shot(mid, "halloween-title");
	// The Settings switch turns the look off, and on again, without a reload.
	await mid.evaluate(() => document.querySelector('[data-open="settings"]').click()); await wait(300);
	await mid.evaluate(() => document.querySelector('#setSeason [data-v="0"]').click()); await wait(4500);
	const off = await look(mid);
	console.log("Settings > Seasonal look: Off removes it:", !off.on && off.edition === "Grand Prix edition" && off.pumpkins === 0 && off.song === "menu", JSON.stringify(off));
	await mid.evaluate(() => document.querySelector('#setSeason [data-v="1"]').click()); await wait(4500);
	const back = await look(mid);
	console.log("and On brings it back:", back.on && back.pumpkins > 0 && back.song === "spooky", JSON.stringify(back));
	await mid.evaluate(() => document.querySelector('#settings [data-close]').click());
	// The paint is on offer in October, hidden outside it, and kept once earned.
	const paintShown = p => p.evaluate(async () => { document.querySelector("#btnGarage").click(); await new Promise(r => setTimeout(r, 900)); const g = document.getElementById("garageItems"); const names = [...g.querySelectorAll(".gname")].map(x => x.textContent); const r = { shown: names.includes("Jack-o'-Lantern"), count: document.getElementById("garageCount").textContent }; document.querySelector("#screen-garage [data-back]").click(); return r; });
	console.log("the paint is on offer in October:", (await paintShown(mid)).shown);
	const spring = await at("2026-04-15T12:00:00");
	console.log("hidden in April, and not counted:", !(await paintShown(spring)).shown);
	await spring.evaluate(() => localStorage.setItem("org-gp:solo", JSON.stringify({ halloween: true })));
	await spring.reload({ waitUntil: "networkidle0" }); await wait(2500);
	console.log("but kept once earned, even in April:", (await paintShown(spring)).shown);
	// Earning it, route 1: a lap of the Halloween challenge (night and fog on Spa).
	const flags = p => p.evaluate(() => JSON.parse(localStorage.getItem("org-gp:solo") || "{}"));
	const run = await at("2026-10-28T12:00:00");
	await run.evaluate(() => { localStorage.removeItem("org-gp:solo"); });
	await run.evaluate(() => document.querySelector("#weeklyGo").click()); await wait(5000);
	const cond = await run.evaluate(() => { const g = window.__game; return { track: g.race.track.def.id, mode: g.race.mode, night: g.world.look.night, fog: g.world.look.fog, weekly: g.ctx.weekly }; });
	console.log("the challenge runs on Spa at night in fog:", cond.track === "spa" && cond.mode === "trial" && cond.night > 0.9 && cond.fog > 0.5 && cond.weekly === "2026-W44", JSON.stringify(cond));
	await autodrive(run);
	for(let i = 0; i < 150; i++){ if((await flags(run)).halloween) break; await wait(1000); }
	console.log("finishing the lap earns the limited paint:", !!(await flags(run)).halloween);
	// Route 2: a bot race at night in fog in October.
	const race = await at("2026-10-12T12:00:00");
	await race.click("#btnBots"); await wait(500);
	await race.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 2; g.setup.tod = "night"; g.setup.weather = "fog"; });
	await click(race, "#setupGo"); await wait(2500);
	await autodrive(race);
	console.log("the race finishes:", await waitScreen(race, "results", 200));
	await wait(1500);
	console.log("finishing a bot race at night in fog earns it too:", !!(await flags(race)).halloween);
	// And the same race in daylight doesn't.
	const day = await at("2026-10-12T12:00:00");
	await day.evaluate(() => { localStorage.removeItem("org-gp:solo"); });
	await day.click("#btnBots"); await wait(500);
	await day.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 2; g.setup.tod = "day"; g.setup.weather = "clear"; });
	await click(day, "#setupGo"); await wait(2500);
	await autodrive(day);
	await waitScreen(day, "results", 200); await wait(1500);
	console.log("a race in daylight does not:", !(await flags(day)).halloween);
}

if(flow === "codes"){
	// Prize codes (type one in, an item unlocks for good) and look codes (send your look to a friend).
	const addCodes = page => page.evaluate(async () => {
		const m = await import("/js/codes.js");
		m.CODES.push({ h: await m.hashCode("TIGER-4821"), grants: ["livery:gold", "title:champion"], label: "test" },
			{ h: await m.hashCode("OLD-ONE-1"), grants: ["livery:lava"], until: "2020-01-01" });
	});
	const modal = page => page.evaluate(() => ({ open: !document.getElementById("prize").hidden, msg: document.getElementById("prizeMsg").hidden ? "" : document.getElementById("prizeMsg").textContent, cls: document.getElementById("prizeMsg").className }));
	const redeem = async (page, text) => { await page.evaluate(t => { const i = document.getElementById("prizeInput"); i.value = t; }, text); await click(page, "#prizeGo"); await wait(500); return modal(page); };
	const page = await open(base + "?localnet");
	await addCodes(page);
	await click(page, '#screen-title [data-open="prize"]'); await wait(300);
	console.log("'Have a prize code?' on the title opens the box:", (await modal(page)).open);
	let r = await redeem(page, "NOT-A-CODE");
	console.log("a wrong code is turned down kindly:", /isn't a code we know/.test(r.msg) && /err/.test(r.cls), "|", r.msg);
	r = await redeem(page, "OLD-ONE-1");
	console.log("an expired code says so:", /run out/.test(r.msg), "|", r.msg);
	for(let i = 0; i < 4; i++) r = await redeem(page, "WRONG-" + i);
	console.log("five wrong tries in a row make you wait:", /wait 30 seconds/.test(r.msg), "|", r.msg);
	r = await redeem(page, "TIGER-4821");
	console.log("even the right code waits while you're locked out:", /Wait a few seconds/.test(r.msg), "|", r.msg);
	await page.evaluate(() => { /* (the lock is held in the page, so reload to clear it) */ });
	await page.reload({ waitUntil: "networkidle0" }); await wait(1500); await addCodes(page);
	await click(page, '#screen-title [data-open="prize"]'); await wait(300);
	r = await redeem(page, " tiger 4821 ");
	console.log("the right code, typed sloppily, unlocks both items:", /Unlocked: Gold Rush paint, Champion title/.test(r.msg) && /ok/.test(r.cls), "|", r.msg);
	await page.evaluate(() => document.querySelector("#prize [data-close]").click());
	const flags = await page.evaluate(() => JSON.parse(localStorage.getItem("org-gp:solo") || "{}"));
	console.log("kept as flags on the device (and synced with an account):", flags["prize:livery:gold"] === true && flags["prize:title:champion"] === true, JSON.stringify(flags));
	await page.reload({ waitUntil: "networkidle0" }); await wait(1500); await addCodes(page);
	await click(page, '#screen-title [data-open="prize"]'); await wait(300);
	r = await redeem(page, "TIGER-4821");
	console.log("after a reload it's still yours, and the code says you have it:", /already have/.test(r.msg), "|", r.msg);
	await page.evaluate(() => document.querySelector("#prize [data-close]").click());
	// The garage shows it, and the look code carries it.
	await click(page, "#btnGarage"); await wait(1200);
	const garage = await page.evaluate(async () => {
		const names = () => [...document.querySelectorAll("#garageItems .gitem:not(.locked) .gname")].map(x => x.textContent);
		const unlockedPaints = names();
		[...document.querySelectorAll("#garageItems .gitem")].find(b => b.querySelector(".gname").textContent === "Gold Rush").click();
		await new Promise(r => setTimeout(r, 400));
		document.getElementById("lookCopy").click();
		await new Promise(r => setTimeout(r, 500));
		return { unlockedPaints, equipped: window.__game.profile.look.livery, msg: document.getElementById("shareMsg").textContent };
	});
	console.log("the garage has Gold Rush open and it can be worn:", garage.unlockedPaints.includes("Gold Rush") && garage.equipped === "gold");
	const code = (garage.msg.match(/GPL1\S+/) || [""])[0].replace(/\.$/, "");
	console.log("Copy look code gives a code:", code, "| matches the look:", code === "GPL1.gold.-.none.white.warm.rookie.classic" || code.startsWith("GPL1.gold."));
	await shot(page, "garage-share");
	// A friend with an empty garage (a fresh browser profile) uses it.
	const ctx = await browser.createBrowserContext();
	const friend = await ctx.newPage();
	friend.on("pageerror", e => errors.push("friend pageerror: " + e.message));
	await friend.setViewport({ width: 1440, height: 900 });
	await friend.goto(base + "?localnet", { waitUntil: "networkidle0" }); await wait(1500);
	await click(friend, "#btnGarage"); await wait(1200);
	await click(friend, "#lookUse"); await wait(200);
	await friend.evaluate(c => { document.getElementById("lookInput").value = c; }, code);
	await click(friend, "#lookApply"); await wait(500);
	const f1 = await friend.evaluate(() => ({ livery: window.__game.profile.look.livery, msg: document.getElementById("shareMsg").textContent }));
	console.log("a friend with Gold Rush locked: their paint stays, and it says what it takes:", f1.livery === "factory" && /Gold Rush paint \(Win 25 online races\)/.test(f1.msg), "|", f1.msg);
	await friend.evaluate(() => { document.getElementById("lookInput").value = "hello there"; });
	await click(friend, "#lookApply"); await wait(300);
	console.log("something that isn't a look code is refused:", /isn't a look code/.test(await friend.$eval("#shareMsg", e => e.textContent)));
	await friend.evaluate(() => localStorage.setItem("org-gp:solo", JSON.stringify({ "prize:livery:gold": true })));
	await friend.reload({ waitUntil: "networkidle0" }); await wait(1500);
	await click(friend, "#btnGarage"); await wait(1200);
	await click(friend, "#lookUse"); await wait(200);
	await friend.evaluate(c => { document.getElementById("lookInput").value = c; }, code);
	await click(friend, "#lookApply"); await wait(500);
	const f2 = await friend.evaluate(() => ({ livery: window.__game.profile.look.livery, msg: document.getElementById("shareMsg").textContent }));
	console.log("once they have it, the same code applies it:", f2.livery === "gold" && /Look applied/.test(f2.msg), "|", f2.msg);
	await ctx.close();
}

if(flow === "announce"){
	// The admin's announcement bar: published from Admin > Announcement, shown on the title screen, dismissable, and it runs out.
	const page = await open(base + "?localnet");
	await wait(600);
	await click(page, "#acctBtn"); await wait(200);
	await page.evaluate(() => { document.getElementById("bvsId").value = "bvs-11018"; document.getElementById("bvsPw").value = "admin-pass"; });
	await click(page, "#bvsCreate"); await wait(900);
	await page.evaluate(() => document.querySelector("#account [data-close]").click());
	await wait(400);
	const bar = p => p.evaluate(() => ({ shown: !document.getElementById("announce").hidden, text: document.getElementById("announceText").textContent }));
	console.log("nothing is showing to begin with:", !(await bar(page)).shown);
	await click(page, "#btnAdmin"); await wait(1200);
	await page.evaluate(() => document.querySelector('#adminTab [data-v="news"]').click()); await wait(800);
	console.log("Admin has an Announcement section saying nothing is showing:", await page.evaluate(() => /Nothing is showing/.test(document.getElementById("adminBody").textContent)));
	await page.evaluate(() => { document.getElementById("newsText").value = "Tournament at lunch in room 12 <b>bring a friend</b>"; document.getElementById("newsFor").value = "24"; });
	await page.evaluate(() => [...document.querySelectorAll("#adminBody button")].find(b => b.textContent === "Publish").click()); await wait(1000);
	const stored = await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); return await n.store.get("config/announcement"); });
	console.log("Publish stores it with an end time a day away:", stored && /Tournament at lunch/.test(stored.text) && Math.abs(stored.until - stored.at - 86400000) < 1000);
	await shot(page, "admin-announce");
	await page.evaluate(() => document.querySelector("#screen-admin [data-back]").click()); await wait(1500);
	let b = await bar(page);
	console.log("back on the title screen it shows (as plain text):", b.shown && b.text === "Tournament at lunch in room 12 <b>bring a friend</b>", JSON.stringify(b.text));
	await shot(page, "announce-bar");
	// A different player sees it too, and can dismiss it for good.
	const guest = await open(base + "?localnet"); await wait(1800);
	console.log("another player sees it:", (await bar(guest)).shown);
	await click(guest, "#announceClose"); await wait(300);
	console.log("Dismiss hides it:", !(await bar(guest)).shown);
	await guest.reload({ waitUntil: "networkidle0" }); await wait(1800);
	console.log("and it stays hidden after a reload:", !(await bar(guest)).shown, "| the admin tab still shows it:", (await bar(page)).shown);
	// A newer announcement shows again.
	await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); await n.publishAnnouncement({ text: "Server maintenance tonight", at: Date.now() + 5, until: 0 }); });
	await guest.reload({ waitUntil: "networkidle0" }); await wait(1800);
	console.log("a newer announcement shows again, even after a dismiss:", (await bar(guest)).text === "Server maintenance tonight");
	// One that has run out doesn't show.
	await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); await n.publishAnnouncement({ text: "Old news", at: Date.now() + 10, until: Date.now() - 1000 }); });
	await guest.reload({ waitUntil: "networkidle0" }); await wait(1800);
	console.log("one past its end time doesn't show:", !(await bar(guest)).shown);
	// Clear from the admin page.
	await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); await n.publishAnnouncement({ text: "Back soon", at: Date.now() + 20, until: 0 }); });
	await click(page, "#btnAdmin"); await wait(1200);
	await page.evaluate(() => document.querySelector('#adminTab [data-v="news"]').click()); await wait(800);
	await page.evaluate(() => [...document.querySelectorAll("#adminBody button")].find(b => b.textContent === "Clear").click()); await wait(900);
	console.log("Clear removes it:", await page.evaluate(async () => { const { connect } = await import("/js/net.js"); const n = await connect(); return (await n.store.get("config/announcement")) == null; }));
}

console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no page errors");
await browser.close();
