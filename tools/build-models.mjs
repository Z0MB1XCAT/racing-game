// Builds the game's own simple models into assets/models/*.glb, so there's something real for the
// asset pipeline (js/assets.js) to load. Anything better, made in Blender or bought, goes in the same
// folder (see assets/README.md), and can replace these.
//   node tools/build-models.mjs
//
// Colours are written the way you'd pick them (sRGB, like the game's hex colours) and stored linear,
// which is what glTF wants; the game converts them back when it loads a model.
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../assets/models/", import.meta.url);

// ---------- A little mesh builder: flat-shaded boxes and tapered prisms, in named materials ----------
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const rgb = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(v => lin(v / 255));

class Model {
	constructor(name){ this.name = name; this.mats = new Map(); }
	mat(name, hex){
		if(!this.mats.has(name)) this.mats.set(name, { name, color: rgb(hex), pos: [], nor: [], idx: [] });
		return this.mats.get(name);
	}
	// One flat polygon (3 or 4 points, counter-clockwise seen from outside).
	poly(m, pts){
		const [a, b, c] = pts;
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
		const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
		const base = m.pos.length / 3;
		for(const p of pts){ m.pos.push(...p); m.nor.push(...n); }
		m.idx.push(base, base + 1, base + 2);
		if(pts.length === 4) m.idx.push(base, base + 2, base + 3);
	}
	// A box centred at (x, y, z), w along x, h up, d along z. skip: faces to leave out ("top", "bottom", ...).
	box(matName, hex, x, y, z, w, h, d, skip = []){
		const m = this.mat(matName, hex), X = w / 2, Y = h / 2, Z = d / 2;
		const P = (sx, sy, sz) => [x + sx * X, y + sy * Y, z + sz * Z];
		const faces = {
			top: [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)],
			bottom: [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)],
			front: [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],
			back: [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)],
			right: [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)],
			left: [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)]
		};
		for(const [k, pts] of Object.entries(faces)) if(!skip.includes(k)) this.poly(m, pts);
	}
	// A prism from y0 (radius r0) up to y1 (radius r1) with `seg` sides, standing at (x, z). Optional top cap.
	prism(matName, hex, x, z, y0, y1, r0, r1, seg, cap = true){
		const m = this.mat(matName, hex);
		const ring = (r, y, k) => [x + Math.cos(k / seg * Math.PI * 2) * r, y, z + Math.sin(k / seg * Math.PI * 2) * r];
		for(let k = 0; k < seg; k++){
			this.poly(m, [ring(r0, y0, k + 1), ring(r0, y0, k), ring(r1, y1, k), ring(r1, y1, k + 1)]);
			if(cap) this.poly(m, [[x, y1, z], ring(r1, y1, k + 1), ring(r1, y1, k)]);
		}
	}
	get tris(){ let t = 0; for(const m of this.mats.values()) t += m.idx.length / 3; return t; }

	// The .glb: one mesh with a primitive per material.
	glb(){
		const chunks = [], views = [], accessors = [], prims = [], materials = [];
		const add = (buf, target) => { const off = chunks.reduce((a, b) => a + b.length, 0); chunks.push(buf); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); return views.length - 1; };
		const align = () => { const len = chunks.reduce((a, b) => a + b.length, 0); if(len % 4) chunks.push(Buffer.alloc(4 - len % 4)); };
		for(const m of this.mats.values()){
			const pos = Float32Array.from(m.pos), nor = Float32Array.from(m.nor), idx = Uint16Array.from(m.idx);
			const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
			for(let i = 0; i < pos.length; i += 3) for(let a = 0; a < 3; a++){ min[a] = Math.min(min[a], pos[i + a]); max[a] = Math.max(max[a], pos[i + a]); }
			align(); const vp = add(Buffer.from(pos.buffer), 34962);
			align(); const vn = add(Buffer.from(nor.buffer), 34962);
			align(); const vi = add(Buffer.from(idx.buffer), 34963);
			accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
			accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: "VEC3" });
			accessors.push({ bufferView: vi, componentType: 5123, count: idx.length, type: "SCALAR" });
			const a = accessors.length - 3;
			materials.push({ name: m.name, pbrMetallicRoughness: { baseColorFactor: [...m.color, 1], metallicFactor: 0, roughnessFactor: 1 } });
			prims.push({ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: materials.length - 1 });
		}
		align();
		const bin = Buffer.concat(chunks);
		const json = { asset: { version: "2.0", generator: "tools/build-models.mjs" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: this.name, mesh: 0 }],
			meshes: [{ name: this.name, primitives: prims }], materials, buffers: [{ byteLength: bin.length }], bufferViews: views, accessors };
		let js = Buffer.from(JSON.stringify(json));
		if(js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - js.length % 4, 0x20)]);
		const total = 12 + 8 + js.length + 8 + bin.length;
		const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
		const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4E4F534A, 4);
		const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.writeUInt32LE(0x004E4942, 4);
		return Buffer.concat([head, h1, js, h2, bin]);
	}
}

// ---------- The models. Origin at the base (or, for the head, at the top of its pole); +x reaches over the road ----------
const models = {};

// A street lamp, in metres: an 8 m post with an arm reaching over the street and a lamp under its end.
// "glow" is the lamp itself, which the game lights up after dark.
{
	const m = new Model("lamp-post");
	m.prism("pole", 0x3d4249, 0, 0, 0, 7.8, 0.12, 0.07, 5, true);
	m.box("pole", 0x3d4249, 0.7, 7.75, 0, 1.5, 0.09, 0.09);                 // the arm
	m.box("pole", 0x3d4249, 1.45, 7.78, 0, 0.75, 0.12, 0.34, ["bottom"]);   // the lamp's housing
	m.poly(m.mat("glow", 0xffc46b), [[1.1, 7.72, -0.14], [1.8, 7.72, -0.14], [1.8, 7.72, 0.14], [1.1, 7.72, 0.14]]);
	models["lamp-post"] = m;
}
// The floodlight pole for the circuits, in game units: one unit tall (the game stretches it up to the
// head), tapering from a stout foot.
{
	const m = new Model("floodlight-pole");
	m.prism("pole", 0x3a3f4a, 0, 0, 0, 1, 0.26, 0.14, 6, false);
	models["floodlight-pole"] = m;
}
// Its head, in game units, at the top of the pole: a mount, an arm reaching over the road and the lamp
// housing with its glowing face underneath.
{
	const m = new Model("floodlight-head");
	m.box("pole", 0x3a3f4a, 0, -0.15, 0, 0.5, 0.5, 0.5);
	m.box("pole", 0x3a3f4a, 0.65, 0.0, 0, 1.3, 0.14, 0.14);
	m.box("pole", 0x3a3f4a, 1.25, 0.07, 0, 1.25, 0.26, 1.5, ["bottom"]);
	m.poly(m.mat("glow", 0xfff1c9), [[0.68, -0.062, -0.68], [1.82, -0.062, -0.68], [1.82, -0.062, 0.68], [0.68, -0.062, 0.68]]);
	models["floodlight-head"] = m;
}

mkdirSync(OUT, { recursive: true });
for(const [name, m] of Object.entries(models)){
	const buf = m.glb();
	writeFileSync(new URL(name + ".glb", OUT), buf);
	console.log(name.padEnd(16), m.tris + " triangles,", (buf.length / 1024).toFixed(1) + " KB");
}
