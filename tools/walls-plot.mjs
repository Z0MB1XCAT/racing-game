// Draws a track's physics walls and centreline around a point, to check tight spots.
//   node tools/walls-plot.mjs <trackId> <x> <z> [radius] [--rev]
// Writes temporary screenshots/walls-<trackId>.png. Needs puppeteer.
import puppeteer from "puppeteer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require("./three.min.cjs");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const TRACKS = [...MAIN, ...LAYOUTS];   // (every layout of every venue)
const { buildTrack } = await import("../js/trackgen.js");
const [id, cx, cz, r = 60] = process.argv.slice(2);
const def = TRACKS.find(t => t.id === id);
const track = buildTrack(def, process.argv.includes("--rev"));
const X = +cx, Z = +cz, R = +r, S = 900 / (R * 2);
const P = (x, z) => [450 + (x - X) * S, 450 - (z - Z) * S];
const segs = track.wallSegs.map(([x1, z1, x2, z2]) => [...P(x1, z1), ...P(x2, z2)]);
const c = track.center, line = [];
for(let i = 0; i < c.n; i++) line.push([...P(c.x[i], c.z[i]), i]);
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 900 });
await p.setContent('<canvas id="c" width="900" height="900" style="background:#fff"></canvas>');
await p.evaluate((segs, line) => {
	const g = document.getElementById("c").getContext("2d");
	g.strokeStyle = "#bbb"; g.lineWidth = 1; g.beginPath();
	line.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
	g.font = "11px sans-serif"; g.fillStyle = "#06c";
	line.forEach(([x, y, i]) => { if(i % 10 === 0 && x > 0 && x < 900 && y > 0 && y < 900) g.fillText(i, x + 3, y - 3); });
	g.strokeStyle = "#d33"; g.lineWidth = 2;
	for(const [a, b, c, d] of segs){ g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
	g.fillStyle = "#000"; g.beginPath(); g.arc(450, 450, 4, 0, 7); g.fill();
}, segs, line);
await (await p.$("#c")).screenshot({ path: `temporary screenshots/walls-${id}.png` });
await b.close();
