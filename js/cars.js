// Car models. Every body is the same size underneath (the physics treats all cars
// the same); only the looks change. "Classic" is the original game's car.
import { item, DEFAULT_LOOK } from "./cosmetics.js";

const THREE = globalThis.THREE;

export const BODIES = [
	{ id: "classic", name: "Classic", note: "The original box" },
	{ id: "formula", name: "Formula", note: "Open wheels, big wings" },
	{ id: "gt", name: "GT", note: "Low and wide" },
	{ id: "stock", name: "Stock", note: "Oval-racing sedan" }
];

const geo = {};
function box(w, h, d){
	const k = w + "," + h + "," + d;
	return geo[k] || (geo[k] = new THREE.BoxBufferGeometry(w, h, d));
}
function wheelGeo(r, w){
	const k = "w" + r + "," + w;
	if(!geo[k]){
		geo[k] = new THREE.CylinderBufferGeometry(r, r, w, 14);
		geo[k].rotateZ(Math.PI / 2);
	}
	return geo[k];
}

const shared = {};
function mat(key, make){
	return shared[key] || (shared[key] = make());
}
const isShared = m => Object.values(shared).includes(m);

export function carColors(hue){
	return {
		main: new THREE.Color(`hsl(${hue}, 100%, 50%)`),
		deep: new THREE.Color(`hsl(${hue}, 85%, 30%)`),
		css: `hsl(${hue}, 100%, 55%)`
	};
}

function canvasTex(w, h, draw){
	const c = document.createElement("canvas");
	c.width = w; c.height = h;
	draw(c.getContext("2d"), w, h);
	return new THREE.CanvasTexture(c);
}

function numberTexture(num, ink){
	return canvasTex(64, 64, g => {
		g.fillStyle = "#f4f6fa";
		g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
		g.fillStyle = ink;
		g.font = "bold 38px 'Barlow Condensed', Arial, sans-serif";
		g.textAlign = "center"; g.textBaseline = "middle";
		g.fillText(String(num), 32, 35);
	});
}

// Small repeatable random numbers, so a pattern looks the same on every screen.
function seeded(seed){
	return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Darker or lighter version of a CSS colour.
function shade(css, l){ const c = new THREE.Color(css); const h = {}; c.getHSL(h); return "#" + c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + l))).getHexString(); }

