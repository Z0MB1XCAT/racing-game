// Makes the pictures search engines and chat apps use for the game (assets/social/): preview.jpg, the card shown when the address is
// pasted into a chat or a search result (1200x630, the real game's title screen with the menus taken off), and icon-192.png and
// apple-touch-icon.png, the favicon as real files (Google can't read the inline one). Run it again only if the logo or the look of
// the title screen changes. Needs node serve.mjs running.
//   node tools/build-social.mjs
import puppeteer from "puppeteer";
import { mkdir, readFile, stat } from "node:fs/promises";

const dir = "assets/social";
await mkdir(dir, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"] });

// ---- the card ----
{
	const page = await browser.newPage();
	await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
	// (The same car and look every time, full quality, no sound, and no "what's new" popup in the way.)
	await page.evaluateOnNewDocument(() => {
		localStorage.setItem("org-gp:settings", JSON.stringify({ quality: "high", adaptive: false, volume: 0 }));
		localStorage.setItem("org-gp:profile", JSON.stringify({ name: "Driver", hue: 205, body: "classic", look: { livery: "factory", number: 7 } }));
		localStorage.setItem("org-gp:seenVersion", JSON.stringify("9999"));
	});
	await page.goto("http://localhost:3000/?localnet&season=off", { waitUntil: "networkidle0" });
	await wait(4500);
	// Keep the logo and the car on the track; take the menus off and put one line of what it is where they were.
	await page.addStyleTag({ content: `
		.title-grid, .topbar .flex, .announce, .menu-toast, #lens, .bats{ display: none !important; }
		.card-line{ position: fixed; left: 0; right: 0; bottom: 0; padding: 70px 40px 34px; background: linear-gradient(0deg, rgba(8,11,17,.92), rgba(8,11,17,.55) 55%, transparent); font-family: "Barlow Condensed", sans-serif; text-transform: uppercase; z-index: 50; }
		.card-line b{ display: block; font-weight: 800; font-size: 52px; letter-spacing: -.01em; line-height: 1; color: #f3f5f9; }
		.card-line span{ display: block; margin-top: 10px; font-weight: 600; font-size: 25px; letter-spacing: .1em; color: #f48342; }
	` });
	await page.evaluate(() => {
		const d = document.createElement("div");
		d.className = "card-line";
		d.innerHTML = "<b>Race your friends in the browser</b><span>Real F1 circuits &middot; Online rooms &middot; Bots &middot; Free, nothing to download</span>";
		document.body.appendChild(d);
	});
	await wait(500);
	await page.screenshot({ path: `${dir}/preview.jpg`, type: "jpeg", quality: 84 });
	await page.close();
}

// ---- the icons: the favicon drawn in index.html, as files ----
const html = await readFile("index.html", "utf8");
const m = /<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/.exec(html);
if(!m) throw new Error("couldn't find the inline favicon in index.html");
const svg = decodeURIComponent(m[1]);
for(const [file, size, square] of [["icon-192.png", 192, false], ["apple-touch-icon.png", 180, true]]){
	const page = await browser.newPage();
	await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
	// (A phone's home screen rounds the corners itself, so that one is square all the way out.)
	const art = square ? svg.replace(/ rx='6'/, "") : svg;
	await page.setContent(`<style>html,body{margin:0;background:${square ? "#11151d" : "transparent"}}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
	await page.screenshot({ path: `${dir}/${file}`, type: "png", omitBackground: !square, clip: { x: 0, y: 0, width: size, height: size } });
	await page.close();
}
await browser.close();
for(const f of ["preview.jpg", "icon-192.png", "apple-touch-icon.png"]) console.log(f.padEnd(22), (await stat(`${dir}/${f}`)).size, "bytes");
