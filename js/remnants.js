// The rest of a venue's circuit: the roads of its other layouts that this layout doesn't use
// (Monza's oval when racing the GP, the climb to the Casino on Monaco's Formula E lap...), drawn
// as closed road with a barrier across each one where it meets the track. Looks only: the track's
// own barriers run across every junction, so the handling and the lap are just as before.
import { layoutsOf } from "./tracks.js";
import { buildTrack } from "./trackgen.js";
import { CIRCUITS } from "./circuits.js";

const built = new Map();
const other = def => { if(!built.has(def.id)) built.set(def.id, buildTrack(def, false)); return built.get(def.id); };

// A grid of points for "anything within r of (x, z)?".
function pointGrid(cell){
	const map = new Map(), pts = [];
	return {
		pts,
		add(x, z, y, tag){
			const k = Math.floor(x / cell) + "," + Math.floor(z / cell);
			if(!map.has(k)) map.set(k, []);
			const p = { x, z, y, tag };
			map.get(k).push(p); pts.push(p);
		},
		near(x, z, r, fn){
			for(let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++)
				for(let cz = Math.floor((z - r) / cell); cz <= Math.floor((z + r) / cell); cz++)
					for(const p of map.get(cx + "," + cz) || []) fn(p);
		}
	};
}

// [{ center (x, z, tx, tz, h, bank, n: like a track's), draw[i] (the piece from i to i+1 is road),
//    open[i] (not overlapping any other road: gets edge lines), ends: [{ i }] (barriers) }]
// plus space: the drawn points, for keeping scenery off them. Empty for tracks with no other layouts.
export function remnants(track){
	const def = track.def, c = track.center;
	const none = { list: [], space: null };
	if(!def || !c || !c.h || !track.mapScale || !CIRCUITS[def.id]) return none;
	const all = layoutsOf(def.id);
	// (Only the current version of a layout: an old weekly-challenge copy was traced differently.)
	if(!all.some(d => d.id === def.id && (d.key || d.id) === (def.key || def.id))) return none;
	const others = all.filter(d => d.id !== def.id && d.pts && CIRCUITS[d.id]).sort((a, b) => CIRCUITS[b.id].meters - CIRCUITS[a.id].meters);
	if(!others.length) return none;

	const S = track.mapScale, base = CIRCUITS[def.id].base || 0, hw = c.hw;
	const road = pointGrid(8), drawn = pointGrid(8);
	for(let i = 0; i < c.n; i++) road.add(c.x[i], c.z[i], c.h[i], "track");
	// On a road already there: within a road's width of it, and at about its height (a road
	// passing over or under on a bridge is not on it).
	const onRoad = (grid, x, z, y) => { let hit = null; grid.near(x, z, hw, p => { if(!hit && Math.hypot(p.x - x, p.z - z) < hw && Math.abs(p.y - y) < 2.5) hit = p; }); return hit; };

	const list = [];
	for(const d of others){
		const o = other(d), oc = o.center, sO = o.mapScale, baseO = CIRCUITS[d.id].base || 0, n = oc.n;
		// Its centreline in this track's world (both are laid out from the same real-world origin).
		const x = new Float64Array(n), z = new Float64Array(n), h = new Float32Array(n), bank = new Float32Array(n);
		for(let i = 0; i < n; i++){
			const [mx, my] = o.toMap(oc.x[i], oc.z[i]);
			[x[i], z[i]] = track.fromMap(mx / sO * S, my / sO * S);
			h[i] = (oc.h[i] / sO + baseO - base) * S;
			bank[i] = oc.bank[i];
		}
		const tx = new Float64Array(n), tz = new Float64Array(n);
		for(let i = 0; i < n; i++){
			const a = (i - 1 + n) % n, b = (i + 1) % n, l = Math.hypot(x[b] - x[a], z[b] - z[a]) || 1;
			tx[i] = (x[b] - x[a]) / l; tz[i] = (z[b] - z[a]) / l;
		}
		// Leave out its tunnel (the road disappears into the hillside there).
		const tn = o.features && o.features.tunnel;
		const inTunnel = i => tn && ((i - tn[0] + n) % n) <= ((tn[1] - tn[0] + n) % n);
		const open = new Uint8Array(n), byTrack = new Uint8Array(n);
		for(let i = 0; i < n; i++){
			if(inTunnel(i)) continue;
			const t = onRoad(road, x[i], z[i], h[i]);
			if(t){ byTrack[i] = 1; continue; }
			if(!onRoad(drawn, x[i], z[i], h[i])) open[i] = 1;
		}
		if(!open.some(v => v)) continue;
		// Road pieces: the open stretches, reaching a few samples on under the road they join.
		const draw = new Uint8Array(n);
		for(let i = 0; i < n; i++) if(open[i]) for(let k = -3; k <= 3; k++){ const j = (i + k + n) % n; if(!inTunnel(j)) draw[j] = 1; }
		// Where an open stretch starts or ends at the track: a barrier across it.
		const ends = [];
		for(let i = 0; i < n; i++){
			if(!open[i]) continue;
			const p = (i - 1 + n) % n, q = (i + 1) % n;
			if(!open[p] && byTrack[p]) ends.push({ i, dir: -1 });
			if(!open[q] && byTrack[q]) ends.push({ i, dir: 1 });
		}
		for(let i = 0; i < n; i++) if(draw[i]) drawn.add(x[i], z[i], h[i], d.id);
		list.push({ id: d.id, center: { x, z, tx, tz, h, bank, n, hw }, draw, open, ends });
	}
	return { list, space: list.length ? drawn : null };
}

// What the ground needs to know about them: their road samples, and an area big enough for all
// the road (for buildTerrain's opts.extra and opts.bounds).
export function remnantGround(track, rem){
	const extra = [], b = Object.assign({}, track.bounds);
	for(const r of rem.list){
		const rc = r.center;
		for(let i = 0; i < rc.n; i++) if(r.draw[i]) extra.push({ x: rc.x[i], z: rc.z[i], h: rc.h[i], tx: rc.tx[i], tz: rc.tz[i], bank: rc.bank[i] });
	}
	for(const p of extra){ b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z); }
	return { extra, bounds: b };
}