// The drawing behind each patterned paint (cached by pattern + colours). Also used for the garage swatches.
const canvasCache = new Map();
export function patternCanvas(pattern, main, second, accent){
	const key = [pattern, main, second, accent].join("|");
	if(canvasCache.has(key)) return canvasCache.get(key);
	let c = null;
	const draw = (w, h, fn) => { c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); };
	if(pattern === "check"){
		draw(64, 64, g => { for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ g.fillStyle = (i + j) % 2 ? "#f4f6fa" : main; g.fillRect(i * 8, j * 8, 8, 8); } });
	}else if(pattern === "fade"){
		draw(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, main); gr.addColorStop(0.45, main); gr.addColorStop(1, second); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
	}else if(pattern === "carbon"){
		draw(32, 32, g => { g.fillStyle = "#1a1c20"; g.fillRect(0, 0, 32, 32); for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ g.fillStyle = (i + j) % 2 ? "#26292f" : "#141619"; g.fillRect(i * 4, j * 4, 4, 2); g.fillRect(i * 4 + ((i + j) % 2) * 2, j * 4 + 2, 2, 2); } });
	}else if(pattern === "flames"){
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			for(const [col, s] of [["#ff5a1f", 1], ["#ffc21f", 0.62]]){
				g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
				for(let x = 0; x <= w; x += 16) g.lineTo(x + 8, h - (40 + ((x * 37) % 50)) * s), g.lineTo(x + 16, h - 12 * s);
				g.lineTo(w, h); g.fill();
			}
		});
	}else if(pattern === "record"){
		draw(64, 64, (g, w, h) => { g.fillStyle = main; g.fillRect(0, 0, w, h); g.strokeStyle = second; g.lineWidth = 5; for(let i = -64; i < 128; i += 18){ g.beginPath(); g.moveTo(i, h); g.lineTo(i + 40, 0); g.stroke(); } });
	}else if(pattern === "monster"){
		// Three torn claw marks, with a few specks thrown off them.
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 6;
			for(let i = 0; i < 3; i++){
				const x0 = 26 + i * 30, top = 8 + i * 5, bot = 120 - (i === 1 ? 0 : 10);
				g.beginPath(); g.moveTo(x0, top);
				g.bezierCurveTo(x0 + 16, top + 30, x0 + 4, bot - 40, x0 + 14, bot);
				g.lineTo(x0 + 6, bot - 22);
				g.bezierCurveTo(x0 - 6, bot - 50, x0 + 4, top + 34, x0 - 5, top + 6);
				g.closePath(); g.fill();
			}
			const r = seeded(7);
			for(let i = 0; i < 14; i++){ g.beginPath(); g.arc(20 + r() * 96, 10 + r() * 108, 0.8 + r() * 1.6, 0, Math.PI * 2); g.fill(); }
		});
	}else if(pattern === "polka"){
		draw(64, 64, (g, w, h) => { g.fillStyle = main; g.fillRect(0, 0, w, h); g.fillStyle = accent; for(let y = 0; y < 5; y++) for(let x = 0; x < 5; x++){ g.beginPath(); g.arc(x * 16 + (y % 2) * 8, y * 16, 4.5, 0, Math.PI * 2); g.fill(); } });
	}else if(pattern === "zebra" || pattern === "tiger"){
		// Wavy bands that taper to a point, from both edges.
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.fillStyle = second;
			const r = seeded(pattern === "zebra" ? 3 : 11), n = pattern === "zebra" ? 9 : 7;
			for(let i = 0; i < n; i++){
				const y = (i + 0.3) * h / n + (r() - 0.5) * 6, th = pattern === "zebra" ? 6 + r() * 4 : 4 + r() * 5, from = i % 2 ? w : 0, dir = i % 2 ? -1 : 1;
				const len = (pattern === "zebra" ? 0.75 : 0.55 + r() * 0.25) * w;
				g.beginPath(); g.moveTo(from, y - th);
				g.quadraticCurveTo(from + dir * len * 0.5, y - th - 8 + r() * 16, from + dir * len, y + (r() - 0.5) * 10);
				g.quadraticCurveTo(from + dir * len * 0.5, y + th + 8 - r() * 16, from, y + th);
				g.fill();
			}
		});
	}else if(pattern === "candy" || pattern === "hazard"){
		draw(64, 64, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.fillStyle = second;
			const band = pattern === "hazard" ? 11 : 8;
			for(let i = -w; i < w * 2; i += band * 2){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i + band, 0); g.lineTo(i + band + h, h); g.lineTo(i + h, h); g.fill(); }
		});
	}else if(pattern === "camo"){
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			const r = seeded(main.length * 31 + 5);
			for(const col of [second, accent, shade(second, -0.08)]){
				g.fillStyle = col;
				for(let i = 0; i < 9; i++){
					const x = r() * w, y = r() * h;
					for(let k = 0; k < 4; k++){ g.beginPath(); g.ellipse(x + (r() - 0.5) * 22, y + (r() - 0.5) * 16, 6 + r() * 10, 4 + r() * 7, r() * Math.PI, 0, Math.PI * 2); g.fill(); }
				}
			}
		});
	}else if(pattern === "sunset"){
		draw(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, second); gr.addColorStop(0.5, accent); gr.addColorStop(1, main); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
	}else if(pattern === "galaxy"){
		draw(128, 128, (g, w, h) => {
			g.fillStyle = second; g.fillRect(0, 0, w, h);
			const r = seeded(21);
			for(const [col, x, y, rad] of [[main, 40, 50, 60], [accent + "88", 84, 70, 40], ["#ff5fc466", 30, 96, 34], ["#35b8ff55", 100, 24, 36]]){
				const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
			}
			for(let i = 0; i < 70; i++){ g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; const s = r() < 0.12 ? 2 : 1; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), s, s); }
		});
	}else if(pattern === "pixel"){
		draw(16, 16, (g, w, h) => {
			const cols = [main, second, shade(main, 0.15), shade(second, -0.1)], r = seeded(4);
			for(let y = 0; y < h; y += 2) for(let x = 0; x < w; x += 2){ g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, 2, 2); }
		});
	}else if(pattern === "synth"){
		draw(64, 64, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.strokeStyle = second; g.lineWidth = 1.5; g.shadowColor = second; g.shadowBlur = 4;
			for(let i = 0; i <= w; i += 16){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
			g.strokeStyle = accent; g.shadowColor = accent; g.lineWidth = 2;
			g.beginPath(); g.moveTo(0, 40); g.lineTo(w, 40); g.stroke();
		});
	}else if(pattern === "lightning"){
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 5;
			for(const [x, s] of [[24, 1], [80, 0.8]]){
				g.beginPath(); g.moveTo(x + 16 * s, 4); g.lineTo(x - 6 * s, 62); g.lineTo(x + 10 * s, 58); g.lineTo(x - 4 * s, 124);
				g.lineTo(x + 30 * s, 48); g.lineTo(x + 14 * s, 52); g.lineTo(x + 32 * s, 4); g.closePath(); g.fill();
			}
		});
	}else if(pattern === "pumpkin"){
		// An orange skin with darker ribs, and a carved face (triangle eyes, a jagged grin) that glows.
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			g.fillStyle = shade(main, -0.09);
			for(let x = 4; x < w; x += 32) g.fillRect(x, 0, 11, h);
			g.lineJoin = "round";
			const face = [
				[[30, 46], [56, 46], [43, 22]],                                  // left eye
				[[72, 46], [98, 46], [85, 22]],                                  // right eye
				[[64, 56], [57, 68], [71, 68]],                                  // nose
				[[18, 82], [30, 76], [40, 90], [52, 78], [64, 92], [76, 78], [88, 90], [98, 76], [110, 82], [100, 104], [86, 98], [74, 108], [64, 100], [54, 108], [42, 98], [28, 104]]   // grin
			];
			g.fillStyle = accent; g.strokeStyle = second; g.lineWidth = 4; g.shadowColor = accent; g.shadowBlur = 8;
			for(const pts of face){ g.beginPath(); g.moveTo(...pts[0]); for(const q of pts.slice(1)) g.lineTo(...q); g.closePath(); g.stroke(); g.fill(); }
		});
	}else if(pattern === "lava"){
		// Glowing cracks: branching lines, blurred underneath for the glow.
		draw(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			const r = seeded(9);
			g.lineCap = "round"; g.lineJoin = "round";
			const paths = [];
			for(let i = 0; i < 9; i++){
				let x = r() * w, y = r() * h, a = r() * Math.PI * 2;
				const pts = [[x, y]];
				for(let k = 0; k < 6; k++){ a += (r() - 0.5) * 1.4; x += Math.cos(a) * 12; y += Math.sin(a) * 12; pts.push([x, y]); }
				paths.push(pts);
			}
			for(const [col, lw, blur] of [[accent, 5, 10], ["#ffc23a", 1.6, 0]]){
				g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = accent; g.shadowBlur = blur;
				for(const pts of paths){ g.beginPath(); g.moveTo(...pts[0]); for(const q of pts.slice(1)) g.lineTo(...q); g.stroke(); }
			}
		});
	}
	canvasCache.set(key, c);
	return c;
}
const PIXELATED = ["check", "carbon", "pixel"];
// Pattern textures for the main paint (cached by pattern + colours).
const texCache = new Map();
function patternTexture(pattern, main, second, accent){
	const key = [pattern, main, second, accent].join("|");
	if(texCache.has(key)) return texCache.get(key);
	const c = patternCanvas(pattern, main, second, accent);
	const t = c ? new THREE.CanvasTexture(c) : null;
	if(t && PIXELATED.includes(pattern)) t.magFilter = THREE.NearestFilter;
	texCache.set(key, t);
	return t;
}

