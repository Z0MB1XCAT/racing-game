// Builds the 3D scene for a track: sky, ground, road, walls and scenery.
// Nothing here affects driving; walls are drawn where the physics walls are.
import { GRID } from "./physics.js";
import { START_Z, seededRandom } from "./trackgen.js";
import { buildScenery, canvasTexture } from "./scenery.js";
import { naturalHour } from "./atmosphere.js";
import { buildTerrain, buildTunnel, buildBridge, buildSkirts, TUNNEL_WALL } from "./terrain.js";
import { placeGeo } from "./placegeo.js";

const THREE = globalThis.THREE;

export const THEMES = {
	classic: { sky: 0x7fb0ff, ground: 0x57c115, stripes: true, wall: 0xf48342, wallH: 1.5, trees: "classic", mountains: "cubes", mountainColor: 0x888888, sun: 0.7, amb: 0.5 },
	monaco: { sky: [0x4f9dea, 0xd6ebff], ground: 0xcdc3ae, wall: "redwhite", road: 0x45484f, trees: "palm", treeDensity: 0.25,
		buildings: { density: 0.9, tall: [12, 30], palette: [0xf2d7b6, 0xf0c9a8, 0xe8e0cf, 0xf5e6c8, 0xd9b99b, 0xf4efe6, 0xe9c9c0] },
		catchFence: true, sea: { dir: [0.9, -0.45], color: 0x1f6fb0 }, mountains: "hills", mountainColor: 0x7f956a, fog: [0xd6ebff, 500, 1600], grandstand: 2, standColor: 0xd8342f, fans: false },
	spa: { sky: [0x7f90a6, 0xcbd4dd], ground: 0x3f7b34, stripes: true, wall: 0xa9b1ba, road: 0x3c4047, trees: "pine", treeDensity: 1.3,
		kerb: [0xd8342f, 0xf2c230], tyreWall: [0xd8342f, 0xf2c230], catchFence: true,
		mountains: "hills", mountainColor: 0x3d663a, fog: [0xbcc6d0, 320, 1300], grandstand: 2, standColor: 0xf4c542, sun: 0.55, amb: 0.6 },
	monza: { sky: [0x4a9eff, 0xd2eaff], ground: 0x5ea94a, stripes: true, wall: 0xb9c1c9, road: 0x41444b, trees: "round", treeDensity: 1.0,
		mountains: "hills", mountainColor: 0x7c9a68, fog: [0xd2eaff, 500, 1700], grandstand: 3, standColor: 0xc8102e },
	suzuka: { sky: [0x5aa7ff, 0xe4f2ff], ground: 0x5a9d43, stripes: true, wall: "bluewhite", road: 0x3f4249, trees: "sakura", treeDensity: 0.9,
		mountains: "hills", mountainColor: 0x5b8757, fog: [0xe4f2ff, 450, 1600], grandstand: 2, standColor: 0x2f63c9, ferris: true },
	jeddah: { night: true, sky: [0x03040c, 0x1c2250], ground: 0x3a3a3e, wall: "concrete", road: 0x3a3d45, trees: "palm", treeDensity: 0.25, cityFill: true,
		buildings: { density: 0.7, night: true, palette: [0x2a2f3d, 0x343a4a, 0x22262f, 0x3a3346] },
		runoff: [0x2f6fe0, 0xe0409a, 0x8f4de0, 0xd8342f], footbridges: 5,
		sea: { dir: [-1, 0.08], color: 0x0a1830 }, lights: true, mountains: "none", fog: [0x121634, 320, 1500], sun: 0.32, amb: 0.72, grandstand: 2, standColor: 0x0e7c86, fans: false },
	daytona: { sky: [0x4aa6ff, 0xdcf0ff], ground: 0x68a94c, stripes: true, wall: 0xf1f3f6, road: 0x3a3d44, trees: "palm", treeDensity: 0.15,
		lake: true, grandstand: 4, standColor: 0x2f63c9, mountains: "none", fog: [0xdcf0ff, 500, 1700] },
	dusk: { sky: [0x241a45, 0xff8a4c], ground: 0x86684a, wall: "tyres", road: 0x4e4540, trees: "none", mountains: "hills", mountainColor: 0x5a3f4a,
		fog: [0xd98160, 220, 900], sun: 0.85, sunColor: 0xffb27a, amb: 0.45, grandstand: 2, standColor: 0xf48342, lights: true, tod: "sunset" },
	snow: { sky: [0x93acc6, 0xe7eff7], ground: 0xe9eff5, wall: 0x2f6fbd, road: 0x5a5f68, trees: "snowpine", treeDensity: 1.1,
		mountains: "peaks", mountainColor: 0x6d7c8e, fog: [0xdfe8f0, 240, 1100], snowfall: true, sun: 0.6, amb: 0.65, grandstand: 1, standColor: 0x2f6fbd }
};

