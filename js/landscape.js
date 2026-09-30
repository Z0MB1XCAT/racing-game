// The real landscape round a circuit, from OpenStreetMap (js/places/<venue>.js, see placegeo.js):
// every building at its real size and height, in the colours of the place (Monaco's pastel
// apartment blocks, Monza's ochre villas, Spa's slate-roofed farmhouses), forests where the map
// has forest, the park's and the streets' own trees, the streets, railways, piers, big wheels and a
// few landmarks (the Casino, the Yacht Club, the palace on the Rock, the Stade Nautique's pool).
// Anything that would touch the road, or something already placed, is left out.
import { inPoly } from "./placegeo.js";
import { roadField } from "./roadfield.js";
import { instantiate } from "./assets.js";
import { shuffled } from "./scenery.js";
const THREE = globalThis.THREE;

// Colours by the kind of place (P.town).
const WALLS = {
	city: [0xf0dcc0, 0xe9c9a4, 0xf3e7d3, 0xe7b8a0, 0xf6efe2, 0xdcc8a8, 0xe8d2b0, 0xd9b48f, 0xf2e4c9, 0xeadbd0],
	town: [0xe9d9b0, 0xdcb98a, 0xf0e6d0, 0xcfa47a, 0xe8cfa6, 0xd8d0c0, 0xc98d6a, 0xefe0c2],
	village: [0xefece4, 0xe0dbd0, 0xcfc6b6, 0xb5a693, 0x9d8e80, 0xd9d4ca, 0xe8e2d4],
	japan: [0xefefeb, 0xdedcd6, 0xcbc8c0, 0xb9bcc0, 0xe6dfd0, 0xa9aeb4, 0xd6d0c4]
};
const PITCHED = {
	city: [0xb5583a, 0xa84f36, 0xc0694a, 0x9e4a33],
	town: [0xb35a3c, 0xa24e35, 0xc4704f, 0x9c5238],
	village: [0x4a4f57, 0x3f444c, 0x55595f, 0x7a3e30, 0x5e4a3e],
	japan: [0x4c5866, 0x5b6470, 0x3f4650, 0x6d4a3a, 0x556b5a]
};
const FLAT = [0xb8b0a2, 0xa9a49a, 0xc4bfb4, 0x9fa3a8];
const SHEDS = [0xc9ccd0, 0xb8bcc2, 0xdad7cf, 0x8f9aa3, 0xa7b0a0];
// Trees by venue: [kind, share] (kinds as buildTrees in scenery.js).
const WOODS = { village: [["pine", 0.7], ["round", 0.3]], town: [["round", 1]], japan: [["round", 0.6], ["pine", 0.4]], city: [["round", 0.75], ["palm", 0.25]] };

