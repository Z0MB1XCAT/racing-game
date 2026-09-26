// Drives the game in a headless browser and screenshots each step.
//   node tools/e2e.mjs solo [trackId]     race bots, hold right-ish steering, screenshot HUD + results
//   node tools/e2e.mjs online             two tabs over ?localnet: host, join, race
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
	await page.click(`#setupTracks [data-id="${trackId}"]`);
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
	const ids = await page.evaluate(async () => (await import("/js/tracks.js")).TRACKS.map(t => t.id));
	for(const id of (trackId === "all" || trackId === "monza" ? ids : trackId.split(","))){
		await click(page, "#btnTrial"); await wait(400);
		await click(page, `#setupTracks [data-id="${id}"]`); await wait(700);
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
	console.log("results:", await waitScreen(host, "results", 90) && await waitScreen(guest, "results", 10));
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
	await page.click(`#setupTracks [data-id="${trackId}"]`); await wait(800);
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

console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no page errors");
await browser.close();
