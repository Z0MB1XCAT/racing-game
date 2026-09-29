// Downloads the real lie of the land round a circuit (a grid of ground heights) from Open Topo
// Data (https://www.opentopodata.org/): EU-DEM 25 m in Europe, SRTM 30 m for Suzuka, into
// data/dem/<venue>.json for tools/build-places.mjs.
//   node tools/fetch-dem.mjs [venue ...]
// The public API allows 100 points a request and one request a second, so this takes a few minutes.
import { writeFileSync, mkdirSync } from "node:fs";
import { BOXES } from "./fetch-osm.mjs";

// Grid spacing (metres) and dataset for each venue.
const DEM = { monaco: [30, "eudem25m"], spa: [45, "eudem25m"], monza: [60, "eudem25m"], suzuka: [40, "srtm30m"] };

const wait = ms => new Promise(r => setTimeout(r, ms));
async function heights(dataset, pts){
	for(let attempt = 0; attempt < 8; attempt++){
		try{
			const r = await fetch(`https://api.opentopodata.org/v1/${dataset}`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "racing-game-scenery/1.0" },
				body: JSON.stringify({ locations: pts.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join("|"), interpolation: "bilinear" }) });
			if(r.ok){ const j = await r.json(); if(j.status === "OK") return j.results.map(x => x.elevation ?? 0); }
			console.log("  retry (" + r.status + ")");
		}catch(e){ console.log("  retry (" + e.message + ")"); }
		await wait(2000 * (attempt + 1));
	}
	throw new Error("Open Topo Data failed");
}

mkdirSync(new URL("../data/dem/", import.meta.url), { recursive: true });
for(const v of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DEM)){
	const [s, w, n, e] = BOXES[v], [step, dataset] = DEM[v];
	const kx = Math.cos((s + n) / 2 * Math.PI / 180) * 111320, ky = 110540;
	const dlat = step / ky, dlon = step / kx;
	const nx = Math.ceil((e - w) / dlon) + 1, ny = Math.ceil((n - s) / dlat) + 1;
	const pts = [];
	for(let j = 0; j < ny; j++) for(let i = 0; i < nx; i++) pts.push([s + j * dlat, w + i * dlon]);
	const h = [];
	for(let k = 0; k < pts.length; k += 100){
		h.push(...await heights(dataset, pts.slice(k, k + 100)));
		if(k % 2000 === 0) console.log(v, k, "/", pts.length);
		await wait(1100);
	}
	writeFileSync(new URL(`../data/dem/${v}.json`, import.meta.url), JSON.stringify({ dataset, south: s, west: w, dlat, dlon, nx, ny, h: h.map(x => Math.round(x * 10) / 10) }));
	console.log(v, "->", nx, "x", ny);
}
