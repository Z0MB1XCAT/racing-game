// Checks the ground against the road on the elevated tracks: the ground mustn't poke
// through the road, and the road shouldn't float high above the ground except on a bridge.
//   node tools/terrain-check.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require("./three.min.cjs");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const TRACKS = [...MAIN, ...LAYOUTS];   // (every layout of every venue)
const { buildTrack } = await import("../js/trackgen.js");
const { buildTerrain } = await import("../js/terrain.js");
const { remnants, remnantGround } = await import("../js/remnants.js");
const { placeGeo, loadPlaces, PLACE_VENUES } = await import("../js/placegeo.js");
for(const v of PLACE_VENUES) await loadPlaces(v);
let bad = 0;
for(const def of TRACKS.filter(d => d.elev)) for(const rev of [false, true]){
	// (As in the game: land above sea level, and the ground shaped round the rest of the venue's
	// circuit too, which mustn't push it up through this track's road.)
	const t = buildTrack(def, rev), c = t.center, n = c.n, rg = remnantGround(t, remnants(t));
	// (And the real lie of the land where the venue has it, reaching as far out as in the game.)
	const geo = placeGeo(t);
	const { groundAt } = buildTerrain(t, { isSea: () => false, extra: rg.extra, bounds: rg.bounds, demAt: geo && geo.demAt, margin: geo && geo.demAt ? 560 : 240 });
	const f = t.features || {};
	const near = (i, k) => k && Math.min(...k.map(a => Math.min(Math.abs(i - a), n - Math.abs(i - a)))) < 70;
	const inTunnel = i => f.tunnel && (f.tunnel[0] < f.tunnel[1] ? i >= f.tunnel[0] && i <= f.tunnel[1] : i >= f.tunnel[0] || i <= f.tunnel[1]);
	let poke = 0, pokeMax = 0, pokeAt = -1, float = 0, floatMax = 0, floatAt = -1;
	for(let i = 0; i < n; i++){
		for(const lat of [-c.hw, -c.hw / 2, 0, c.hw / 2, c.hw]){
			const x = c.x[i] + c.tz[i] * lat, z = c.z[i] - c.tx[i] * lat;
			const road = t.heightAt(x, z, i), g = groundAt(x, z);
			if(g > road - 0.05 && !near(i, f.bridge)){ poke++; if(g - road > pokeMax){ pokeMax = g - road; pokeAt = i; } }
		}
		for(const lat of [-c.hw - 1.2, c.hw + 1.2]){
			const x = c.x[i] + c.tz[i] * lat, z = c.z[i] - c.tx[i] * lat;
			const gap = c.h[i] + lat * c.bank[i] - groundAt(x, z);
			if(gap > 1.5 && !near(i, f.bridge) && !inTunnel(i)){ float++; if(gap > floatMax){ floatMax = gap; floatAt = i; } }
		}
	}
	const b = f.bridge ? ` bridge gap ${(c.h[f.bridge[1]] - c.h[f.bridge[0]]).toFixed(1)} at ${f.bridge}` : "";
	console.log(`${t.id.padEnd(14)} ground through road: ${poke} (worst ${pokeMax.toFixed(2)} at ${pokeAt}) | road floating: ${float} (worst ${floatMax.toFixed(2)} at ${floatAt})${b}`);
	bad += poke;
}
process.exit(bad ? 1 : 0);
