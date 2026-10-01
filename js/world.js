// Builds the 3D scene for a track: sky, ground, road, walls and scenery.
// Nothing here affects driving; walls are drawn where the physics walls are.
import { GRID } from "./physics.js";
import { START_Z, seededRandom } from "./trackgen.js";
import { buildScenerySteps, canvasTexture } from "./scenery.js";
import { naturalHour } from "./atmosphere.js";
import { buildTerrainSteps, buildTunnel, buildBridge, buildSkirts, TUNNEL_WALL } from "./terrain.js";
import { placeGeoSteps } from "./placegeo.js";
import { slice, drain } from "./steps.js";
import { remnantsSteps, remnantGround } from "./remnants.js";
import { detail } from "./materials.js";
import { instantiate, hasModel, modelSize } from "./assets.js";

const THREE = globalThis.THREE;

export const THEMES = {
	classic: { sky: 0x7fb0ff, ground: 0x57c115, stripes: true, wall: 0xf48342, wallH: 1.5, trees: "classic", mountains: "cubes", mountainColor: 0x888888, sun: 0.7, amb: 0.5 },
	monaco: { sky: [0x4f9dea, 0xd6ebff], ground: 0xc2b9a5, grass: 0x5f9446, wall: "redwhite", road: 0x45484f, trees: "palm", treeDensity: 0.25,
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
		grandstand: 0, fans: false, catchFence: "outside", standColor: 0x2f63c9, mountains: "none", fog: [0xdcf0ff, 500, 1700] },
	dusk: { sky: [0x241a45, 0xff8a4c], ground: 0x86684a, wall: "tyres", road: 0x4e4540, trees: "none", mountains: "hills", mountainColor: 0x5a3f4a,
		fog: [0xd98160, 220, 900], sun: 0.85, sunColor: 0xffb27a, amb: 0.45, grandstand: 2, standColor: 0xf48342, lights: true, tod: "sunset" },
	snow: { sky: [0x93acc6, 0xe7eff7], ground: 0xe9eff5, wall: 0x2f6fbd, road: 0x5a5f68, trees: "snowpine", treeDensity: 1.1,
		mountains: "peaks", mountainColor: 0x6d7c8e, fog: [0xdfe8f0, 240, 1100], snowfall: true, sun: 0.6, amb: 0.65, grandstand: 1, standColor: 0x2f6fbd }
};

// Ground colours for the real ground cover (placegeo.js landAt), from the track's own grass.
function landColours(theme, town){
	// (Vegetation from the track's grass, or its own green where the ground isn't grass, like Monaco's.)
	const g = new THREE.Color(theme.grass ?? theme.ground), hsl = {};
	g.getHSL(hsl);
	const tone = (dh, ds, dl) => new THREE.Color().setHSL(hsl.h + dh, Math.max(0, Math.min(1, hsl.s + ds)), Math.max(0, Math.min(1, hsl.l + dl))).getHex();
	return {
		forest: tone(0.02, -0.12, -0.1), scrub: tone(0.01, -0.15, -0.04), grass: tone(-0.01, 0.02, 0.05), orchard: tone(-0.02, -0.08, 0.0),
		farm: theme.farm ?? (town === "japan" ? 0x7fa84e : 0xa9a462), res: town === "city" ? 0x96938b : tone(0.02, -0.35, 0.02), ind: 0x9b9a94, paved: 0x74767c, pitch: tone(0, 0.05, 0.02),
		sand: 0xd8c79f, gravel: 0xb9b09f, dirt: 0x9c8466, water: null, pool: null
	};
}

