// Checks the rest of each venue's circuit (js/remnants.js) against the track: where a closed-off
// road lies over the track's road it must stay below the track's surface (or be a bridge well
// overhead), so it never shows through or blocks the way.
//   node tools/remnant-check.mjs [trackId]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require("./three.min.cjs");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const { buildTrack, nearestSample } = await import("../js/trackgen.js");
const { remnants } = await import("../js/remnants.js");
const only = process.argv[2];
let bad = 0;
for(const def of [...MAIN, ...LAYOUTS].filter(d => !only || d.id === only)){
	const t = buildTrack(def, false), c = t.center, rem = remnants(t);
	if(!rem.list.length) continue;
	let clip = 0, worst = 0, where = null;
	for(const r of rem.list){
		const rc = r.center;
		for(let i = 0; i < rc.n; i++){
			if(!r.draw[i]) continue;
			for(const lat of [-rc.hw, -rc.hw / 2, 0, rc.hw / 2, rc.hw]){
				const x = rc.x[i] + rc.tz[i] * lat, z = rc.z[i] - rc.tx[i] * lat;
				const k = nearestSample(t, x, z, -1);
				const off = Math.abs((x - c.x[k]) * c.tz[k] - (z - c.z[k]) * c.tx[k]);
				if(off > c.hw - 0.3 || Math.hypot(x - c.x[k], z - c.z[k]) > c.hw) continue;       // (not over the track's road)
				const above = (rc.h[i] + lat * rc.bank[i] - 0.03) - (t.heightAt(x, z, k) + 0.02);
				if(above > -0.02 && above < 2.5){ clip++; if(above > worst){ worst = above; where = [r.id, i, Math.round(x), Math.round(z)]; } }
			}
		}
	}
	console.log(`${def.id.padEnd(15)} closed roads showing through the track: ${clip}${clip ? ` (worst ${worst.toFixed(2)} at ${where})` : ""}`);
	bad += clip;
}
process.exit(bad ? 1 : 0);
