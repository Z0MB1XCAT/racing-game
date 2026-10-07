// Turns a track definition from tracks.js into what the game needs: physics walls
// and lines, a centreline for positions/bots/minimap, and scenery spots.
import { wallFromWorld, lineFromWorld, wallFromTrackUnits, lineFromTrackUnits, GRID, MAP_SCALE } from "./physics.js";

export const START_Z = 10;          // start line sits this far ahead of the front row
const STEP = 1;                     // centreline sample spacing (world units)
const CHECKPOINTS = 3;              // hidden sector lines, besides the start line
export const tuning = { WALL_TOL: 1.2 };   // how far a wall may cut inside the smooth curve
const WALL_TOL_REF = () => tuning.WALL_TOL;

export function seededRandom(str){
	let h = 1779033703 ^ str.length;
	for(let i = 0; i < str.length; i++){
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	return function(){
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Centripetal Catmull-Rom through a closed loop of points.
function smoothLoop(pts){
	const out = [], n = pts.length;
	const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
	for(let i = 0; i < n; i++){
		const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
		const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
		const steps = Math.min(48, Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 24)));
		for(let k = 0; k < steps; k++){
			const t = t1 + (t2 - t1) * k / steps;
			const lerp = (a, b, ta, tb) => [
				(tb - t) / (tb - ta) * a[0] + (t - ta) / (tb - ta) * b[0],
				(tb - t) / (tb - ta) * a[1] + (t - ta) / (tb - ta) * b[1]
			];
			const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
			const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
			out.push(lerp(b1, b2, t1, t2));
		}
	}
	return out;
}

function loopLength(p){
	let len = 0;
	for(let i = 0; i < p.length; i++){
		const a = p[i], b = p[(i + 1) % p.length];
		len += Math.hypot(b[0] - a[0], b[1] - a[1]);
	}
	return len;
}

// Evenly spaced points around a closed polyline.
function resample(p, step){
	const total = loopLength(p);
	const n = Math.round(total / step);
	const ds = total / n;
	const out = [];
	let seg = 0, segStart = 0;
	let segLen = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
	for(let k = 0; k < n; k++){
		const s = k * ds;
		while(s > segStart + segLen && seg < p.length - 1){
			segStart += segLen;
			seg++;
			const a = p[seg], b = p[(seg + 1) % p.length];
			segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
		}
		const a = p[seg], b = p[(seg + 1) % p.length];
		const f = segLen > 0 ? (s - segStart) / segLen : 0;
		out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
	}
	return { pts: out, ds };
}

// Douglas-Peucker on an open polyline.
function simplify(pts, tol){
	if(pts.length < 3) return pts.slice();
	const keep = new Uint8Array(pts.length);
	keep[0] = keep[pts.length - 1] = 1;
	const stack = [[0, pts.length - 1]];
	while(stack.length){
		const [a, b] = stack.pop();
		const [ax, az] = pts[a], [bx, bz] = pts[b];
		const len = Math.hypot(bx - ax, bz - az) || 1e-9;
		let best = -1, bestD = tol;
		for(let i = a + 1; i < b; i++){
			const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
			if(d > bestD){ bestD = d; best = i; }
		}
		if(best >= 0){
			keep[best] = 1;
			stack.push([a, best], [best, b]);
		}
	}
	return pts.filter((_, i) => keep[i]);
}

// Grid lookup of centreline samples by position.
// (Cells are keyed by a number, not a string: this is asked millions of times when a world is built.)
const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
function makeHash(xs, zs, cell){
	const map = new Map();
	for(let i = 0; i < xs.length; i++){
		const k = cellKey(Math.floor(xs[i] / cell), Math.floor(zs[i] / cell));
		if(!map.has(k)) map.set(k, []);
		map.get(k).push(i);
	}
	return {
		cell,
		near(x, z, r, fn){
			const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell);
			const d0 = Math.floor((z - r) / cell), d1 = Math.floor((z + r) / cell);
			for(let cx = c0; cx <= c1; cx++)
				for(let cz = d0; cz <= d1; cz++){
					const list = map.get(cellKey(cx, cz));
					if(list) for(const i of list) fn(i);
				}
		},
		// Is any sample closer than r to (x, z)? The same as asking near() and measuring, without the callbacks.
		within(x, z, r){
			const r2 = r * r;
			const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell);
			const d0 = Math.floor((z - r) / cell), d1 = Math.floor((z + r) / cell);
			for(let cx = c0; cx <= c1; cx++)
				for(let cz = d0; cz <= d1; cz++){
					const list = map.get(cellKey(cx, cz));
					if(list) for(let q = 0; q < list.length; q++){ const i = list[q], dx = xs[i] - x, dz = zs[i] - z; if(dx * dx + dz * dz < r2) return true; }
				}
			return false;
		}
	};
}