// The smallest box round an outline: centre, size along its long side (w) and across (d), turn.
function orientedBox(pts){
	let best = null;
	for(let i = 0; i < pts.length; i++){
		const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if(L < 0.3) continue;
		const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
		let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
		for(const [x, z] of pts){ const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
		const A = (u1 - u0) * (v1 - v0);
		if(!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
	}
	if(!best) return null;
	let { ux, uz, u0, u1, v0, v1 } = best;
	const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
	const cx = um * ux - vm * uz, cz = um * uz + vm * ux;
	let w = u1 - u0, d = v1 - v0;
	// (The ridge runs along the long side.)
	if(w < d){ [w, d] = [d, w]; [ux, uz] = [-uz, ux]; }
	// Builder's local x runs along (cos ry, -sin ry).
	return { cx, cz, w, d, ry: Math.atan2(-uz, ux) };
}
const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };

export function buildLandscape(geo, ctx){
	const { track, theme, B, G, sp, place, c, n, rand, group, keep, shadows, low, buildTrees } = ctx;
	const { P, S } = geo;
	const town = P.town || "town";
	const walls = WALLS[town], pitched = PITCHED[town];
	const out = { wheels: [], trees: 0, clumps: 0, buildings: 0 };
	const centre = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
	const clearOf = (pts, m) => pts.every(([x, z]) => sp.edge(x, z, m + 1) >= m);
	// Road running through an outline (a big building the road passes, or crosses)?
	const roadInside = pts => {
		const [cx, cz] = centre(pts), r = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
		let hit = false;
		c.hash.near(cx, cz, r + 1, j => { if(!hit && inPoly(pts, c.x[j], c.z[j])) hit = true; });
		if(!hit && track.remnantSpace) track.remnantSpace.near(cx, cz, r + 1, p => { if(!hit && inPoly(pts, p.x, p.z)) hit = true; });
		return hit;
	};
	const pick = (list, x, z) => list[Math.floor(hash(x, z) * list.length) % list.length];
	// The nearest bit of road (the track's centreline, or a closed-off road's) to (x, z), within r.
	const nearestRoad = (x, z, r) => {
		let best = r, hit = null;
		c.hash.near(x, z, r, j => { const d = Math.hypot(c.x[j] - x, c.z[j] - z); if(d < best){ best = d; hit = [c.x[j], c.z[j]]; } });
		if(track.remnantSpace) track.remnantSpace.near(x, z, r, p => { const d = Math.hypot(p.x - x, p.z - z); if(d < best){ best = d; hit = [p.x, p.z]; } });
		return hit;
	};
	const winCell = [3.3 * S, 3.1 * S];
	// (Distances to the road from a grid worked out once: see roadfield.js.)
	const field = roadField(track);

	// ----- Buildings -----
	const marks = [];
	let bi = 0;
	for(const b of P.buildings){
		let pts = geo.solid(b.p);
		if(pts.length < 3) continue;
		// (On low quality, the little buildings well away from the track are left out.)
		if(low && !b.m && b.k !== "stand" && pts.length <= 8 && b.h * S < 12 && field.dist(pts[0][0], pts[0][1]) > 160){
			let A = 0;
			for(let i = 0, j = pts.length - 1; i < pts.length; j = i++) A += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
			if(Math.abs(A / 2) < 60) continue;
		}
		if(roadInside(pts)) continue;
		// A building that only just reaches the (wider) road is nudged back from it, a few units at most.
		for(let tries = 0; tries < 3 && !clearOf(pts, 1.6); tries++){
			let worst = null, wd = Infinity;
			for(const [x, z] of pts){ const d = sp.edge(x, z, 8); if(d < wd){ wd = d; worst = [x, z]; } }
			const r = nearestRoad(worst[0], worst[1], c.hw + 8);
			if(!r || wd < -5) break;
			const dx = worst[0] - r[0], dz = worst[1] - r[1], L = Math.hypot(dx, dz) || 1, move = 1.6 - wd + 0.3;
			pts = pts.map(([x, z]) => [x + dx / L * move, z + dz / L * move]);
		}
		if(!clearOf(pts, 1.6) || roadInside(pts)) continue;
		const [cx, cz] = centre(pts);
		const rad = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
		// (Real buildings stand wall to wall without overlapping: they only give way to what's
		// placed round the track, like the pits and grandstands.)
		const id = "realb";
		bi++;
		if(!sp.free(cx, cz, rad * 0.6, id)) continue;
		if(b.k === "stand" && geo.standsBuilt && sp.edge(cx, cz, 40) < 30) continue;   // (built as real seating along the track instead)
		const h = Math.max(2.5, b.h * S);
		let gmin = Infinity;
		for(const [x, z] of pts) gmin = Math.min(gmin, G(x, z));
		const top = G(cx, cz) + h, y0 = gmin - 1.2;
		const box = orientedBox(pts);
		if(b.m){ marks.push({ b, pts, cx, cz, top, y0, box }); }
		else if(b.k === "shed" || b.k === "roof"){
			const col = b.c ?? pick(SHEDS, cx, cz);
			if(b.k === "roof") B.prism(pts, top - 0.35 * Math.max(1, S * 2), 0.35 * Math.max(1, S * 2), col, null, col);
			else B.prism(pts, y0, top - y0, col, null, pick(FLAT, cz, cx));
		}else if(b.k === "stand" && box){
			stepped(box, h);
		}else if(b.k === "tower"){
			B.prism(pts, y0, top - y0, b.c ?? pick([0x7d93a8, 0x8aa2b3, 0xc9ced4], cx, cz), [winCell[0] * 0.7, winCell[1]], 0x2a3440);
		}else{
			const wall = b.c ?? pick(walls, cx, cz);
			const small = box && box.w < 34 * S && box.d < 22 * S;
			const gable = box && (b.k === "house" || b.k === "church" || b.g || (town !== "city" && small && h < 12 * S));
			B.prism(pts, y0, top - y0, wall, [winCell[0], winCell[1]], b.r ?? pick(FLAT, cx, cz));
			if(gable){
				const rh = Math.min(box.d * 0.42, 5 * S + box.d * 0.2);
				B.roof({ x: box.cx, z: box.cz, y: top - G(box.cx, box.cz), w: box.w + 0.5 * S, d: box.d + 0.5 * S, h: rh, ry: box.ry, color: b.r ?? pick(pitched, cz, cx), gable: wall });
			}
			if(b.k === "church" && box){
				// A bell tower at one end, with a spire.
				const cs = Math.cos(box.ry), sn = Math.sin(box.ry), ex = box.cx + cs * box.w * 0.42, ez = box.cz - sn * box.w * 0.42, tw = Math.max(1.2, Math.min(box.d * 0.5, 5 * S));
				const th = top - G(ex, ez) + 9 * S;
				B.box({ x: ex, z: ez, w: tw, d: tw, h: th, ry: box.ry, color: wall, top: 0x4a4f57 });
				B.roof({ x: ex, z: ez, y: th, w: tw * 0.05 + 0.01, d: tw, h: 7 * S, ry: box.ry, color: 0x4a4f57 });
				B.roof({ x: ex, z: ez, y: th, w: tw * 0.05 + 0.01, d: tw, h: 7 * S, ry: box.ry + Math.PI / 2, color: 0x4a4f57 });
			}
		}
		place({ x: cx, z: cz, ry: 0, hw: rad * 0.75, hd: rad * 0.75, y0: -1, y1: top - G(cx, cz) });
		sp.take(cx, cz, rad * 0.75, id);
		out.buildings++;
	}

	// ----- Real grandstands: stepped seating (full of fans) facing the nearest road, a back wall and a roof -----
	function stepped(box, h){
		const cs = Math.cos(box.ry), sn = Math.sin(box.ry), vx = sn, vz = cs;              // (local z: across the stand)
		const at = (u, v) => [box.cx + cs * u + sn * v, box.cz - sn * u + cs * v];
		const [fx, fz] = at(0, box.d / 2), [bx, bz] = at(0, -box.d / 2);
		const fs = sp.edge(fx, fz, 60) <= sp.edge(bx, bz, 60) ? 1 : -1;                 // (which long side faces the road)
		const rows = Math.max(3, Math.min(18, Math.round(box.d / 1.4))), rowD = box.d / rows, rise = Math.max(0.5, h * 0.72 / rows);
		const standColor = theme.standColor ?? 0x2f63c9, ry = Math.atan2(vx * fs, vz * fs);
		for(let k = 0; k < rows; k++){
			const [x, z] = at(0, fs * (box.d / 2 - (k + 0.5) * rowD)), topk = 0.6 + (k + 1) * rise;
			B.box({ x, z, w: box.w, d: rowD + 0.02, h: topk, ry: box.ry, color: k % 2 ? 0x9aa1ab : 0x8d939e, top: standColor });
			if(ctx.people && ctx.people.length < 9000) for(let u = -box.w / 2 + 0.4; u < box.w / 2 - 0.3; u += 0.72){
				if(rand() > (ctx.fill ?? 0.8)) continue;
				const [qx, qz] = at(u + (rand() - 0.5) * 0.15, fs * (box.d / 2 - (k + 0.5) * rowD));
				ctx.people.push({ x: qx, y: G(qx, qz) + topk, z: qz, ry: ry + (rand() - 0.5) * 0.5 });
			}
		}
		const [wx, wz] = at(0, -fs * (box.d / 2 - 0.2)), topY = 0.6 + rows * rise;
		B.box({ x: wx, z: wz, w: box.w, d: 0.4, h: topY + 3, ry: box.ry, color: 0xb9c0c9 });
		const [rx, rz] = at(0, 0);
		B.box({ x: rx, z: rz, y: topY + 2.8, w: box.w + 0.4, d: box.d + 0.8, h: 0.35, ry: box.ry, color: 0xe9edf2, top: 0xf4f6fa, bottom: true });
	}

	// ----- Landmarks (Monaco) -----
	for(const { b, pts, cx, cz, top, y0, box } of marks){
		if(b.m === "casino"){
			// Belle Époque: cream stone, a green copper roof, twin towers on the side facing the sea.
			B.prism(pts, y0, top - y0, 0xefe3c4, [winCell[0] * 1.4, winCell[1] * 1.3], 0x6fa596);
			if(box){
				const cs = Math.cos(box.ry), sn = Math.sin(box.ry);
				for(const f of [-0.42, 0.42]){
					const tx = box.cx + cs * box.w * f + sn * box.d * 0.38, tz = box.cz - sn * box.w * f + cs * box.d * 0.38, tw = Math.max(1.5, 7 * S);
					const th = top - G(tx, tz) + 8 * S;
					B.box({ x: tx, z: tz, w: tw, d: tw, h: th, ry: box.ry, color: 0xf2e8cf, top: 0x6fa596 });
					B.roof({ x: tx, z: tz, y: th, w: tw * 0.05 + 0.01, d: tw, h: 6 * S, ry: box.ry, color: 0x6fa596 });
					B.roof({ x: tx, z: tz, y: th, w: tw * 0.05 + 0.01, d: tw, h: 6 * S, ry: box.ry + Math.PI / 2, color: 0x6fa596 });
				}
				B.roof({ x: box.cx, z: box.cz, y: top - G(box.cx, box.cz), w: box.w * 0.6, d: box.d * 0.7, h: 6 * S, ry: box.ry, color: 0x6fa596, gable: 0x6fa596 });
			}
		}else if(b.m === "yachtclub"){
			// Decks stepping back like a ship's, all white.
			B.prism(pts, y0, top - y0 - 5 * S, 0xf6f7f9, [winCell[0], winCell[1]], 0xe9edf2);
			if(box) for(let k = 0; k < 2; k++) B.box({ x: box.cx, z: box.cz, y: top - G(box.cx, box.cz) - 5 * S + k * 2.5 * S, w: box.w * (0.8 - k * 0.2), d: box.d * (0.7 - k * 0.2), h: 2.5 * S, ry: box.ry, color: 0xf6f7f9, win: [winCell[0], winCell[1] * 0.8], top: 0xdfe4ea });
		}else if(b.m === "palace"){
			B.prism(pts, y0, top - y0, 0xecd9b9, [winCell[0] * 1.3, winCell[1] * 1.2], 0xc49a6c);
			// Battlements along the wall tops.
			for(let i = 0; i < pts.length; i++){
				const a = pts[i], d = pts[(i + 1) % pts.length], L = Math.hypot(d[0] - a[0], d[1] - a[1]);
				for(let t = 0.8; t < L; t += 2.2 * Math.max(0.5, S)){
					const x = a[0] + (d[0] - a[0]) * t / L, z = a[1] + (d[1] - a[1]) * t / L;
					B.box({ x, z, y: top - G(x, z), w: 0.9 * Math.max(0.5, S), d: 0.9 * Math.max(0.5, S), h: 1.2 * S, ry: Math.atan2(-(d[1] - a[1]), d[0] - a[0]), color: 0xecd9b9 });
				}
			}
		}else if(b.m === "grandhotel" || b.m === "hermitage"){
			// Belle Époque hotels: cream stone, a dark slate mansard roof, a dome on the corner.
			B.prism(pts, y0, top - y0, b.m === "hermitage" ? 0xf1e2c6 : 0xf4ecdc, [winCell[0] * 1.2, winCell[1] * 1.15], 0x5c6168);
			if(box){
				B.roof({ x: box.cx, z: box.cz, y: top - G(box.cx, box.cz), w: box.w * 0.92, d: box.d * 0.8, h: 4 * S, ry: box.ry, color: 0x5c6168, gable: 0x5c6168 });
				const cs = Math.cos(box.ry), sn = Math.sin(box.ry), tx = box.cx + cs * box.w * 0.44 + sn * box.d * 0.36, tz = box.cz - sn * box.w * 0.44 + cs * box.d * 0.36, tw = Math.max(1.4, 8 * S);
				const th = top - G(tx, tz) + 2 * S;
				B.box({ x: tx, z: tz, w: tw, d: tw, h: th, ry: box.ry, color: 0xf4ecdc, top: 0x6fa596 });
				B.roof({ x: tx, z: tz, y: th, w: tw * 0.05 + 0.01, d: tw, h: 7 * S, ry: box.ry, color: 0x6fa596 });
				B.roof({ x: tx, z: tz, y: th, w: tw * 0.05 + 0.01, d: tw, h: 7 * S, ry: box.ry + Math.PI / 2, color: 0x6fa596 });
			}
		}else B.prism(pts, y0, top - y0, 0xefe9de, [winCell[0], winCell[1]], 0xb8b0a2);
	}
	// The Stade Nautique's pool, by the harbour.
	if(P.marks && P.marks.pool){
		const pts = geo.ring(P.marks.pool.p);
		if(pts.length >= 3 && clearOf(pts, 0.5) && !roadInside(pts)){
			const [cx, cz] = centre(pts), y = G(cx, cz) + 0.06;
			B.flat(pts, y, 0xe9edf2);
			const inner = pts.map(([x, z]) => [cx + (x - cx) * 0.82, cz + (z - cz) * 0.82]);
			B.flat(inner, y + 0.02, 0x2fa6e0);
		}
	}

	// ----- Water (ponds, lakes, fountains): flat, where the ground there is flat enough -----
	for(const a of P.land || []){
		if(a.k !== "water" && a.k !== "pool") continue;
		const pts = geo.ring(a.p);
		if(pts.length < 3 || !clearOf(pts, 0.5) || roadInside(pts)) continue;
		let g0 = Infinity, g1 = -Infinity;
		for(const [x, z] of pts){ const g = G(x, z); g0 = Math.min(g0, g); g1 = Math.max(g1, g); }
		if(g1 - g0 > (a.k === "pool" ? 0.6 : 2.5)) continue;
		B.flat(pts, g1 + 0.06, a.k === "pool" ? 0x3aa7d8 : 0x3f7fa6);
	}

	// ----- Streets: asphalt following the ground, lamp posts in the towns -----
	const lamps = [];
	const lampGap = town === "city" ? 16 : town === "town" ? 22 : 0;
	const street = 0x4a4d53;
	for(const r of P.roads){
		const pts = geo.ring(r.p), wv = Math.max(1.4, r.w * S);
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			if(len < 0.2) continue;
			const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz * wv / 2, nz = ux * wv / 2;
			const steps = Math.max(1, Math.ceil(len / 4));
			for(let k = 0; k < steps; k++){
				const t0 = k / steps, t1 = (k + 1) / steps;
				const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
				const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
				// Leave out anything near the circuit (its own roads are part of the track), or in the water.
				if(sp.edge(mx, mz, wv + 6) < wv / 2 + 3 || (ctx.isWater && ctx.isWater(mx, mz))) continue;
				const q = (x, z) => [x, G(x, z) + 0.07, z];
				B.poly([q(x0 + nx, z0 + nz), q(x1 + nx, z1 + nz), q(x1 - nx, z1 - nz), q(x0 - nx, z0 - nz)], street);   // (counter-clockwise from above: facing up)
			}
			if(lampGap) for(let d = lampGap * 0.5; d < len; d += lampGap){
				const x = ax + ux * d + nx * 1.1, z = az + uz * d + nz * 1.1;
				if(sp.edge(x, z, 4) > 2.5 && !(ctx.isWater && ctx.isWater(x, z))) lamps.push({ x, z, y: G(x, z), ry: Math.atan2(nz, -nx) });
			}
		}
	}
	for(const r of P.rails || []){
		const pts = geo.ring(r), wv = Math.max(1, 4.5 * S);
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			if(len < 0.2) continue;
			const nx = -(bz - az) / len * wv / 2, nz = (bx - ax) / len * wv / 2, steps = Math.max(1, Math.ceil(len / 4));
			for(let k = 0; k < steps; k++){
				const t0 = k / steps, t1 = (k + 1) / steps;
				const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
				if(sp.edge((x0 + x1) / 2, (z0 + z1) / 2, wv + 4) < wv / 2 + 2) continue;
				const q = (x, z, up = 0.06) => [x, G(x, z) + up, z];
				B.poly([q(x0 + nx, z0 + nz), q(x1 + nx, z1 + nz), q(x1 - nx, z1 - nz), q(x0 - nx, z0 - nz)], 0x8a8074);
				for(const f of [-0.3, 0.3]) B.poly([q(x0 + nx * (f + 0.05), z0 + nz * (f + 0.05), 0.12), q(x1 + nx * (f + 0.05), z1 + nz * (f + 0.05), 0.12), q(x1 + nx * (f - 0.05), z1 + nz * (f - 0.05), 0.12), q(x0 + nx * (f - 0.05), z0 + nz * (f - 0.05), 0.12)], 0x55504a);
			}
		}
	}
	if(lamps.length){
		const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0xffc46b }));
		// The lamp post model (assets/models/lamp-post.glb: 8 m tall, its arm reaching over the street) where it's
		// loaded, else a pole and a box. (Never shorter than 2.2 units, so it still reads on a small map.)
		const size = Math.max(1, 2.2 / (8 * S));
		const model = instantiate("lamp-post", lamps.map(l => Object.assign({ s: size }, l)), { S, materials: { glow: glowMat }, quality: low ? "low" : "high" });
		if(model) group.add(model);
		else{
			const unit = keep(new THREE.BoxBufferGeometry(1, 1, 1));
			const pole = new THREE.InstancedMesh(unit, keep(new THREE.MeshLambertMaterial({ color: 0x5b6068 })), lamps.length);
			const head = new THREE.InstancedMesh(unit, glowMat, lamps.length);
			const m = new THREE.Matrix4(), ph = Math.max(2.2, 8 * S);
			lamps.forEach((l, i) => {
				m.makeScale(0.12, ph, 0.12); m.setPosition(l.x, l.y + ph / 2, l.z); pole.setMatrixAt(i, m);
				m.makeScale(0.45, 0.16, 0.45); m.setPosition(l.x, l.y + ph + 0.05, l.z); head.setMatrixAt(i, m);
			});
			pole.frustumCulled = head.frustumCulled = false;
			group.add(pole, head);
		}
		// The lamp heads only glow after dark.
		out.setNight = v => glowMat.color.setHex(v > 0.3 ? 0xffc46b : 0x9aa0a8);
	}

	// ----- Piers into the harbour, with yachts moored alongside -----
	const seaY = G(1e7, 1e7) + 0.02, yachts = [];
	for(const pr of P.piers){
		const pts = geo.ring(pr.p);
		if(pts.length < 2) continue;
		if(pr.a){ if(clearOf(pts, 1) && !roadInside(pts)) B.prism(pts, seaY - 1, 1.6, 0xcfc8ba, null, 0xbdb5a5); continue; }
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			if(len < 0.3 || sp.edge((ax + bx) / 2, (az + bz) / 2, 6) < 3) continue;
			const ux = (bx - ax) / len, uz = (bz - az) / len, wv = Math.max(0.8, 4 * S / 2);
			B.prism([[ax - uz * wv, az + ux * wv], [bx - uz * wv, bz + ux * wv], [bx + uz * wv, bz - ux * wv], [ax + uz * wv, az - ux * wv]], seaY - 1, 1.5, 0xcfc8ba, null, 0xbdb5a5);
			for(let d = 2; d < len - 1; d += 2.8) for(const sd of [1, -1]){
				const L = (10 + rand() * 22) * S, off = wv + 0.5 + L / 2;
				const x = ax + ux * d - uz * sd * off, z = az + uz * d + ux * sd * off;
				if(rand() < 0.3 || !ctx.isWater || !ctx.isWater(x, z) || sp.edge(x, z, 6) < 4 || !sp.free(x, z, L * 0.35, "yacht")) continue;
				sp.take(x, z, L * 0.35, "yacht");
				yachts.push({ x, z, L, ry: Math.atan2(-uz * sd, ux * sd) + Math.PI / 2 });
			}
		}
	}
	for(const y of yachts){
		const w = y.L * 0.3;
		B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) - 0.15, w, d: y.L, h: 0.8, ry: y.ry, color: 0xf6f7f9, bottom: true });
		B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) + 0.65, w: w * 0.7, d: y.L * 0.45, h: 0.6, ry: y.ry, color: 0xe3e8ee, top: 0x2c3440 });
	}

	// ----- Big wheels (Suzuka's amusement park) -----
	for(const w of P.wheels || []){
		const [x, z] = geo.toWorld(...w.at);
		out.wheels.push({ x, z, r: w.d * S / 2 });
	}

	// ----- Trees -----
	// Forests: close to the track, proper trees (trunks and all) a few metres apart; further off,
	// bigger clumps of canopy, which is all you see of a forest from a distance.
	const mix = WOODS[town] || WOODS.town;
	const nearList = {}, farList = {};
	for(const [k] of mix){ nearList[k] = []; farList[k] = []; }
	const kindAt = (x, z) => { let t = hash(z * 1.7, x * 0.3); for(const [k, share] of mix){ if(t < share) return k; t -= share; } return mix[0][0]; };
	const NEAR = 70, nearGap = (low ? 7.5 : 5.5), farGap = (low ? 14 : 10);
	const maxNear = low ? 2500 : 6500, maxFar = low ? 4000 : 9000;
	let nNear = 0, nFar = 0, farScale = 1;
	const DENSE = { forest: 1, orchard: 0.8, scrub: 0.35 };
	// What grows at a spot: the map's woods, or where the map leaves the land blank and it slopes
	// (geo.fillAt: Suzuka's wooded hills), forest.
	const woodAt = (x, z) => { const k = geo.landAt(x, z); if(k) return DENSE[k] ? k : null; return geo.fillAt && geo.fillAt(x, z) === "forest" ? "forest" : null; };
	const bb = track.bounds, pad = 700, X0 = bb.minX - pad, X1 = bb.maxX + pad, Z0 = bb.minZ - pad, Z1 = bb.maxZ + pad;
	const plantPass = (gap, wantNear) => {
		for(let x = X0 + gap / 2; x < X1; x += gap) for(let z = Z0 + gap / 2; z < Z1; z += gap){
			if(wantNear ? nNear >= maxNear : nFar >= maxFar) return;
			const px = x + (hash(x, z) - 0.5) * gap * 0.8, pz = z + (hash(z, x) - 0.5) * gap * 0.8;
			const dist = field.dist(px, pz);
			if(dist < c.hw + 2 || (dist < NEAR) !== wantNear) continue;
			const w = woodAt(px, pz), dense = w && DENSE[w];
			if(!dense || hash(px * 3.1, pz) > dense) continue;
			if(ctx.isWater && ctx.isWater(px, pz)) continue;
			const k = w === "orchard" ? "round" : kindAt(px, pz);
			const s = wantNear ? (w === "scrub" ? 0.45 : w === "orchard" ? 0.55 : 0.8 + hash(pz, px * 2) * 0.5) : (1.5 + hash(pz, px * 2) * 0.7) * farScale;
			const r = 3.4 * s, room = r * (wantNear ? 0.9 : 0.6) + 1.5;
			// (Close to the road, measured exactly.)
			if(dist - c.hw < room + 6 && sp.edge(px, pz, r + 3) < room) continue;
			if(!sp.free(px, pz, r * 0.5, "trees")) continue;
			sp.take(px, pz, r * 0.5, "trees");
			const t = { x: px, y: G(px, pz), z: pz, s, ry: hash(px, pz * 5) * 6, r, k: hash(px * 7, pz) };
			if(wantNear){ nearList[k].push(t); nNear++; } else { farList[k].push(t); nFar++; }
		}
	};
	plantPass(nearGap, true);
	// The map's own trees: single trees in parks and streets, and rows of trees.
	const single = (x, z, s) => {
		if(field.dist(x, z) - c.hw < 3.4 * s + 7 && sp.edge(x, z, 6) < 3.4 * s + 0.8) return;
		if((ctx.isWater && ctx.isWater(x, z)) || !sp.free(x, z, 1.2, "trees")) return;
		sp.take(x, z, 1.2, "trees");
		const k = town === "city" ? (hash(x, z) < 0.45 ? "palm" : "round") : "round";
		(nearList[k] || (nearList[k] = [])).push({ x, y: G(x, z), z, s, ry: hash(z, x) * 6, r: 3.4 * s, k: hash(x * 3, z) });
		nNear++;
	};
	for(const [e, nn] of P.trees || []){ if(nNear < maxNear * 1.3){ const [x, z] = geo.toWorld(e, nn); single(x, z, 0.6 + hash(e, nn) * 0.35); } }
	for(const a of P.land || []){
		if(a.k !== "row") continue;
		const pts = geo.ring(a.p);
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			for(let d = 0; d < len; d += Math.max(2.5, 7 * S)) single(ax + (bx - ax) * d / len, az + (bz - az) * d / len, 0.7);
		}
	}
	// Far off, the clumps are spread over all the woods there are, however much: further apart (and
	// bigger, so the canopy stays closed) where there's a lot (the area sampled every 12 units).
	let woodArea = 0;
	for(let x = X0; x < X1; x += 12) for(let z = Z0; z < Z1; z += 12){
		if(field.dist(x, z) < NEAR) continue;
		const w = woodAt(x, z);
		if(w) woodArea += 144 * (w === "forest" ? 1 : 0.4);
	}
	const gapFar = Math.max(farGap, Math.sqrt(woodArea / maxFar) * 1.05);
	farScale = gapFar / farGap;
	plantPass(gapFar, false);
	const occ = ctx.treeOccluders;
	for(const [k, list] of Object.entries(nearList)) if(list.length) buildTrees(k, list, theme, { group, keep, shadows, rand, occ });
	out.trees = nNear;
	// Clumps: canopy only, no trunks, no shadows (they're far off).
	const clumpGeo = {
		pine: (() => { const g = keep(new THREE.ConeBufferGeometry(3.6, 10, 7)); g.translate(0, 6.5, 0); return g; })(),
		round: (() => { const g = keep(new THREE.IcosahedronBufferGeometry(3.9, 0)); g.scale(1, 0.85, 1); g.translate(0, 4.6, 0); return g; })(),
		palm: (() => { const g = keep(new THREE.IcosahedronBufferGeometry(3.4, 0)); g.translate(0, 4, 0); return g; })()
	};
	const clumpMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
	const green = { pine: 0x24532e, round: 0x3d7f2c, palm: 0x2f7d3a };
	for(const [k, list0] of Object.entries(farList)){
		if(!list0.length) continue;
		const list = shuffled(list0, rand);      // (random order: thinning by drawing only the first part is even)
		const mesh = new THREE.InstancedMesh(clumpGeo[k], clumpMat, list.length);
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), hsl = {};
		list.forEach((t, i) => {
			e.set(0, t.ry, 0); q.setFromEuler(e); p.set(t.x, t.y, t.z); sc.set(t.s, t.s * (0.85 + t.k * 0.35), t.s);
			m.compose(p, q, sc); mesh.setMatrixAt(i, m);
			col.set(green[k]); col.getHSL(hsl); col.setHSL(hsl.h + (t.k - 0.5) * 0.05, hsl.s, Math.max(0, hsl.l + (hash(t.z, t.x) - 0.5) * 0.12));
			mesh.setColorAt(i, col);
		});
		mesh.frustumCulled = false;
		mesh.receiveShadow = shadows;
		mesh.userData.noMirror = true;            // (far forest: not needed in the rear-view mirror)
		mesh.userData.lod = list.length;
		group.add(mesh);
		out.clumps += list.length;
	}
	return out;
}
