// Screenshots from chosen places around a track (a camera parked beside the road), for
// checking elevation, tunnels and bridges. Needs node serve.mjs running.
//   node tools/spot-shots.mjs <trackId> [fraction or feature ...]
//   e.g. node tools/spot-shots.mjs monaco tunnel 0.25 high     (features: tunnel, bridge, high, low, top)
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

// Add "rev" to shoot the track reversed (files get a -rev suffix).
// Add "rain" for heavy rain (files get a -rain suffix).
const args = process.argv.slice(2), rev = args.includes("rev"), rain = args.includes("rain");
const [id = "monaco", ...wanted] = args.filter(a => a !== "rev" && a !== "rain");
const spots = wanted.length ? wanted : ["0", "0.25", "0.5", "0.75", "high", "tunnel", "bridge"];
mkdirSync("temporary screenshots/spots", { recursive: true });
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
const errors = [];
p.on("pageerror", e => errors.push(e.message));
await p.setViewport({ width: 1440, height: 900 });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
await p.click("#btnBots"); await new Promise(r => setTimeout(r, 400));
await p.evaluate(async id => { const { venueOf } = await import("/js/tracks.js"); document.querySelector(`#setupTracks [data-id="${venueOf(id)}"]`).click(); if(venueOf(id) !== id) document.querySelector(`#setupLayout [data-v="${id}"]`).click(); }, id);   // (a layout: its venue, then the Layout switch) await new Promise(r => setTimeout(r, 800));
if(rev){ await p.click('#setupDir [data-v="1"]'); await new Promise(r => setTimeout(r, 400)); }
await p.evaluate(rain => { window.__game.setup.bots = 5; if(rain) window.__game.setup.weather = "rain"; }, rain);
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
		else if(spot === "over" && f.bridge) i = (f.bridge[1] - 30 + n) % n;
		else if(spot === "tunnelin" && f.tunnel) i = (f.tunnel[0] - 32 + n) % n;
		else if(spot.startsWith("above")){
			// Straight down from above sample above<i> (or the tunnel mouth), 60 up.
			const j = spot === "above" && f.tunnel ? f.tunnel[0] : spot.includes(".") ? Math.floor(+spot.slice(5) * n) % n : +spot.slice(5) % n;
			g.freeCam = { p: [c.x[j] + 0.01, c.h[j] + 60, c.z[j] - 20], t: [c.x[j], c.h[j], c.z[j]] };
			g.frozen = true;
			return true;
		}
		else if((spot === "tunnelview" && f.tunnel) || spot.startsWith("v")){
			// Raised view from well back along the road, looking at the spot (tunnel mouth or sample v<i>).
			const j = spot === "tunnelview" ? f.tunnel[0] : spot.includes(".") ? Math.floor(+spot.slice(1) * n) % n : +spot.slice(1) % n, k = (j - 40 + n) % n;
			g.freeCam = { p: [c.x[k] + c.tz[k] * 6, c.h[k] + 9, c.z[k] - c.tx[k] * 6], t: [c.x[j], c.h[j] + 4, c.z[j]] };
			g.frozen = true;
			return true;
		}
		else if(spot === "tunnelout" && f.tunnel) i = (f.tunnel[1] - 12 + n) % n;
		else if(spot === "bridgeside" && f.bridge){
			// From off to the side of the crossing, along the lower road's line, a little raised.
			const lo = f.bridge[0], up = f.bridge[1];
			g.freeCam = { p: [c.x[lo] + c.tx[up] * 45 + c.tz[up] * 8, c.h[lo] + 5, c.z[lo] + c.tz[up] * 45 - c.tx[up] * 8], t: [c.x[lo], c.h[lo] + 2, c.z[lo]] };
			g.frozen = true;
			return true;
		}
		else if(spot.startsWith("s") && !isNaN(+spot.slice(1))) i = +spot.slice(1) % n;
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
	await p.screenshot({ path: `temporary screenshots/spots/${id}${rev ? "-rev" : ""}${rain ? "-rain" : ""}-${spot}.png` });
	console.log(id, spot, "ok");
}
console.log(errors.length ? errors : "no page errors");
await b.close();
