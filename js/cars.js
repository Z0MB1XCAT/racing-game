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

// Pattern textures for the main paint (cached by pattern + colours).
const texCache = new Map();
function patternTexture(pattern, main, second, accent){
	const key = [pattern, main, second, accent].join("|");
	if(texCache.has(key)) return texCache.get(key);
	let t = null;
	if(pattern === "check"){
		t = canvasTex(64, 64, g => { for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ g.fillStyle = (i + j) % 2 ? "#f4f6fa" : main; g.fillRect(i * 8, j * 8, 8, 8); } });
		t.magFilter = THREE.NearestFilter;
	}else if(pattern === "fade"){
		t = canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, main); gr.addColorStop(0.45, main); gr.addColorStop(1, second); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
	}else if(pattern === "carbon"){
		t = canvasTex(32, 32, g => { g.fillStyle = "#1a1c20"; g.fillRect(0, 0, 32, 32); for(let i = 0; i < 8; i++) for(let j = 0; j < 8; j++){ g.fillStyle = (i + j) % 2 ? "#26292f" : "#141619"; g.fillRect(i * 4, j * 4, 4, 2); g.fillRect(i * 4 + ((i + j) % 2) * 2, j * 4 + 2, 2, 2); } });
		t.magFilter = THREE.NearestFilter;
	}else if(pattern === "flames"){
		t = canvasTex(128, 128, (g, w, h) => {
			g.fillStyle = main; g.fillRect(0, 0, w, h);
			for(const [col, s] of [["#ff5a1f", 1], ["#ffc21f", 0.62]]){
				g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
				for(let x = 0; x <= w; x += 16) g.lineTo(x + 8, h - (40 + ((x * 37) % 50)) * s), g.lineTo(x + 16, h - 12 * s);
				g.lineTo(w, h); g.fill();
			}
		});
	}else if(pattern === "record"){
		t = canvasTex(64, 64, (g, w, h) => { g.fillStyle = main; g.fillRect(0, 0, w, h); g.strokeStyle = second; g.lineWidth = 5; for(let i = -64; i < 128; i += 18){ g.beginPath(); g.moveTo(i, h); g.lineTo(i + 40, 0); g.stroke(); } });
	}
	texCache.set(key, t);
	return t;
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
	if(L.pattern === "gold") mainMat = own(new THREE.MeshPhongMaterial(Object.assign({ color: 0xc9a227, specular: 0xfff1b8, shininess: 90 }, see)));
	else if(L.pattern === "chrome") mainMat = own(new THREE.MeshPhongMaterial(Object.assign({ color: 0xcfd6dd, specular: 0xffffff, shininess: 140 }, see)));
	else{
		const map = patternTexture(L.pattern, L.main, L.second, L.accent);
		mainMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: map ? 0xffffff : L.main, map }, see)));
	}
	const secondMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: L.second }, see)));
	const accentMat = own(new THREE.MeshLambertMaterial(Object.assign({ color: L.accent, emissive: L.pattern === "neon" ? L.accent : 0x000000, emissiveIntensity: 0.8 }, see)));
	const dark = ghost ? mainMat : mat("dark", () => new THREE.MeshLambertMaterial({ color: 0x1b1e26 }));
	const tyre = ghost ? mainMat : mat("tyre", () => new THREE.MeshLambertMaterial({ color: 0x222222 }));
	const glass = ghost ? mainMat : mat("glass", () => new THREE.MeshLambertMaterial({ color: 0x0e1622, emissive: 0x0a1830 }));
	const head = ghost ? mainMat : mat("head", () => new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
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
		const color = glow.color === "hue" ? `hsl(${hue}, 100%, 60%)` : glow.color === "rainbow" ? "#ffffff" : glow.color;
		const m = own(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		const plane = new THREE.Mesh(mat("glowGeo", () => new THREE.PlaneBufferGeometry(2.4, 3.4)), m);
		plane.rotation.x = -Math.PI / 2;
		plane.position.y = 0.05;
		plane.renderOrder = 2;
		g.add(plane);
		g.userData.glow = m;
		g.userData.rainbow = glow.color === "rainbow";
	}

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
	if(model.userData.rainbow && model.userData.glow){
		model.userData.hueT = ((model.userData.hueT || 0) + dt * 0.25) % 1;
		model.userData.glow.color.copy(tmpColor.setHSL(model.userData.hueT, 1, 0.6));
	}
}

export function disposeCar(model){
	for(const o of model.userData.owned || []) if(o && o.dispose && !isShared(o)) o.dispose();
}
