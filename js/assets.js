// 3D models and textures from assets/ (see assets/README.md for how to add one).
//
// assets/manifest.json lists what there is. The game starts without waiting for any of it:
// preload() fetches the lot in the background, and the world is built again with them once they're
// in (main.js). Anything that fails to load, or isn't listed, is simply missing: every caller has
// its own drawn-in-code version to fall back on, so the game never depends on a file.
//
// Models are glTF / GLB (THREE.GLTFLoader, vendor/three-r128/). They're turned into the game's
// own plain materials (Lambert, or Phong for shiny metal) so they take the same lighting as
// everything else, and are always placed as instances (many copies, one draw call per part).
import { VERSION } from "./config.js";
const THREE = globalThis.THREE;

const ROOT = new URL("../assets/", import.meta.url).href;
const state = { promise: null, started: new Set(), models: new Map(), textures: new Map(), defs: { models: {}, textures: {} }, ready: false, loaded: 0 };
const warned = new Set();
function warn(what, err){
	if(warned.has(what)) return;
	warned.add(what);
	console.warn("[assets] " + what + ": " + ((err && err.message) || err));
}
const url = file => ROOT + file + "?v=" + encodeURIComponent(VERSION);

async function readManifest(){
	try{
		const r = await fetch(url("manifest.json"));
		if(!r.ok) throw new Error("manifest.json: " + r.status);
		const m = await r.json();
		return { models: (m && m.models) || {}, textures: (m && m.textures) || {} };
	}catch(e){
		warn("manifest", e);
		return { models: {}, textures: {} };
	}
}

// glTF colours are linear numbers; the game's colours are used as they are (no colour management), so
// convert once here and models come out the colour they were authored.
function gameMaterial(src){
	const color = src.color ? src.color.clone().convertLinearToSRGB() : new THREE.Color(1, 1, 1);
	const emissive = src.emissive ? src.emissive.clone().convertLinearToSRGB() : new THREE.Color(0, 0, 0);
	for(const t of [src.map, src.emissiveMap]) if(t) t.encoding = THREE.LinearEncoding;
	const p = { color, emissive, map: src.map || null, emissiveMap: src.emissiveMap || null, transparent: src.transparent, opacity: src.opacity, side: src.side, alphaTest: src.alphaTest };
	const shiny = src.metalness > 0.5 && src.roughness < 0.6;
	const m = shiny ? new THREE.MeshPhongMaterial(Object.assign(p, { specular: 0x444444, shininess: 40 })) : new THREE.MeshLambertMaterial(p);
	m.name = src.name;
	return m;
}

function prepareModel(name, def, gltf){
	const root = gltf.scene, mats = new Map(), meshes = [];
	root.updateMatrixWorld(true);
	let tris = 0;
	root.traverse(o => {
		if(!o.isMesh) return;
		const g = o.geometry;
		tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
		if(!mats.has(o.material)) mats.set(o.material, gameMaterial(o.material));
		meshes.push({ geometry: g, material: mats.get(o.material), matrix: o.matrixWorld.clone() });
	});
	if(!meshes.length) throw new Error("no meshes in " + def.file);
	return { name, def, meshes, tris: Math.round(tris) };
}

function loadModel(name, def){
	return new Promise(resolve => {
		if(!THREE.GLTFLoader){ warn(name, "THREE.GLTFLoader isn't loaded"); return resolve(null); }
		new THREE.GLTFLoader().load(url(def.file), gltf => {
			try{ resolve(prepareModel(name, def, gltf)); }
			catch(e){ warn(name, e); resolve(null); }
		}, undefined, e => { warn(name, e); resolve(null); });
	});
}

function loadTexture(name, def){
	return new Promise(resolve => {
		new THREE.TextureLoader().load(url(def.file), t => {
			t.encoding = THREE.LinearEncoding;
			t.wrapS = t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
			resolve(t);
		}, undefined, e => { warn(name, e); resolve(null); });
	});
}