// Merge many boxes into one mesh (one draw call). Each item: {x, y, z, w, h, d, ry, color}
function mergedBoxes(items){
	const base = new THREE.BoxBufferGeometry(1, 1, 1);
	const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
	const vc = bp.length / 3;
	const pos = new Float32Array(items.length * bp.length), nor = new Float32Array(items.length * bn.length), col = new Float32Array(items.length * bp.length);
	const idx = new Uint32Array(items.length * bi.length);
	const c = new THREE.Color();
	items.forEach((it, k) => {
		const cs = Math.cos(it.ry || 0), sn = Math.sin(it.ry || 0);
		c.set(it.color);
		for(let v = 0; v < vc; v++){
			const x = bp[v * 3] * it.w, y = bp[v * 3 + 1] * it.h, z = bp[v * 3 + 2] * it.d;
			const o = (k * vc + v) * 3;
			pos[o] = it.x + x * cs + z * sn;
			pos[o + 1] = it.y + y;
			pos[o + 2] = it.z - x * sn + z * cs;
			const nx = bn[v * 3], ny = bn[v * 3 + 1], nz = bn[v * 3 + 2];
			nor[o] = nx * cs + nz * sn; nor[o + 1] = ny; nor[o + 2] = -nx * sn + nz * cs;
			col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
		}
		for(let q = 0; q < bi.length; q++) idx[k * bi.length + q] = bi[q] + k * vc;
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
	g.setAttribute("color", new THREE.BufferAttribute(col, 3));
	g.setIndex(new THREE.BufferAttribute(idx, 1));
	base.dispose();
	return g;
}

// Walls that follow the road's height: each wall piece becomes a short slab whose ends sit at
// the road height there (so the barrier climbs and dips with the road). items: as mergedBoxes.
function wallStrips(track, items, h, heightAt){
	const pos = [], col = [], idx = [], c = new THREE.Color();
	const quad = (a, b, cc, d, color) => {
		const base = pos.length / 3;
		for(const p of [a, b, cc, d]) pos.push(...p);
		c.set(color);
		for(let i = 0; i < 4; i++) col.push(c.r, c.g, c.b);
		idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
	};
	for(const it of items){
		const cs = Math.cos(it.ry || 0), sn = Math.sin(it.ry || 0);
		const hx = it.w / 2 * cs, hz = -it.w / 2 * sn;            // along the piece
		const tx = it.d / 2 * sn, tz = it.d / 2 * cs;             // across it
		const ax = it.x - hx, az = it.z - hz, bx = it.x + hx, bz = it.z + hz;
		// (it.seg: the road sample the wall belongs to, so near a bridge it takes its own road's height.)
		const ya = heightAt(ax, az, it.seg ?? -1), yb = heightAt(bx, bz, it.seg ?? -1);
		const y0a = ya + it.y - h / 2, y0b = yb + it.y - h / 2, y1a = y0a + h, y1b = y0b + h;
		const P = (x, y, z) => [x, y, z];
		// Both faces, the top, and the two ends.
		quad(P(ax + tx, y0a, az + tz), P(bx + tx, y0b, bz + tz), P(bx + tx, y1b, bz + tz), P(ax + tx, y1a, az + tz), it.color);
		quad(P(bx - tx, y0b, bz - tz), P(ax - tx, y0a, az - tz), P(ax - tx, y1a, az - tz), P(bx - tx, y1b, bz - tz), it.color);
		quad(P(ax + tx, y1a, az + tz), P(bx + tx, y1b, bz + tz), P(bx - tx, y1b, bz - tz), P(ax - tx, y1a, az - tz), it.color);
		quad(P(ax - tx, y0a, az - tz), P(ax + tx, y0a, az + tz), P(ax + tx, y1a, az + tz), P(ax - tx, y1a, az - tz), it.color);
		quad(P(bx + tx, y0b, bz + tz), P(bx - tx, y0b, bz - tz), P(bx - tx, y1b, bz - tz), P(bx + tx, y1b, bz + tz), it.color);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

function instanced(geometry, material, list, shadow){
	const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
	const c = new THREE.Color();
	list.forEach((it, i) => {
		e.set(it.rx || 0, it.ry || 0, it.rz || 0, "YXZ");
		q.setFromEuler(e);
		p.set(it.x, it.y || 0, it.z);
		s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
		m.compose(p, q, s);
		mesh.setMatrixAt(i, m);
		if(it.color !== undefined){ c.set(it.color); mesh.setColorAt(i, c); }
	});
	mesh.count = list.length;
	mesh.castShadow = !!shadow;
	mesh.receiveShadow = !!shadow;
	mesh.frustumCulled = false;
	return mesh;
}

// A flat ribbon along the centreline between two lateral offsets (left = +). With colorFn, each
// piece between samples is its own quad in one colour (crisp kerb blocks, no blending).
function ribbon(center, from, to, y, keepFn, colorFn){
	if(colorFn) return blockRibbon(center, from, to, y, keepFn, colorFn);
	const n = center.n, pos = [], col = [], idx = [];
	const c = new THREE.Color();
	for(let i = 0; i <= n; i++){
		const k = i % n;
		const nx = center.tz[k], nz = -center.tx[k];
		const ya = y + (center.h ? center.h[k] + from * center.bank[k] : 0), yb = y + (center.h ? center.h[k] + to * center.bank[k] : 0);
		pos.push(center.x[k] + nx * from, ya, center.z[k] + nz * from, center.x[k] + nx * to, yb, center.z[k] + nz * to);
		c.set(colorFn ? colorFn(k) : 0xffffff);
		col.push(c.r, c.g, c.b, c.r, c.g, c.b);
		if(i < n && (!keepFn || keepFn(k))){
			const a = i * 2;
			idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

function blockRibbon(center, from, to, y, keepFn, colorFn){
	const n = center.n, pos = [], col = [], idx = [], c = new THREE.Color();
	const edge = (k, lat) => [center.x[k] + center.tz[k] * lat, y + (center.h ? center.h[k] + lat * center.bank[k] : 0), center.z[k] - center.tx[k] * lat];
	for(let i = 0; i < n; i++){
		if(keepFn && !keepFn(i)) continue;
		const j = (i + 1) % n, base = pos.length / 3;
		pos.push(...edge(i, from), ...edge(i, to), ...edge(j, from), ...edge(j, to));
		c.set(colorFn(i));
		for(let v = 0; v < 4; v++) col.push(c.r, c.g, c.b);
		idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

function sky(top, bottom, radius){
	const g = new THREE.SphereBufferGeometry(radius, 24, 12);
	g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
	const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	paintSky(mesh, new THREE.Color(top), new THREE.Color(bottom), radius);
	return mesh;
}
function paintSky(mesh, a, b, radius){
	const p = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, c = new THREE.Color();
	for(let i = 0; i < p.count; i++){
		const t = Math.max(0, Math.min(1, p.getY(i) / radius * 1.6 + 0.05));
		c.copy(b).lerp(a, Math.pow(t, 0.8));
		col.setXYZ(i, c.r, c.g, c.b);
	}
	col.needsUpdate = true;
}

// ---------- Time of day ----------
// A palette per time of day; the one matching the track's own look is the track's colours.
const pal = (top, bottom, fog, sun, sunColor, hemiSky, hemiGround, hemi, amb, night) => ({ top, bottom, fog, sun, sunColor, hemiSky, hemiGround, hemi, amb, night });
const GENERIC = {
	night: pal(0x040611, 0x1a2144, 0x121634, 0.16, 0x9fb4ff, 0x5d6aa8, 0x14161f, 0.42, 0.1, 1),
	dawn: pal(0x3b4a7a, 0xf2a48a, 0xd9a58f, 0.5, 0xffc9a0, 0xd8c8ff, 0x6b6a55, 0.45, 0.14, 0.35),
	day: pal(0x4a9eff, 0xd2eaff, 0xd2eaff, 0.7, 0xffffff, 0xffffff, 0x6b7a55, 0.55, 0.18, 0),
	sunset: pal(0x241a45, 0xff8a4c, 0xd98160, 0.85, 0xffb27a, 0xffd2b0, 0x6b5a55, 0.45, 0.15, 0.2),
	dusk: pal(0x0d1030, 0x5a3a6a, 0x3a2c4c, 0.3, 0xff9a70, 0x8a7ab8, 0x2a2430, 0.38, 0.12, 0.7)
};
const KEYS = [[0, "night"], [4.8, "night"], [6, "dawn"], [8, "day"], [17, "day"], [18.9, "sunset"], [20.3, "dusk"], [21.5, "night"], [24, "night"]];
function palettesFor(theme, skyTop, skyBottom){
	const own = pal(skyTop, skyBottom, theme.fog ? theme.fog[0] : skyBottom, theme.sun ?? 0.7, theme.sunColor ?? (theme.night ? 0x9fb4ff : 0xffffff),
		theme.night ? 0x5d6aa8 : 0xffffff, theme.night ? 0x14161f : 0x6b7a55, theme.amb ?? 0.55, theme.night ? 0.12 : 0.18, theme.night ? 1 : theme.tod === "sunset" ? 0.2 : 0);
	const p = Object.assign({}, GENERIC);
	p[theme.night ? "night" : theme.tod === "sunset" ? "sunset" : "day"] = own;
	return p;
}
const ca = new THREE.Color(), cb = new THREE.Color();
function mixHex(a, b, f){ return ca.set(a).lerp(cb.set(b), f).getHex(); }
function paletteAt(p, hour){
	let i = 0;
	while(i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
	const [h0, k0] = KEYS[i], [h1, k1] = KEYS[i + 1];
	const f = h1 > h0 ? Math.max(0, Math.min(1, (hour - h0) / (h1 - h0))) : 0;
	const a = p[k0], b = p[k1], out = {};
	for(const k in a) out[k] = typeof a[k] === "number" && k !== "sun" && k !== "hemi" && k !== "amb" && k !== "night" ? mixHex(a[k], b[k], f) : a[k] + (b[k] - a[k]) * f;
	return out;
}

export function buildWorld(track, opts = {}){
	const theme = THEMES[(track.def && track.def.theme) || "classic"] || THEMES.classic;
	const quality = opts.quality || "high";
	const shadows = quality === "high";
	const rand = seededRandom("world:" + track.id);
	const group = new THREE.Group();
	const disposables = [];
	const updaters = [];
	const keep = x => (disposables.push(x), x);

	const b = track.bounds;
	const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
	const radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 30;
	const mDist = Math.max(track.mountainDist, radius + 150);
	const farPlane = Math.max(1000, mDist + 900);

	// Sky, fog and light.
	const skyTop = Array.isArray(theme.sky) ? theme.sky[0] : theme.sky;
	const skyBottom = Array.isArray(theme.sky) ? theme.sky[1] : theme.sky;
	let skyMesh = null;
	if(Array.isArray(theme.sky)){
		skyMesh = sky(skyTop, skyBottom, farPlane * 0.85);
		keep(skyMesh.geometry); keep(skyMesh.material);
		group.add(skyMesh);
	}
	// Fog is always there so rain can close in; tracks without fog start with it out of sight.
	const fogBase = theme.fog ? [theme.fog[1], theme.fog[2]] : [farPlane * 2, farPlane * 3];
	const fog = new THREE.Fog(theme.fog ? theme.fog[0] : skyBottom, fogBase[0], fogBase[1]);
	const hemi = new THREE.HemisphereLight(theme.night ? 0x5d6aa8 : 0xffffff, theme.night ? 0x14161f : 0x6b7a55, theme.amb ?? 0.55);
	group.add(hemi);
	const ambient = new THREE.AmbientLight(0xffffff, theme.night ? 0.12 : 0.18);
	group.add(ambient);
	const sun = new THREE.DirectionalLight(theme.sunColor ?? (theme.night ? 0x9fb4ff : 0xffffff), theme.sun ?? 0.7);
	sun.position.set(300, 400, -200);
	sun.target.position.set(0, 0, 0);
	group.add(sun, sun.target);
	if(shadows){
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		const sc = sun.shadow.camera;
		sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 100; sc.far = 900;
		sun.shadow.bias = -0.0005;
	}
	const sunOffset = new THREE.Vector3(180, 320, -120);

	// Ground.
	const groundSize = (mDist + 800) * 2;
	let groundMat;
	if(theme.stripes){
		const stripes = keep(canvasTexture(1, 2, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1); g.fillStyle = "#fff"; g.fillRect(0, 1, 1, 1); }));
		stripes.magFilter = THREE.NearestFilter;
		stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
		stripes.repeat.set(groundSize / 10, groundSize / 10);
		groundMat = keep(new THREE.MeshLambertMaterial({ color: theme.ground, emissive: 0x0f0f0f, emissiveMap: stripes }));
	}else{
		groundMat = keep(new THREE.MeshLambertMaterial({ color: theme.ground }));
	}
	// Which side is sea (Monaco, Jeddah), in real compass terms.
	let seaEdge = null;
	if(theme.sea && track.toMap){
		const [dx, dy] = theme.sea.dir, l = Math.hypot(dx, dy);
		const ux = dx / l, uy = dy / l;
		let edge = -Infinity;
		for(const [x1, z1, x2, z2] of track.wallSegs) for(const [x, z] of [[x1, z1], [x2, z2]]){
			const [mx, my] = track.toMap(x, z);
			edge = Math.max(edge, mx * ux + my * uy);
		}
		seaEdge = { ux, uy, edge: edge + 25 };
	}
	const isSea = seaEdge ? (x, z) => { const [mx, my] = track.toMap(x, z); return mx * seaEdge.ux + my * seaEdge.uy > seaEdge.edge; } : null;
	// A harbour beside part of the lap (Monaco's Port Hercule, from the tunnel exit round Tabac and
	// the Swimming Pool): water from a quay beside the road out to the open sea.
	let harbour = null;
	if(track.def && track.def.harbour && track.center && track.center.h){
		const c = track.center, n = c.n, [f0, f1] = track.def.harbour, rev = !!track.reverse;
		const a = Math.floor((rev ? 1 - f1 : f0) * n), b = Math.floor((rev ? 1 - f0 : f1) * n), side = rev ? -1 : 1, off = c.hw + 9;
		const quay = [];
		for(let i = a; i <= b; i += 2){
			const s = i % n, x = c.x[s] + c.tz[s] * side * off, z = c.z[s] - c.tx[s] * side * off;
			// Inside a tight corner the offset line folds over itself: leave out points that end up
			// closer to the road than the quay should be, and any that would step backwards.
			let near = Infinity;
			c.hash.near(x, z, off, j => { near = Math.min(near, Math.hypot(c.x[j] - x, c.z[j] - z)); });
			if(near < off - 0.5) continue;
			const prev = quay[quay.length - 1];
			if(prev && ((x - prev.x) * c.tx[s] + (z - prev.z) * c.tz[s]) <= 0) continue;
			quay.push({ s, x, z });
		}
		// Water: points whose nearest bit of this stretch of road has them on the harbour side,
		// past the quay (and not past the ends of the stretch).
		const S = [];
		for(let i = a; i <= b; i++) S.push(i % n);
		const inside = (x, z) => {
			let best = Infinity, j = -1;
			for(const s of S){ const d = (c.x[s] - x) ** 2 + (c.z[s] - z) ** 2; if(d < best){ best = d; j = s; } }
			const dx = x - c.x[j], dz = z - c.z[j];
			const lat = (dx * c.tz[j] - dz * c.tx[j]) * side, along = dx * c.tx[j] + dz * c.tz[j];
			return lat > off - 0.5 && lat < 420 && Math.abs(along) < 3;
		};
		// Its extent, for the water surface.
		const bb = track.bounds, box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
		for(let x = bb.minX - 300; x <= bb.maxX + 300; x += 8) for(let z = bb.minZ - 300; z <= bb.maxZ + 300; z += 8) if(inside(x, z)){
			box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
		}
		harbour = { quay, inside, side, box };
	}
	let isWater = harbour ? (x, z) => (isSea && isSea(x, z)) || harbour.inside(x, z) : isSea;
	// Real surroundings (js/places.js): the real coastline, lagoons and marina. Never right next
	// to the road (the map's coastline and the game's road don't line up to the metre).
	const geo = track.center ? placeGeo(track) : null;
	if(geo){
		const c = track.center, clear = c.hw + 10;
		const byRoad = (x, z) => { let near = false; c.hash.near(x, z, clear, j => { if(!near && Math.hypot(c.x[j] - x, c.z[j] - z) < clear) near = true; }); return near; };
		isWater = (x, z) => !byRoad(x, z) && geo.isWater(x, z);
	}

	// Elevated circuits get rolling ground built from the road's own heights.
	let terrain = null;
	if(track.elevated){
		terrain = buildTerrain(track, { isSea: isWater, uvOrigin: { x: cx - groundSize / 2, z: cz + groundSize / 2 } });
		keep(terrain.geometry);
		let tmat = groundMat;
		if(theme.stripes && groundMat.emissiveMap){
			const t = keep(groundMat.emissiveMap.clone());
			t.repeat.set(1, 1); t.needsUpdate = true;
			tmat = keep(new THREE.MeshLambertMaterial({ color: theme.ground, emissive: 0x0f0f0f, emissiveMap: t }));
		}
		const tm = new THREE.Mesh(terrain.geometry, tmat);
		tm.receiveShadow = shadows;
		tm.frustumCulled = false;
		group.add(tm);
	}
	const groundAt = terrain ? terrain.groundAt : () => 0;
	const heightAt = track.heightAt || (() => 0);
	const ground = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(groundSize, groundSize)), groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(cx, terrain ? terrain.base - 0.05 : 0, cz);
	ground.receiveShadow = shadows;
	group.add(ground);

	let roadMat = null;
	// Road, edge lines, kerbs, start line, grid boxes (circuits only; the Classic look has none).
	if(track.center && theme.road !== undefined){
		const c = track.center, hw = c.hw;
		roadMat = keep(new THREE.MeshPhongMaterial({ color: theme.road, emissive: theme.night ? 0x14161c : 0x000000, specular: 0x000000, shininess: 40, side: THREE.DoubleSide }));
		const road = new THREE.Mesh(keep(ribbon(c, hw + 0.8, -hw - 0.8, 0.02)), roadMat);
		road.receiveShadow = shadows;
		group.add(road);
		const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0xe9edf2, side: THREE.DoubleSide, fog: true }));
		const keepL = k => track.keep[0][k], keepR = k => track.keep[1][k];
		group.add(new THREE.Mesh(keep(ribbon(c, hw - 0.5, hw - 0.8, 0.035, keepL)), lineMat));
		group.add(new THREE.Mesh(keep(ribbon(c, -hw + 0.8, -hw + 0.5, 0.035, keepR)), lineMat));

		const kerbMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
		for(const k of track.kerbs){
			if(k.end - k.start < 6) continue;
			const inRange = i => i >= k.start - 3 && i <= k.end + 3;
			const [ka, kb] = theme.kerb || [0xe23b3b, 0xf4f6fa];
			const colorFn = i => (Math.floor(i / 2.5) % 2 ? ka : kb);
			const [a, bb] = k.side === 0 ? [hw + 0.2, hw - 1.4] : [-hw + 1.4, -hw - 0.2];
			const mesh = new THREE.Mesh(keep(ribbon(c, a, bb, 0.045, i => inRange(i) && track.keep[k.side][i], colorFn)), kerbMat);
			group.add(mesh);
		}

		// Chequered start line.
		const chk = keep(canvasTexture(16, 2, (g) => { for(let i = 0; i < 16; i++) for(let j = 0; j < 2; j++){ g.fillStyle = (i + j) % 2 ? "#111" : "#f5f5f5"; g.fillRect(i, j, 1, 1); } }));
		chk.magFilter = THREE.NearestFilter;
		const startLine = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(hw * 2, 1.6)), keep(new THREE.MeshLambertMaterial({ map: chk })));
		startLine.rotation.x = -Math.PI / 2;
		const h0 = heightAt(0, START_Z);
		startLine.position.set(0, 0.05 + h0, START_Z);
		group.add(startLine);
		// Gantry over the line.
		const gantry = mergedBoxes([
			{ x: hw + 1.6, y: 3.5, z: START_Z, w: 0.5, h: 7, d: 0.5, color: 0x2a2e38 },
			{ x: -hw - 1.6, y: 3.5, z: START_Z, w: 0.5, h: 7, d: 0.5, color: 0x2a2e38 },
			{ x: 0, y: 7.2, z: START_Z, w: hw * 2 + 3.7, h: 1.2, d: 0.6, color: 0x1a1d25 }
		]);
		const gm = new THREE.Mesh(keep(gantry), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
		gm.position.y = h0;
		group.add(gm);
		const banner = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(hw * 2 + 3, 1)), keep(new THREE.MeshBasicMaterial({ map: chk, side: THREE.DoubleSide })));
		banner.position.set(0, 7.2 + h0, START_Z - 0.32);
		group.add(banner);
		// Grid slots.
		const slots = GRID.slice(0, 10).map(g => ({ x: g.x, y: 0.05 + heightAt(g.x, g.y + 1.25), z: g.y + 1.25, sx: 1.4, sy: 1, sz: 0.14 }));
		group.add(instanced(keep(new THREE.BoxBufferGeometry(1, 0.02, 1)), lineMat, slots));
	}else if(!track.center){
		// Original-style start line and checkpoint.
		track.lines.forEach((l, i) => {
			const m = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(l.width, 0.1, 1)), keep(new THREE.MeshLambertMaterial({ color: i == 0 ? 0x2580db : 0xdb2525 })));
			m.position.copy(l.position);
			m.rotation.set(0, l.angle, 0, "YXZ");
			group.add(m);
		});
	}

	// Walls.
	const wallItems = [];
	const wallH = theme.wallH || 1.2;
	const style = theme.wall;
	const pairs = { redwhite: [0xd8342f, 0xf2f2f2], bluewhite: [0x2f63c9, 0xf2f2f2], tyres: [0x1d1e22, 0xe9e9e9], concrete: [0xc9ccd2, 0xc9ccd2] };
	// Tyre walls (theme.tyreWall colours) on the outside of corners: wall pieces on the side
	// opposite a kerb, near it.
	const outsideOfCorner = (() => {
		if(!theme.tyreWall || !track.center) return () => false;
		const n = track.center.n, mark = [new Uint8Array(n), new Uint8Array(n)];
		// Only slow corners (tighter than 16 units radius somewhere), not fast sweepers.
		const curv = track.center.curv;
		for(const k of track.kerbs){
			if(k.end - k.start < 6) continue;
			let tight = 0;
			for(let i = k.start; i <= k.end; i++) tight = Math.max(tight, Math.abs(curv[i % n]));
			if(tight < 1 / 16) continue;
			for(let i = k.start - 12; i <= k.end + 12; i++) mark[1 - k.side][(i + n) % n] = 1;
		}
		return (side, q) => q >= 0 && mark[side][q] === 1;
	})();
	let tyre = 0;
	for(const [x1, z1, x2, z2, wside, i1, i2] of track.wallSegs){
		const len = Math.hypot(x2 - x1, z2 - z1);
		// The road sample a point part way along the segment belongs to (for its height).
		const n = track.center ? track.center.n : 1, span = i1 === undefined ? 0 : ((i2 - i1) % n + n) % n;
		const sampleAt = t => i1 === undefined ? -1 : Math.round(i1 + span * t) % n;
		const ry = Math.atan2(z1 - z2, x2 - x1);
		if(typeof style === "number" && track.elevated){
			// On hills a long straight piece would float or sink in the middle: use short ones.
			const pieces = Math.max(1, Math.round(len / 3));
			for(let p = 0; p < pieces; p++){
				const t = (p + 0.5) / pieces;
				const q = sampleAt(t), tw = outsideOfCorner(wside, q);
				wallItems.push({ x: x1 + (x2 - x1) * t, y: wallH / 2, z: z1 + (z2 - z1) * t, w: len / pieces + 0.04, h: wallH, d: tw ? 0.9 : 0.3, ry, color: tw ? theme.tyreWall[tyre++ % 2] : style, seg: q });
			}
		}else if(typeof style === "number"){
			wallItems.push({ x: (x1 + x2) / 2, y: wallH / 2, z: (z1 + z2) / 2, w: len + 0.3, h: wallH, d: 0.3, ry, color: style });
		}else{
			const [ca, cb] = pairs[style] || pairs.redwhite;
			const pieces = Math.max(1, Math.round(len / 3));
			for(let p = 0; p < pieces; p++){
				const t = (p + 0.5) / pieces;
				wallItems.push({ x: x1 + (x2 - x1) * t, y: wallH / 2, z: z1 + (z2 - z1) * t, w: len / pieces + 0.04, h: wallH, d: 0.3, ry, color: p % 2 ? ca : cb, seg: sampleAt(t) });
			}
		}
	}
	const wallMesh = new THREE.Mesh(keep(track.elevated ? wallStrips(track, wallItems, wallH, heightAt) : mergedBoxes(wallItems)), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
	wallMesh.castShadow = wallMesh.receiveShadow = shadows;
	group.add(wallMesh);
	// Painted run-off outside the slow corners (theme.runoff colours): a band beyond the barrier,
	// left out wherever it would reach another piece of road.
	if(theme.runoff && track.center){
		const c = track.center, n = c.n, curv = c.curv, cols = theme.runoff;
		let k = 0;
		for(const kb of track.kerbs){
			if(kb.end - kb.start < 6) continue;
			let tight = 0;
			for(let i = kb.start; i <= kb.end; i++) tight = Math.max(tight, Math.abs(curv[i % n]));
			if(tight < 1 / 16) continue;
			const out = kb.side === 0 ? -1 : 1, color = cols[k++ % cols.length];
			const a = out > 0 ? c.hw + 0.35 : -c.hw - 7, b2 = out > 0 ? c.hw + 7 : -c.hw - 0.35;
			const inRange = i => i >= kb.start - 8 && i <= kb.end + 8;
			const clearAt = i => {
				const lat = out * (c.hw + 7), x = c.x[i] + c.tz[i] * lat, z = c.z[i] - c.tx[i] * lat;
				let ok = true;
				c.hash.near(x, z, c.hw + 1, j => { if(ok && Math.min(Math.abs(j - i), n - Math.abs(j - i)) > 30 && Math.hypot(c.x[j] - x, c.z[j] - z) < c.hw + 1) ok = false; });
				return ok;
			};
			group.add(new THREE.Mesh(keep(ribbon(c, a, b2, 0.015, i => inRange(i) && track.keep[kb.side === 0 ? 1 : 0][i] && clearAt(i), () => color)),
				keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: theme.night ? 0x111111 : 0, side: THREE.DoubleSide }))));
		}
	}
	// Catch fencing on top of the barriers (Monaco): posts, two rails and see-through mesh.
	if(theme.catchFence && track.center && track.elevated){
		const t = track.features && track.features.tunnel, n = track.center.n;
		const inTunnel = s => t && s >= 0 && ((s - t[0] + n) % n) <= ((t[1] - t[0] + n) % n) + 2;
		const fenceItems = wallItems.filter(w => !inTunnel(w.seg ?? -1));
		const FH = 2.6, top = wallH + FH;
		const rails = [], mesh = [];
		for(const w of fenceItems){
			for(const y of [wallH + FH * 0.5, top]) rails.push(Object.assign({}, w, { y, h: 0.07, d: 0.07, color: 0x8d949c }));
			mesh.push(Object.assign({}, w, { y: wallH + FH / 2, h: FH, d: 0.02, color: 0x9aa3ad }));
		}
		group.add(new THREE.Mesh(keep(wallStrips(track, rails, 0.07, heightAt)), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));
		const wire = new THREE.Mesh(keep(wallStrips(track, mesh, FH, heightAt)), keep(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })));
		wire.renderOrder = 2;
		group.add(wire);
		const posts = [];
		fenceItems.forEach((w, k) => { if(k % 2) return; const y = heightAt(w.x, w.z, w.seg ?? -1); posts.push({ x: w.x, y: y + wallH + FH / 2, z: w.z, sx: 0.1, sy: FH, sz: 0.1, ry: w.ry }); });
		group.add(instanced(keep(new THREE.BoxBufferGeometry(1, 1, 1)), keep(new THREE.MeshLambertMaterial({ color: 0x7d848c })), posts, shadows));
	}
	if(style === "concrete"){
		// Jeddah: a strip of light along the top of every wall.
		const strip = wallItems.map(w => Object.assign({}, w, { y: wallH + 0.05, h: 0.1, d: 0.32, color: 0x7ad7ff }));
		group.add(new THREE.Mesh(keep(track.elevated ? wallStrips(track, strip, 0.1, heightAt) : mergedBoxes(strip)), keep(new THREE.MeshBasicMaterial({ vertexColors: true }))));
	}

	// Trees, grandstands, pits, billboards, buildings (see scenery.js).
	const scenery = track.scenery || [];
	const extras = buildScenery(track, theme, { group, keep, shadows, quality, rand, groundAt, harbour, geo, isWater });
	const occluders = extras.occluders;
	updaters.push(...extras.updaters);
	if(theme.trees === "classic"){
		const cone = keep(new THREE.CylinderBufferGeometry(0, 4, 15, 8));
		const mat = keep(new THREE.MeshLambertMaterial({ color: 0x1bad2c }));
		group.add(instanced(cone, mat, (track.trees || []).map(t => ({ x: t.x, z: t.z, s: t.s })), shadows));
		for(const t of track.trees || []) occluders.add({ x: t.x, z: t.z, ry: 0, hw: 2.4 * t.s, hd: 2.4 * t.s, y0: 0, y1: 11 * t.s });
		const sign = keep(new THREE.ConeBufferGeometry(0.7, 2, 5));
		const smat = keep(new THREE.MeshLambertMaterial({ color: 0xff0000 }));
		group.add(instanced(sign, smat, (track.signs || []).map(s => ({ x: s.x, y: s.y, z: s.z, rx: Math.PI / 2, ry: s.rot })), shadows));
	}
	const roomFor = (x, z, m) => !extras.clearOfRoad || extras.clearOfRoad(x, z, m);
	if(track.features && track.features.tunnel){
		const t = buildTunnel(track, track.features.tunnel, keep);
		for(const m of t.meshes){ m.receiveShadow = shadows; group.add(m); }
		for(const o of t.occluders) occluders.add(o);
	}
	if(terrain && track.center){
		// Retaining walls where the road stands above the ground beside it (left open under the bridge deck).
		const br = track.features && track.features.bridge, n = track.center.n;
		const skip = br ? i => Math.min(Math.abs(i - br[1]), n - Math.abs(i - br[1])) <= 60 && track.center.h[i] - groundAt(track.center.x[i], track.center.z[i]) > 1.2 : undefined;
		const sk = new THREE.Mesh(keep(buildSkirts(track, groundAt, skip, { ground: theme.ground, stone: theme.skirt })), keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
		sk.receiveShadow = shadows;
		group.add(sk);
	}
	if(track.features && track.features.bridge && terrain){
		const br = buildBridge(track, track.features.bridge, groundAt, keep);
		if(br.items.length){
			const m = new THREE.Mesh(keep(mergedBoxes(br.items)), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
			m.castShadow = m.receiveShadow = shadows;
			group.add(m);
		}
		const deck = new THREE.Mesh(keep(br.deck), keep(new THREE.MeshLambertMaterial({ color: 0x9aa1ab, side: THREE.DoubleSide })));
		deck.castShadow = deck.receiveShadow = shadows;
		group.add(deck);
		for(const o of br.occluders) occluders.add(o);
	}

	// Real water (the sea, lagoons, the marina) across the whole ground patch: the ground only
	// dips below it where the map says there's water.
	if(geo && terrain){
		const pt = terrain.patch, wg = keep(new THREE.PlaneBufferGeometry(pt.x1 - pt.x0, pt.z1 - pt.z0));
		wg.rotateX(-Math.PI / 2);
		wg.translate((pt.x0 + pt.x1) / 2, terrain.base + 0.02, (pt.z0 + pt.z1) / 2);
		const sea = theme.sea || { color: 0x1f6fb0 };
		group.add(new THREE.Mesh(wg, keep(new THREE.MeshLambertMaterial({ color: sea.color, emissive: theme.night ? 0x061634 : 0x0a2a4a }))));
	}

	// The harbour's water, with a stone quay wall down to it.
	if(harbour && terrain){
		// One flat sheet at sea level: the ground is dipped under it in the harbour and stays
		// above it everywhere else, so the shoreline is where they meet.
		const hbx = harbour.box, hg = keep(new THREE.PlaneBufferGeometry(hbx.maxX - hbx.minX + 30, hbx.maxZ - hbx.minZ + 30));
		hg.rotateX(-Math.PI / 2);
		hg.translate((hbx.minX + hbx.maxX) / 2, 0, (hbx.minZ + hbx.maxZ) / 2);
		const water = new THREE.Mesh(hg, keep(new THREE.MeshLambertMaterial({ color: theme.sea ? theme.sea.color : 0x1f6fb0, emissive: theme.night ? 0x050b18 : 0x0a2a4a, side: THREE.DoubleSide })));
		water.position.y = terrain.base + 0.03;
		group.add(water);
		const c = track.center, pos = [], idx = [];
		harbour.quay.forEach((p, k) => {
			const top = c.h[p.s] - 0.3;
			pos.push(p.x, top, p.z, p.x, terrain.base - 1, p.z);
			if(k) idx.push((k - 1) * 2, (k - 1) * 2 + 1, k * 2, k * 2, (k - 1) * 2 + 1, k * 2 + 1);
		});
		const qg = new THREE.BufferGeometry();
		qg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		qg.setIndex(idx);
		qg.computeVertexNormals();
		group.add(new THREE.Mesh(keep(qg), keep(new THREE.MeshLambertMaterial({ color: 0xbfb4a0, side: THREE.DoubleSide }))));
	}

	// Where there's a roof overhead (the tunnel, under the bridge deck), and how high: rain
	// doesn't fall there, and it sounds like you're under cover. Cells of 2 x 2 units.
	const roofs = new Map(), RC = 2;
	const addRoof = (x, z, y) => { const k = Math.floor(x / RC) + "," + Math.floor(z / RC), o = roofs.get(k); if(o === undefined || y < o) roofs.set(k, y); };
	if(track.center && track.center.h && track.features){
		const c = track.center, n = c.n, hw = c.hw;
		const cover = (i, half, y) => {
			for(let lat = -half; lat <= half; lat += 1) for(let al = -1; al <= 1; al += 1)
				addRoof(c.x[i] + c.tz[i] * lat + c.tx[i] * al, c.z[i] - c.tx[i] * lat + c.tz[i] * al, y);
		};
		if(track.features.tunnel){
			const [a, b] = track.features.tunnel, len = (b - a + n) % n;
			for(let k = 0; k <= len; k++){ const i = (a + k) % n; cover(i, hw + TUNNEL_WALL + 0.7, c.h[i] + 6); }
		}
		if(track.features.bridge && terrain){
			const up = track.features.bridge[1];
			for(let o = -60; o <= 60; o++){
				const i = (up + o + n) % n;
				if(c.h[i] - groundAt(c.x[i], c.z[i]) > 1.2) cover(i, hw + 0.8, c.h[i] - 1.3);
			}
		}
	}
	const roofAt = (x, z) => roofs.get(Math.floor(x / RC) + "," + Math.floor(z / RC));

	// Sea beyond one side of the circuit, in real compass terms.
	if(seaEdge){
		const { ux, uy, edge } = seaEdge, px = -uy, py = ux;
		const [mcx, mcy] = track.toMap(cx, cz);
		const along = mcx * px + mcy * py;
		const big = groundSize;
		const corners = [[edge, along - big], [edge, along + big], [edge + big, along + big], [edge + big, along - big]]
			.map(([a, s]) => track.fromMap(ux * a + px * s, uy * a + py * s));
		const g = new THREE.BufferGeometry();
		const seaY = terrain ? terrain.base + 0.02 : 0.06;     // just above the far ground plane; the terrain dips under it on the sea side
		g.setAttribute("position", new THREE.Float32BufferAttribute([].concat(...corners.map(([x, z]) => [x, seaY, z])), 3));
		g.setIndex([0, 1, 2, 0, 2, 3]);
		g.computeVertexNormals();
		const sea = new THREE.Mesh(keep(g), keep(new THREE.MeshLambertMaterial({ color: theme.sea.color, emissive: theme.night ? 0x050b18 : 0x0a2a4a, side: THREE.DoubleSide })));
		group.add(sea);
	}

	if(theme.lake && track.center){
		const lake = new THREE.Mesh(keep(new THREE.CircleBufferGeometry(1, 40)), keep(new THREE.MeshLambertMaterial({ color: 0x2c7fc4, emissive: 0x0a2a4a })));
		lake.rotation.x = -Math.PI / 2;
		lake.scale.set((b.maxX - b.minX) * 0.2, (b.maxZ - b.minZ) * 0.2, 1);
		lake.position.set(cx, 0.06, cz);
		group.add(lake);
	}

	// Floodlights along every circuit. They light up at night (and at dusk on the speedway).
	let headMat = null, poolMat = null;
	if(track.center){
		const c = track.center, hw = c.hw, poles = [], heads = [], pools = [];
		for(let i = 0; i < c.n; i += 42){
			const side = (i / 42) % 2 ? 1 : -1;
			const nx = c.tz[i] * side, nz = -c.tx[i] * side;
			const off = hw + 3;
			const x = c.x[i] + nx * off, z = c.z[i] + nz * off;
			if(!track.keep[side > 0 ? 0 : 1][i] || !roomFor(x, z, 0.8)) continue;
			const gy = Math.max(groundAt(x, z), c.h ? c.h[i] - 1 : 0), py = c.h ? c.h[i] : 0;
			poles.push({ x, y: gy + 5 + (py - gy) / 2, z, sx: 0.3, sy: 10 + (py - gy), sz: 0.3 });
			heads.push({ x: x - nx * 1.2, y: py + 10, z: z - nz * 1.2, sx: 1.4, sy: 0.4, sz: 1.4 });
			// The pool of light lies on the road, tilted with its camber (so it doesn't clip into it).
			const lat = -side * (hw * 0.7 + 3) + side * off, bank = c.bank ? c.bank[i] : 0;
			pools.push({ x: x - nx * (hw * 0.7 + 3), y: py + lat * bank + 0.07, z: z - nz * (hw * 0.7 + 3), rx: -Math.PI / 2 + Math.atan(bank), ry: Math.atan2(-c.tz[i], c.tx[i]), s: hw * 1.6 });
		}
		const unit = keep(new THREE.BoxBufferGeometry(1, 1, 1));
		group.add(instanced(unit, keep(new THREE.MeshLambertMaterial({ color: 0x3a3f4a })), poles));
		headMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
		group.add(instanced(unit, headMat, heads));
		const glow = keep(canvasTexture(64, 64, (g) => {
			const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			r.addColorStop(0, "rgba(255,236,190,0.9)"); r.addColorStop(1, "rgba(255,236,190,0)");
			g.fillStyle = r; g.fillRect(0, 0, 64, 64);
		}));
		poolMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
		group.add(instanced(keep(new THREE.PlaneBufferGeometry(1, 1)), poolMat, pools));
	}

	// A big wheel in the paddock at Suzuka.
	if(theme.ferris && scenery.some(s => s.off > 40 && roomFor(s.x, s.z, 22))){
		const spot = scenery.find(s => s.off > 40 && roomFor(s.x, s.z, 22));
		const wheel = new THREE.Group();
		const ringMat = keep(new THREE.MeshLambertMaterial({ color: 0xf4f6fa }));
		const ring = new THREE.Mesh(keep(new THREE.TorusBufferGeometry(18, 0.5, 6, 40)), ringMat);
		wheel.add(ring);
		for(let k = 0; k < 12; k++){
			const a = k / 12 * Math.PI * 2;
			const spoke = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(0.3, 18, 0.3)), ringMat);
			spoke.position.set(Math.sin(a) * 9, Math.cos(a) * 9, 0);
			spoke.rotation.z = -a;
			wheel.add(spoke);
			const cab = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(2, 2, 2)), keep(new THREE.MeshLambertMaterial({ color: new THREE.Color(`hsl(${k * 30}, 80%, 58%)`) })));
			cab.position.set(Math.sin(a) * 18, Math.cos(a) * 18 - 1.4, 0);
			wheel.add(cab);
		}
		const holder = new THREE.Group();
		holder.position.set(spot.x, 21 + groundAt(spot.x, spot.z), spot.z);
		holder.rotation.y = spot.face;
		holder.add(wheel);
		const legs = mergedBoxes([
			{ x: -6, y: -10.5, z: 0, w: 0.8, h: 22, d: 0.8, ry: 0, color: 0x9aa3ad },
			{ x: 6, y: -10.5, z: 0, w: 0.8, h: 22, d: 0.8, ry: 0, color: 0x9aa3ad }
		]);
		holder.add(new THREE.Mesh(keep(legs), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));
		group.add(holder);
		occluders.add({ x: spot.x, z: spot.z, ry: spot.face, hw: 19, hd: 2, y0: 2, y1: 40 });
		updaters.push(dt => { wheel.rotation.z += dt * 0.08; wheel.children.forEach(o => { if(o.geometry && o.geometry.parameters && o.geometry.parameters.width === 2) o.rotation.z = -wheel.rotation.z; }); });
	}

	// Mountains around the edge.
	if(theme.mountains === "cubes"){
		const list = [];
		for(let i = 0; i < 100; i++){
			const d = rand() * track.mountainDist + track.mountainDist, a = rand() * Math.PI * 2;
			list.push({ x: d * Math.sin(a), z: d * Math.cos(a), rx: rand() * 6.28, ry: rand() * 6.28, rz: rand() * 6.28, s: 100 });
		}
		group.add(instanced(keep(new THREE.BoxBufferGeometry(1, 1, 1)), keep(new THREE.MeshLambertMaterial({ color: theme.mountainColor, side: THREE.DoubleSide })), list));
	}else if(theme.mountains === "hills" || theme.mountains === "peaks"){
		const list = [], caps = [];
		for(let i = 0; i < 70; i++){
			const d = mDist + rand() * 420, a = rand() * Math.PI * 2;
			const r = 70 + rand() * 150, h = theme.mountains === "peaks" ? 120 + rand() * 170 : 35 + rand() * 90;
			list.push({ x: cx + d * Math.sin(a), z: cz + d * Math.cos(a), sx: r, sy: h, sz: r, ry: rand() * 6 });
			if(theme.mountains === "peaks") caps.push({ x: cx + d * Math.sin(a), y: h * 0.62, z: cz + d * Math.cos(a), sx: r * 0.38, sy: h * 0.38, sz: r * 0.38, ry: rand() * 6 });
		}
		const cone = keep(new THREE.ConeBufferGeometry(1, 1, 7)); cone.translate(0, 0.5, 0);
		group.add(instanced(cone, keep(new THREE.MeshLambertMaterial({ color: theme.mountainColor })), list));
		if(caps.length) group.add(instanced(cone, keep(new THREE.MeshLambertMaterial({ color: 0xf5f8fb })), caps));
	}

	// Falling snow that follows the camera.
	let snow = null;
	if(theme.snowfall && quality !== "low"){
		const N = 1400, pos = new Float32Array(N * 3);
		for(let i = 0; i < N; i++){ pos[i * 3] = (rand() - 0.5) * 80; pos[i * 3 + 1] = rand() * 30; pos[i * 3 + 2] = (rand() - 0.5) * 80; }
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		snow = new THREE.Points(keep(g), keep(new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.85 })));
		snow.frustumCulled = false;
		group.add(snow);
	}

	// Rain: streaks that follow the camera. (Glacier Pass gets heavier snow instead.)
	let rainLines = null;
	if(!theme.snowfall){
		const N = quality === "low" ? 700 : 1800, pos = new Float32Array(N * 6);
		for(let i = 0; i < N; i++){
			const x = (rand() - 0.5) * 70, y = rand() * 28, z = (rand() - 0.5) * 70;
			pos.set([x, y, z, x + 0.12, y + 0.9, z], i * 6);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		rainLines = new THREE.LineSegments(keep(g), keep(new THREE.LineBasicMaterial({ color: 0xb8c4d2, transparent: true, opacity: 0, depthWrite: false })));
		rainLines.userData.fallY = Float32Array.from({ length: N }, (_, i) => pos[i * 6 + 1]);
		rainLines.frustumCulled = false;
		rainLines.visible = false;
		group.add(rainLines);
	}
	// Cloud cover: a soft layer high overhead.
	const cloudTex = keep(canvasTexture(256, 256, (g, w, h) => {
		g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, w, h);
		for(let i = 0; i < 90; i++){
			const x = rand() * w, y = rand() * h, r = 18 + rand() * 46;
			for(const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]){
				const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
				gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
				g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
			}
		}
	}));
	cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
	cloudTex.repeat.set(6, 6);
	const cloudMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
	const clouds = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(farPlane * 2.4, farPlane * 2.4)), cloudMat);
	clouds.rotation.x = Math.PI / 2;
	clouds.position.y = 190;
	clouds.visible = false;
	group.add(clouds);
	// Stars on clear nights.
	const starPos = new Float32Array(600 * 3);
	for(let i = 0; i < 600; i++){
		const a = rand() * Math.PI * 2, e = 0.12 + rand() * 1.3, r = farPlane * 0.7;
		starPos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
	}
	const starGeo = keep(new THREE.BufferGeometry());
	starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
	const starMat = keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
	const stars = new THREE.Points(starGeo, starMat);
	stars.frustumCulled = false;
	stars.visible = false;
	group.add(stars);

	// ----- Atmosphere: time of day and weather -----
	const palettes = palettesFor(theme, skyTop, skyBottom);
	const baseRoad = roadMat ? roadMat.color.clone() : null;
	const skyRadius = farPlane * 0.85;
	const GREY_TOP = new THREE.Color(0x6c7682), GREY_BOTTOM = new THREE.Color(0xa3acb5), GREY_FOG = new THREE.Color(0x9aa3ad);
	const skyColor = new THREE.Color(skyBottom);
	const now = { hour: naturalHour(theme), cloud: 0.08, rain: 0 };
	const look = { night: palettes[theme.night ? "night" : "day"].night, dim: 0, rain: 0, wet: 0, lights: 0 };
	let wet = 0, flash = 0, flashTimer = 3, applyTimer = 0, lastKey = "";
	let onThunder = null;
	const tA = new THREE.Color(), tB = new THREE.Color(), tF = new THREE.Color();
	function apply(){
		const p = paletteAt(palettes, now.hour);
		const grey = Math.min(1, now.cloud * 0.62 + now.rain * 0.25);
		const dark = 1 - 0.82 * p.night;
		tA.set(p.top).lerp(tF.copy(GREY_TOP).multiplyScalar(dark), grey);
		tB.set(p.bottom).lerp(tF.copy(GREY_BOTTOM).multiplyScalar(dark), grey);
		const f = 1 + flash * 2.2;
		tA.multiplyScalar(f); tB.multiplyScalar(f);
		const key = [tA.getHex(), tB.getHex()].join();
		if(skyMesh && key !== lastKey) paintSky(skyMesh, tA, tB, skyRadius);
		lastKey = key;
		skyColor.copy(tB);
		fog.color.set(p.fog).lerp(tF.copy(GREY_FOG).multiplyScalar(dark), grey);
		fog.near = fogBase[0] + (Math.min(fogBase[0], 40) - fogBase[0]) * now.rain * 0.9;
		fog.far = fogBase[1] + (Math.min(fogBase[1], 520) - fogBase[1]) * now.rain;
		if(p.night > 0.5) fog.far *= 1 - 0.15 * p.night;
		hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGround);
		hemi.intensity = p.hemi * (1 - 0.15 * now.cloud) + flash * 1.4;
		ambient.intensity = p.amb;
		sun.color.set(p.sunColor);
		sun.intensity = p.sun * (1 - 0.62 * now.cloud);
		// The sun rises in the east and sets in the west; at night it's the moon, fairly high.
		const day = now.hour > 5.5 && now.hour < 20.5;
		const arc = day ? (now.hour - 6) / 12 * Math.PI : 1.1;
		const up = Math.max(0.16, Math.sin(Math.max(0.2, Math.min(Math.PI - 0.2, arc))));
		sunOffset.set(Math.cos(arc) * 300, 70 + up * 330, -120);
		if(!shadows){ sun.position.copy(sunOffset); sun.target.position.set(0, 0, 0); }
		// Lights: floodlights and headlights come on as it gets dark, or in heavy weather.
		const dim = Math.max(p.night, now.cloud * 0.35 + now.rain * 0.3);
		look.night = p.night; look.dim = dim; look.rain = now.rain;
		look.lights = Math.max(theme.lights ? Math.max(p.night, 0.35) : 0, Math.min(1, (dim - 0.25) / 0.5));
		if(poolMat) poolMat.opacity = 0.3 * look.lights;
		if(headMat) headMat.color.set(mixHex(0x8d939e, 0xfff1c9, Math.min(1, look.lights * 1.5)));
		if(extras.setNight) extras.setNight(Math.max(p.night, dim * 0.4));
		starMat.opacity = p.night * (1 - now.cloud) * 0.9;
		stars.visible = starMat.opacity > 0.02;
		cloudMat.opacity = Math.min(0.9, now.cloud * 0.95);
		cloudMat.color.set(tB).lerp(tF.set(0xffffff), 0.2 * dark);
		clouds.visible = cloudMat.opacity > 0.02;
		if(rainLines){ rainLines.material.opacity = Math.min(0.55, now.rain * 0.6); rainLines.visible = now.rain > 0.02; }
		if(snow){ snow.material.opacity = 0.85; snow.material.size = 0.25 + now.rain * 0.25; }
	}
	apply();

	return {
		group, theme, sun, fog, farPlane, occluders, info: extras.info,
		// Height of the ground (terrain) and of the road surface at (x, z).
		groundAt, heightAt, harbour,
		// 1 if (x, y, z) is under a roof (the tunnel, under the bridge), else 0.
		coverAt(x, y, z){ const r = roofAt(x, z); return r !== undefined && y < r ? 1 : 0; },
		look,
		// { hour 0-24, cloud 0-1, rain 0-1 }. Cheap to call every frame.
		setAtmosphere(a){ now.hour = a.hour; now.cloud = a.cloud; now.rain = a.rain; },
		defaultAtmosphere(){ return { hour: naturalHour(theme), cloud: 0.08, rain: 0 }; },
		set onThunder(fn){ onThunder = fn; },
		// Crowd excitement 0..1 (the start, a finish).
		cheer(v){ extras.cheer(v); },
		skyColor,
		center: { x: cx, z: cz }, radius,
		// cam: where the camera is (the rain falls around it), if not the focus.
		update(dt, focus, cam){
			for(const u of updaters) u(dt);
			// Wet road builds up in the rain and dries slowly afterwards.
			wet += (now.rain - wet) * Math.min(1, dt * (now.rain > wet ? 0.12 : 0.04));
			look.wet = wet;
			if(roadMat){
				roadMat.color.copy(baseRoad).multiplyScalar(1 - 0.4 * wet);
				roadMat.specular.setScalar(0.28 * wet);
			}
			// Lightning in heavy rain, with thunder a moment later.
			if(now.rain > 0.7){
				flashTimer -= dt;
				if(flashTimer <= 0){ flash = 1; flashTimer = 6 + Math.random() * 14; if(onThunder) onThunder(0.4 + Math.random() * 1.6); }
			}
			if(flash > 0) flash = Math.max(0, flash - dt * (flash > 0.5 ? 6 : 2.5));
			applyTimer -= dt;
			if(applyTimer <= 0 || flash > 0){ applyTimer = 0.1; apply(); }
			if(focus){
				clouds.position.set(focus.x, 190 + (focus.y || 0), focus.z);
				stars.position.set(focus.x, 0, focus.z);
			}
			const rf = cam || focus;
			if(rainLines && rainLines.visible && rf){
				const p = rainLines.geometry.attributes.position, a = p.array;
				const fall = dt * (38 + now.rain * 14), ys = rainLines.userData.fallY;
				const ox = rf.x, oy = (rf.y || 0) - 14, oz = rf.z;
				// Only look for roofs when there are any nearby.
				const nearRoof = roofs.size > 0 && (roofAt(ox, oz) !== undefined || [[-30, 0], [30, 0], [0, -30], [0, 30], [-20, -20], [20, 20], [-20, 20], [20, -20]].some(([dx, dz]) => roofAt(ox + dx, oz + dz) !== undefined));
				for(let i = 0, s = 0; i < a.length; i += 6, s++){
					let y = ys[s] - fall;
					if(y < 0){ y += 28; }
					ys[s] = y;
					let top = y + 0.9;
					if(nearRoof){
						const r = roofAt(a[i] + ox, a[i + 2] + oz);
						if(r !== undefined && y + oy < r){ y = top = -500; }      // under a roof: not drawn
					}
					a[i + 1] = y; a[i + 4] = top;
				}
				p.needsUpdate = true;
				rainLines.position.set(ox, oy, oz);
			}
			if(skyMesh && focus) skyMesh.position.set(focus.x, 0, focus.z);
			if(shadows && focus){
				sun.target.position.set(focus.x, focus.y || 0, focus.z);
				sun.position.set(focus.x + sunOffset.x, sunOffset.y + (focus.y || 0), focus.z + sunOffset.z);
			}
			if(snow && focus){
				const p = snow.geometry.attributes.position;
				for(let i = 0; i < p.count; i++){
					let y = p.getY(i) - dt * (6 + now.rain * 10);
					if(y < 0) y += 30;
					p.setY(i, y);
					p.setX(i, p.getX(i) + Math.sin(y * 0.4 + i) * dt * 0.6);
				}
				p.needsUpdate = true;
				snow.position.set(focus.x, (focus.y || 0) - 2, focus.z);
			}
		},
		dispose(){
			for(const d of disposables) if(d && d.dispose) d.dispose();
			group.traverse(o => { if(o.isInstancedMesh && o.dispose) o.dispose(); });
		}
	};
}
