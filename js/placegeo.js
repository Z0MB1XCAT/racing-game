// The real surroundings of a circuit (js/places/<venue>.js, from OpenStreetMap) placed in the world.
// Everything there is in metres east/north of the circuit data's first point; the track's own
// map transform (the same one the road went through) puts it in game units.
//
// The game's road is wider than the real one (up to four times, at Spa), and tight corners are
// opened up a little, so near the track the real surroundings are moved to match: pushed out
// by the extra width, and along with the road where a corner moved. Further out they're exactly
// where the map has them. That keeps the pits, grandstands, buildings and forest edges lining
// the track the way they really do, instead of under the road.

import { CIRCUITS } from "./circuits.js";
import { roadField } from "./roadfield.js";

// Venues with real surroundings. Each venue's file is loaded when it's first wanted.
export const PLACE_VENUES = ["jeddah", "daytona", "monaco", "spa", "monza", "suzuka"];
const PLACES = {}, loading = {};
export function loadPlaces(venue){
	if(!PLACE_VENUES.includes(venue)) return Promise.resolve(null);
	if(!loading[venue]) loading[venue] = import(`./places/${venue}.js`).then(m => (PLACES[venue] = m.default)).catch(() => { delete loading[venue]; return null; });
	return loading[venue];
}
export function placesLoaded(venue){ return !PLACE_VENUES.includes(venue) || !!PLACES[venue]; }

export function inPoly(ring, x, y){
	let r = false;
	for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
		const [xi, yi] = ring[i], [xj, yj] = ring[j];
		if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r;
	}
	return r;
}

// How real surroundings near the road move to fit the game's road (see the top). A grid of
// offsets over the area round the track, looked up in between.
function makeWarp(track, S){
	const def = track.def, c = track.center, n = c.n;
	if(!def.pts || !c) return null;
	// The real centreline in world units, finely spaced.
	const real = [];
	for(let i = 0; i < def.pts.length; i++){
		const a = def.pts[i], b = def.pts[(i + 1) % def.pts.length];
		const [ax, az] = track.fromMap(a[0] * S, a[1] * S), [bx, bz] = track.fromMap(b[0] * S, b[1] * S);
		const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
		for(let k = 0; k < steps; k++) real.push([ax + (bx - ax) * k / steps, az + (bz - az) * k / steps]);
	}
	const RC = 8, rgrid = new Map();
	real.forEach(([x, z], k) => { const key = Math.floor(x / RC) + "," + Math.floor(z / RC); if(!rgrid.has(key)) rgrid.set(key, []); rgrid.get(key).push(k); });
	const nearestReal = (x, z, r, tx, tz) => {
		let best = r * r, hit = -1;
		for(let gx = Math.floor((x - r) / RC); gx <= Math.floor((x + r) / RC); gx++) for(let gz = Math.floor((z - r) / RC); gz <= Math.floor((z + r) / RC); gz++)
			for(const k of rgrid.get(gx + "," + gz) || []){
				const [px, pz] = real[k], d = (px - x) ** 2 + (pz - z) ** 2;
				if(d >= best) continue;
				// (Running the same way as the game's road there, not a crossing piece of road.)
				const [qx, qz] = real[(k + 1) % real.length], l = Math.hypot(qx - px, qz - pz) || 1;
				if(Math.abs(((qx - px) * tx + (qz - pz) * tz) / l) < 0.6) continue;
				best = d; hit = k;
			}
		return hit;
	};
	// How much wider the game's road is than the real one (about 13 m across, so 6.5 m either side),
	// plus a little: whatever stood at the real road's edge ends up just behind the barrier.
	const extra = Math.max(0, c.hw + 2 - 6.5 * S);
	const near = 18, fade = Math.max(60, extra * 9), reach = near + fade;
	// Anchors: every few samples of the game's road, where it is and where the real road was.
	const anchors = [], AC = 16, agrid = new Map();
	for(let i = 0; i < n; i += 2){
		const k = nearestReal(c.x[i], c.z[i], 40, c.tx[i], c.tz[i]);
		if(k < 0) continue;
		const [rx, rz] = real[k];
		const a = { rx, rz, dx: c.x[i] - rx, dz: c.z[i] - rz, nx: c.tz[i], nz: -c.tx[i] };
		const key = Math.floor(rx / AC) + "," + Math.floor(rz / AC);
		if(!agrid.has(key)) agrid.set(key, []);
		agrid.get(key).push(a);
		anchors.push(a);
	}
	if(!anchors.length) return null;
	const smooth = t => t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
	// The offset for a real point (world units, before moving).
	function offsetAt(x, z){
		let sw = 0, ox = 0, oz = 0;
		for(let gx = Math.floor((x - reach) / AC); gx <= Math.floor((x + reach) / AC); gx++) for(let gz = Math.floor((z - reach) / AC); gz <= Math.floor((z + reach) / AC); gz++)
			for(const a of agrid.get(gx + "," + gz) || []){
				const vx = x - a.rx, vz = z - a.rz, d2 = vx * vx + vz * vz;
				if(d2 > reach * reach) continue;
				const lat = vx * a.nx + vz * a.nz, al = Math.abs(lat), f = smooth((al - near) / fade), side = lat < 0 ? -1 : 1;
				const w = 1 / (d2 + 9);
				sw += w;
				ox += w * (a.dx * f + a.nx * side * extra * f);
				oz += w * (a.dz * f + a.nz * side * extra * f);
			}
		return sw ? [ox / sw, oz / sw] : [0, 0];
	}
	// Precomputed on a grid round the track (4 units apart), zero beyond it.
	const b = track.bounds, G = 4, x0 = b.minX - reach - 250, z0 = b.minZ - reach - 250;
	const W = Math.ceil((b.maxX - b.minX + (reach + 250) * 2) / G) + 1, D = Math.ceil((b.maxZ - b.minZ + (reach + 250) * 2) / G) + 1;
	const gx = new Float32Array(W * D), gz = new Float32Array(W * D);
	const field = roadField(track);
	for(let j = 0; j < D; j++) for(let i = 0; i < W; i++){
		const x = x0 + i * G, z = z0 + j * G;
		// (Only where the road is within reach.)
		if(field.dist(x, z) > reach + 12) continue;
		const [ox, oz] = offsetAt(x, z);
		gx[j * W + i] = ox; gz[j * W + i] = oz;
	}
	function at(x, z){
		const fx = (x - x0) / G, fz = (z - z0) / G;
		if(fx < 0 || fz < 0 || fx >= W - 1 || fz >= D - 1) return [0, 0];
		const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * W + i;
		const l = a => (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - tz) + (a[k + W] * (1 - tx) + a[k + W + 1] * tx) * tz;
		return [l(gx), l(gz)];
	}
	return {
		move: (x, z) => { const [ox, oz] = at(x, z); return [x + ox, z + oz]; },
		// Back from a moved point to where the map has it (near enough: the offsets change slowly).
		back: (x, z) => { let [ox, oz] = at(x, z); [ox, oz] = at(x - ox, z - oz); return [x - ox, z - oz]; }
	};
}

