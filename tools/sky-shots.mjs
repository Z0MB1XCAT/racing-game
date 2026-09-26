// Screenshots of a track at different times of day and weather.
//   node tools/sky-shots.mjs [trackId] [tod-weather ...]    e.g. monza night-rain sunset-cloudy
// Needs node serve.mjs running.
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const [trackId = "monza", ...combos] = process.argv.slice(2);
const list = combos.length ? combos : ["day-clear", "sunset-cloudy", "night-clear", "day-rain", "night-rain"];
const out = "temporary screenshots/sky";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: "new" });
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
for(const combo of list){
	const [tod, weather] = combo.split("-");
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	page.on("pageerror", e => errors.push(combo + ": " + e.message));
	await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	await page.click("#btnBots"); await wait(400);
	await page.click(`#setupTracks [data-id="${trackId}"]`); await wait(600);
	await page.evaluate((tod, weather) => { const g = window.__game; g.setup.tod = tod; g.setup.weather = weather; g.setup.laps = 1; g.setup.bots = 5; }, tod, weather);
	await page.click("#setupGo");
	await wait(2000);
	await page.evaluate(async () => {
		const { Bot } = await import("/js/bots.js");
		const g = window.__game, me = g.race.me;
		me.bot = new Bot("hard");
		const orig = g.race.update.bind(g.race);
		g.race.update = (dt) => { g.race.tracker.update(me); return orig(dt, me.bot.steer(me, g.race.tracker, g.race.active, dt)); };
	});
	await wait(9000);
	const look = await page.evaluate(() => { const l = window.__game.world.look; return { night: +l.night.toFixed(2), lights: +l.lights.toFixed(2), rain: +l.rain.toFixed(2), wet: +l.wet.toFixed(2) }; });
	await page.screenshot({ path: `${out}/${trackId}-${combo}.png` });
	console.log(combo, JSON.stringify(look));
	await page.close();
}
console.log(errors.length ? errors : "no page errors");
await browser.close();
