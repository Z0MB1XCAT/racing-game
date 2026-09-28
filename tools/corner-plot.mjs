// Overlays the game's road (grey, with its edges) on the real centreline (red) around a point
// on the lap, to see how much a corner has been opened up.
//   node tools/corner-plot.mjs <trackId> <lap fraction> [radius] [label]
// Writes temporary screenshots/corner-<trackId>-<label>.png. Needs puppeteer.
import puppeteer from "puppeteer";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require("./three.min.cjs");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const TRACKS = [...MAIN, ...LAYOUTS];   // (every layout of every venue)
const { buildTrack } = await import("../js/trackgen.js");
const [id, frac, r = 60, label = frac] = process.argv.slice(2);
const def = TRACKS.find(t => t.id === id);
const game = buildTrack(def), real = buildTrack(Object.assign({}, def, { cornerRoom: -1e6, tight: [] }));
const c = game.center, i0 = Math.floor(+frac * c.n) % c.n;
const X = c.x[i0], Z = c.z[i0], R = +r, S = 900 / (R * 2);
const P = (x, z) => [450 - (x - X) * S, 450 - (z - Z) * S];
const pts = t => Array.from({ length: t.center.n }, (_, i) => P(t.center.x[i], t.center.z[i]));
const edge = (t, s) => Array.from({ length: t.center.n }, (_, i) => P(t.center.x[i] + t.center.tz[i] * s * t.center.hw, t.center.z[i] - t.center.tx[i] * s * t.center.hw));
// Distance labels along the game road every 100 m of the real lap (for naming corners).
const meters = def.pts ? (await import("../js/circuits.js")).CIRCUITS[def.id].meters : 0;
const ticks = meters ? Array.from({ length: Math.floor(meters / 100) }, (_, k) => { const i = Math.floor(k * 100 / meters * c.n); return [...P(c.x[i], c.z[i]), k * 100]; }) : [];
const data = { game: pts(game), real: pts(real), gl: edge(game, 1), gr: edge(game, -1), rl: edge(real, 1), rr: edge(real, -1), mark: P(X, Z), scale: S, ticks };
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 900 });
await p.setContent(`<canvas id=c width=900 height=900 style="background:#eef2e6"></canvas>`);
await p.evaluate(d => {
	const g = document.getElementById("c").getContext("2d");
	const poly = (a, col, w, dash) => { g.beginPath(); g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = w; a.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); };
	poly(d.game, "#9aa0a6", d.scale * 11, []);
	poly(d.gl, "#333", 2); poly(d.gr, "#333", 2);
	poly(d.rl, "#d33", 1.5, [6, 5]); poly(d.rr, "#d33", 1.5, [6, 5]);
	poly(d.real, "#d33", 2.5);
	g.fillStyle = "#06c"; g.beginPath(); g.arc(d.mark[0], d.mark[1], 6, 0, 7); g.fill();
	g.font = "bold 13px sans-serif"; g.fillStyle = "#063";
	for(const [x, y, m] of d.ticks){ g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillText(m + "m", x + 5, y - 5); }
	g.fillStyle = "#000"; g.font = "16px sans-serif"; g.fillText("grey/black: game road   red: real layout (same width)   blue: chosen point", 12, 24);
}, data);
await p.screenshot({ path: `temporary screenshots/corner-${id}-${label}.png` });
await b.close();
console.log("wrote", `temporary screenshots/corner-${id}-${label}.png`);
