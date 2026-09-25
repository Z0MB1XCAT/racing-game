// Draws every track top-down (map orientation, north up) into an HTML sheet and screenshots it.
//   node tools/track-preview.mjs [trackId] [--rev] [--world]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
const require = createRequire(import.meta.url);
globalThis.THREE = require(process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const { TRACKS } = await import("../js/tracks.js");
const { buildTrack, badGridSlots } = await import("../js/trackgen.js");
const { GRID } = await import("../js/physics.js");

const args = process.argv.slice(2);
const only = args.find(a => !a.startsWith("--"));
const rev = args.includes("--rev"), worldView = args.includes("--world"), sim = args.includes("--sim");
const { makeTracker } = await import("../js/progress.js");
const simRace = sim ? (await import("./sim-core.mjs")).race : null;
const list = TRACKS.filter(t => !only || t.id === only);

const cards = list.map(def => {
	const t = buildTrack(def, rev);
	const P = worldView ? (x, z) => [-x, -z] : (x, z) => { const [mx, my] = t.toMap(x, z); return [mx, -my]; };
	const segs = t.wallSegs.map(([x1, z1, x2, z2, s]) => {
		const [a, b] = P(x1, z1), [c, d] = P(x2, z2);
		return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${s ? "#f48342" : "#ffd24a"}" stroke-width="1.2"/>`;
	}).join("");
	let center = "";
	const racingLine = t.center || makeTracker(t).path;
	if(racingLine){
		const c = racingLine;
		center = `<polyline fill="none" stroke="#3a4a66" stroke-width="${c.hw * 2}" stroke-linejoin="round" points="${Array.from({ length: c.n }, (_, i) => P(c.x[i], c.z[i]).join(",")).join(" ")}"/>`;
		center += `<polyline fill="none" stroke="#6b7c99" stroke-width="0.4" stroke-dasharray="2 3" points="${Array.from({ length: c.n }, (_, i) => P(c.x[i], c.z[i]).join(",")).join(" ")}"/>`;
	}
	const lines = t.lines.map((l, i) => {
		const [a, b] = P(l.a.x, l.a.y), [c, d] = P(l.b.x, l.b.y);
		return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${i ? "#e23b3b" : "#2580db"}" stroke-width="${i ? 1.5 : 3}"/>`;
	}).join("");
	let simSvg = "";
	if(simRace){
		const r = simRace(t, makeTracker(t), ["hard"], 2);
		simSvg = `<polyline fill="none" stroke="#7CFFB2" stroke-width="0.6" points="${r.trail.map(([x, z]) => P(x, z).join(",")).join(" ")}"/>` +
			r.hitsAt.map(([x, z]) => { const [a, b] = P(x, z); return `<circle cx="${a}" cy="${b}" r="1.6" fill="#ff3b6b"/>`; }).join("");
	}
	const pinch = (t.pinches || []).map(([i, j]) => { const c = t.center; const [a, b] = P(c.x[i], c.z[i]), [e, f] = P(c.x[j], c.z[j]); return `<line x1="${a}" y1="${b}" x2="${e}" y2="${f}" stroke="#ff4dff" stroke-width="0.8"/>`; }).join("");
	const bad = new Set(badGridSlots(t, 10));
	const grid = GRID.slice(0, 10).map((g, k) => { const [a, b] = P(g.x, g.y); return `<circle cx="${a}" cy="${b}" r="0.9" fill="${bad.has(k) ? "red" : "#fff"}"/>`; }).join("");
	const pts = [];
	for(const [x1, z1, x2, z2] of t.wallSegs) pts.push(P(x1, z1), P(x2, z2));
	const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
	const pad = 20, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad;
	return `<figure><svg viewBox="${minX} ${minY} ${w} ${h}">${center}${segs}${lines}${grid}${simSvg}${pinch}</svg>
		<figcaption>${def.name}${rev ? " (reverse)" : ""} - walls ${t.walls.length}, length ${t.center ? t.center.len : "-"}, oob ${Math.round(t.oob)}${bad.size ? ", BAD GRID " + [...bad] : ""}</figcaption></figure>`;
}).join("");

const html = `<!doctype html><style>body{margin:0;background:#11151d;color:#dfe6f2;font:14px system-ui;display:grid;grid-template-columns:repeat(${only ? 1 : 3},1fr);gap:8px;padding:8px}
figure{margin:0;background:#1a2130;padding:8px;border-radius:6px}svg{width:100%;height:${only ? 860 : 420}px}figcaption{padding-top:4px}</style>${cards}`;
const file = new URL("../temporary screenshots/tracks.html", import.meta.url);
writeFileSync(file, html);
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: only ? 900 : 1340 });
await page.goto(file.href);
const out = `temporary screenshots/tracks-${only || "all"}${rev ? "-rev" : ""}.png`;
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