// Fetch the manifest and everything in it that this quality wants ("min": "high" entries wait for
// high quality). Safe to call again (a quality change): only what's new is loaded. Never rejects.
export function preload(quality = "high"){
	if(!state.promise) state.promise = readManifest().then(m => { state.defs = m; return m; });
	return state.promise.then(async m => {
		const jobs = [];
		const want = def => !(def && def.min === "high" && quality === "low");
		for(const [name, def] of Object.entries(m.models)){
			const key = "m:" + name;
			if(!def || !def.file || state.started.has(key) || !want(def)) continue;
			state.started.add(key);
			jobs.push(loadModel(name, def).then(v => { if(v){ state.models.set(name, v); state.loaded++; } }));
		}
		for(const [name, def] of Object.entries(m.textures)){
			const key = "t:" + name;
			if(!def || !def.file || state.started.has(key) || !want(def)) continue;
			state.started.add(key);
			jobs.push(loadTexture(name, def).then(v => { if(v){ state.textures.set(name, v); state.loaded++; } }));
		}
		await Promise.all(jobs);
		state.ready = true;
		return true;
	});
}

export const assetsReady = () => state.ready;
// Changes whenever something new has come in: a world built under another stamp is out of date.
export const assetsStamp = () => (state.ready ? 1 : 0) + ":" + state.loaded;
// (Whether a model may be used at this quality: a "min": "high" one stays loaded if the player goes down to Low, but isn't used.)
const usable = (m, quality) => !!m && !(m.def.min === "high" && quality === "low");
export const hasModel = (name, quality = "high") => usable(state.models.get(name), quality);
export const texture = name => state.textures.get(name) || null;
export const textureDef = name => state.defs.textures[name] || null;
// What's loaded, for the tests: { models: { name: triangles }, textures: [names] }.
export function assetInfo(){
	return { ready: state.ready, models: Object.fromEntries([...state.models].map(([k, v]) => [k, v.tris])), textures: [...state.textures.keys()] };
}

// Many copies of a model in one go: one InstancedMesh per part of it, in a Group (add it to the
// world; don't dispose its geometry or materials, they belong to the loaded model and outlive the
// world). null if the model isn't loaded, so the caller draws its own instead.
//   list: [{ x, y, z, ry, s, sx, sy, sz }]  (y: where its base stands; s: overall size, sx/sy/sz: stretch)
//   S: the track's game units per metre (track.mapScale). Models marked "scale": "world" in the
//      manifest are in metres and are scaled by it, like the real buildings; "game" ones are used as they are.
//   materials: { "material name": material }  swap a part's material for one the game drives itself
//      (a "glow" part that lights up at night, say).
//   quality: "low" or "high", the world's: a model marked "min": "high" isn't used on Low.
export function instantiate(name, list, { S = 1, materials = {}, shadows = false, quality = "high" } = {}){
	const m = state.models.get(name);
	if(!usable(m, quality) || !list.length) return null;
	const k = m.def.scale === "game" ? 1 : S;
	const out = new THREE.Group();
	const place = new THREE.Matrix4(), full = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
	for(const part of m.meshes){
		const mesh = new THREE.InstancedMesh(part.geometry, materials[part.material.name] || part.material, list.length);
		list.forEach((it, i) => {
			e.set(0, it.ry || 0, 0); q.setFromEuler(e);
			p.set(it.x, it.y || 0, it.z);
			const s = (it.s ?? 1) * k;
			sc.set((it.sx ?? 1) * s, (it.sy ?? 1) * s, (it.sz ?? 1) * s);
			place.compose(p, q, sc);
			full.multiplyMatrices(place, part.matrix);
			mesh.setMatrixAt(i, full);
		});
		mesh.castShadow = mesh.receiveShadow = shadows;
		mesh.frustumCulled = false;      // (r128 culls a whole InstancedMesh by its first instance's bounds)
		out.add(mesh);
	}
	return out;
}