// Headlight colour for a look: a CSS colour, or "rainbow".
export function headlightColor(look, hue){
	const it = item("lights", look && look.lights) || item("lights", "warm");
	return it.color === "hue" ? `hsl(${hue}, 100%, 72%)` : it.color;
}

// Resolve a look into concrete colours and materials.
function resolveLook(look, hue){
	const liv = item("livery", look.livery) || item("livery", "factory");
	const hueMain = `hsl(${hue}, 100%, 50%)`, hueDeep = `hsl(${hue}, 85%, 30%)`;
	const main = liv.main || hueMain;
	const second = liv.second || hueDeep;
	const accent = liv.accent || (liv.pattern === "neon" ? `hsl(${hue}, 100%, 70%)` : "#f4f6fa");
	return { liv, main, second, accent, pattern: liv.pattern };
}

// Returns a THREE.Group sitting on the ground at the origin, facing +z.
// opts: { ghost, look: { livery, number, glow, smoke } }
export function makeCar(body, hue, opts = {}){
	const g = new THREE.Group();
	const ghost = !!opts.ghost;
	const look = Object.assign({}, DEFAULT_LOOK, opts.look);
	const L = resolveLook(look, hue);
	const owned = [];
	const own = m => (owned.push(m), m);
	const see = ghost ? { transparent: true, opacity: 0.35, depthWrite: false } : {};

	let mainMat;
	if(L.pattern === "gloss") mainMat = own(new THREE.MeshPhongMaterial(Object.assign({ color: L.main, specular: 0x8a93a6, shininess: 90 }, see)));
	else if(L.pattern === "gold") mainMat = own(new THREE.MeshPhongMaterial(Object.assign({ color: 0xc9a227, specular: 0xfff1b8, shininess: 90 }, see)));
	else if(L.pattern === "chrome") mainMat = own(new THREE.MeshPhongMaterial(Object.assign({ color: 0xcfd6dd, specular: 0xffffff, shininess: 140 }, see)));
	else{
		const map = patternTexture(L.pattern, L.main, L.second, L.accent);
		// Some paints glow a little in the dark (claw marks, lava cracks, neon grid, stars).
		const glows = map && L.liv.glow;
		mainMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: map ? 0xffffff : L.main, map }, glows ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.45 } : {}, see)));
	}
	const secondMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: L.second }, see)));
	const accentMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: L.accent, emissive: L.pattern === "neon" ? L.accent : 0x000000, emissiveIntensity: 0.8 }, see)));
	const dark = ghost ? mainMat : mat("dark", () => new THREE.MeshLambertMaterial({ color: 0x1b1e26 }));
	const tyre = ghost ? mainMat : mat("tyre", () => new THREE.MeshLambertMaterial({ color: 0x222222 }));
	const glass = ghost ? mainMat : mat("glass", () => new THREE.MeshLambertMaterial({ color: 0x0e1622, emissive: 0x0a1830 }));
	// Headlight lamps: the default warm colour is the one the lamps always had.
	const lampCol = headlightColor(look, hue);
	const head = ghost ? mainMat : lampCol === "rainbow" ? own(new THREE.MeshBasicMaterial({ color: 0xffffff }))
		: lampCol === "#fff2cd" ? mat("head", () => new THREE.MeshBasicMaterial({ color: 0xfff4c8 }))
		: mat("head" + lampCol, () => new THREE.MeshBasicMaterial({ color: lampCol }));
	const tail = ghost ? mainMat : mat("tail", () => new THREE.MeshBasicMaterial({ color: 0xff2a3a }));

	const add = (geom, m, x, y, z) => {
		const mesh = new THREE.Mesh(geom, m);
		mesh.position.set(x, y, z);
		mesh.castShadow = !ghost;
		g.add(mesh);
		return mesh;
	};
	const wheels = [], front = [];
	const wheel = (r, w, x, y, z, isFront) => {
		const holder = new THREE.Group();
		holder.position.set(x, y, z);
		const m = new THREE.Mesh(wheelGeo(r, w), tyre);
		m.castShadow = !ghost;
		holder.add(m);
		g.add(holder);
		wheels.push(m);
		if(isFront) front.push(holder);
	};
	// The main painted blocks, used to lay stripes and splits over the top.
	const shells = [];
	const shell = (w, h, d, x, y, z) => { add(box(w, h, d), mainMat, x, y, z); shells.push({ w, h, d, x, y, z }); };
	let decal = null;   // where the race number sits: [size, x, y, z]

	if(body === "formula"){
		shell(0.34, 0.26, 1.05, 0, 0.36, 0.55);                     // nose
		shell(0.82, 0.36, 1.0, 0, 0.4, -0.25);                      // sidepods
		add(box(0.42, 0.3, 0.55), secondMat, 0, 0.66, -0.35);       // engine cover
		add(box(0.34, 0.14, 0.34), dark, 0, 0.62, 0.12);            // cockpit
		add(box(1.36, 0.05, 0.26), secondMat, 0, 0.22, 1.08);       // front wing
		add(box(1.02, 0.06, 0.28), secondMat, 0, 0.92, -0.92);      // rear wing
		add(box(0.05, 0.42, 0.3), accentMat, 0.5, 0.72, -0.92);
		add(box(0.05, 0.42, 0.3), accentMat, -0.5, 0.72, -0.92);
		wheel(0.3, 0.3, 0.64, 0.3, 0.72, true);
		wheel(0.3, 0.3, -0.64, 0.3, 0.72, true);
		wheel(0.34, 0.36, 0.64, 0.34, -0.66);
		wheel(0.34, 0.36, -0.64, 0.34, -0.66);
		add(box(0.22, 0.06, 0.04), head, 0, 0.3, 1.21);
		add(box(0.3, 0.06, 0.04), tail, 0, 0.5, -1.07);
		decal = [0.26, 0, 0.495, 0.72];
	}else if(body === "gt"){
		shell(1.04, 0.34, 2.02, 0, 0.36, 0);
		shell(0.98, 0.14, 0.7, 0, 0.58, 0.55);                      // bonnet
		add(box(0.84, 0.3, 0.86), glass, 0, 0.66, -0.12);           // cabin
		add(box(0.86, 0.04, 0.6), secondMat, 0, 0.83, -0.16);       // roof
		add(box(1.0, 0.05, 0.22), secondMat, 0, 0.78, -0.95);       // wing
		add(box(0.06, 0.2, 0.1), dark, 0.34, 0.66, -0.92);
		add(box(0.06, 0.2, 0.1), dark, -0.34, 0.66, -0.92);
		wheel(0.3, 0.24, 0.5, 0.3, 0.66, true);
		wheel(0.3, 0.24, -0.5, 0.3, 0.66, true);
		wheel(0.3, 0.26, 0.5, 0.3, -0.66);
		wheel(0.3, 0.26, -0.5, 0.3, -0.66);
		add(box(0.22, 0.08, 0.04), head, 0.34, 0.42, 1.01);
		add(box(0.22, 0.08, 0.04), head, -0.34, 0.42, 1.01);
		add(box(0.26, 0.08, 0.04), tail, 0.32, 0.46, -1.01);
		add(box(0.26, 0.08, 0.04), tail, -0.32, 0.46, -1.01);
		decal = [0.42, 0, 0.853, -0.16];
	}else if(body === "stock"){
		shell(1.02, 0.44, 2.04, 0, 0.44, 0);
		add(box(0.88, 0.36, 1.0), glass, 0, 0.84, -0.18);
		add(box(0.9, 0.04, 0.94), secondMat, 0, 1.03, -0.18);        // roof
		add(box(0.98, 0.14, 0.05), secondMat, 0, 0.72, -1.0);       // spoiler
		wheel(0.3, 0.22, 0.5, 0.3, 0.68, true);
		wheel(0.3, 0.22, -0.5, 0.3, 0.68, true);
		wheel(0.3, 0.22, 0.5, 0.3, -0.68);
		wheel(0.3, 0.22, -0.5, 0.3, -0.68);
		add(box(0.26, 0.1, 0.04), head, 0.32, 0.5, 1.03);
		add(box(0.26, 0.1, 0.04), head, -0.32, 0.5, 1.03);
		add(box(0.3, 0.08, 0.04), tail, 0.3, 0.56, -1.03);
		add(box(0.3, 0.08, 0.04), tail, -0.3, 0.56, -1.03);
		decal = [0.62, 0, 1.056, -0.18];
	}else{
		// The original car: a 1x1x2 box on four wheels.
		shell(1, 1, 2, 0, 0.6, 0);
		wheel(0.5, 0.2, 0.6, 0.5, 0.7, true);
		wheel(0.5, 0.2, -0.6, 0.5, 0.7, true);
		wheel(0.5, 0.2, 0.6, 0.5, -0.7);
		wheel(0.5, 0.2, -0.6, 0.5, -0.7);
		decal = [0.62, 0, 1.106, 0.25];
	}

	// Livery overlays on the painted shells.
	for(const s of shells){
		if(L.pattern === "stripe" || L.pattern === "team"){
			const sw = L.pattern === "team" ? Math.min(0.12, s.w * 0.18) : Math.min(0.24, s.w * 0.3);
			add(box(sw, s.h + 0.012, s.d + 0.012), accentMat, s.x, s.y, s.z);
		}else if(L.pattern === "twin"){
			for(const side of [-1, 1]) add(box(s.w * 0.1, s.h + 0.012, s.d + 0.012), accentMat, s.x + side * s.w * 0.2, s.y, s.z);
		}else if(L.pattern === "split"){
			add(box(s.w + 0.012, s.h * 0.45, s.d + 0.012), secondMat, s.x, s.y - s.h * 0.275, s.z);
		}else if(L.pattern === "neon"){
			for(const side of [-1, 1]) add(box(0.03, 0.05, s.d + 0.01), accentMat, s.x + side * (s.w / 2 + 0.005), s.y - s.h / 2 + 0.04, s.z);
		}else if(L.pattern === "carbon"){
			add(box(Math.min(0.18, s.w * 0.25), s.h + 0.012, s.d + 0.012), own(new THREE.MeshLambertMaterial(Object.assign({ color: `hsl(${hue}, 100%, 50%)` }, see))), s.x, s.y, s.z);
		}
	}

	// Race number.
	if(!ghost && decal && look.number != null){
		const [size, x, y, z] = decal;
		const tex = numberTexture(look.number, "#0e1219");
		const d = new THREE.Mesh(new THREE.PlaneBufferGeometry(size, size), own(new THREE.MeshLambertMaterial({ map: tex, transparent: true })));
		d.rotation.x = -Math.PI / 2;
		d.position.set(x, y, z);
		g.add(d);
		owned.push(tex, d.geometry);
	}

	// Underglow.
	const glow = item("glow", look.glow);
	if(!ghost && glow && glow.color){
		const tex = mat("glowTex", () => canvasTex(64, 64, gg => {
			const r = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
			r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
			gg.fillStyle = r; gg.fillRect(0, 0, 64, 64);
		}));
		const color = glow.color === "hue" ? `hsl(${hue}, 100%, 60%)` : glow.color === "rainbow" || glow.color === "police" ? "#ffffff" : glow.color;
		const m = own(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		const plane = new THREE.Mesh(mat("glowGeo", () => new THREE.PlaneBufferGeometry(2.4, 3.4)), m);
		plane.rotation.x = -Math.PI / 2;
		plane.position.y = 0.05;
		plane.renderOrder = 2;
		g.add(plane);
		g.userData.glow = m;
		g.userData.rainbow = glow.color === "rainbow";
		g.userData.police = glow.color === "police";
	}

	// Headlights: the beam on the road (added in a race) takes the same colour.
	g.userData.lights = lampCol;
	if(lampCol === "rainbow" && !ghost) g.userData.headMat = head;

	// Tyre smoke colour (used by fx.js).
	const smoke = item("smoke", look.smoke) || item("smoke", "white");
	g.userData.smoke = smoke.color === "hue" ? `hsl(${hue}, 100%, 70%)` : smoke.color;

	g.userData.wheels = wheels;
	g.userData.frontWheels = front;
	g.userData.owned = owned;
	return g;
}

