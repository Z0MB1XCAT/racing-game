// Builds the 3D scene for a track: sky, ground, road, walls and scenery.
// Nothing here affects driving; walls are drawn where the physics walls are.
import { GRID } from "./physics.js";
import { START_Z, seededRandom } from "./trackgen.js";

const THREE = globalThis.THREE;

export const THEMES = {
	classic: { sky: 0x7fb0ff, ground: 0x57c115, stripes: true, wall: 0xf48342, wallH: 1.5, trees: "classic", mountains: "cubes", mountainColor: 0x888888, sun: 0.7, amb: 0.5 },
	monaco: { sky: [0x4f9dea, 0xd6ebff], ground: 0xcdc3ae, wall: "redwhite", road: 0x45484f, trees: "palm", treeDensity: 0.25,
		buildings: { density: 0.9, palette: [0xf2d7b6, 0xf0c9a8, 0xe8e0cf, 0xf5e6c8, 0xd9b99b, 0xf4efe6, 0xe9c9c0] },
		sea: { dir: [0.25, -1], color: 0x1f6fb0 }, mountains: "hills", mountainColor: 0x7f956a, fog: [0xd6ebff, 500, 1600], grandstand: 1 },
	spa: { sky: [0x7f90a6, 0xcbd4dd], ground: 0x3f7b34, stripes: true, wall: 0xa9b1ba, road: 0x3c4047, trees: "pine", treeDensity: 1.3,
		mountains: "hills", mountainColor: 0x3d663a, fog: [0xbcc6d0, 320, 1300], grandstand: 1, sun: 0.55, amb: 0.6 },
	monza: { sky: [0x4a9eff, 0xd2eaff], ground: 0x5ea94a, stripes: true, wall: 0xb9c1c9, road: 0x41444b, trees: "round", treeDensity: 1.0,
		mountains: "hills", mountainColor: 0x7c9a68, fog: [0xd2eaff, 500, 1700], grandstand: 2 },
	suzuka: { sky: [0x5aa7ff, 0xe4f2ff], ground: 0x5a9d43, stripes: true, wall: "bluewhite", road: 0x3f4249, trees: "sakura", treeDensity: 0.9,
		mountains: "hills", mountainColor: 0x5b8757, fog: [0xe4f2ff, 450, 1600], grandstand: 1, ferris: true },
	jeddah: { night: true, sky: [0x03040c, 0x1c2250], ground: 0x1f2129, wall: "concrete", road: 0x2d3038, trees: "palm", treeDensity: 0.25,
		buildings: { density: 0.7, night: true, palette: [0x2a2f3d, 0x343a4a, 0x22262f, 0x3a3346] },
		sea: { dir: [0.47, -0.88], color: 0x0a1830 }, lights: true, mountains: "none", fog: [0x121634, 280, 1300], sun: 0.18, amb: 0.4, grandstand: 1 },
	daytona: { sky: [0x4aa6ff, 0xdcf0ff], ground: 0x68a94c, stripes: true, wall: 0xf1f3f6, road: 0x3a3d44, trees: "palm", treeDensity: 0.15,
		lake: true, grandstand: 5, mountains: "none", fog: [0xdcf0ff, 500, 1700] },
	dusk: { sky: [0x241a45, 0xff8a4c], ground: 0x86684a, wall: "tyres", road: 0x4e4540, trees: "none", mountains: "hills", mountainColor: 0x5a3f4a,
		fog: [0xd98160, 220, 900], sun: 0.85, sunColor: 0xffb27a, amb: 0.45, grandstand: 2, lights: true },
	snow: { sky: [0x93acc6, 0xe7eff7], ground: 0xe9eff5, wall: 0x2f6fbd, road: 0x5a5f68, trees: "snowpine", treeDensity: 1.1,
		mountains: "peaks", mountainColor: 0x6d7c8e, fog: [0xdfe8f0, 240, 1100], snowfall: true, sun: 0.6, amb: 0.65 }
};

function canvasTexture(w, h, draw){
	const c = document.createElement("canvas");
	c.width = w; c.height = h;
	draw(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	return t;
}

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
	return mesh;
}

