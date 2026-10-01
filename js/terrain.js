// Ground, tunnels and bridges for circuits with real elevation (the F1 tracks).
// All looks: the handling stays flat, exactly as always.
import { slice, drain } from "./steps.js";
const THREE = globalThis.THREE;

// A heightfield around the circuit. Under and beside the road it sits just below the
// road surface; further out it rolls into hills made from the road's own heights, and
// fades to the base level far away. Where two roads cross at different heights (a
// bridge) the ground follows the lower one.
export function buildTerrain(track, opts = {}){ return drain(buildTerrainSteps(track, opts)); }
// (The same, in slices: see steps.js.)
export function* buildTerrainSteps(track, opts = {}){
	const c = track.center, hw = c.hw, n = c.n;
	// (opts.bounds: a bigger area, when there's more road than the track's own: see remnants.js.)
	// (opts.demAt: the real lie of the land, where the venue has it: the ground reaches further out then.)
	const b = opts.bounds || track.bounds, margin = opts.margin ?? 240;
	const x0 = b.minX - margin, z0 = b.minZ - margin;
	const spanX = b.maxX - b.minX + margin * 2, spanZ = b.maxZ - b.minZ + margin * 2;
	// (A banked oval is small, and its banking changes quickly across and along: a finer grid.)
	const isOval = opts.oval ?? !!(track.def && track.def.kind === "oval");
	const cell = isOval ? Math.max(2.5, Math.max(spanX, spanZ) / 360) : Math.max(5, Math.max(spanX, spanZ) / (opts.demAt && !opts.low ? 300 : 220));
	const nx = Math.ceil(spanX / cell), nz = Math.ceil(spanZ / cell), W = nx + 1, D = nz + 1;
	let minH = Infinity;
	for(let i = 0; i < n; i++) minH = Math.min(minH, c.h[i] - Math.abs(c.bank[i]) * (hw + 1));    // (the low edge of any banking)
	for(const e of opts.extra || []) minH = Math.min(minH, e.h - Math.abs(e.bank) * (hw + 1));
	const oval = isOval;
	const base = oval ? -0.9 : minH - 0.6;
	const sumW = new Float32Array(W * D), sumH = new Float32Array(W * D);
	const near = new Float32Array(W * D).fill(1e9), nearH = new Float32Array(W * D).fill(0);
	const cap = new Float32Array(W * D).fill(Infinity);         // must stay under any road covering this cell
	// A banked oval (opts.oval) sits on flat ground: a level infield, and behind the outside wall an
	// embankment up to the top of the banking that slopes away. Which side is the infield: the side
	// the lap turns towards.
	let turning = 0;
	for(let i = 0; i < n; i++) turning += c.curv[i];
	const inSign = turning > 0 ? 1 : -1;
	const nearLat = new Float32Array(W * D), nearEdge = new Float32Array(W * D);
	// (The band next to the road is two cells wider than it, so no hill cell is
	// ever blended into the road surface.)
	const R = 110, ROAD = hw + 1.5 + cell * 2, COVER = hw + 1 + cell;
	// The track's road, then any other road (opts.extra: [{ x, z, h, tx, tz, bank }], the rest of the
	// venue's circuit): the ground is shaped round all of it.
	const extra = opts.extra || [];
	for(let i = 0; i < n + extra.length; i++){
		if(slice.over()) yield "terrain: road";
		const e = i >= n ? extra[i - n] : null;
		const x = e ? e.x : c.x[i], z = e ? e.z : c.z[i], h = e ? e.h : c.h[i], tx = e ? e.tx : c.tx[i], tz = e ? e.tz : c.tz[i], bank = e ? e.bank : c.bank[i];
		const r = i % 3 === 0 ? R : ROAD;
		const ga = Math.max(0, Math.floor((x - r - x0) / cell)), gb = Math.min(nx, Math.ceil((x + r - x0) / cell));
		const ha = Math.max(0, Math.floor((z - r - z0) / cell)), hb = Math.min(nz, Math.ceil((z + r - z0) / cell));
		for(let gx = ga; gx <= gb; gx++) for(let gz = ha; gz <= hb; gz++){
			const px = x0 + gx * cell, pz = z0 + gz * cell, d = Math.hypot(px - x, pz - z);
			const k = gz * W + gx;
			// Just under the road surface across it (following the camber), level with its edges beyond.
			const rawLat = (px - x) * tz - (pz - z) * tx;
			const lat = Math.max(-hw - 1, Math.min(hw + 1, rawLat));
			const low = h + lat * bank - (oval ? 0.4 : 0.3 + Math.abs(bank) * 2);
			// Next to the road the ground takes the nearest road's height, but never rises
			// into any road whose surface spans this cell.
			if(d < near[k]){ near[k] = d; nearH[k] = low; nearLat[k] = rawLat; nearEdge[k] = h + Math.max(-hw, Math.min(hw, rawLat)) * bank; }
			if(d < COVER && Math.abs((px - x) * tx + (pz - z) * tz) < cell * 0.5) cap[k] = Math.min(cap[k], low);   // (only square across from this sample)
			// Influence fades to nothing at R, so there is no ring where it stops.
			if(r === R && d < R){ const f = 1 - d / R, w = f * f / (d * d + 400); sumW[k] += w; sumH[k] += w * h; }
		}
	}
	const W0 = 3 / (90 * 90 + 400);
	const heights = new Float32Array(W * D);
	// With the real lie of the land, the hills are the real ones: the road's own heights close to it,
	// easing into the real ground over DEM_EASE beyond the band beside the road.
	const DEM_EASE = 45;
	for(let k = 0; k < W * D; k++){
		if((k & 1023) === 0 && slice.over()) yield "terrain: heights";
		const gx = k % W, gz = Math.floor(k / W);
		const px = x0 + gx * cell, pz = z0 + gz * cell;
		let hill = (sumH[k] + base * W0) / (sumW[k] + W0) - 0.4;
		const real = opts.demAt ? opts.demAt(px, pz) : null;
		if(real !== null && real !== undefined){
			const t = Math.max(0, Math.min(1, (near[k] - ROAD) / DEM_EASE)), f = t * t * (3 - 2 * t);
			hill = hill + (real - 0.4 - hill) * f;
		}
		// Next to the road the hills are made mostly of nearby road heights, so they meet it smoothly.
		let y = near[k] < ROAD ? Math.min(nearH[k], cap[k]) : hill;
		if(oval){
			// Infield level with the bottom of the banking; outside, the embankment falls away from
			// the top of the wall at about 25 degrees.
			if(near[k] >= ROAD) y = nearLat[k] * inSign > 0 ? 0 : Math.max(0, nearEdge[k] + 0.4 - Math.max(0, near[k] - hw - 7) * 0.45);
			else if(nearLat[k] * inSign > 0) y = Math.min(y, 0);
			if(opts.isSea && opts.isSea(px, pz) && near[k] >= ROAD + cell * 2) y = -1.6;       // lakes in the infield (kept off the road's edge)
		}else if(opts.isSea && opts.isSea(px, pz)) y = Math.min(y, base - 2);
		else if(opts.isSea) y = Math.max(y, base + 0.3);          // (land stays clearly above sea level, so the two never flicker)
		// Fade to the base level at the edges of the patch.
		const e = Math.min(gx, gz, nx - gx, nz - gz) / (opts.demAt ? 18 : 6);
		if(e < 1) y = base + (y - base) * Math.max(0, e);
		if(oval && y > -1.2 && near[k] >= ROAD) y = Math.max(y, base + 0.08);          // (land stays above the lake's water line)
		heights[k] = y;
	}
	// Smooth the ground away from the road so there are no steps.
	const smooth = new Float32Array(heights);
	for(let pass = 0; pass < 2; pass++){
		for(let gz = 1; gz < nz; gz++) for(let gx = 1; gx < nx; gx++){
			if(gx === 1 && slice.over()) yield "terrain: smooth";
			const k = gz * W + gx;
			if(near[k] < ROAD) continue;
			smooth[k] = (heights[k] * 4 + heights[k - 1] + heights[k + 1] + heights[k - W] + heights[k + W]) / 8;
		}
		heights.set(smooth);
	}
	const pos = new Float32Array(W * D * 3), uv = new Float32Array(W * D * 2);
	// Same texture mapping as the flat ground plane, so the stripes line up where they meet.
	const o = opts.uvOrigin || { x: 0, z: 0 };
	for(let gz = 0; gz <= nz; gz++) for(let gx = 0; gx <= nx; gx++){
		if(gx === 0 && slice.over()) yield "terrain: positions";
		const k = gz * W + gx, x = x0 + gx * cell, z = z0 + gz * cell;
		pos[k * 3] = x; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = z;
		uv[k * 2] = (x - o.x) / 10; uv[k * 2 + 1] = (o.z - z) / 10;
	}
	const idx = new (W * D > 65535 ? Uint32Array : Uint16Array)(nx * nz * 6);
	for(let gz = 0, q = 0; gz < nz; gz++){
		if(slice.over()) yield "terrain: triangles";
		for(let gx = 0; gx < nx; gx++){
			const a = gz * W + gx, bb = a + 1, cc = a + W, d = cc + 1;
			idx[q++] = a; idx[q++] = cc; idx[q++] = bb; idx[q++] = bb; idx[q++] = cc; idx[q++] = d;
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	// opts.colorAt(x, z): the ground's colour there (forest floor, fields, car parks: the real ground
	// cover), fading to plain ground (opts.color) at the edges of the patch so it meets the ground beyond.
	if(opts.colorAt){
		const col = new Float32Array(W * D * 3), plain = new THREE.Color(opts.color), k2 = new THREE.Color(), kc = new THREE.Color();
		for(let gz = 0; gz <= nz; gz++) for(let gx = 0; gx <= nx; gx++){
			if((gx & 31) === 0 && slice.over()) yield "terrain: colours";
			const k = gz * W + gx, got = opts.colorAt(x0 + gx * cell, z0 + gz * cell);
			k2.copy(plain);
			if(got !== null && got !== undefined) k2.lerp(kc.set(got), Math.max(0, Math.min(1, Math.min(gx, gz, nx - gx, nz - gz) / 8 - 0.5)));
			col[k * 3] = k2.r; col[k * 3 + 1] = k2.g; col[k * 3 + 2] = k2.b;
		}
		geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
	}
	geo.setIndex(new THREE.BufferAttribute(idx, 1));
	if(slice.over()) yield "terrain: normals";
	geo.computeVertexNormals();
	// Height of the ground at (x, z).
	function groundAt(x, z){
		const fx = (x - x0) / cell, fz = (z - z0) / cell;
		if(fx < 0 || fz < 0 || fx >= nx || fz >= nz) return base;
		const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz, k = gz * W + gx;
		const a = heights[k], b2 = heights[k + 1], c2 = heights[k + W], d = heights[k + W + 1];
		return (a * (1 - tx) + b2 * tx) * (1 - tz) + (c2 * (1 - tx) + d * tx) * tz;
	}
	return { geometry: geo, groundAt, base, patch: { x0, z0, x1: x0 + nx * cell, z1: z0 + nz * cell } };
}

// Vertical strip along the road between two lateral offsets (left = +), from the road
// surface up to `top` above it. Used for tunnel walls.
function sideStrip(c, from, to, lat, height, color){
	const pos = [], col = [], idx = [], k = new THREE.Color(color);
	for(let i = from; i <= to; i++){
		const s = i % c.n, nx = c.tz[s], nz = -c.tx[s];
		const y = c.h[s] + lat * c.bank[s];
		pos.push(c.x[s] + nx * lat, y - 0.5, c.z[s] + nz * lat, c.x[s] + nx * lat, y + height, c.z[s] + nz * lat);
		col.push(k.r, k.g, k.b, k.r, k.g, k.b);
		if(i < to){ const a = (i - from) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}
// Flat slab above the road between two lateral offsets, `lift` above the surface.
function roofStrip(c, from, to, left, right, lift){
	const pos = [], idx = [];
	for(let i = from; i <= to; i++){
		const s = i % c.n, nx = c.tz[s], nz = -c.tx[s];
		const y = c.h[s] + lift;
		pos.push(c.x[s] + nx * left, y, c.z[s] + nz * left, c.x[s] + nx * right, y, c.z[s] + nz * right);
		if(i < to){ const a = (i - from) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

// The Monaco tunnel: tiled walls outside the barriers (far enough out that the barriers, which
// may cut a little inside the curve, never poke through), a dark roof with two rows of lamps,
// and the building mass above. Returns meshes to add and occluder boxes (so TV cameras don't try
// to look through it).
export const TUNNEL_WALL = 2.1;                    // tunnel wall, this far outside the road edge
function tileTexture(){
	const cv = document.createElement("canvas"); cv.width = cv.height = 128;
	const g = cv.getContext("2d");
	g.fillStyle = "#6d6258"; g.fillRect(0, 0, 128, 128);
	for(let y = 0; y < 4; y++) for(let x = 0; x < 4; x++){
		const l = 170 + ((x * 7 + y * 13) % 5) * 7;
		g.fillStyle = `rgb(${l + 28},${l + 10},${l - 18})`;
		g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
	}
	const tex = new THREE.CanvasTexture(cv);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	return tex;
}
// Vertical wall along the road at lateral offset lat, from just below the road to `height` above
// it, with texture coordinates in world units (u along, v up).
function tunnelWall(c, from, to, lat, height){
	const pos = [], uv = [], idx = [];
	let u = 0;
	for(let i = from; i <= to; i++){
		const s = i % c.n, nx = c.tz[s], nz = -c.tx[s];
		if(i > from){ const p = (i - 1) % c.n; u += Math.hypot(c.x[s] + nx * lat - c.x[p] - c.tz[p] * lat, c.z[s] + nz * lat - c.z[p] + c.tx[p] * lat); }
		const y = c.h[s];
		pos.push(c.x[s] + nx * lat, y - 0.5, c.z[s] + nz * lat, c.x[s] + nx * lat, y + height, c.z[s] + nz * lat);
		uv.push(u / 3.2, -0.5 / 3.2, u / 3.2, height / 3.2);
		if(i < to){ const k = (i - from) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}
export function buildTunnel(track, [a, b], keep){
	const c = track.center, hw = c.hw, n = c.n, W = hw + TUNNEL_WALL;
	const to = b >= a ? b : b + n;
	const meshes = [], occ = [];
	const tiles = keep(tileTexture());
	// Tiled walls, lit warm by the tunnel lamps (so they glow rather than sit in shadow).
	const tileMat = keep(new THREE.MeshLambertMaterial({ map: tiles, emissive: 0x6b4a26, emissiveMap: tiles, emissiveIntensity: 0.55, side: THREE.DoubleSide }));
	for(const lat of [W, -W]) meshes.push(new THREE.Mesh(keep(tunnelWall(c, a, to, lat, 6.2)), tileMat));
	const roof = new THREE.Mesh(keep(roofStrip(c, a, to, W + 0.1, -W - 0.1, 6)), keep(new THREE.MeshLambertMaterial({ color: 0x4a4540, emissive: 0x1a140e, side: THREE.DoubleSide })));
	roof.castShadow = true;
	meshes.push(roof);
	// Upper deck on top, so it looks like a building rather than a lid.
	const top = new THREE.Mesh(keep(roofStrip(c, a, to, W + 0.7, -W - 0.7, 7.4)), keep(new THREE.MeshLambertMaterial({ color: 0xd9cbb2, side: THREE.DoubleSide })));
	meshes.push(top);
	const outerMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
	for(const lat of [W + 0.7, -W - 0.7]) meshes.push(new THREE.Mesh(keep(sideStrip(c, a, to, lat, 7.4, 0xe7dcc6)), outerMat));
	// Two rows of lamps in the ceiling, white and amber, and occluders for the TV director.
	const lights = [];
	for(let i = a + 2; i <= to; i += 4){
		const s = i % n, nx = c.tz[s], nz = -c.tx[s], ry = Math.atan2(c.tx[s], c.tz[s]);
		for(const lat of [hw * 0.45, -hw * 0.45]) lights.push({ x: c.x[s] + nx * lat, y: c.h[s] + 5.93, z: c.z[s] + nz * lat, ry, warm: ((i - a) / 4 + (lat > 0 ? 1 : 0)) % 3 === 0 });
		if((i - a) % 8 === 2){
			occ.push({ x: c.x[s], z: c.z[s], ry, hw: W + 0.8, hd: 3, y0: c.h[s] + 5.3, y1: c.h[s] + 7.6 });
			for(const lat of [W, -W]) occ.push({ x: c.x[s] + nx * lat, z: c.z[s] + nz * lat, ry, hw: 0.4, hd: 3, y0: c.h[s] - 0.5, y1: c.h[s] + 6.2 });
		}
	}
	const lamp = new THREE.InstancedMesh(keep(new THREE.BoxBufferGeometry(1.1, 0.1, 0.7)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })), lights.length);
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
	lights.forEach((l, i) => {
		e.set(0, l.ry, 0); q.setFromEuler(e); p.set(l.x, l.y, l.z); m.compose(p, q, one); lamp.setMatrixAt(i, m);
		lamp.setColorAt(i, col.set(l.warm ? 0xffb347 : 0xf4f8ff));
	});
	lamp.frustumCulled = false;
	meshes.push(lamp);
	return { meshes, occluders: occ };
}

export function buildBridge(track, [lowAt, upAt], groundAt, keep){
	const c = track.center, hw = c.hw, n = c.n;
	const items = [], occ = [];
	const lowIdx = [];
	for(let o = -40; o <= 40; o++) lowIdx.push((lowAt + o + n) % n);
	const distToLower = (x, z) => Math.min(...lowIdx.map(i => Math.hypot(c.x[i] - x, c.z[i] - z)));
	// The deck: a slab under the road wherever it's clear of the ground, its top just under the
	// road surface (following the camber) so it never shows through, with fascia down the sides.
	const W = hw + 0.8, pos = [], idx = [];
	let prev = -1;
	for(let o = -60; o <= 60; o++){
		const i = (upAt + o + n) % n;
		const gap = c.h[i] - groundAt(c.x[i], c.z[i]);
		if(gap < 1.2){ prev = -1; continue; }
		const nx = c.tz[i], nz = -c.tx[i];
		const yl = c.h[i] + W * c.bank[i] - 0.03, yr = c.h[i] - W * c.bank[i] - 0.03, bot = Math.min(yl, yr) - 1.2;
		const v = pos.length / 3;
		pos.push(c.x[i] + nx * W, yl, c.z[i] + nz * W,  c.x[i] + nx * W, bot, c.z[i] + nz * W,
			c.x[i] - nx * W, yr, c.z[i] - nz * W,  c.x[i] - nx * W, bot, c.z[i] - nz * W);
		if(prev >= 0){
			const p = prev;
			idx.push(p, p + 1, v, v, p + 1, v + 1);                 // left fascia
			idx.push(p + 2, v + 2, p + 3, p + 3, v + 2, v + 3);     // right fascia
			idx.push(p + 1, p + 3, v + 1, v + 1, p + 3, v + 3);     // underside
			idx.push(p, v, p + 2, p + 2, v, v + 2);                 // top (hidden under the road)
		}
		prev = v;
		const ry = Math.atan2(c.tx[i], c.tz[i]);
		if(o % 2 === 0) occ.push({ x: c.x[i], z: c.z[i], ry, hw: hw + 1, hd: 1.2, y0: bot, y1: c.h[i] + 1 });
		// Pillars wherever the deck is high and they won't stand on the road below.
		if(o % 12 === 0 && gap > 2.5) for(const lat of [hw - 0.5, -hw + 0.5]){
			const px = c.x[i] + c.tz[i] * lat, pz = c.z[i] - c.tx[i] * lat;
			if(distToLower(px, pz) < hw + 1.5) continue;
			const g = groundAt(px, pz), top = bot + 0.1;
			items.push({ x: px, z: pz, y: (g + top) / 2, w: 1.2, h: top - g, d: 1.2, ry, color: 0x8d939e });
			occ.push({ x: px, z: pz, ry, hw: 0.6, hd: 0.6, y0: g, y1: top });
		}
	}
	const deck = new THREE.BufferGeometry();
	deck.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	deck.setIndex(idx);
	deck.computeVertexNormals();
	return { items, occluders: occ, deck };
}

// Retaining walls down the sides of the road wherever it sits above the ground next to it
// (hillside roads above lower ones, banked edges), so the road never looks like it floats.
// `skip(i)`: samples to leave open (under a bridge deck). Low edges take the ground's
// colour (they're just the verge); tall ones are stone.
// skip(i, side): leave out the wall at sample i on that side (+1 left).
export function buildSkirts(track, groundAt, skip = () => false, colors = {}){
	const c = track.center, n = c.n, pos = [], col = [], idx = [];
	const soil = new THREE.Color(colors.ground ?? 0x5b7a3a), stone = new THREE.Color(colors.stone ?? 0x8f8a80), k = new THREE.Color();
	for(const side of [1, -1]){
		const lat = side * (c.hw + 0.8), start = pos.length / 3, gap = [];
		for(let i = 0; i < n; i++){
			const x = c.x[i] + c.tz[i] * lat, z = c.z[i] - c.tx[i] * lat;
			const top = c.h[i] + lat * c.bank[i] + 0.01, g = groundAt(x, z);
			pos.push(x, top, z, x, Math.min(top, g) - 0.3, z);
			gap.push(top - g);
			k.copy(soil).lerp(stone, Math.max(0, Math.min(1, (top - g - 0.7) / 0.8)));
			col.push(k.r, k.g, k.b, k.r, k.g, k.b);
		}
		for(let i = 0; i < n; i++){
			const j = (i + 1) % n;
			if(skip(i, side) || skip(j, side) || Math.max(gap[i], gap[j]) < 0.08) continue;
			const p = start + i * 2, q = start + j * 2;
			idx.push(p, p + 1, q, q, p + 1, q + 1);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}