// Steering and rolling, purely visual.
const tmpColor = globalThis.THREE ? new THREE.Color() : null;
export function animateCar(model, steer, speed, dt){
	for(const f of model.userData.frontWheels) f.rotation.y = steer;
	const spin = speed * 60 * dt * 2.2;
	for(const w of model.userData.wheels) w.rotation.x += spin;
	const u = model.userData;
	if(u.rainbow && u.glow){
		u.hueT = ((u.hueT || 0) + dt * 0.25) % 1;
		u.glow.color.copy(tmpColor.setHSL(u.hueT, 1, 0.6));
	}
	// Blue and red, flashing in turn.
	if(u.police && u.glow){
		u.flashT = ((u.flashT || 0) + dt * 2.2) % 1;
		u.glow.color.set(u.flashT < 0.5 ? 0x2a5bff : 0xff2433);
	}
	if(u.lights === "rainbow"){
		u.lightT = ((u.lightT || 0) + dt * 0.2) % 1;
		tmpColor.setHSL(u.lightT, 1, 0.7);
		if(u.headMat) u.headMat.color.copy(tmpColor);
		if(u.beamMat) u.beamMat.color.copy(tmpColor);
	}
}

export function disposeCar(model){
	for(const o of model.userData.owned || []) if(o && o.dispose && !isShared(o)) o.dispose();
}
