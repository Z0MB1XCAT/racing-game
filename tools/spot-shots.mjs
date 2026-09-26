// Screenshots from chosen places around a track (a camera parked beside the road), for
// checking elevation, tunnels and bridges. Needs node serve.mjs running.
//   node tools/spot-shots.mjs <trackId> [fraction or feature ...]
//   e.g. node tools/spot-shots.mjs monaco tunnel 0.25 high     (features: tunnel, bridge, high, low, top)
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const [id = "monaco", ...wanted] = process.argv.slice(2);
const spots = wanted.length ? wanted : ["0", "0.25", "0.5", "0.75", "high", "tunnel", "bridge"];
mkdirSync("temporary screenshots/spots", { recursive: true });
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
const errors = [];
p.on("pageerror", e => errors.push(e.message));
await p.setViewport({ width: 1440, height: 900 });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
await p.click("#btnBots"); await new Promise(r => setTimeout(r, 400));
await p.click(`#setupTracks [data-id="${id}"]`); await new Promise(r => setTimeout(r, 800));
await p.evaluate(() => { window.__game.setup.bots = 5; });
await p.click("#setupGo");
await new Promise(r => setTimeout(r, 6000));
for(const spot of spots){
	const ok = await p.evaluate(spot => {
		const g = window.__game, c = g.track.center, n = c.n, f = g.track.features || {};
		let i;
		if(spot === "tunnel" && f.tunnel) i = (f.tunnel[0] + 8) % n;
		else if(spot === "bridge" && f.bridge) i = (f.bridge[0] - 30 + n) % n;
		else if(spot === "high" && c.h) i = c.h.indexOf(Math.max(...c.h));
		else if(spot === "low" && c.h) i = c.h.indexOf(Math.min(...c.h));
		else if(spot === "top"){
			const w = g.world, r = w.radius;
			g.freeCam = { p: [w.center.x, r * 1.6, w.center.z + r * 0.35], t: [w.center.x, 0, w.center.z] };
			g.frozen = true;
			return true;
		}
		else if(!isNaN(+spot)) i = Math.floor(+spot * n) % n;
		else return false;
		const h = c.h ? c.h[i] : 0, j = (i + 25) % n, hj = c.h ? c.h[j] : 0;
		const side = spot === "bridge" ? 0 : 4;
		g.freeCam = {
			p: [c.x[i] - c.tx[i] * 10 + c.tz[i] * side, h + (spot === "bridge" ? 3 : 5), c.z[i] - c.tz[i] * 10 - c.tx[i] * side],
			t: [c.x[j], hj + 1, c.z[j]]
		};
		g.frozen = true;
		return true;
	}, spot);
	if(!ok){ console.log(id, spot, "not on this track"); continue; }
	await new Promise(r => setTimeout(r, 700));
	await p.screenshot({ path: `temporary screenshots/spots/${id}-${spot}.png` });
	console.log(id, spot, "ok");
}
console.log(errors.length ? errors : "no page errors");
await b.close();