// The original physics bounces cars off walls in a way that can shove them through
// the next wall on a very tight bend, so no corner may be tighter than `minR`.
// Relaxes offending points towards their neighbours until everything is wide enough.
function openTightCorners(pts, minRAt){
	const n = pts.length, k = 3;
	const p = pts.map(q => [q[0], q[1]]);
	const radius = i => {
		const a = p[(i - k + n) % n], b = p[i], c = p[(i + k) % n];
		const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
		const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
		return cross < 1e-9 ? Infinity : ab * bc * ca / (2 * cross);
	};
	for(let iter = 0; iter < 400; iter++){
		let moved = 0;
		for(let i = 0; i < n; i++){
			if(i < 30 || i > n - 30) continue;       // leave the start straight alone
			if(radius(i) >= minRAt(i / n)) continue;
			const a = p[(i - k + n) % n], c = p[(i + k) % n];
			for(let j = -1; j <= 1; j++){
				const q = p[(i + j + n) % n], f = j ? 0.15 : 0.35;
				q[0] += ((a[0] + c[0]) / 2 - q[0]) * f;
				q[1] += ((a[1] + c[1]) / 2 - q[1]) * f;
			}
			moved++;
		}
		if(!moved) break;
	}
	return p;
}

function circDist(a, b, n){
	const d = Math.abs(a - b) % n;
	return Math.min(d, n - d);
}