// null if this track has no real surroundings (or they haven't loaded yet).
export function placeGeo(track){
	const def = track.def;
	const P = def && def.pts && track.mapScale && PLACES[def.layoutOf || def.id];   // (a venue's other layouts share its surroundings)
	if(!P) return null;
	const S = track.mapScale;
	// The old venues (Jeddah, Daytona) keep their surroundings exactly where the map has them.
	const warp = P.land ? makeWarp(track, S) : null;
	// Metres east/north -> world x, z (and back).
	const toMap0 = (e, n) => track.fromMap(e * S, n * S);
	const toWorld = warp ? (e, n) => { const [x, z] = toMap0(e, n); return warp.move(x, z); } : toMap0;
	const toMetres = (x, z) => { if(warp) [x, z] = warp.back(x, z); const [mx, my] = track.toMap(x, z); return [mx / S, my / S]; };

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
	// (Where the map has the whole landscape, lakes and ponds are drawn at their own level, not sea level:
	// only the sea counts here.)
	const waterAtMetres = (e, n) => !P.land && P.water.some(([outer, ...holes]) => inPoly(outer, e, n) && !holes.some(h => inPoly(h, e, n)));
	const isWater = (x, z) => { const [e, n] = toMetres(x, z); return waterAtMetres(e, n) || seaAtMetres(e, n); };
	const ring = r => r.map(([e, n]) => toWorld(e, n));
	// Ground cover (P.land: forest, fields, car parks...) in world units, looked up by a grid of
	// the areas' boxes. Where areas overlap, the more particular one wins (a car park in a park).
	const RANK = { water: 10, pool: 9, paved: 8, pitch: 7, sand: 6, gravel: 6, dirt: 5, forest: 4, scrub: 3, orchard: 3, farm: 2, grass: 2, ind: 1, res: 1 };
	let areas = null;
	const LC = 24, lgrid = new Map();
	function landAreas(){
		if(areas) return areas;
		areas = [];
		for(const a of P.land || []){
			if(!RANK[a.k]) continue;
			const outer = ring(a.p), holes = (a.h || []).map(ring);
			let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
			for(const [x, z] of outer){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
			const it = { k: a.k, rank: RANK[a.k], outer, holes, box: [x0, z0, x1, z1] };
			areas.push(it);
			for(let gx = Math.floor(x0 / LC); gx <= Math.floor(x1 / LC); gx++) for(let gz = Math.floor(z0 / LC); gz <= Math.floor(z1 / LC); gz++){
				const key = gx + "," + gz;
				if(!lgrid.has(key)) lgrid.set(key, []);
				lgrid.get(key).push(it);
			}
		}
		return areas;
	}
	function landAtExact(x, z){
		landAreas();
		let best = null;
		for(const a of lgrid.get(Math.floor(x / LC) + "," + Math.floor(z / LC)) || []){
			if(best && a.rank <= best.rank) continue;
			const [x0, z0, x1, z1] = a.box;
			if(x < x0 || x > x1 || z < z0 || z > z1 || !inPoly(a.outer, x, z) || a.holes.some(h => inPoly(h, x, z))) continue;
			best = a;
		}
		return best ? best.k : null;
	}
	// The same as a grid over the area round the track (cells RC apart), filled in once, row by row:
	// what the ground is at any spot there is then just a look-up.
	const KINDS = [null, ...Object.keys(RANK)], RC = 3;
	let raster = null;
	function landRaster(){
		if(raster) return raster;
		landAreas();
		const b = track.bounds, pad = 720, x0 = b.minX - pad, z0 = b.minZ - pad;
		const W = Math.ceil((b.maxX - b.minX + pad * 2) / RC) + 1, D = Math.ceil((b.maxZ - b.minZ + pad * 2) / RC) + 1;
		const g = new Uint8Array(W * D);
		// Lowest rank first, so the more particular areas are painted over the others.
		for(const a of areas.slice().sort((p, q) => p.rank - q.rank)){
			const code = KINDS.indexOf(a.k), rings = [a.outer, ...a.holes];
			const j0 = Math.max(0, Math.ceil((a.box[1] - z0) / RC)), j1 = Math.min(D - 1, Math.floor((a.box[3] - z0) / RC));
			const xs = [];
			for(let j = j0; j <= j1; j++){
				const z = z0 + j * RC;
				xs.length = 0;
				for(const r of rings) for(let i = 0, k = r.length - 1; i < r.length; k = i++){
					const [xi, zi] = r[i], [xk, zk] = r[k];
					if((zi > z) !== (zk > z)) xs.push(xi + (z - zi) * (xk - xi) / (zk - zi));
				}
				xs.sort((p, q) => p - q);
				for(let q = 0; q + 1 < xs.length; q += 2){
					const i0 = Math.max(0, Math.ceil((xs[q] - x0) / RC)), i1 = Math.min(W - 1, Math.floor((xs[q + 1] - x0) / RC));
					for(let i = i0; i <= i1; i++) g[j * W + i] = code;
				}
			}
		}
		raster = { g, x0, z0, W, D };
		return raster;
	}
	function landAt(x, z){
		const r = landRaster(), i = Math.round((x - r.x0) / RC), j = Math.round((z - r.z0) / RC);
		if(i < 0 || j < 0 || i >= r.W || j >= r.D) return landAtExact(x, z);
		return KINDS[r.g[j * r.W + i]];
	}
	// The real lie of the land (P.dem): ground height in world units at (x, z), or null off the grid.
	// Heights are above the circuit's lowest point (CIRCUITS[..].base), like the road's own.
	let demAt = null;
	const base = CIRCUITS[def.id] && CIRCUITS[def.id].base;
	if(P.dem && base !== undefined){
		const d = P.dem;
		demAt = (x, z) => {
			const [mx, my] = track.toMap(x, z), fx = (mx / S - d.e0) / d.de, fy = (my / S - d.n0) / d.dn;
			if(fx < 0 || fy < 0 || fx > d.nx - 1.001 || fy > d.ny - 1.001) return null;
			const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * d.nx + i, h = d.h;
			const alt = (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + d.nx] * (1 - tx) + h[k + d.nx + 1] * tx) * ty;
			return (alt - base) * S;
		};
	}
	// Land the map leaves blank, filled in by its lie (P.fill, Suzuka): the Japanese countryside is
	// wooded wherever it slopes, with rice paddies on the flat.
	const fillAt = P.fill && demAt ? (x, z) => {
		const a = demAt(x - 6, z), b = demAt(x + 6, z), c2 = demAt(x, z - 6), d = demAt(x, z + 6);
		if(a === null || b === null || c2 === null || d === null) return null;
		return Math.hypot(b - a, d - c2) / 12 > P.fill ? "forest" : "farm";
	} : null;
	return {
		P, S, toWorld, toMetres, isWater, ring, landAt, landAreas, demAt, fillAt,
		// A building's outline moved as one piece (by the offset at its middle), so it keeps its shape.
		solid(r){
			if(!warp) return ring(r);
			const pts = r.map(([e, n]) => toMap0(e, n));
			const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
			const [mx, mz] = warp.move(cx, cz);
			return pts.map(([x, z]) => [x + mx - cx, z + mz - cz]);
		}
	};
}