// Broad patches of lighter, darker and drier ground, so a meadow or a forest floor isn't one flat colour: value noise
// at two scales (about 70 and 22 units across), 0..1.
const hash2 = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); };
function smoothNoise(x, z){
	const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
	const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
	return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const patchNoise = (x, z) => smoothNoise(x / 70, z / 70) * 0.7 + smoothNoise(x / 22 + 40, z / 22 + 17) * 0.3;
const _pc = new THREE.Color(), _hsl = {};
// A ground colour (hex) varied by the patches at (x, z): drier and lighter where the noise is high, deeper and darker where low.
function patched(hex, x, z, amount = 1){
	const n = (patchNoise(x, z) - 0.5) * 2 * amount;         // about -1..1
	_pc.setHex(hex).getHSL(_hsl);
	_pc.setHSL(_hsl.h - n * 0.028, _hsl.s * (1 - 0.14 * Math.max(0, n)), Math.max(0, Math.min(1, _hsl.l * (1 + 0.16 * n))));
	return _pc.getHex();
}
const PATCHY = { forest: 0.8, scrub: 1, grass: 1, orchard: 0.9, farm: 1.2, pitch: 0.4 };

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
	const n = center.n, pos = [], col = [], idx = [], uv = [];
	const c = new THREE.Color();
	// (uv: u across (0 at `from`, 1 at `to`), v along, a tile as long as the ribbon is wide: for road textures.)
	const tile = Math.abs(from - to) || 1, step = center.step || 1;
	for(let i = 0; i <= n; i++){
		const k = i % n;
		uv.push(0, i * step / tile, 1, i * step / tile);
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
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
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

// The sky dome: a gradient from the horizon colour up to the zenith colour, with the sun (or the moon at
// night) as a disc with a glow round it, and soft clouds that come and go with the weather. paintSky gives
// it the colours; world.js's apply() gives it the sun, the night and the cloud cover.
// (Drawn last, at the far plane: then the graphics chip only shades the sky you can see, not all of it
// under the ground and the buildings.)
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
	uniform vec3 uTop, uBottom, uSunDir, uSunColor;
	uniform float uSun, uNight, uCloud, uTime;
	varying vec3 vDir;
	float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
	float noise(vec2 p){
		vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
		return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
	}
	float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i = 0; i < 3; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
	void main(){
		vec3 d = normalize(vDir);
		float h = clamp(d.y * 1.6 + 0.05, 0.0, 1.0);
		vec3 col = mix(uBottom, uTop, pow(h, 0.8));
		// The sun, or the moon: a small bright disc and a wide glow.
		float s = max(dot(d, normalize(uSunDir)), 0.0);
		col += uSunColor * (smoothstep(0.9991, 0.9996, s) * 1.6 + pow(s, 72.0) * 0.5 + pow(s, 7.0) * 0.13) * uSun;
		// Clouds: noise on a flat layer overhead, thinning out towards the horizon.
		vec2 uv = d.xz / max(d.y + 0.14, 0.06) * 0.5 + uTime * vec2(0.0045, 0.0018);
		float c = fbm(uv * 1.7);
		float edge = 1.0 - clamp(uCloud, 0.0, 1.0) * 0.72;
		float cl = smoothstep(edge - 0.1, edge + 0.2, c) * smoothstep(0.0, 0.2, d.y);
		vec3 cloudCol = mix(vec3(1.0), uBottom * 1.15 + 0.08, 0.3) * mix(1.0, 0.42, uNight);
		cloudCol *= 1.0 - 0.3 * smoothstep(0.55, 0.95, c);                   // darker where they're thick
		col = mix(col, cloudCol, cl * (0.86 - 0.3 * uNight));
		col += uSunColor * pow(s, 9.0) * cl * 0.22 * uSun;                   // a bright edge near the sun
		col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                         // (dither: no bands in the gradient)
		gl_FragColor = vec4(col, 1.0);
	}`;
function sky(top, bottom, radius){
	const g = new THREE.SphereBufferGeometry(radius, 32, 16);
	const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
		uniforms: { uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) }, uSunDir: { value: new THREE.Vector3(0.4, 0.8, -0.3).normalize() },
			uSunColor: { value: new THREE.Color(0xffffff) }, uSun: { value: 0.8 }, uNight: { value: 0 }, uCloud: { value: 0.2 }, uTime: { value: 0 } },
		vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, depthWrite: false
	}));
	mesh.renderOrder = 10;
	return mesh;
}
function paintSky(mesh, a, b){
	const u = mesh.material.uniforms;
	u.uTop.value.copy(a); u.uBottom.value.copy(b);
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

export function buildWorld(track, opts = {}){ return drain(buildWorldSteps(track, opts)); }
// The same, in slices (steps.js): `yield` wherever a pause is safe, when the time slice is up. opts.sink, if given, is
// handed the list of what was built (sink.disposables) so a build that's given up halfway can be cleared away.
export function* buildWorldSteps(track, opts = {}){
	const theme = THEMES[(track.def && track.def.theme) || "classic"] || THEMES.classic;
	const quality = opts.quality || "high";
	const shadows = quality === "high";
	const rand = seededRandom("world:" + track.id);
	const group = new THREE.Group();
	const disposables = [];
	const updaters = [];
	const keep = x => (disposables.push(x), x);
	if(opts.sink) opts.sink.disposables = disposables;

	// The rest of the venue's circuit (its other layouts' roads), closed off (remnants.js). The world
	// is made big enough for all of it.
	const rem = yield* remnantsSteps(track);
	track.remnantSpace = rem.space;
	track.remnants = rem.list;
	if(slice.over()) yield "remnants";
	const remGround = remnantGround(track, rem), b = remGround.bounds;
	if(slice.over()) yield "remnant ground";
	const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
	const radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 30;
	// Real surroundings (js/places/): the real coastline, lagoons and marina, buildings, forests, and
	// where the venue has it, the real lie of the land, which reaches further out (so the far hills
	// stand beyond it).
	const geo = track.center ? yield* placeGeoSteps(track) : null;
	const demMargin = geo && geo.demAt ? 560 : 240;
	const mDist = Math.max(track.mountainDist, radius + demMargin + (geo && geo.demAt ? 120 : -90));
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
	// Steady shadows: the shadow map follows the car, and if it moved a fraction of a texel at a time the
	// shadow edges would crawl. So the light's view is kept on whole texels: (x, y, z) is moved along the
	// light's own right and up directions to the nearest texel.
	const lRight = new THREE.Vector3(), lUp = new THREE.Vector3(), lFwd = new THREE.Vector3(), Y_UP = new THREE.Vector3(0, 1, 0);
	function snapToTexels(x, y, z, out){
		lFwd.copy(sunOffset).normalize().negate();
		lRight.crossVectors(lFwd, Y_UP).normalize();
		lUp.crossVectors(lRight, lFwd);
		const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
		const px = x * lRight.x + y * lRight.y + z * lRight.z, py = x * lUp.x + y * lUp.y + z * lUp.z;
		const dx = Math.round(px / texel) * texel - px, dy = Math.round(py / texel) * texel - py;
		return out.set(x + lRight.x * dx + lUp.x * dy, y + lRight.y * dx + lUp.y * dy, z + lRight.z * dx + lUp.z * dy);
	}
	const snapped = new THREE.Vector3();
	if(slice.over()) yield "sky and light";

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
		for(const p of rem.space ? rem.space.pts : []){ const [mx, my] = track.toMap(p.x, p.z); edge = Math.max(edge, mx * ux + my * uy + track.center.hw); }
		seaEdge = { ux, uy, edge: edge + 25 };
	}
	const isSea = seaEdge ? (x, z) => { const [mx, my] = track.toMap(x, z); return mx * seaEdge.ux + my * seaEdge.uy > seaEdge.edge; } : null;
	if(slice.over()) yield "sea";
	// A harbour beside part of the lap (Monaco's Port Hercule, from the tunnel exit round Tabac and
	// the Swimming Pool): water from a quay beside the road out to the open sea.
	let harbour = null;
	if(track.def && track.def.harbour && track.center && track.center.h){
		const c = track.center, n = c.n, [f0, f1] = track.def.harbour, rev = !!track.reverse;
		const nearRemnant = (x, z, r) => !!(rem.space && rem.space.within(x, z, r));
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
			// (No quay across a closed-off road of another layout that runs by the water.)
			if(nearRemnant(x, z, c.hw + 4)) continue;
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
			return lat > off - 0.5 && lat < 420 && Math.abs(along) < 3 && !nearRemnant(x, z, c.hw + 5);
		};
		// Its extent, for the water surface.
		const bb = track.bounds, box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
		for(let x = bb.minX - 300; x <= bb.maxX + 300; x += 8){
			if(slice.over()) yield "harbour";
			for(let z = bb.minZ - 300; z <= bb.maxZ + 300; z += 8) if(inside(x, z)){
				box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
			}
		}
		harbour = { quay, inside, side, box };
	}
	let isWater = harbour ? (x, z) => (isSea && isSea(x, z)) || harbour.inside(x, z) : isSea;
	// The real water, never right next to the road (the map's coastline and the game's road don't
	// line up to the metre).
	if(geo){
		const c = track.center, clear = c.hw + 10;
		const byRoad = (x, z) => c.hash.within(x, z, clear) || !!(rem.space && rem.space.within(x, z, clear));
		// (Monaco's harbour beside the track stays water too.)
		isWater = (x, z) => !byRoad(x, z) && (geo.isWater(x, z) || !!(harbour && harbour.inside(x, z)));
	}

	// Elevated circuits get rolling ground built from the road's own heights.
	let terrain = null;
	if(track.elevated){
		if(geo && geo.P.land) yield* geo.landRasterSteps();       // (what the ground is made of, worked out ahead, in slices)
		// The real ground cover, where the venue has it (forest floor, meadows, fields, car parks...).
		const cover = geo && geo.P.land ? landColours(theme, geo.P.town) : null;
		const colorAt = cover ? (x, z) => { const k = geo.landAt(x, z) || (geo.fillAt && geo.fillAt(x, z)); return k ? (PATCHY[k] ? patched(cover[k], x, z, PATCHY[k]) : cover[k]) : null; } : null;
		terrain = yield* buildTerrainSteps(track, { isSea: isWater, uvOrigin: { x: cx - groundSize / 2, z: cz + groundSize / 2 }, extra: remGround.extra, bounds: b, colorAt, color: theme.ground,
			demAt: geo && geo.demAt, margin: demMargin, low: quality === "low" });
		keep(terrain.geometry);
		let tmat = groundMat;
		if(theme.stripes && groundMat.emissiveMap){
			const t = keep(groundMat.emissiveMap.clone());
			t.repeat.set(1, 1); t.needsUpdate = true;
			tmat = keep(new THREE.MeshLambertMaterial({ color: theme.ground, emissive: 0x0f0f0f, emissiveMap: t }));
		}
		if(colorAt){ tmat = keep(tmat.clone()); tmat.color.set(0xffffff); tmat.vertexColors = true; }
		// Fine grass over it (see materials.js). Its uv repeat is the stripes' too (r128 has one per material): 1.
		const turf = detail("grass", quality);
		if(tmat === groundMat) tmat = keep(tmat.clone());
		tmat.map = turf.texture;
		if(!turf.tint && !colorAt) tmat.color.set(0xffffff);
		const tm = new THREE.Mesh(terrain.geometry, tmat);
		tm.receiveShadow = shadows;
		tm.frustumCulled = false;
		group.add(tm);
	}
	if(slice.over()) yield "ground";
	const groundAt = terrain ? terrain.groundAt : () => 0;
	const heightAt = track.heightAt || (() => 0);
	const ground = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(groundSize, groundSize)), groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(cx, terrain ? terrain.base - 0.05 : 0, cz);
	ground.receiveShadow = shadows;
	group.add(ground);

	let roadMat = null, roadLines = null, remnantSides = [];
	// Road, edge lines, kerbs, start line, grid boxes (circuits only; the Classic look has none).
	if(track.center && theme.road !== undefined){
		const c = track.center, hw = c.hw;
		roadMat = keep(new THREE.MeshPhongMaterial({ color: theme.road, emissive: theme.night ? 0x14161c : 0x000000, specular: 0x000000, shininess: 40, side: THREE.DoubleSide }));
		// Fine tarmac on the road (assets/textures/asphalt.* if there is one, else drawn: materials.js).
		const tarmac = detail("asphalt", quality);
		roadMat.map = tarmac.texture;
		if(!tarmac.tint) roadMat.color.set(0xffffff);
		const road = new THREE.Mesh(keep(ribbon(c, hw + 0.8, -hw - 0.8, 0.02, c.dup ? i => !c.dup[i] : null)), roadMat);   // (a road used twice is drawn once)
		road.receiveShadow = shadows;
		group.add(road);
		if(slice.over()) yield "road";
		const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0xe9edf2, side: THREE.DoubleSide, fog: true }));
		roadLines = lineMat;       // (dimmed after dark: unlit white lines would glow like neon)
		const keepL = k => track.keep[0][k], keepR = k => track.keep[1][k];
		group.add(new THREE.Mesh(keep(ribbon(c, hw - 0.5, hw - 0.8, 0.035, keepL)), lineMat));
		group.add(new THREE.Mesh(keep(ribbon(c, -hw + 0.8, -hw + 0.5, 0.035, keepR)), lineMat));

		const kerbMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
		if(slice.over()) yield "road lines";
		for(const k of track.kerbs){
			if(slice.over()) yield "kerbs";
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
		// On a banked start (Daytona's tri-oval) the line, gantry and grid slots follow the camber:
		// the road rises by bank0 per unit to the left (+x at the line).
		const bank0 = track.center && track.center.bank ? track.center.bank[0] : 0, tilt = Math.atan(bank0);
		const lineGeo = keep(new THREE.PlaneBufferGeometry(hw * 2, 1.6));
		lineGeo.rotateX(-Math.PI / 2);
		lineGeo.rotateZ(tilt);
		const startLine = new THREE.Mesh(lineGeo, keep(new THREE.MeshLambertMaterial({ map: chk })));
		const h0 = heightAt(0, START_Z);
		startLine.position.set(0, 0.05 + h0, START_Z);
		group.add(startLine);
		// Gantry over the line.
		// Each post stands on its own edge of the road (they differ on a banked start), up to a level beam.
		const eL = hw * bank0, eR = -hw * bank0, beamY = 7.2 + Math.max(eL, eR, 0);
		const post = (x, e) => ({ x, y: (e - 1 + beamY) / 2, z: START_Z, w: 0.5, h: beamY - e + 1, d: 0.5, color: 0x2a2e38 });
		const gantry = mergedBoxes([
			post(hw + 1.6, eL),
			post(-hw - 1.6, eR),
			{ x: 0, y: beamY, z: START_Z, w: hw * 2 + 3.7, h: 1.2, d: 0.6, color: 0x1a1d25 }
		]);
		// The gantry model (assets/models/kenney/overheadLights: an arch with its lights), sized to span the road, when it's
		// loaded and the start isn't banked (its two legs stand level); otherwise the boxes above.
		const gSize = modelSize("gantry"), gSpan = hw * 2 + 3.7;
		const gModel = gSize && Math.abs(bank0) < 0.02 && hasModel("gantry", quality) ? instantiate("gantry", [{ x: 0, y: h0, z: START_Z, s: gSpan / gSize.x }], { quality }) : null;
		let bannerY = beamY + h0;
		if(gModel){ group.add(gModel); bannerY = h0 + gSize.y * (gSpan / gSize.x) * 0.72; }
		else{
			const gm = new THREE.Mesh(keep(gantry), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
			gm.position.y = h0;
			group.add(gm);
		}
		const banner = new THREE.Mesh(keep(new THREE.PlaneBufferGeometry(hw * 2 + 3, 1)), keep(new THREE.MeshBasicMaterial({ map: chk, side: THREE.DoubleSide })));
		banner.position.set(0, bannerY, START_Z - 0.32);
		group.add(banner);
		// Grid slots.
		const slots = GRID.slice(0, 10).map(g => ({ x: g.x, y: 0.05 + heightAt(g.x, g.y + 1.25), z: g.y + 1.25, sx: 1.4, sy: 1, sz: 0.14, rz: tilt }));
		group.add(instanced(keep(new THREE.BoxBufferGeometry(1, 0.02, 1)), lineMat, slots));
		// The rest of the venue's circuit: closed road (a little below the track where they meet),
		// its edge lines, low walls down to the ground where it stands above it, and a barrier
		// across it wherever it joins the track.
		const blocks = [], sides = [];
		for(const r of rem.list){
			if(slice.over()) yield "closed roads";
			const rc = r.center, n = rc.n, piece = i => r.draw[i] && r.draw[(i + 1) % n];
			group.add(new THREE.Mesh(keep(ribbon(rc, hw + 0.8, -hw - 0.8, -0.03, piece)), roadMat));
			const open = i => r.open[i] && r.open[(i + 1) % n];
			group.add(new THREE.Mesh(keep(ribbon(rc, hw - 0.5, hw - 0.8, -0.015, open)), lineMat));
			group.add(new THREE.Mesh(keep(ribbon(rc, -hw + 0.8, -hw + 0.5, -0.015, open)), lineMat));
			sides.push({ rc, piece });
			for(const e of r.ends){
				const i = e.i, nx = rc.tz[i], nz = -rc.tx[i], ry = Math.atan2(rc.tx[i], rc.tz[i]);   // (blocks side by side across the road)
				let k = 0;
				for(let lat = -hw - 0.4; lat <= hw + 0.4; lat += 1.6, k++){
					const x = rc.x[i] + nx * lat, z = rc.z[i] + nz * lat;
					let onTrack = false;
					c.hash.near(x, z, hw + 0.8, j => { if(!onTrack && Math.hypot(c.x[j] - x, c.z[j] - z) < hw + 0.8) onTrack = true; });
					if(onTrack) continue;
					blocks.push({ x, y: rc.h[i] + lat * rc.bank[i] + 0.55, z, w: 1.5, h: 1.1, d: 0.6, ry, color: k % 2 ? 0xd8342f : 0xf2f2f2 });
				}
			}
		}
		if(blocks.length){
			const m = new THREE.Mesh(keep(mergedBoxes(blocks)), keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
			m.castShadow = m.receiveShadow = shadows;
			group.add(m);
		}
		remnantSides = sides;
	}else if(!track.center){
		// Original-style start line and checkpoint.
		track.lines.forEach((l, i) => {
			const m = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(l.width, 0.1, 1)), keep(new THREE.MeshLambertMaterial({ color: i == 0 ? 0x2580db : 0xdb2525 })));
			m.position.copy(l.position);
			m.rotation.set(0, l.angle, 0, "YXZ");
			group.add(m);
		});
	}

	if(slice.over()) yield "start line";
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
		if(slice.over()) yield "walls";
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
	if(slice.over()) yield "wall mesh";
	// Painted run-off outside the slow corners (theme.runoff colours): a band beyond the barrier,
	// left out wherever it would reach another piece of road.
	if(theme.runoff && track.center){
		const c = track.center, n = c.n, curv = c.curv, cols = theme.runoff;
		let k = 0;
		for(const kb of track.kerbs){
			if(slice.over()) yield "run-off";
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
				// (Nor over the closed-off roads of the venue's other layouts, across the band.)
				if(ok && rem.space) for(const f of [0.1, 0.5, 1]){
					const l = out * (c.hw + 0.35 + 6.65 * f), px = c.x[i] + c.tz[i] * l, pz = c.z[i] - c.tx[i] * l;
					rem.space.near(px, pz, c.hw + 1.5, p => { if(ok && Math.hypot(p.x - px, p.z - pz) < c.hw + 1.5) ok = false; });
				}
				return ok;
			};
			group.add(new THREE.Mesh(keep(ribbon(c, a, b2, 0.015, i => inRange(i) && track.keep[kb.side === 0 ? 1 : 0][i] && clearAt(i), () => color)),
				keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: theme.night ? 0x111111 : 0, side: THREE.DoubleSide }))));
		}
	}
	if(slice.over()) yield "catch fence";
	// Catch fencing on top of the barriers (Monaco): posts, two rails and see-through mesh.
	if(theme.catchFence && track.center && track.elevated){
		const t = track.features && track.features.tunnel, n = track.center.n;
		const inTunnel = s => t && s >= 0 && ((s - t[0] + n) % n) <= ((t[1] - t[0] + n) % n) + 2;
		// catchFence "outside": only on the outside wall (an oval's, where the cars run up the banking).
		const c = track.center;
		let turning = 0;
		for(let i = 0; i < n; i++) turning += c.curv[i];
		const outside = w => { const s = w.seg ?? -1; if(s < 0) return true; return ((w.x - c.x[s]) * c.tz[s] - (w.z - c.z[s]) * c.tx[s]) * turning < 0; };
		const fenceItems = wallItems.filter(w => !inTunnel(w.seg ?? -1) && (theme.catchFence !== "outside" || outside(w)));
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

	if(slice.over()) yield "before scenery";
	// Trees, grandstands, pits, billboards, buildings (see scenery.js).
	const scenery = track.scenery || [];
	// Spots for buildings and trees along the closed roads too (the same spread as the track's own).
	const extraSpots = [], rr = seededRandom("remnants:" + track.id);
	for(const r of rem.list){
		const rc = r.center, open = [...r.open.keys()].filter(i => r.open[i]);
		for(let k = 0; k < open.length / 5; k++){
			const i = open[Math.floor(rr() * open.length)], side = rr() < 0.5 ? 1 : -1, off = rc.hw + 6 + Math.pow(rr(), 1.6) * 70;
			extraSpots.push({ x: rc.x[i] + rc.tz[i] * off * side, z: rc.z[i] - rc.tx[i] * off * side, off: off - rc.hw, i: -1, side, r: rr(), r2: rr(), face: Math.atan2(-rc.tz[i] * side, rc.tx[i] * side) });
		}
	}
	const extras = yield* buildScenerySteps(track, theme, { group, keep, shadows, quality, rand, groundAt, harbour, geo, isWater, extraSpots });
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
	if(slice.over()) yield "after scenery";
	const roomFor = (x, z, m) => !extras.clearOfRoad || extras.clearOfRoad(x, z, m);
	if(track.features && track.features.tunnel){
		const t = buildTunnel(track, track.features.tunnel, keep);
		for(const m of t.meshes){ m.receiveShadow = shadows; group.add(m); }
		for(const o of t.occluders) occluders.add(o);
	}
	if(slice.over()) yield "tunnel done";
	if(terrain && track.center){
		// Retaining walls where the road stands above the ground beside it (left open under the bridge deck).
		const br = track.features && track.features.bridge, n = track.center.n;
		const underDeck = br ? i => Math.min(Math.abs(i - br[1]), n - Math.abs(i - br[1])) <= 60 && track.center.h[i] - groundAt(track.center.x[i], track.center.z[i]) > 1.2 : () => false;
		// (Nor down over a closed-off road running alongside, a little below the track's edge.)
		const c = track.center, besideRemnant = (i, side) => {
			if(!rem.space) return false;
			const lat = side * (c.hw + 0.8), x = c.x[i] + c.tz[i] * lat, z = c.z[i] - c.tx[i] * lat;
			let hit = false;
			rem.space.near(x, z, c.hw + 1, p => { if(!hit && Math.hypot(p.x - x, p.z - z) < c.hw + 0.9) hit = true; });
			return hit;
		};
		const skip = (i, side) => underDeck(i) || besideRemnant(i, side);
		const sk = new THREE.Mesh(keep(buildSkirts(track, groundAt, skip, { ground: theme.ground, stone: theme.skirt })), keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
		sk.receiveShadow = shadows;
		group.add(sk);
	}
	// The closed-off roads' sides, down to the ground where they stand above it.
	if(terrain && remnantSides.length){
		const pos = [], c = track.center, hw = c.hw;
		for(const { rc, piece } of remnantSides) for(let i = 0; i < rc.n; i++){
			if(!piece(i)) continue;
			const j = (i + 1) % rc.n;
			for(const lat of [hw + 0.8, -hw - 0.8]){
				const p = k => { const x = rc.x[k] + rc.tz[k] * lat, z = rc.z[k] - rc.tx[k] * lat; return [x, rc.h[k] + lat * rc.bank[k] - 0.03, z, groundAt(x, z) - 0.3]; };
				const [ax, ay, az, ag] = p(i), [bx, by, bz, bg] = p(j);
				if(ay - ag < 0.4 && by - bg < 0.4) continue;
				// (Not where it passes over the track on a bridge: the cars drive underneath.)
				let over = false;
				for(const [x, z] of [[ax, az], [bx, bz]]) c.hash.near(x, z, c.hw + 3, k => { if(!over && Math.hypot(c.x[k] - x, c.z[k] - z) < c.hw + 3) over = true; });
				if(over) continue;
				pos.push(ax, ay, az, bx, by, bz, ax, ag, az, bx, by, bz, bx, bg, bz, ax, ag, az);
			}
		}
		if(pos.length){
			const g = keep(new THREE.BufferGeometry());
			g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
			g.computeVertexNormals();
			const m = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ color: theme.skirt ?? 0x9a9ea6, side: THREE.DoubleSide })));
			m.receiveShadow = shadows;
			group.add(m);
		}
	}
	if(slice.over()) yield "skirts done";
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

	if(slice.over()) yield "bridge done";
	// Real water (the sea, lagoons, the marina) across the whole ground patch: the ground only
	// dips below it where the map says there's water.
	// (Inland venues with no coast, like Spa, have none: their ponds are drawn where they are.)
	if(geo && terrain && !(geo.P.land && !geo.P.coast.length)){
		const pt = terrain.patch, wg = keep(new THREE.PlaneBufferGeometry(pt.x1 - pt.x0, pt.z1 - pt.z0));
		wg.rotateX(-Math.PI / 2);
		wg.translate((pt.x0 + pt.x1) / 2, terrain.base + 0.02, (pt.z0 + pt.z1) / 2);
		const sea = theme.sea || { color: 0x1f6fb0 };
		group.add(new THREE.Mesh(wg, keep(new THREE.MeshLambertMaterial({ color: sea.color, emissive: theme.night ? 0x061634 : 0x0a2a4a }))));
	}

	if(slice.over()) yield "water done";
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
			// (A gap where it was left out, by a closed-off road: two walls, not one across the gap.)
			const q = harbour.quay[k - 1];
			if(k && Math.hypot(p.x - q.x, p.z - q.z) < 6) idx.push((k - 1) * 2, (k - 1) * 2 + 1, k * 2, k * 2, (k - 1) * 2 + 1, k * 2 + 1);
		});
		const qg = new THREE.BufferGeometry();
		qg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		qg.setIndex(idx);
		qg.computeVertexNormals();
		group.add(new THREE.Mesh(keep(qg), keep(new THREE.MeshLambertMaterial({ color: 0xbfb4a0, side: THREE.DoubleSide }))));
	}

	if(slice.over()) yield "harbour water done";
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

	if(slice.over()) yield "roofs done";
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

	if(slice.over()) yield "sea done";
	// Floodlights along every circuit. They light up at night (and at dusk on the speedway).
	let headMat = null, poolMat = null;
	if(track.center){
		const c = track.center, hw = c.hw, poles = [], heads = [], pools = [], polesM = [], headsM = [];
		for(let i = 0; i < c.n; i += 42){
			const side = (i / 42) % 2 ? 1 : -1;
			const nx = c.tz[i] * side, nz = -c.tx[i] * side;
			const off = hw + 3;
			const x = c.x[i] + nx * off, z = c.z[i] + nz * off;
			if(!track.keep[side > 0 ? 0 : 1][i] || !roomFor(x, z, 0.8)) continue;
			// Heights from the edge of the road beside the pole (they differ across a banked road).
			const bank = c.bank ? c.bank[i] : 0, edgeY = c.h ? c.h[i] + side * hw * bank : 0;
			const gy = Math.max(groundAt(x, z), c.h ? edgeY - 1 : 0), py = edgeY;
			poles.push({ x, y: gy + 5 + (py - gy) / 2, z, sx: 0.3, sy: 10 + (py - gy), sz: 0.3 });
			heads.push({ x: x - nx * 1.2, y: py + 10, z: z - nz * 1.2, sx: 1.4, sy: 0.4, sz: 1.4 });
			// (For the models: a pole one unit tall, stretched up to the head, whose arm reaches out over the road.)
			polesM.push({ x, y: gy, z, sy: 10 + (py - gy) });
			headsM.push({ x, y: py + 10, z, ry: Math.atan2(nz, -nx) });
			// The pool of light lies on the road, tilted with its camber (so it doesn't clip into it).
			const lat = -side * (hw * 0.7 + 3) + side * off, cy = c.h ? c.h[i] : 0;
			pools.push({ x: x - nx * (hw * 0.7 + 3), y: cy + lat * bank + 0.07, z: z - nz * (hw * 0.7 + 3), rx: -Math.PI / 2 + Math.atan(bank), ry: Math.atan2(-c.tz[i], c.tx[i]), s: hw * 1.6 });
		}
		const unit = keep(new THREE.BoxBufferGeometry(1, 1, 1));
		headMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
		// The pole and lamp head models (assets/models/) where they've loaded, else plain boxes. The head's
		// "glow" part is the game's own material, so it lights up at night like the boxes did.
		const poleM = hasModel("floodlight-pole", quality) && hasModel("floodlight-head", quality) ? instantiate("floodlight-pole", polesM, { quality }) : null;
		const headM = poleM ? instantiate("floodlight-head", headsM, { materials: { glow: headMat }, quality }) : null;
		if(poleM && headM) group.add(poleM, headM);
		else{
			group.add(instanced(unit, keep(new THREE.MeshLambertMaterial({ color: 0x3a3f4a })), poles));
			group.add(instanced(unit, headMat, heads));
		}
		const glow = keep(canvasTexture(64, 64, (g) => {
			const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			r.addColorStop(0, "rgba(255,236,190,0.9)"); r.addColorStop(1, "rgba(255,236,190,0)");
			g.fillStyle = r; g.fillRect(0, 0, 64, 64);
		}));
		poolMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
		group.add(instanced(keep(new THREE.PlaneBufferGeometry(1, 1)), poolMat, pools));
	}

	// A big wheel in the paddock at Suzuka: the real ones where the map has them (Suzuka Circuit's
	// amusement park), otherwise one on a spot well away from the road.
	function bigWheel(x, z, face, R){
		const k = R / 18, wheel = new THREE.Group();
		const ringMat = keep(new THREE.MeshLambertMaterial({ color: 0xf4f6fa }));
		wheel.add(new THREE.Mesh(keep(new THREE.TorusBufferGeometry(R, 0.5 * k, 6, 40)), ringMat));
		const cabs = [];
		for(let i = 0; i < 12; i++){
			const a = i / 12 * Math.PI * 2;
			const spoke = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(0.3 * k, R, 0.3 * k)), ringMat);
			spoke.position.set(Math.sin(a) * R / 2, Math.cos(a) * R / 2, 0);
			spoke.rotation.z = -a;
			wheel.add(spoke);
			const cab = new THREE.Mesh(keep(new THREE.BoxBufferGeometry(2 * k, 2 * k, 2 * k)), keep(new THREE.MeshLambertMaterial({ color: new THREE.Color(`hsl(${i * 30}, 80%, 58%)`) })));
			cab.position.set(Math.sin(a) * R, Math.cos(a) * R - 1.4 * k, 0);
			wheel.add(cab);
			cabs.push(cab);
		}
		const holder = new THREE.Group();
		holder.position.set(x, R + 3 * k + groundAt(x, z), z);
		holder.rotation.y = face;
		holder.add(wheel);
		const legs = mergedBoxes([
			{ x: -R / 3, y: -(R + 3 * k) / 2, z: 0, w: 0.8 * k, h: R + 4 * k, d: 0.8 * k, ry: 0, color: 0x9aa3ad },
			{ x: R / 3, y: -(R + 3 * k) / 2, z: 0, w: 0.8 * k, h: R + 4 * k, d: 0.8 * k, ry: 0, color: 0x9aa3ad }
		]);
		holder.add(new THREE.Mesh(keep(legs), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))));
		group.add(holder);
		occluders.add({ x, z, ry: face, hw: R + 1, hd: 2, y0: 2, y1: R * 2 + 4 * k + groundAt(x, z) });
		updaters.push(dt => { wheel.rotation.z += dt * 0.08; for(const cb of cabs) cb.rotation.z = -wheel.rotation.z; });
	}
	if(theme.ferris && extras.wheels && extras.wheels.length){
		// (Facing the middle of the circuit.)
		for(const w of extras.wheels) if(roomFor(w.x, w.z, w.r * 0.4)) bigWheel(w.x, w.z, Math.atan2(cx - w.x, cz - w.z) + Math.PI / 2, Math.max(8, w.r));
	}else if(theme.ferris && scenery.some(s => s.off > 40 && roomFor(s.x, s.z, 22))){
		const spot = scenery.find(s => s.off > 40 && roomFor(s.x, s.z, 22));
		bigWheel(spot.x, spot.z, spot.face, 18);
	}

	if(slice.over()) yield "floodlights done";
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
		const hills = instanced(cone, keep(new THREE.MeshLambertMaterial({ color: theme.mountainColor })), list);
		hills.userData.noMirror = true;           // (too far to show in the rear-view mirror)
		group.add(hills);
		if(caps.length) group.add(instanced(cone, keep(new THREE.MeshLambertMaterial({ color: 0xf5f8fb })), caps));
	}

	if(slice.over()) yield "mountains done";
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
	if(slice.over()) yield "weather done";
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

	if(slice.over()) yield "sky extras done";
	// ----- Atmosphere: time of day and weather -----
	const palettes = palettesFor(theme, skyTop, skyBottom);
	const baseRoad = roadMat ? roadMat.color.clone() : null;
	const skyRadius = farPlane * 0.85;
	const GREY_TOP = new THREE.Color(0x6c7682), GREY_BOTTOM = new THREE.Color(0xa3acb5), GREY_FOG = new THREE.Color(0x9aa3ad);
	const skyColor = new THREE.Color(skyBottom);
	const now = { hour: naturalHour(theme), cloud: 0.08, rain: 0 };
	const look = { night: palettes[theme.night ? "night" : "day"].night, dim: 0, rain: 0, wet: 0, lights: 0, warm: 0 };
	const sunTint = new THREE.Color();
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
		// The sky shows the sun (or moon) where the light comes from; the grade warms up when the light is golden.
		sunTint.set(p.sunColor);
		look.warm = Math.max(0, Math.min(1, (sunTint.r - sunTint.b) * 1.8)) * (1 - 0.6 * now.cloud);
		if(skyMesh){
			const u = skyMesh.material.uniforms;
			u.uSunDir.value.copy(sunOffset).normalize(); u.uSunColor.value.copy(sunTint);
			u.uSun.value = Math.min(1.2, sun.intensity / 0.7) * (1 - 0.75 * now.cloud);
			u.uNight.value = p.night; u.uCloud.value = 0.15 + 0.85 * now.cloud;
		}
		if(!shadows){ sun.position.copy(sunOffset); sun.target.position.set(0, 0, 0); }
		// Lights: floodlights and headlights come on as it gets dark, or in heavy weather.
		const dim = Math.max(p.night, now.cloud * 0.35 + now.rain * 0.3);
		look.night = p.night; look.dim = dim; look.rain = now.rain;
		if(roadLines) roadLines.color.setHex(0xe9edf2).multiplyScalar(1 - 0.34 * p.night);
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

	// Where a lap uses the same road twice and then it parts (Monza's GP + oval, at the end of the
	// main straight): arrow boards across whichever way is wrong for the car being followed, pointing
	// it the right way. The first time down the straight they close off the oval; the second time,
	// the way on round the GP circuit (setRoute, every frame, from the car's place on the lap).
	const forks = [];
	if(track.center && track.center.dup){
		const c = track.center, n = c.n, hw = c.hw, wrap = i => ((i % n) + n) % n;
		const chevrons = right => {
			const t = keep(canvasTexture(128, 64, g => {
				g.fillStyle = "#15171c"; g.fillRect(0, 0, 128, 64);
				g.fillStyle = "#ffd21f";
				for(let k = 0; k < 3; k++){ const x0 = 12 + k * 36; g.beginPath(); g.moveTo(x0, 8); g.lineTo(x0 + 17, 8); g.lineTo(x0 + 33, 32); g.lineTo(x0 + 17, 56); g.lineTo(x0, 56); g.lineTo(x0 + 16, 32); g.closePath(); g.fill(); }
			}));
			if(!right){ t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
			return t;
		};
		const boardGeo = keep(new THREE.PlaneBufferGeometry(hw * 0.6, hw * 0.3)), postGeo = keep(new THREE.BoxBufferGeometry(0.15, 1, 0.15));
		const postMat = keep(new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
		const mats = { true: keep(new THREE.MeshBasicMaterial({ map: chevrons(true), side: THREE.DoubleSide })), false: keep(new THREE.MeshBasicMaterial({ map: chevrons(false), side: THREE.DoubleSide })) };
		// A row of boards across the road at sample k, arrows towards (x, z).
		const boards = (k, x, z) => {
			const grp = new THREE.Group(), lat0 = (x - c.x[k]) * c.tz[k] - (z - c.z[k]) * c.tx[k];
			for(const f of [-0.62, 0, 0.62]){
				const lat = f * hw, px = c.x[k] + c.tz[k] * lat, pz = c.z[k] - c.tx[k] * lat, y = c.h ? c.h[k] + lat * c.bank[k] : 0;
				const b = new THREE.Mesh(boardGeo, mats[lat0 < 0]);
				b.position.set(px, y + 1.1 + hw * 0.15, pz);
				b.rotation.y = Math.atan2(-c.tx[k], -c.tz[k]);          // (facing the cars coming up to it)
				grp.add(b);
				for(const side of [-1, 1]){
					const p = new THREE.Mesh(postGeo, postMat);
					p.scale.y = 1.1 + 0.2;
					p.position.set(px + c.tz[k] * side * hw * 0.27, y + 0.6, pz - c.tx[k] * side * hw * 0.27);
					grp.add(p);
				}
			}
			grp.visible = false;
			group.add(grp);
			return grp;
		};
		for(let a = 0; a < n; a++){
			if(!c.dup[a] || c.dup[wrap(a + 1)]) continue;
			// The boards go where the two ways are clearly apart (a road's width between them); if they never
			// part, it's still one road (the lap line runs across it), not a fork.
			const b = c.pair[a];
			let D = 0;
			for(let d = 5; d < 80 && !D; d++) if(Math.hypot(c.x[wrap(a + d)] - c.x[wrap(b + d)], c.z[wrap(a + d)] - c.z[wrap(b + d)]) > hw * 2.4) D = d;
			if(!D) continue;
			const ka = wrap(a + D), kb = wrap(b + D);
			forks.push({ a, b, D, onA: boards(ka, c.x[kb], c.z[kb]), onB: boards(kb, c.x[ka], c.z[ka]) });
		}
		const near = (ci, at, D) => { const d = wrap(at - ci); return d <= 180 || n - d <= D + 5; };      // (coming up to it, or just past)
		forks.setRoute = ci => { for(const f of forks){ f.onB.visible = ci >= 0 && near(ci, f.a, f.D); f.onA.visible = ci >= 0 && near(ci, f.b, f.D); } };
	}

	// What the rear-view mirror doesn't draw (see renderMirror in main.js), and the forests that can be thinned.
	const noMirror = [], lod = [];
	group.traverse(o => { if(o.userData && o.userData.noMirror) noMirror.push(o); if(o.userData && o.userData.lod) lod.push(o); });

	return {
		group, theme, sun, fog, farPlane, occluders, info: extras.info, boards: extras.boards, noMirror,
		// The sun's shadows on or off while it's running (the adaptive quality in gfx.js). Only where the world was built with them.
		setShadows(on){ if(shadows) sun.castShadow = !!on; },
		// Draw only this share (0..1) of the trees (they were built in a random order, so it thins evenly).
		setDensity(d){ for(const m of lod) m.count = Math.max(1, Math.round(m.userData.lod * d)); },
		// Arrow boards at a fork in a lap that uses the same road twice: ci, the followed car's sample.
		setRoute(ci){ if(forks.setRoute) forks.setRoute(ci); },
		forks,
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
			if(skyMesh){ skyMesh.material.uniforms.uTime.value += dt; if(focus) skyMesh.position.set(focus.x, 0, focus.z); }
			if(shadows && focus){
				snapToTexels(focus.x, focus.y || 0, focus.z, snapped);
				sun.target.position.copy(snapped);
				sun.position.set(snapped.x + sunOffset.x, snapped.y + sunOffset.y, snapped.z + sunOffset.z);
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