export function buildCircuit(def, reverse = false){
	let src = def.px ? def.px.map(p => [p[0] / 100, -p[1] / 100]) : def.pts.map(p => [p[0], p[1]]);
	let elevSrc = def.elev ? def.elev.slice() : null, camberSrc = def.camber ? def.camber.slice() : null;
	if(reverse){
		src = [src[0], ...src.slice(1).reverse()];
		if(elevSrc) elevSrc = [elevSrc[0], ...elevSrc.slice(1).reverse()];
		if(camberSrc) camberSrc = [camberSrc[0], ...camberSrc.slice(1).reverse()];
	}

	// Map coords (x east, y north) -> world before alignment: X = -east so that a
	// top-down view drawn with screen-x = -X comes out the right way round.
	const dense = smoothLoop(src);
	const scale = def.length / loopLength(dense);
	const pre = dense.map(p => [-p[0] * scale, p[1] * scale]);
	const hw = def.width / 2;
	// Corners tighter than this are opened up so the car fits round (def.tight: stretches of the
	// lap, as fractions, that keep more of their real tightness, like the Monaco hairpin).
	const roomAt = f => {
		for(const [a, b, room] of def.tight || []){
			const [fa, fb] = reverse ? [1 - b, 1 - a] : [a, b];
			if(f >= fa && f <= fb) return hw + room;
		}
		return hw + (def.cornerRoom ?? 5);
	};
	const { pts } = resample(openTightCorners(resample(pre, STEP).pts, roomAt), STEP);
	const n = pts.length;

	// Rotate so the start points +z, then move the start line to (0, START_Z).
	const tx0 = pts[1][0] - pts[n - 1][0], tz0 = pts[1][1] - pts[n - 1][1];
	const rot = Math.PI / 2 - Math.atan2(tz0, tx0);
	const cr = Math.cos(rot), sr = Math.sin(rot);
	const ox = pts[0][0], oz = pts[0][1];
	const xs = new Float64Array(n), zs = new Float64Array(n);
	for(let i = 0; i < n; i++){
		const x = pts[i][0] - ox, z = pts[i][1] - oz;
		xs[i] = x * cr - z * sr;
		zs[i] = x * sr + z * cr + START_Z;
	}
	xs[0] = 0; zs[0] = START_Z;
	const toMap = (x, z) => {
		const px = x, pz = z - START_Z;
		const ux = px * cr + pz * sr, uz = -px * sr + pz * cr;
		return [-(ux + ox), uz + oz];
	};
	const fromMap = (mx, my) => {
		const ux = -mx - ox, uz = my - oz;
		return [ux * cr - uz * sr, ux * sr + uz * cr + START_Z];
	};

	// Tangents, left normals and signed curvature (positive = left-hander).
	const tx = new Float64Array(n), tz = new Float64Array(n), heading = new Float64Array(n), curv = new Float64Array(n);
	for(let i = 0; i < n; i++){
		const a = (i - 1 + n) % n, b = (i + 1) % n;
		const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
		tx[i] = dx / l; tz[i] = dz / l;
		heading[i] = Math.atan2(tx[i], tz[i]);
	}
	for(let i = 0; i < n; i++){
		const a = (i - 4 + n) % n, b = (i + 4) % n;
		let dh = heading[b] - heading[a];
		while(dh > Math.PI) dh -= Math.PI * 2;
		while(dh < -Math.PI) dh += Math.PI * 2;
		curv[i] = dh / (8 * STEP);
	}

	const hash = makeHash(xs, zs, 8);

	// Elevation and camber (looks only: the handling is flat, as always).
	// h[i]: road height at sample i. bank[i]: how much the road rises per unit to the left.
	let h = null, bank = null, features = null;
	if(elevSrc){
		// Heights are given per source point; spread them round the lap by distance.
		const cum = [0];
		for(let i = 1; i <= src.length; i++){ const a = src[i - 1], b = src[i % src.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
		const total = cum[src.length];
		const raw = new Float64Array(n), camber = new Float64Array(n);
		for(let i = 0, j = 0; i < n; i++){
			const d = i / n * total;
			while(j < src.length - 1 && cum[j + 1] <= d) j++;
			const f = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
			raw[i] = (elevSrc[j] + (elevSrc[(j + 1) % src.length] - elevSrc[j]) * f) * scale;
			if(camberSrc) camber[i] = camberSrc[j] + (camberSrc[(j + 1) % src.length] - camberSrc[j]) * f;
		}
		h = new Float32Array(n);
		for(let i = 0; i < n; i++){
			let sum = 0, w = 0;
			for(let o = -10; o <= 10; o++){ const ww = 11 - Math.abs(o); sum += raw[(i + o + n) % n] * ww; w += ww; }
			h[i] = sum / w;
		}
		// Camber only on the corners that really have it (def.camber: how much the road rises per
		// unit to the left, in the race direction). Level elsewhere. Reversed, left and right swap.
		bank = new Float32Array(n);
		if(camberSrc) for(let i = 0; i < n; i++) bank[i] = reverse ? -camber[i] : camber[i];
		const frac = f => { const v = reverse ? (1 - f) % 1 : f; return Math.round(v * n) % n; };
		features = {};
		if(def.tunnel){ const [a, b] = def.tunnel.map(frac); features.tunnel = reverse ? [b, a] : [a, b]; }
		if(def.bridge){
			// [lower road, upper road]: start from the given fractions, then find where the two
			// pieces of road actually cross (the fractions are only roughly placed).
			let [lo, up] = def.bridge.map(frac), best = Infinity;
			for(let a = -60; a <= 60; a++) for(let b = -60; b <= 60; b++){
				const i = (lo + a + n) % n, j = (up + b + n) % n, d = (xs[i] - xs[j]) ** 2 + (zs[i] - zs[j]) ** 2;
				if(d < best){ best = d; features.bridge = [i, j]; }
			}
			if(h[features.bridge[0]] > h[features.bridge[1]]) features.bridge.reverse();
		}
	}

	// Distance from (x, z) to the nearest bit of road that isn't near sample `self`.
	function clearOfOtherRoad(x, z, self, window, limit){
		let ok = true;
		hash.near(x, z, limit, j => {
			if(ok && (self < 0 || circDist(j, self, n) > window) && Math.hypot(xs[j] - x, zs[j] - z) < limit) ok = false;
		});
		return ok;
	}

	// A lap that uses the same road twice (Monza's GP + oval, down the main straight twice): the second
	// time along it (dup) is the same road as the first time (pair), so it has no walls of its own.
	let dup = null, pair = null;
	for(let i = 0; i < n; i++){
		hash.near(xs[i], zs[i], 1.5, j => {
			if(j >= i || circDist(i, j, n) < 200 || Math.hypot(xs[j] - xs[i], zs[j] - zs[i]) >= 1.5 || tx[i] * tx[j] + tz[i] * tz[j] < 0.9) return;
			if(h && Math.abs(h[i] - h[j]) > 1) return;
			if(!dup){ dup = new Uint8Array(n); pair = new Int32Array(n).fill(-1); }
			if(pair[i] < 0){ dup[i] = 1; pair[i] = j; }
		});
	}
	// Both edges; drop edge points that sit on top of another piece of road
	// (tight inside corners and the figure-8 crossings), leaving gaps in the wall.
	const sides = [[], []], keep = [new Uint8Array(n), new Uint8Array(n)];
	const clearOfRoad = (x, z) => {
		if(!dup) return clearOfOtherRoad(x, z, -1, 0, hw - 0.35);
		let ok = true;
		hash.near(x, z, hw - 0.35, j => { if(ok && !dup[j] && Math.hypot(xs[j] - x, zs[j] - z) < hw - 0.35) ok = false; });
		return ok;
	};
	for(let i = 0; i < n; i++){
		const nx = tz[i], nz = -tx[i];
		const L = [xs[i] + nx * hw, zs[i] + nz * hw, i], R = [xs[i] - nx * hw, zs[i] - nz * hw, i];   // (x, z, sample)
		sides[0].push(L); sides[1].push(R);
		keep[0][i] = !(dup && dup[i]) && clearOfRoad(L[0], L[1]) ? 1 : 0;
		keep[1][i] = !(dup && dup[i]) && clearOfRoad(R[0], R[1]) ? 1 : 0;
	}

	const walls = [], wallSegs = [];
	for(let s = 0; s < 2; s++){
		const runs = [];
		let startIdx = -1;
		for(let i = 0; i < n; i++) if(!keep[s][i]){ startIdx = i; break; }
		if(startIdx < 0){
			// Unbroken loop: split in two so the simplifier has distinct end points.
			const half = n >> 1;
			runs.push(sides[s].slice(0, half + 1), [...sides[s].slice(half), sides[s][0]]);
		}else{
			let run = [];
			for(let k = 1; k <= n; k++){
				const i = (startIdx + k) % n;
				if(keep[s][i]) run.push(sides[s][i]);
				else if(run.length){ runs.push(run); run = []; }
			}
			if(run.length) runs.push(run);
		}
		for(const run of runs){
			if(run.length < 3) continue;
			const simp = simplify(run, def.wallTol ?? WALL_TOL_REF());
			for(let k = 0; k < simp.length - 1; k++){
				const [x1, z1] = simp[k], [x2, z2] = simp[k + 1];
				if(Math.hypot(x2 - x1, z2 - z1) < 0.05) continue;
				walls.push(wallFromWorld(x1, z1, x2, z2));
				wallSegs.push([x1, z1, x2, z2, s, simp[k][2], simp[k + 1][2]]);   // (side, first and last sample)
			}
		}
	}

	// A bridge: where the two roads overlap, each road's edges were left open above. Give both
	// roads their barriers back there, each on its own level (lvl: road height), so a barrier
	// only stops cars on its own road: the parapets on the bridge, the walls underneath.
	if(features && features.bridge){
		for(const at of features.bridge){
			for(let s = 0; s < 2; s++){
				let run = [];
				const flush = () => {
					if(run.length >= 2){
						const simp = simplify(run, 0.3);
						for(let k = 0; k < simp.length - 1; k++){
							const [x1, z1, i1] = simp[k], [x2, z2, i2] = simp[k + 1];
							if(Math.hypot(x2 - x1, z2 - z1) < 0.05) continue;
							const lvl = (h[i1] + h[i2]) / 2;
							walls.push(Object.assign(wallFromWorld(x1, z1, x2, z2), { lvl }));
							wallSegs.push([x1, z1, x2, z2, s, i1, i2, lvl]);
						}
					}
					run = [];
				};
				for(let o = -60; o <= 60; o++){
					const i = (at + o + n) % n;
					if(keep[s][i]){ if(run.length){ run.push(sides[s][i]); flush(); } continue; }
					if(!run.length){ const p = (i - 1 + n) % n; run.push(sides[s][p]); }
					run.push(sides[s][i]);
				}
				flush();
			}
		}
	}

	// Start line plus evenly spaced hidden sector lines, nudged away from crossings.
	const lineAt = i => {
		const nx = tz[i], nz = -tx[i];
		return lineFromWorld(xs[i] + nx * hw, zs[i] + nz * hw, xs[i] - nx * hw, zs[i] - nz * hw);
	};
	const lines = [lineAt(0)], lineIdx = [0];
	for(let k = 1; k <= CHECKPOINTS; k++){
		let i = Math.round(n * k / (CHECKPOINTS + 1));
		for(let tries = 0; tries < 60 && !clearOfOtherRoad(xs[i], zs[i], i, def.width * 3, def.width + 2); tries++)
			i = (i + 5) % n;
		lines.push(lineAt(i));
		lineIdx.push(i);
	}

	// Kerbs on the inside of anything tighter than ~50 units radius.
	const kerbs = [];
	let cur = null;
	for(let i = 0; i < n; i++){
		const side = curv[i] > 1 / 50 ? 0 : curv[i] < -1 / 50 ? 1 : -1;
		if(side >= 0 && keep[side][i]){
			if(cur && cur.side === side && cur.end === i - 1) cur.end = i;
			else { cur = { side, start: i, end: i }; kerbs.push(cur); }
		}
	}

	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, far = 0;
	for(const [x1, z1, x2, z2] of wallSegs){
		for(const [x, z] of [[x1, z1], [x2, z2]]){
			minX = Math.min(minX, x); maxX = Math.max(maxX, x);
			minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
			far = Math.max(far, Math.hypot(x, z));
		}
	}

	const pinches = [];
	for(let i = 0; i < n; i += 4){
		hash.near(xs[i], zs[i], def.width + 3, j => {
			if(j > i && circDist(i, j, n) > def.width * 4 && Math.hypot(xs[j] - xs[i], zs[j] - zs[i]) < def.width + 3) pinches.push([i, j]);
		});
	}

	const track = {
		pinches,
		id: (def.key || def.id) + (reverse ? "-rev" : ""), def, reverse, kind: "circuit",
		walls, lines, lineIdx, wallSegs,
		center: { x: xs, z: zs, tx, tz, curv, n, len: n * STEP, step: STEP, hw, hash, h, bank, dup, pair },
		elevated: !!h, features,
		hash, kerbs, sides, keep, toMap, fromMap, mapScale: scale,
		bounds: { minX, maxX, minZ, maxZ },
		oob: far + 40,
		mountainDist: far + 120,
		laps: def.laps
	};
	track.heightAt = h ? (x, z, hint = -1) => roadHeight(track.center, x, z, hint) : () => 0;
	track.lastSample = () => roadHeight.last;
	track.scenery = makeScenery(track);
	return track;
}

// Height of the road surface at (x, z): the centreline height plus the camber across it.
// Also gives the nearest sample, which callers can pass back as the next hint.
function roadHeight(c, x, z, hint){
	const i = nearestOnPath(c, x, z, hint);
	// Interpolate along the piece of road the point is on (the one behind the nearest sample
	// if it's behind it), so the height is continuous and cars don't twitch at each sample.
	const along = (x - c.x[i]) * c.tx[i] + (z - c.z[i]) * c.tz[i];
	const a = along >= 0 ? i : (i - 1 + c.n) % c.n, b = (a + 1) % c.n;
	const f = Math.max(0, Math.min(1, along >= 0 ? along / c.step : 1 + along / c.step));
	const base = c.h[a] + (c.h[b] - c.h[a]) * f;
	const bank = c.bank[a] + (c.bank[b] - c.bank[a]) * f;
	const lat = (x - c.x[i]) * c.tz[i] - (z - c.z[i]) * c.tx[i];
	const clamped = Math.max(-c.hw - 1, Math.min(c.hw + 1, lat));
	roadHeight.last = i;
	return base + clamped * bank;
}
export function lastRoadSample(){ return roadHeight.last; }

// Random spots off the track for trees, buildings and so on. Deterministic per track.
function makeScenery(track){
	const c = track.center, rand = seededRandom(track.id);
	const out = [];
	const want = Math.round(c.len / 5);
	for(let tries = 0; out.length < want && tries < want * 12; tries++){
		const i = Math.floor(rand() * c.n);
		const side = rand() < 0.5 ? 1 : -1;
		const off = c.hw + 6 + Math.pow(rand(), 1.6) * 70;
		const x = c.x[i] + c.tz[i] * off * side, z = c.z[i] - c.tx[i] * off * side;
		let ok = true;
		track.hash.near(x, z, c.hw + 5, j => {
			if(ok && Math.hypot(c.x[j] - x, c.z[j] - z) < c.hw + 5) ok = false;
		});
		if(!ok) continue;
		out.push({ x, z, off: off - c.hw, i, side, r: rand(), r2: rand(), face: Math.atan2(-c.tz[i] * side, c.tx[i] * side) });
	}
	return out;
}

// Original-format track codes: the Classic track and anything from the editor.
export function parseTrackCode(code, id = "custom"){
	const parts = String(code).replace(/<br\s*\/?>/gi, " ").trim().split("|");
	if(parts.length < 2) throw new Error("That doesn't look like a track code.");
	const nums = s => (s || "").trim().split(/\s+/).filter(Boolean);
	const walls = [], wallSegs = [], lines = [];
	for(const t of nums(parts[0])){
		const [a, b] = t.split("/");
		if(!b) continue;
		const [x1, y1] = a.split(",").map(parseFloat), [x2, y2] = b.split(",").map(parseFloat);
		if([x1, y1, x2, y2].some(isNaN)) continue;
		walls.push(wallFromTrackUnits(x1, y1, x2, y2));
		wallSegs.push([-x1 * MAP_SCALE, y1 * MAP_SCALE, -x2 * MAP_SCALE, y2 * MAP_SCALE, 0]);
	}
	for(const t of nums(parts[1])){
		const [a, b] = t.split("/");
		if(!b) continue;
		const [x1, y1] = a.split(",").map(parseFloat), [x2, y2] = b.split(",").map(parseFloat);
		if([x1, y1, x2, y2].some(isNaN)) continue;
		lines.push(lineFromTrackUnits(x1, y1, x2, y2));
	}
	if(!walls.length) throw new Error("That track code has no walls.");
	if(!lines.length) throw new Error("That track code has no start line.");

	const rand = seededRandom(id + ":" + code.length);
	const trees = nums(parts[2]).map(t => {
		const [x, y] = t.split(",").map(parseFloat);
		return { x: -x * MAP_SCALE, z: y * MAP_SCALE, s: rand() + 1 };
	}).filter(t => !isNaN(t.x + t.z));
	const signs = nums(parts[3]).map(t => {
		const [p, deg] = t.split("/");
		const [x, y, z] = (p || "").split(",").map(parseFloat);
		return { x: -x * MAP_SCALE, y: y + 1, z: z * MAP_SCALE, rot: parseFloat(deg) / 180 * Math.PI };
	}).filter(s => !isNaN(s.x + s.y + s.z + s.rot));

	// Old track codes could carry JavaScript "mods". We only read a few harmless
	// settings from them. Handling settings (SPEED, BOUNCE...) are left alone on purpose.
	const settings = { LAPS: 3, OOB_DIST: 200, MOUNTAIN_DIST: 250 };
	const mods = parts[4] || "";
	for(const m of mods.matchAll(/\b(LAPS|OOB_DIST|MOUNTAIN_DIST)\s*(\*=|=)\s*([\d.]+)/g)){
		const v = parseFloat(m[3]);
		if(!isFinite(v)) continue;
		settings[m[1]] = m[2] === "*=" ? settings[m[1]] * v : v;
	}
	settings.LAPS = Math.max(1, Math.min(20, Math.round(settings.LAPS)));

	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for(const [x1, z1, x2, z2] of wallSegs){
		minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
		minZ = Math.min(minZ, z1, z2); maxZ = Math.max(maxZ, z1, z2);
	}
	return {
		id, kind: "code", code, walls, lines, wallSegs, trees, signs,
		center: null,
		toMap: (x, z) => [-x, z],
		fromMap: (mx, my) => [-mx, my],
		bounds: { minX, maxX, minZ, maxZ },
		oob: settings.OOB_DIST,
		mountainDist: settings.MOUNTAIN_DIST,
		laps: settings.LAPS
	};
}

export function buildTrack(def, reverse = false){
	if(def.code) return Object.assign(parseTrackCode(def.code, def.id), { def, name: def.name });
	return Object.assign(buildCircuit(def, reverse), { name: def.name });
}

// Nearest sample of a centreline or racing line to (x, z), searching near `hint` first.
export function nearestSample(track, x, z, hint){
	return nearestOnPath(track.center, x, z, hint);
}

export function nearestOnPath(c, x, z, hint){
	let best = -1, bestD = Infinity;
	if(hint >= 0){
		for(let k = -40; k <= 40; k++){
			const i = (hint + k + c.n) % c.n;
			const d = (c.x[i] - x) ** 2 + (c.z[i] - z) ** 2;
			if(d < bestD){ bestD = d; best = i; }
		}
		if(bestD < (c.hw * 2) ** 2) return best;
	}
	c.hash.near(x, z, 40, i => {
		const d = (c.x[i] - x) ** 2 + (c.z[i] - z) ** 2;
		if(d < bestD){ bestD = d; best = i; }
	});
	if(best < 0){
		for(let i = 0; i < c.n; i++){
			const d = (c.x[i] - x) ** 2 + (c.z[i] - z) ** 2;
			if(d < bestD){ bestD = d; best = i; }
		}
	}
	return best;
}

// How many cars a track's start holds: the places up to the first one that would start in a wall. A track from the original's
// code has no road data to check against, so it keeps the original's 18.
export function gridCapacity(track){
	if(!track.center) return 18;
	const bad = badGridSlots(track, GRID.length);
	return bad.length ? Math.max(2, bad[0]) : GRID.length;
}

// Grid slots that would start inside a wall (used by the track test).
export function badGridSlots(track, count = GRID.length){
	if(!track.center) return [];
	const bad = [];
	for(let k = 0; k < count; k++){
		const g = GRID[k];
		const i = nearestSample(track, g.x, g.y, 0);
		const c = track.center;
		const lateral = Math.abs((g.x - c.x[i]) * c.tz[i] - (g.y - c.z[i]) * c.tx[i]);
		if(lateral > c.hw - 1.8) bad.push(k);
	}
	return bad;
}
