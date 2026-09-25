// Car models. Every body is the same size underneath (the physics treats all cars
// the same); only the looks change. "Classic" is the original game's car.
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

export function carColors(hue){
	return {
		main: new THREE.Color(`hsl(${hue}, 100%, 50%)`),
		deep: new THREE.Color(`hsl(${hue}, 85%, 30%)`),
		css: `hsl(${hue}, 100%, 55%)`
	};
}

function numberTexture(num, hue){
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const g = c.getContext("2d");
	g.fillStyle = "#f4f6fa";
	g.beginPath();
	g.arc(32, 32, 30, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = `hsl(${hue}, 80%, 28%)`;
	g.font = "bold 38px 'Barlow Condensed', Arial, sans-serif";
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.fillText(String(num), 32, 35);
	const t = new THREE.CanvasTexture(c);
	return t;
}

// Returns a THREE.Group sitting on the ground at the origin, facing +z.
// group.userData.frontWheels / .wheels are used to steer and spin them.
export function makeCar(body, hue, opts = {}){
	const g = new THREE.Group();
	const col = carColors(hue);
	const ghost = !!opts.ghost;
	const paint = new THREE.MeshLambertMaterial({ color: col.main, transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost });
	const deep = new THREE.MeshLambertMaterial({ color: col.deep, transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost });
	const dark = ghost ? paint : mat("dark", () => new THREE.MeshLambertMaterial({ color: 0x1b1e26 }));
	const tyre = ghost ? paint : mat("tyre", () => new THREE.MeshLambertMaterial({ color: 0x222222 }));
	const glass = ghost ? paint : mat("glass", () => new THREE.MeshLambertMaterial({ color: 0x0e1622, emissive: 0x0a1830 }));
	const white = ghost ? paint : mat("white", () => new THREE.MeshLambertMaterial({ color: 0xf2f4f8 }));
	const head = ghost ? paint : mat("head", () => new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
	const tail = ghost ? paint : mat("tail", () => new THREE.MeshBasicMaterial({ color: 0xff2a3a }));

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

	if(body === "formula"){
		add(box(0.34, 0.26, 1.05), paint, 0, 0.36, 0.55);           // nose
		add(box(0.82, 0.36, 1.0), paint, 0, 0.4, -0.25);            // sidepods
		add(box(0.42, 0.3, 0.55), deep, 0, 0.66, -0.35);            // engine cover
		add(box(0.34, 0.14, 0.34), dark, 0, 0.62, 0.12);            // cockpit
		add(box(1.36, 0.05, 0.26), deep, 0, 0.22, 1.08);            // front wing
		add(box(1.02, 0.06, 0.28), deep, 0, 0.92, -0.92);           // rear wing
		add(box(0.05, 0.42, 0.3), dark, 0.5, 0.72, -0.92);
		add(box(0.05, 0.42, 0.3), dark, -0.5, 0.72, -0.92);
		wheel(0.3, 0.3, 0.64, 0.3, 0.72, true);
		wheel(0.3, 0.3, -0.64, 0.3, 0.72, true);
		wheel(0.34, 0.36, 0.64, 0.34, -0.66);
		wheel(0.34, 0.36, -0.64, 0.34, -0.66);
		add(box(0.22, 0.06, 0.04), head, 0, 0.3, 1.21);
		add(box(0.3, 0.06, 0.04), tail, 0, 0.5, -1.07);
	}else if(body === "gt"){
		add(box(1.04, 0.34, 2.02), paint, 0, 0.36, 0);
		add(box(0.98, 0.14, 0.7), paint, 0, 0.58, 0.55);           // bonnet
		add(box(0.84, 0.3, 0.86), glass, 0, 0.66, -0.12);          // cabin
		add(box(0.86, 0.04, 0.6), deep, 0, 0.83, -0.16);           // roof
		add(box(1.0, 0.05, 0.22), deep, 0, 0.78, -0.95);           // wing
		add(box(0.06, 0.2, 0.1), dark, 0.34, 0.66, -0.92);
		add(box(0.06, 0.2, 0.1), dark, -0.34, 0.66, -0.92);
		add(box(0.12, 0.34, 2.03), white, 0, 0.37, 0);             // stripe
		wheel(0.3, 0.24, 0.5, 0.3, 0.66, true);
		wheel(0.3, 0.24, -0.5, 0.3, 0.66, true);
		wheel(0.3, 0.26, 0.5, 0.3, -0.66);
		wheel(0.3, 0.26, -0.5, 0.3, -0.66);
		add(box(0.22, 0.08, 0.04), head, 0.34, 0.42, 1.01);
		add(box(0.22, 0.08, 0.04), head, -0.34, 0.42, 1.01);
		add(box(0.26, 0.08, 0.04), tail, 0.32, 0.46, -1.01);
		add(box(0.26, 0.08, 0.04), tail, -0.32, 0.46, -1.01);
	}else if(body === "stock"){
		add(box(1.02, 0.44, 2.04), paint, 0, 0.44, 0);
		add(box(0.88, 0.36, 1.0), glass, 0, 0.84, -0.18);
		add(box(0.9, 0.04, 0.94), paint, 0, 1.03, -0.18);
		const num = opts.number ?? ((hue * 7) % 99 + 1);
		const decal = new THREE.Mesh(new THREE.PlaneBufferGeometry(0.62, 0.62), ghost ? paint : new THREE.MeshLambertMaterial({ map: numberTexture(num, hue), transparent: true }));
		decal.rotation.x = -Math.PI / 2;
		decal.position.set(0, 1.056, -0.18);
		g.add(decal);
		add(box(1.03, 0.1, 2.05), white, 0, 0.3, 0);               // rocker stripe
		add(box(0.98, 0.14, 0.05), deep, 0, 0.72, -1.0);           // spoiler
		wheel(0.3, 0.22, 0.5, 0.3, 0.68, true);
		wheel(0.3, 0.22, -0.5, 0.3, 0.68, true);
		wheel(0.3, 0.22, 0.5, 0.3, -0.68);
		wheel(0.3, 0.22, -0.5, 0.3, -0.68);
		add(box(0.26, 0.1, 0.04), head, 0.32, 0.5, 1.03);
		add(box(0.26, 0.1, 0.04), head, -0.32, 0.5, 1.03);
		add(box(0.3, 0.08, 0.04), tail, 0.3, 0.56, -1.03);
		add(box(0.3, 0.08, 0.04), tail, -0.3, 0.56, -1.03);
	}else{
		// The original car: a 1x1x2 box on four wheels.
		add(box(1, 1, 2), paint, 0, 0.6, 0);
		wheel(0.5, 0.2, 0.6, 0.5, 0.7, true);
		wheel(0.5, 0.2, -0.6, 0.5, 0.7, true);
		wheel(0.5, 0.2, 0.6, 0.5, -0.7);
		wheel(0.5, 0.2, -0.6, 0.5, -0.7);
	}
	g.userData.wheels = wheels;
	g.userData.frontWheels = front;
	g.userData.materials = [paint, deep];
	return g;
}

// Steering and rolling, purely visual.
export function animateCar(model, steer, speed, dt){
	for(const f of model.userData.frontWheels) f.rotation.y = steer;
	const spin = speed * 60 * dt * 2.2;
	for(const w of model.userData.wheels) w.rotation.x += spin;
}

export function disposeCar(model){
	for(const m of model.userData.materials || []) m.dispose();
	model.traverse(o => {
		if(o.material && o.material.map && !Object.values(shared).includes(o.material)){
			o.material.map.dispose();
			o.material.dispose();
		}
	});
}
