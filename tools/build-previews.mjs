// Makes the two pictures Settings shows under Graphics (assets/previews/quality-fast.jpg and quality-pretty.jpg): the same moment of the
// same race, once on Fast and once on Pretty, taken from the real game on a real graphics card. Run it again only when what a
// quality looks like changes. Needs node serve.mjs running.
//   node tools/build-previews.mjs [trackId] [timeOfDay]
import puppeteer from "puppeteer";
import { mkdir, stat } from "node:fs/promises";

const [track = "spa", tod = "sunset"] = process.argv.slice(2);
const dir = "assets/previews";
await mkdir(dir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });

for(const [quality, file] of [["low", "quality-fast.jpg"], ["high", "quality-pretty.jpg"]]){
	const page = await browser.newPage();
	await page.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
	// (Sharpness held at full, no FPS counter, no sound: the picture is of the quality, not of how a computer coped.)
	// (And the same car in both, parked on the grid during the countdown: the pictures differ only in the quality.)
	await page.evaluateOnNewDocument(q => {
		localStorage.setItem("org-gp:settings", JSON.stringify({ quality: q, adaptive: false, fps: false, volume: 0 }));
		localStorage.setItem("org-gp:profile", JSON.stringify({ name: "Driver", hue: 205, body: "classic", look: { livery: "factory", number: 7 } }));
	}, quality);
	await page.goto("http://localhost:3000/?localnet&season=off", { waitUntil: "networkidle0" });
	await wait(1500);
	await page.evaluate(() => document.querySelector("#btnTrial").click()); await wait(900);
	await page.evaluate((id, tod) => {
		document.querySelector(`#setupTracks [data-id="${id}"]`).click();
		document.querySelector(`#setupTod [data-v="${tod}"]`).click();
	}, track, tod);
	await wait(3500);
	await page.evaluate(() => document.querySelector("#setupGo").click());
	await wait(2300);                                  // (the lights come on; the car hasn't moved yet)
	await page.addStyleTag({ content: "#hud, #labels, #touch, .fps-box{ display: none !important; }" });
	await wait(600);
	await page.screenshot({ path: `${dir}/${file}`, type: "jpeg", quality: 80 });
	const info = await page.evaluate(() => ({ quality: window.__game.gfx.quality, shadows: window.__game.gfx.current.shadows, glow: window.__game.gfx.postOn, step: window.__game.gfx.adaptive.step }));
	console.log(file, JSON.stringify(info), (await stat(`${dir}/${file}`)).size, "bytes");
	await page.close();
}
await browser.close();
