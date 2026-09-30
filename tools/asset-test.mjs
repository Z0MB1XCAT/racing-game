// Checks the asset pipeline (js/assets.js, js/materials.js) in the real game: models and textures load
// and are used, and the game carries on with its own drawn-in-code versions when they don't.
// Needs node serve.mjs running.
//   node tools/asset-test.mjs
//
// Each case loads the game fresh with the asset requests changed on the way (the files on disk aren't touched):
//   normal    : the models load, and the world uses them (the floodlights are the model, not boxes)
//   no-manifest: manifest.json is missing: nothing loads, the game builds its own, no page errors
//   bad-model : one model file is junk: that one falls back, the others load
//   texture   : a texture in the manifest replaces the drawn asphalt (and "tint": false shows its own colours)
//   low       : a "min": "high" model isn't fetched on Low quality
import puppeteer from "puppeteer";
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

// Every model the real manifest lists (so adding one doesn't break the counts below).
const MODELS = Object.keys(JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8")).models);

// A tiny solid-colour PNG (2 x 2), made here so the test needs no image file.
function png(r, g, b){
	const crc = (buf) => { let c, t = crc.t || (crc.t = Array.from({ length: 256 }, (_, n) => { c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); let x = 0xFFFFFFFF; for(const v of buf) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
	const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
	const raw = Buffer.concat([0, 1].map(() => Buffer.from([0, r, g, b, r, g, b])));
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const browser = await puppeteer.launch({ headless: "new" });
const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };

async function run(name, { intercept, quality, track = "spa" }){
	console.log(name);
	const p = await browser.newPage();
	const errors = [], warns = [];
	p.on("pageerror", e => errors.push(e.message));
	p.on("console", m => { const t = m.text(); if(m.type() === "warn" && /\[assets\]/.test(t)) warns.push(t); else if(m.type() === "error" && !/tailwind|apple-mobile|404|Failed to load resource/.test(t)) errors.push(t); });
	if(quality) await p.evaluateOnNewDocument(q => { try{ localStorage.setItem("org-gp:settings", JSON.stringify({ quality: q })); }catch(e){} }, quality);
	await p.setRequestInterception(true);
	p.on("request", req => { const r = intercept ? intercept(req.url()) : null; if(r) req.respond(r); else req.continue(); });
	await p.setViewport({ width: 1100, height: 700 });
	await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	await p.click("#btnBots"); await new Promise(r => setTimeout(r, 400));
	await p.evaluate(id => document.querySelector(`#setupTracks [data-id="${id}"]`).click(), track);
	await new Promise(r => setTimeout(r, 2500));
	const res = await p.evaluate(async () => {
		const a = await import("/js/assets.js");
		const g = window.__game;
		let glowParts = 0, boxLights = 0, roadMap = null, roadColor = null, terrainMap = false;
		g.world.group.traverse(o => {
			if(o.isInstancedMesh && o.geometry.attributes.position.count === 4 && o.material.type === "MeshBasicMaterial" && !o.material.map && o.count > 5) glowParts++;
			if(o.isInstancedMesh && o.geometry.attributes.position.count === 24 && o.material.type === "MeshBasicMaterial" && !o.material.map && o.count > 5) boxLights++;
			if(o.isMesh && o.material && o.material.type === "MeshPhongMaterial" && o.material.map && o.material.side === 2 && !roadMap){ roadMap = o.material.map.image ? (o.material.map.image.naturalWidth || o.material.map.image.width) : 0; roadColor = o.material.color.getHex(); }
			if(o.isMesh && o.material && o.material.type === "MeshLambertMaterial" && o.material.map && o.geometry.attributes.uv && o.geometry.attributes.position.count > 20000) terrainMap = true;
		});
		// (A model that's loaded but marked "min": "high" isn't handed out for a Low world.)
		const lampLow = a.instantiate("lamp-post", [{ x: 0, z: 0 }], { quality: "low" }), lampHigh = a.instantiate("lamp-post", [{ x: 0, z: 0 }], { quality: "high" });
		const ts = g.world.info && g.world.info.trackside;
		return { info: a.assetInfo(), trackside: ts ? { posts: ts.posts, flags: ts.flags, tents: ts.tents, cones: ts.cones } : null, glowParts, boxLights, roadMap, roadColor, terrainMap, lampLow: !!lampLow, lampHigh: !!lampHigh };
	});
	await p.close();
	return { ...res, errors, warns };
}

// ---- normal
{
	const r = await run("normal", { quality: "high" });
	ok(MODELS.every(m => m in r.info.models), "every model in the manifest loaded (" + MODELS.length + "): " + Object.keys(r.info.models).length);
	ok("gantry" in r.info.models && r.trackside && r.trackside.posts > 0 && r.trackside.flags > 0, "the start gantry and the trackside props are there: " + JSON.stringify(r.trackside));
	ok(r.glowParts > 0, "the floodlights are the model (" + r.glowParts + " glowing lamp parts)");
	ok(r.roadMap > 0, "the road has a tarmac texture (" + r.roadMap + " px)");
	ok(r.terrainMap, "the ground has a grass texture");
	ok(r.lampHigh && !r.lampLow, "the High-only lamp is handed out for a High world but not a Low one, even though it's loaded");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- no manifest
{
	const r = await run("no-manifest", { intercept: u => /assets\/manifest\.json/.test(u) ? { status: 404, body: "" } : null });
	ok(Object.keys(r.info.models).length === 0 && r.info.ready, "nothing loaded, and the game knows it's done");
	ok(r.glowParts === 0 && r.boxLights > 0, "the floodlights are the game's own boxes (" + r.boxLights + ")");
	ok(r.trackside && r.trackside.posts + r.trackside.flags + r.trackside.tents + r.trackside.cones === 0, "no trackside props, and nothing breaks: " + JSON.stringify(r.trackside));
	ok(r.roadMap > 0, "the road still has its drawn tarmac");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- one junk model
{
	const r = await run("bad-model", { quality: "high", intercept: u => /models\/lamp-post\.glb/.test(u) ? { status: 200, contentType: "model/gltf-binary", body: Buffer.from("this is not a model") } : null, track: "monza" });
	ok(!("lamp-post" in r.info.models) && Object.keys(r.info.models).length === MODELS.length - 1, "the junk one didn't load, the rest did: " + Object.keys(r.info.models).length + " of " + MODELS.length);
	ok(r.warns.some(w => /lamp-post/.test(w)), "it said so in the console once");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- a junk model the trackside needs: no marshal posts, but the rest of the trackside and the gantry are fine
{
	const r = await run("bad-post", { quality: "high", intercept: u => /models\/kenney\/bannerTowerRed\.glb/.test(u) ? { status: 200, contentType: "model/gltf-binary", body: Buffer.from("this is not a model") } : null, track: "monza" });
	ok(r.trackside && r.trackside.posts === 0 && r.trackside.tents > 0, "no marshal posts, tents still there: " + JSON.stringify(r.trackside));
	ok("gantry" in r.info.models && !("marshal-post-red" in r.info.models), "the gantry loaded, the junk post didn't");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- a texture in the manifest
{
	const manifest = { models: {}, textures: { asphalt: { file: "textures/test.png", tint: false }, grass: { file: "textures/test.png" } } };
	const r = await run("texture", { intercept: u => /assets\/manifest\.json/.test(u) ? { status: 200, contentType: "application/json", body: JSON.stringify(manifest) } : /textures\/test\.png/.test(u) ? { status: 200, contentType: "image/png", body: png(200, 40, 40) } : null });
	ok(r.info.textures.includes("asphalt") && r.info.textures.includes("grass"), "both textures loaded: " + r.info.textures);
	ok(r.roadMap === 2, "the road uses the file's texture (2 px), not the drawn one (" + r.roadMap + ")");
	ok(r.roadColor === 0xffffff, "\"tint\": false made the road's colour white (0x" + (r.roadColor || 0).toString(16) + ")");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- a high-quality-only model, on Low
{
	let fetched = false;
	const manifest = { models: { "lamp-post": { file: "models/lamp-post.glb", min: "high" } }, textures: {} };
	const r = await run("low", { quality: "low", intercept: u => { if(/models\/lamp-post\.glb/.test(u)) fetched = true; return /assets\/manifest\.json/.test(u) ? { status: 200, contentType: "application/json", body: JSON.stringify(manifest) } : null; } });
	ok(!fetched && Object.keys(r.info.models).length === 0, "a \"min\": \"high\" model isn't even fetched on Low");
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
// ---- the real manifest on Low: the street-lamp model waits for High, the floodlights don't
{
	const r = await run("real-low", { quality: "low", track: "monaco" });
	ok(!("lamp-post" in r.info.models) && "floodlight-head" in r.info.models, "Low loads the floodlights but not the High-only lamp: " + JSON.stringify(r.info.models));
	ok(r.errors.length === 0, "no page errors" + (r.errors.length ? ": " + r.errors[0] : ""));
}
await browser.close();
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\nasset pipeline ok");
