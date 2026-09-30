// Checks assets/manifest.json against the files in assets/ and their budgets (see assets/README.md).
//   node tools/check-assets.mjs
// For each model: the file exists, is a real GLB (glTF 2.0) with only plain data (no Draco, Meshopt or
// KTX2, which the game can't read), and is within maxTris / maxKB. For each texture: it exists, is a
// PNG, JPEG or WebP, and is within maxKB (dimensions are shown for PNG and JPEG; a power of two is best).
// Exits with 1 if anything is wrong.
import { readFileSync, existsSync, statSync } from "node:fs";

const ROOT = new URL("../assets/", import.meta.url);
let bad = 0;
const fail = (what, msg) => { bad++; console.log("  FAIL", what + ":", msg); };
const warn = (what, msg) => console.log("  warn", what + ":", msg);

const manifest = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
const kb = f => statSync(f).size / 1024;
const pow2 = n => n > 0 && (n & (n - 1)) === 0;

// Triangles and the extensions used, read from a GLB's JSON chunk.
function readGlb(file){
	const b = readFileSync(file);
	if(b.length < 20 || b.toString("ascii", 0, 4) !== "glTF") throw new Error("not a GLB file (no glTF header)");
	if(b.readUInt32LE(4) !== 2) throw new Error("not glTF 2.0");
	const jsonLen = b.readUInt32LE(12);
	if(b.readUInt32LE(16) !== 0x4E4F534A) throw new Error("the first chunk isn't JSON");
	const j = JSON.parse(b.toString("utf8", 20, 20 + jsonLen));
	let tris = 0;
	for(const m of j.meshes || []) for(const p of m.primitives || []){
		const mode = p.mode ?? 4;
		if(mode !== 4) continue;                                   // (triangles only)
		const count = p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count;
		tris += count / 3;
	}
	return { json: j, tris: Math.round(tris), materials: (j.materials || []).map(m => m.name || "(unnamed)") };
}
// Width and height of a PNG or JPEG (or null: a WebP, or something unreadable).
function imageSize(file){
	const b = readFileSync(file);
	if(b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
	if(b[0] === 0xFF && b[1] === 0xD8){
		for(let i = 2; i < b.length - 9;){
			if(b[i] !== 0xFF){ i++; continue; }
			const marker = b[i + 1];
			if(marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
			i += 2 + b.readUInt16BE(i + 2);
		}
	}
	return null;
}

let files = 0, total = 0;
console.log("models");
for(const [name, def] of Object.entries(manifest.models || {})){
	const f = new URL(def.file, ROOT);
	if(!def.file || !existsSync(f)){ fail(name, "file not found: " + def.file); continue; }
	files++; total += kb(f);
	try{
		const g = readGlb(f);
		const ext = [...(g.json.extensionsRequired || []), ...(g.json.extensionsUsed || [])].filter(e => /draco|meshopt|ktx|basisu/i.test(e));
		console.log("  " + name.padEnd(18), String(g.tris).padStart(5) + " tris,", kb(f).toFixed(1).padStart(6) + " KB, materials: " + g.materials.join(", "));
		if(ext.length) fail(name, "uses " + ext.join(", ") + " (the game can't read compressed glTF: export it plain)");
		if(def.maxTris && g.tris > def.maxTris) fail(name, g.tris + " triangles, over its budget of " + def.maxTris);
		if(def.maxKB && kb(f) > def.maxKB) fail(name, kb(f).toFixed(1) + " KB, over its budget of " + def.maxKB);
		if(!["world", "game", undefined].includes(def.scale)) fail(name, "scale must be \"world\" or \"game\"");
	}catch(e){ fail(name, e.message); }
}
console.log("textures");
for(const [name, def] of Object.entries(manifest.textures || {})){
	const f = new URL(def.file, ROOT);
	if(!def.file || !existsSync(f)){ fail(name, "file not found: " + def.file); continue; }
	files++; total += kb(f);
	const size = imageSize(f), webp = /\.webp$/i.test(def.file);
	console.log("  " + name.padEnd(18), (size ? size.join(" x ") : webp ? "webp" : "?").padEnd(11), kb(f).toFixed(1).padStart(6) + " KB");
	if(!size && !webp) fail(name, "not a PNG, JPEG or WebP the game can read");
	if(size && (!pow2(size[0]) || !pow2(size[1]))) warn(name, "not a power of two (256, 512, 1024...): it works, but looks best and loads fastest as one");
	if(size && Math.max(...size) > 2048) warn(name, "bigger than 2048 pixels: players download it, and it costs memory on a phone");
	if(def.maxKB && kb(f) > def.maxKB) fail(name, kb(f).toFixed(1) + " KB, over its budget of " + def.maxKB);
	if(def.tint !== undefined && typeof def.tint !== "boolean") fail(name, "tint must be true or false");
	if(!["asphalt", "grass"].includes(name)) warn(name, "the game only uses textures called asphalt and grass");
}
console.log(files + " files, " + total.toFixed(1) + " KB in all" + (total > 8192 ? "  (warn: over 8 MB: that's a lot for players to download)" : ""));
if(bad){ console.log(bad + " problem" + (bad > 1 ? "s" : "")); process.exit(1); }
console.log("assets ok");
