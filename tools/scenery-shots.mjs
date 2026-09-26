// Screenshots of each track's scenery: the overview, a few moments in a race (with the
// mirror), looking back, and the highlights afterwards. Needs node serve.mjs running.
//   node tools/scenery-shots.mjs [trackId ...]
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["monaco", "spa", "monza", "suzuka", "jeddah", "daytona", "figure8", "glacier"];
const out = "temporary screenshots/scenery";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

for(const id of ids){
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	page.on("pageerror", e => errors.push(id + ": " + e.message));
	page.on("console", m => { if(m.type() === "error") errors.push(id + ": " + m.text()); });
	await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	await page.click("#btnBots");
	await wait(500);
	const found = await page.$(`#setupTracks [data-id="${id}"]`);
	if(!found){ console.log("no track", id); await page.close(); continue; }
	await found.click();
	await wait(2500);
	await page.screenshot({ path: `${out}/${id}-overview.png` });
	await page.evaluate(() => { const g = window.__game; g.setup.laps = 1; g.setup.bots = 5; });
	await page.click("#setupGo");
	await wait(2000);
	await page.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("hard");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	const info = await page.evaluate(() => { const w = window.__game.world; return Object.assign({ occluders: w.occluders.count }, w.info); });
	for(const t of [3, 9, 16, 24]){
		await wait(t === 3 ? 3000 : 7000);
		await page.screenshot({ path: `${out}/${id}-race-${t}.png` });
	}
	await page.keyboard.down("KeyB"); await wait(400);
	await page.screenshot({ path: `${out}/${id}-lookback.png` });
	await page.keyboard.up("KeyB");
	for(let i = 0; i < 120; i++){
		const s = await page.evaluate(() => window.__game.screen);
		if(s === "replay" || s === "results") break;
		await wait(1000);
	}
	for(let k = 0; k < 4; k++){
		await wait(4500);
		if(await page.evaluate(() => window.__game.screen) !== "replay") break;
		await page.screenshot({ path: `${out}/${id}-highlight-${k}.png` });
	}
	console.log(id, JSON.stringify(info));
	await page.close();
}
console.log(errors.length ? errors : "no page errors");
await browser.close();