// A flat ribbon along the centreline between two lateral offsets (left = +).
function ribbon(center, from, to, y, keepFn, colorFn){
	const n = center.n, pos = [], col = [], idx = [];
	const c = new THREE.Color();
	for(let i = 0; i <= n; i++){
		const k = i % n;
		const nx = center.tz[k], nz = -center.tx[k];
		pos.push(center.x[k] + nx * from, y, center.z[k] + nz * from, center.x[k] + nx * to, y, center.z[k] + nz * to);
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

function sky(top, bottom, radius){
	const g = new THREE.SphereBufferGeometry(radius, 24, 12);
	const col = [], p = g.attributes.position;
	const a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color();
	for(let i = 0; i < p.count; i++){
		const t = Math.max(0, Math.min(1, p.getY(i) / radius * 1.6 + 0.05));
		c.copy(b).lerp(a, Math.pow(t, 0.8));
		col.push(c.r, c.g, c.b);
	}
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
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
	const fog = theme.fog ? new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]) : null;
	const hemi = new THREE.HemisphereLight(theme.night ? 0x5d6aa8 : 0xffffff, theme.night ? 0x14161f : 0x6b7a55, theme.amb ?? 0.55);
	group.add(hemi);
	if(!theme.hemiOnly) group.add(new THREE.AmbientLight(0xffffff, theme.night ? 0.12 : 0.18));
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
	const ground = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(groundSize, groundSize)), groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(cx, 0, cz);
	ground.receiveShadow = shadows;
	group.add(ground);

	// Road, edge lines, kerbs, start line, grid boxes (circuits only; the Classic look has none).
	if(track.center && theme.road !== undefined){
		const c = track.center, hw = c.hw;
		const roadMat = keep(new THREE.MeshLambertMaterial({ color: theme.road, emissive: theme.night ? 0x14161c : 0x000000, side: THREE.DoubleSide }));
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
			const colorFn = i => (Math.floor(i / 2.5) % 2 ? 0xe23b3b : 0xf4f6fa);
			const [a, bb] = k.side === 0 ? [hw + 0.2, hw - 1.4] : [-hw + 1.4, -hw - 0.2];
			const mesh = new THREE.Mesh(keep(ribbon(c, a, bb, 0.045, i => inRange(i) && track.keep[k.side][i], colorFn)), kerbMat);
			group.add(mesh);
		}

		// Chequered start line.
		const chk = keep(canvasTexture(16, 2, (g) => { for(let i = 0; i < 16; i++) for(let j = 0; j < 2; j++){ g.fillStyle = (i + j) % 2 ? "#111" : "#f5f5f5"; g.fillRect(i, j, 1, 1); } }));
		chk.magFilter = THREE.NearestFilter;
		const startLine = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(hw * 2, 1.6)), keep(new THREE.MeshLambertMaterial({ map: chk })));
		startLine.rotation.x = -Math.PI / 2;
		startLine.position.set(0, 0.05, START_Z);
		group.add(startLine);
		// Gantry over the line.
		const gantry = mergedBoxes([
			{ x: hw + 1.6, y: 3.5, z: START_Z, w: 0.5, h: 7, d: 0.5, color: 0x2a2e38 },
			{ x: -hw - 1.6, y: 3.5, z: START_Z, w: 0.5, h: 7, d: 0.5, color: 0x2a2e38 },
			{ x: 0, y: 7.2, z: START_Z, w: hw * 2 + 3.7, h: 1.2, d: 0.6, color: 0x1a1d25 }
		]);
		group.add(new THREE.Mesh(keep(gantry), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));
		const banner = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(hw * 2 + 3, 1)), keep(new THREE.MeshBasicMaterial({ map: chk, side: THREE.DoubleSide })));
		banner.position.set(0, 7.2, START_Z - 0.32);
		group.add(banner);
		// Grid slots.
		const slots = GRID.slice(0, 10).map(g => ({ x: g.x, y: 0.05, z: g.y + 1.25, sx: 1.4, sy: 1, sz: 0.14 }));
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
	for(const [x1, z1, x2, z2] of track.wallSegs){
		const len = Math.hypot(x2 - x1, z2 - z1);
		const ry = Math.atan2(z1 - z2, x2 - x1);
		if(typeof style === "number"){
			wallItems.push({ x: (x1 + x2) / 2, y: wallH / 2, z: (z1 + z2) / 2, w: len + 0.3, h: wallH, d: 0.3, ry, color: style });
		}else{
			const [ca, cb] = pairs[style] || pairs.redwhite;
			const pieces = Math.max(1, Math.round(len / 3));
			for(let p = 0; p < pieces; p++){
				const t = (p + 0.5) / pieces;
				wallItems.push({ x: x1 + (x2 - x1) * t, y: wallH / 2, z: z1 + (z2 - z1) * t, w: len / pieces + 0.04, h: wallH, d: 0.3, ry, color: p % 2 ? ca : cb });
			}
		}
	}
	const wallMesh = new THREE.Mesh(keep(mergedBoxes(wallItems)), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
	wallMesh.castShadow = wallMesh.receiveShadow = shadows;
	group.add(wallMesh);
	if(style === "concrete"){
		// Jeddah: a strip of light along the top of every wall.
		const strip = wallItems.map(w => Object.assign({}, w, { y: wallH + 0.05, h: 0.1, d: 0.32, color: 0x7ad7ff }));
		group.add(new THREE.Mesh(keep(mergedBoxes(strip)), keep(new THREE.MeshBasicMaterial({ vertexColors: true }))));
	}

	// Trees, buildings and other scenery.
	const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
	const scenery = track.scenery || [];
	const lowQ = quality === "low" ? 0.5 : 1;
	const treeSpots = [], buildSpots = [];
	for(const s of scenery){
		if(theme.buildings && s.off < 34 && s.r < theme.buildings.density) buildSpots.push(s);
		else if(s.r2 < (theme.treeDensity ?? 0) * 0.8 * lowQ) treeSpots.push(s);
	}
	if(theme.trees === "classic"){
		const cone = keep(new THREE.CylinderBufferGeometry(0, 4, 15, 8));
		const mat = keep(new THREE.MeshLambertMaterial({ color: 0x1bad2c }));
		group.add(instanced(cone, mat, (track.trees || []).map(t => ({ x: t.x, z: t.z, s: t.s })), shadows));
		const sign = keep(new THREE.ConeBufferGeometry(0.7, 2, 5));
		const smat = keep(new THREE.MeshLambertMaterial({ color: 0xff0000 }));
		group.add(instanced(sign, smat, (track.signs || []).map(s => ({ x: s.x, y: s.y, z: s.z, rx: Math.PI / 2, ry: s.rot })), shadows));
	}else if(theme.trees && theme.trees !== "none" && treeSpots.length){
		const kind = theme.trees;
		const list = treeSpots.map(s => ({ x: s.x, z: s.z, s: 0.75 + s.r * 0.8, ry: s.r2 * 6 }));
		let trunk, crown, crownMat, trunkH;
		if(kind === "palm"){
			trunkH = 9;
			trunk = keep(new THREE.CylinderBufferGeometry(0.25, 0.4, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
			crown = keep(new THREE.ConeBufferGeometry(4, 1.6, 7)); crown.translate(0, trunkH + 0.4, 0);
			crownMat = keep(new THREE.MeshLambertMaterial({ color: theme.night ? 0x1e4a2c : 0x2f7d3a }));
		}else if(kind === "round" || kind === "sakura"){
			trunkH = 3;
			trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.5, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
			crown = keep(new THREE.IcosahedronBufferGeometry(3.4, 0)); crown.translate(0, trunkH + 2.4, 0);
			crownMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
			list.forEach(t => { t.color = kind === "sakura" ? (rand() < 0.65 ? 0xf6a9c6 : rand() < 0.5 ? 0xfbd3e2 : 0x4d8f3c) : (rand() < 0.5 ? 0x3d7f2c : 0x4f9435); });
		}else{
			trunkH = 2.5;
			trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.45, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
			crown = keep(new THREE.ConeBufferGeometry(3.4, 10, 7)); crown.translate(0, trunkH + 5, 0);
			crownMat = keep(new THREE.MeshLambertMaterial({ color: kind === "snowpine" ? 0x2f5a44 : 0x24532e }));
		}
		group.add(instanced(trunk, trunkMat, list.map(t => Object.assign({}, t, { color: undefined })), shadows));
		group.add(instanced(crown, crownMat, list, shadows));
		if(kind === "snowpine"){
			const cap = keep(new THREE.ConeBufferGeometry(2.1, 5, 7)); cap.translate(0, trunkH + 7.6, 0);
			group.add(instanced(cap, keep(new THREE.MeshLambertMaterial({ color: 0xf4f8fb })), list.map(t => Object.assign({}, t, { color: undefined }))));
		}
	}

	if(theme.buildings && buildSpots.length){
		const bdef = theme.buildings;
		const win = keep(canvasTexture(64, 128, (g, w, h) => {
			g.fillStyle = bdef.night ? "#141821" : "#ffffff"; g.fillRect(0, 0, w, h);
			for(let y = 6; y < h - 4; y += 12) for(let x = 5; x < w - 4; x += 12){
				const lit = Math.random() < (bdef.night ? 0.55 : 0);
				g.fillStyle = bdef.night ? (lit ? "#ffd98a" : "#20242e") : "#8fa7c0";
				g.fillRect(x, y, 6, 7);
			}
		}));
		const bmat = bdef.night
			? keep(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveMap: win, map: win }))
			: keep(new THREE.MeshLambertMaterial({ color: 0xffffff, map: win }));
		const bgeo = keep(new THREE.BoxBufferGeometry(1, 1, 1)); bgeo.translate(0, 0.5, 0);
		const list = buildSpots.map(s => {
			const h = 10 + s.r2 * (bdef.night ? 60 : 30);
			const w = 8 + s.r * 10;
			return { x: s.x, z: s.z, sx: w, sy: h, sz: 8 + s.r2 * 8, ry: s.face, color: bdef.palette[Math.floor(s.r2 * 97) % bdef.palette.length] };
		});
		group.add(instanced(bgeo, bmat, list, shadows));
	}

	// Grandstands along the start straight.
	if(track.center && theme.grandstand){
		const c = track.center, hw = c.hw;
		const crowd = keep(canvasTexture(128, 32, (g, w, h) => {
			g.fillStyle = "#3a3f4c"; g.fillRect(0, 0, w, h);
			const cols = ["#e23b3b", "#f4f6fa", "#f4c542", "#2580db", "#f48342", "#6bd06b", "#c86bd0"];
			for(let i = 0; i < 380; i++){ g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
		}));
		crowd.wrapS = THREE.RepeatWrapping;
		const standMat = keep(new THREE.MeshLambertMaterial({ map: crowd }));
		const frameMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
		const count = theme.grandstand;
		for(let k = 0; k < count; k++){
			const along = (k - (count - 1) / 2) * 34 - 20;
			const i = ((Math.round(along) % c.n) + c.n) % c.n;
			const side = k % 2 === 0 ? -1 : 1;
			const off = hw + (side < 0 ? 8 : 9);
			const nx = c.tz[i] * side, nz = -c.tx[i] * side;
			const x = c.x[i] + nx * off, z = c.z[i] + nz * off;
			const ry = Math.atan2(nx, nz);
			const stand = new THREE.Group();
			const steps = [];
			for(let s = 0; s < 5; s++) steps.push({ x: 0, y: 0.6 + s * 1.2, z: 1.2 + s * 1.6, w: 30, h: 1.2 + s * 2.4, d: 1.6, color: 0x8d939e });
			steps.push({ x: 0, y: 10.5, z: 5, w: 31, h: 0.4, d: 10, color: 0x2a2e38 });
			steps.push({ x: 15, y: 5, z: 7, w: 0.4, h: 10, d: 0.4, color: 0x2a2e38 });
			steps.push({ x: -15, y: 5, z: 7, w: 0.4, h: 10, d: 0.4, color: 0x2a2e38 });
			stand.add(new THREE.Mesh(keep(mergedBoxes(steps)), frameMat));
			const face = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(30, 9.2)), standMat);
			face.position.set(0, 4.8, 3.9);
			face.rotation.x = -0.93;
			face.rotation.y = Math.PI;
			stand.add(face);
			stand.position.set(x, 0, z);
			stand.rotation.y = ry;
			stand.traverse(o => { o.castShadow = o.receiveShadow = shadows; });
			group.add(stand);
		}
	}

	// Sea beyond one side of the circuit, in real compass terms.
	if(theme.sea && track.toMap){
		const [dx, dy] = theme.sea.dir, l = Math.hypot(dx, dy);
		const ux = dx / l, uy = dy / l, px = -uy, py = ux;
		let edge = -Infinity;
		for(const [x1, z1, x2, z2] of track.wallSegs){
			for(const [x, z] of [[x1, z1], [x2, z2]]){
				const [mx, my] = track.toMap(x, z);
				edge = Math.max(edge, mx * ux + my * uy);
			}
		}
		edge += 25;
		const [mcx, mcy] = track.toMap(cx, cz);
		const along = mcx * px + mcy * py;
		const big = groundSize;
		const corners = [[edge, along - big], [edge, along + big], [edge + big, along + big], [edge + big, along - big]]
			.map(([a, s]) => track.fromMap(ux * a + px * s, uy * a + py * s));
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute([].concat(...corners.map(([x, z]) => [x, 0.06, z])), 3));
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

	// Floodlights along the track at night (and for the dusk speedway).
	if(theme.lights && track.center){
		const c = track.center, hw = c.hw, poles = [], heads = [], pools = [];
		for(let i = 0; i < c.n; i += 42){
			const side = (i / 42) % 2 ? 1 : -1;
			const nx = c.tz[i] * side, nz = -c.tx[i] * side;
			const off = hw + 3;
			const x = c.x[i] + nx * off, z = c.z[i] + nz * off;
			if(!track.keep[side > 0 ? 0 : 1][i]) continue;
			poles.push({ x, y: 5, z, sx: 0.3, sy: 10, sz: 0.3 });
			heads.push({ x: x - nx * 1.2, y: 10, z: z - nz * 1.2, sx: 1.4, sy: 0.4, sz: 1.4 });
			pools.push({ x: x - nx * (hw * 0.7 + 3), y: 0.07, z: z - nz * (hw * 0.7 + 3), rx: -Math.PI / 2, s: hw * 1.6 });
		}
		const unit = keep(new THREE.BoxBufferGeometry(1, 1, 1));
		group.add(instanced(unit, keep(new THREE.MeshLambertMaterial({ color: 0x3a3f4a })), poles));
		group.add(instanced(unit, keep(new THREE.MeshBasicMaterial({ color: 0xfff1c9 })), heads));
		const glow = keep(canvasTexture(64, 64, (g) => {
			const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			r.addColorStop(0, "rgba(255,236,190,0.9)"); r.addColorStop(1, "rgba(255,236,190,0)");
			g.fillStyle = r; g.fillRect(0, 0, 64, 64);
		}));
		const poolMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: theme.night ? 0.28 : 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
		group.add(instanced(keep(new THREE.PlaneBufferGeometry(1, 1)), poolMat, pools));
	}

	// A big wheel in the paddock at Suzuka.
	if(theme.ferris && scenery.length){
		const spot = scenery.find(s => s.off > 50) || scenery[0];
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
		holder.position.set(spot.x, 21, spot.z);
		holder.rotation.y = spot.face;
		holder.add(wheel);
		const legs = mergedBoxes([
			{ x: -6, y: -10.5, z: 0, w: 0.8, h: 22, d: 0.8, ry: 0, color: 0x9aa3ad },
			{ x: 6, y: -10.5, z: 0, w: 0.8, h: 22, d: 0.8, ry: 0, color: 0x9aa3ad }
		]);
		holder.add(new THREE.Mesh(keep(legs), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));
		group.add(holder);
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

	return {
		group, theme, sun, fog, farPlane,
		skyColor: new THREE.Color(skyBottom),
		center: { x: cx, z: cz }, radius,
		update(dt, focus){
			for(const u of updaters) u(dt);
			if(skyMesh && focus) skyMesh.position.set(focus.x, 0, focus.z);
			if(shadows && focus){
				sun.target.position.set(focus.x, 0, focus.z);
				sun.position.set(focus.x + sunOffset.x, sunOffset.y, focus.z + sunOffset.z);
			}
			if(snow && focus){
				const p = snow.geometry.attributes.position;
				for(let i = 0; i < p.count; i++){
					let y = p.getY(i) - dt * 6;
					if(y < 0) y += 30;
					p.setY(i, y);
					p.setX(i, p.getX(i) + Math.sin(y * 0.4 + i) * dt * 0.6);
				}
				p.needsUpdate = true;
				snow.position.set(focus.x, 0, focus.z);
			}
		},
		dispose(){
			for(const d of disposables) if(d && d.dispose) d.dispose();
			group.traverse(o => { if(o.isInstancedMesh && o.dispose) o.dispose(); });
		}
	};
}
