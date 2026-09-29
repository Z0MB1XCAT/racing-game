// A map of a venue's real surroundings as the game has them (js/places/<venue>.js): ground cover,
// water, buildings, streets, trees and the circuit, into temporary screenshots/places/<venue>.png.
//   node tools/place-plot.mjs <venue> [size in metres] [fraction of the lap to centre on]
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { CIRCUITS } from "../js/circuits.js";

const [venue = "spa", size = "3600", at] = process.argv.slice(2);
const P = (await import(`../js/places/${venue}.js`)).default;
const half = +size / 2, px = 1600, k = px / (+size);
const track = CIRCUITS[venue].pts;
let cx = track.reduce((a, p) => a + p[0], 0) / track.length, cy = track.reduce((a, p) => a + p[1], 0) / track.length;
if(at !== undefined){ const q = track[Math.floor(+at * track.length) % track.length]; [cx, cy] = q; }
const X = e => ((e - cx + half) * k).toFixed(1), Y = n => ((half - (n - cy)) * k).toFixed(1);
const path = (pts, close = true) => "M" + pts.map(([e, n]) => X(e) + "," + Y(n)).join("L") + (close ? "Z" : "");
const COL = { forest: "#2f6b34", scrub: "#6f8f4f", grass: "#9fd07a", farm: "#e3d48a", orchard: "#b6cf7a", res: "#d8d4cc", ind: "#c9c0d0", paved: "#9a9aa2",
	pitch: "#7fcf7a", sand: "#f0e0b0", gravel: "#c8bca8", dirt: "#b89a78", water: "#6aa8e8", pool: "#6ad0f0" };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#eef3e6">`;
const order = ["res", "ind", "grass", "farm", "orchard", "scrub", "forest", "pitch", "paved", "sand", "gravel", "dirt", "water", "pool"];
for(const kind of order) for(const a of P.land || []) if(a.k === kind) svg += `<path d="${path(a.p)}${(a.h || []).map(h => path(h)).join("")}" fill="${COL[kind]}" fill-rule="evenodd" opacity="0.9"/>`;
for(const [outer, ...holes] of P.water) svg += `<path d="${path(outer)}${holes.map(h => path(h)).join("")}" fill="#6aa8e8" fill-rule="evenodd"/>`;
for(const line of P.coast) svg += `<path d="${path(line, false)}" fill="none" stroke="#1f5fa8" stroke-width="2"/>`;
for(const r of P.roads) svg += `<path d="${path(r.p, false)}" fill="none" stroke="#666" stroke-width="${Math.max(1, r.w * k * 0.6)}"/>`;
for(const r of P.rails || []) svg += `<path d="${path(r, false)}" fill="none" stroke="#7a4a2a" stroke-width="2" stroke-dasharray="4 3"/>`;
for(const b of P.buildings) svg += `<path d="${path(b.p)}" fill="${b.k === "stand" ? "#d84040" : b.m ? "#ffb000" : b.k === "house" ? "#a07050" : b.k === "shed" ? "#8a8a9a" : "#5a5048"}"/>`;
for(const [e, n] of P.trees || []) svg += `<circle cx="${X(e)}" cy="${Y(n)}" r="1.6" fill="#1d4d24"/>`;
for(const w of P.wheels || []) svg += `<circle cx="${X(w.at[0])}" cy="${Y(w.at[1])}" r="${w.d * k / 2}" fill="none" stroke="#e040a0" stroke-width="3"/>`;
svg += `<path d="${path(track)}" fill="none" stroke="#111" stroke-width="3"/>`;
svg += `<text x="10" y="24" font-family="sans-serif" font-size="18">${venue}: ${size} m across</text></svg>`;
// Every tenth of the lap marked along the track.
for(let f = 0; f < 10; f++){ const q = track[Math.floor(f / 10 * track.length)]; svg += `<text x="${X(q[0])}" y="${Y(q[1])}" font-family="sans-serif" font-size="20" fill="#d00">${f / 10}</text>`; }
svg = svg.replace("</svg>", "") + "</svg>";
mkdirSync("temporary screenshots/places", { recursive: true });
const b = await puppeteer.launch({ headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: px, height: px });
await p.setContent(svg);
await p.screenshot({ path: `temporary screenshots/places/${venue}${at !== undefined ? "-" + at : ""}.png` });
await b.close();
console.log(`temporary screenshots/places/${venue}.png`);
