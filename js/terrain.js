// Ground, tunnels and bridges for circuits with real elevation (the F1 tracks).
// All looks: the handling stays flat, exactly as always.
const THREE = globalThis.THREE;

// A heightfield around the circuit. Under and beside the road it sits just below the
// road surface; further out it rolls into hills made from the road's own heights, and
// fades to the base level far away. Where two roads cross at different heights (a
// bridge) the ground follows the lower one.
export function buildTerrain(track, opts = {}){
	const c = track.center, hw = c.hw, n = c.n;
	const b = track.bounds, margin = 240;
	const x0 = b.minX - margin, z0 = b.minZ - margin;
	const spanX = b.maxX - b.minX + margin * 2, spanZ = b.maxZ - b.minZ + margin * 2;
	const cell = Math.max(5, Math.max(spanX, spanZ) / 220);
	const nx = Math.ceil(spanX / cell), nz = Math.ceil(spanZ / cell), W = nx + 1, D = nz + 1;
	let minH = Infinity;
	for(let i = 0; i < n; i++) minH = Math.min(minH, c.h[i]);
	const base = minH - 0.6;
	const sumW = new Float32Array(W * D), sumH = new Float32Array(W * D);
	const near = new Float32Array(W * D).fill(1e9), nearH = new Float32Array(W * D).fill(0);
	const cap = new Float32Array(W * D).fill(Infinity);         // must stay under any road covering this cell
	// (The band next to the road is two cells wider than it, so no hill cell is
	// ever blended into the road surface.)
	const R = 110, ROAD = hw + 1.5 + cell * 2, COVER = hw + 1 + cell;
	for(let i = 0; i < n; i++){
		const x = c.x[i], z = c.z[i], h = c.h[i], tx = c.tx[i], tz = c.tz[i], bank = c.bank[i];
		const r = i % 3 === 0 ? R : ROAD;
		const ga = Math.max(0, Math.floor((x - r - x0) / cell)), gb = Math.min(nx, Math.ceil((x + r - x0) / cell));
		const ha = Math.max(0, Math.floor((z - r - z0) / cell)), hb = Math.min(nz, Math.ceil((z + r - z0) / cell));
		for(let gx = ga; gx <= gb; gx++) for(let gz = ha; gz <= hb; gz++){
			const px = x0 + gx * cell, pz = z0 + gz * cell, d = Math.hypot(px - x, pz - z);
			const k = gz * W + gx;
			// Just under the road surface across it (following the camber), level with its edges beyond.
			const lat = Math.max(-hw - 1, Math.min(hw + 1, (px - x) * tz - (pz - z) * tx));
			const low = h + lat * bank - 0.3;
			// Next to the road the ground takes the nearest road's height, but never rises
			// into any road whose surface spans this cell.
			if(d < near[k]){ near[k] = d; nearH[k] = low; }
			if(d < COVER && Math.abs((px - x) * tx + (pz - z) * tz) < cell * 0.5) cap[k] = Math.min(cap[k], low);   // (only square across from this sample)
			// Influence fades to nothing at R, so there is no ring where it stops.
			if(r === R && d < R){ const f = 1 - d / R, w = f * f / (d * d + 400); sumW[k] += w; sumH[k] += w * h; }
		}
	}
	const W0 = 3 / (90 * 90 + 400);
	const heights = new Float32Array(W * D);
	for(let k = 0; k < W * D; k++){
		const hill = (sumH[k] + base * W0) / (sumW[k] + W0) - 0.4;
		// Next to the road the hills are made mostly of nearby road heights, so they meet it smoothly.
		let y = near[k] < ROAD ? Math.min(nearH[k], cap[k]) : hill;
		const gx = k % W, gz = Math.floor(k / W);
		const px = x0 + gx * cell, pz = z0 + gz * cell;
		if(opts.isSea && opts.isSea(px, pz)) y = Math.min(y, base - 2);
		// Fade to the base level at the edges of the patch.
		const e = Math.min(gx, gz, nx - gx, nz - gz) / 6;
		if(e < 1) y = base + (y - base) * Math.max(0, e);
		heights[k] = y;
	}
	// Smooth the ground away from the road so there are no steps.
	const smooth = new Float32Array(heights);
	for(let pass = 0; pass < 2; pass++){
		for(let gz = 1; gz < nz; gz++) for(let gx = 1; gx < nx; gx++){
			const k = gz * W + gx;
			if(near[k] < ROAD) continue;
			smooth[k] = (heights[k] * 4 + heights[k - 1] + heights[k + 1] + heights[k - W] + heights[k + W]) / 8;
		}
		heights.set(smooth);
	}
	const pos = new Float32Array(W * D * 3), uv = new Float32Array(W * D * 2);
	for(let gz = 0; gz <= nz; gz++) for(let gx = 0; gx <= nx; gx++){
		const k = gz * W + gx, x = x0 + gx * cell, z = z0 + gz * cell;
		pos.set([x, heights[k], z], k * 3);
		// Same texture mapping as the flat ground plane, so the stripes line up where they meet.
		const o = opts.uvOrigin || { x: 0, z: 0 };
		uv.set([(x - o.x) / 10, (o.z - z) / 10], k * 2);
	}
	const idx = [];
	for(let gz = 0; gz < nz; gz++) for(let gx = 0; gx < nx; gx++){
		const a = gz * W + gx, bb = a + 1, cc = a + W, d = cc + 1;
		idx.push(a, cc, bb, bb, cc, d);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	// Height of the ground at (x, z).
	function groundAt(x, z){
		const fx = (x - x0) / cell, fz = (z - z0) / cell;
		if(fx < 0 || fz < 0 || fx >= nx || fz >= nz) return base;
		const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz, k = gz * W + gx;
		const a = heights[k], b2 = heights[k + 1], c2 = heights[k + W], d = heights[k + W + 1];
		return (a * (1 - tx) + b2 * tx) * (1 - tz) + (c2 * (1 - tx) + d * tx) * tz;
	}
	return { geometry: geo, groundAt, base };
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

// The Monaco tunnel: walls outside the barriers, a roof, strip lights, and the hotel above.
// Returns meshes to add and occluder boxes (so TV cameras don't try to look through it).
export function buildTunnel(track, [a, b], keep){
	const c = track.center, hw = c.hw, n = c.n;
	const to = b >= a ? b : b + n;
	const meshes = [], occ = [];
	const wallMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
	for(const lat of [hw + 0.7, -hw - 0.7]) meshes.push(new THREE.Mesh(keep(sideStrip(c, a, to, lat, 6.2, 0x8f8a82)), wallMat));
	const roof = new THREE.Mesh(keep(roofStrip(c, a, to, hw + 1.4, -hw - 1.4, 6)), keep(new THREE.MeshLambertMaterial({ color: 0x5d5a55, side: THREE.DoubleSide })));
	roof.castShadow = true;
	meshes.push(roof);
	// Upper deck on top, so it looks like a building rather than a lid.
	const top = new THREE.Mesh(keep(roofStrip(c, a, to, hw + 1.4, -hw - 1.4, 7.4)), keep(new THREE.MeshLambertMaterial({ color: 0xd9cbb2, side: THREE.DoubleSide })));
	meshes.push(top);
	for(const lat of [hw + 1.4, -hw - 1.4]) meshes.push(new THREE.Mesh(keep(sideStrip(c, a, to, lat, 7.4, 0xe7dcc6)), wallMat));
	// Lights along the roof.
	const lights = [];
	for(let i = a; i <= to; i += 5){
		const s = i % n;
		lights.push(new THREE.Vector3(c.x[s], c.h[s] + 5.9, c.z[s]));
		occ.push({ x: c.x[s], z: c.z[s], ry: Math.atan2(c.tx[s], c.tz[s]), hw: hw + 1.6, hd: 3, y0: c.h[s] + 5.3, y1: c.h[s] + 7.6 });
		for(const lat of [hw + 0.8, -hw - 0.8]) occ.push({ x: c.x[s] + c.tz[s] * lat, z: c.z[s] - c.tx[s] * lat, ry: Math.atan2(c.tx[s], c.tz[s]), hw: 0.4, hd: 3, y0: c.h[s] - 0.5, y1: c.h[s] + 6.2 });
	}
	const lamp = new THREE.InstancedMesh(keep(new THREE.BoxBufferGeometry(0.5, 0.12, 2.4)), keep(new THREE.MeshBasicMaterial({ color: 0xffe2a0 })), lights.length);
	const m = new THREE.Matrix4();
	lights.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); lamp.setMatrixAt(i, m); });
	lamp.frustumCulled = false;
	meshes.push(lamp);
	return { meshes, occluders: occ };
}

// Where one road passes over another (Suzuka): a deck under the upper road and pillars
// beside the lower one. `groundAt` is the terrain.
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
			if(skip(i) || skip(j) || Math.max(gap[i], gap[j]) < 0.08) continue;
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
