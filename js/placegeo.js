// The real surroundings of a circuit (js/places.js, from OpenStreetMap) placed in the world.
// Everything in places.js is in metres east/north of the circuit data's first point; the
// track's own map transform (the same one the road went through) puts it in game units.
import { PLACES } from "./places.js";

export function inPoly(ring, x, y){
	let r = false;
	for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
		const [xi, yi] = ring[i], [xj, yj] = ring[j];
		if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r;
	}
	return r;
}

// null if this track has no real surroundings.
export function placeGeo(track){
	const def = track.def;
	const P = def && def.pts && track.mapScale && PLACES[def.id];
	if(!P) return null;
	const S = track.mapScale;
	// Metres east/north -> world x, z (and back).
	const toWorld = (e, n) => track.fromMap(e * S, n * S);
	const toMetres = (x, z) => { const [mx, my] = track.toMap(x, z); return [mx / S, my / S]; };

	// The sea: OpenStreetMap coastlines run with the land on the left, the water on the right.
	// A point is water if it's on the right of the nearest bit of coastline. Segments are kept in
	// a 100 m grid so that's quick.
	const C = 100, grid = new Map(), segs = [];
	for(const line of P.coast) for(let i = 0; i < line.length - 1; i++){
		const a = line[i], b = line[i + 1], k = segs.length;
		segs.push([a[0], a[1], b[0], b[1]]);
		const x0 = Math.floor(Math.min(a[0], b[0]) / C), x1 = Math.floor(Math.max(a[0], b[0]) / C);
		const y0 = Math.floor(Math.min(a[1], b[1]) / C), y1 = Math.floor(Math.max(a[1], b[1]) / C);
		for(let gx = x0; gx <= x1; gx++) for(let gy = y0; gy <= y1; gy++){
			const key = gx + "," + gy;
			if(!grid.has(key)) grid.set(key, []);
			grid.get(key).push(k);
		}
	}
	// Points well away from the coast give the same answer as their neighbours: remember those
	// by 80 m square (only when more than 120 m from the coast, so the whole square agrees).
	const known = new Map();
	function seaAtMetres(e, n){
		if(!segs.length) return false;
		const key = Math.floor(e / 80) + "," + Math.floor(n / 80);
		const k0 = known.get(key);
		if(k0 !== undefined) return k0;
		const gx = Math.floor(e / C), gy = Math.floor(n / C);
		let best = Infinity, side = 0;
		for(let r = 0; r <= 12 && (best === Infinity || r <= Math.ceil(Math.sqrt(best) / C) + 1); r++){
			for(let dx = -r; dx <= r; dx++) for(let dy = -r; dy <= r; dy++){
				if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				for(const k of grid.get((gx + dx) + "," + (gy + dy)) || []){
					const [ax, ay, bx, by] = segs[k], vx = bx - ax, vy = by - ay;
					const t = Math.max(0, Math.min(1, ((e - ax) * vx + (n - ay) * vy) / (vx * vx + vy * vy || 1)));
					const px = ax + vx * t - e, py = ay + vy * t - n, d = px * px + py * py;
					if(d < best){ best = d; side = vx * (n - ay) - vy * (e - ax); }
				}
			}
		}
		const sea = best < Infinity && side < 0;
		if(best > 120 * 120) known.set(key, sea);
		return sea;
	}
	// Lagoons and basins (outer ring, then holes).
	const waterAtMetres = (e, n) => P.water.some(([outer, ...holes]) => inPoly(outer, e, n) && !holes.some(h => inPoly(h, e, n)));
	const isWater = (x, z) => { const [e, n] = toMetres(x, z); return waterAtMetres(e, n) || seaAtMetres(e, n); };
	return { P, S, toWorld, toMetres, isWater, ring: ring => ring.map(([e, n]) => toWorld(e, n)) };
}
