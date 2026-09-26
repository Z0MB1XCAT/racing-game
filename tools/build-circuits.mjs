// Builds js/circuits.js from the real-world circuit data in data/circuits.
//   node tools/build-circuits.mjs
// For each F1 circuit:
//   - the real centreline (GeoJSON, race direction) in metres east/north;
//   - the start line moved where needed;
//   - sections that run side by side closer than the game's road width allows are eased
//     apart just enough to leave barriers between them (the real crossover at Suzuka stays);
//   - real elevation (Open Topo Data, cached), smoothed, with the Monaco tunnel levelled out
//     and the Suzuka crossover raised onto a bridge.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = new URL("../data/circuits/", import.meta.url);
const CONF = {
	// Monaco's data starts at Casino Square; the start line is ~140 m before Ste Devote (point 120).
	// The town is too steep for a 25 m DEM (it has the pit straight climbing the hillside), so the
	// heights come from the corners' real elevations instead (metres, by data point).
	monaco: { file: "mc-1929", length: 1300, width: 11, startPoint: 120, dem: "eudem25m", tunnel: [640, 1080],
		profile: { 0: 45, 10: 36, 20: 25, 30: 17, 40: 8, 50: 5, 58: 3, 70: 2, 85: 1, 100: 2, 110: 3, 120: 6, 130: 11, 140: 27, 150: 41 } },
	spa: { file: "be-1925", length: 1700, width: 14, dem: "eudem25m" },
	monza: { file: "it-1922", length: 1350, width: 14, dem: "eudem25m" },
	suzuka: { file: "jp-1962", length: 1650, width: 13, dem: "srtm30m", bridge: 7 },
	// Jeddah is flat; the 30 m DEM mostly picks up buildings, so keep only a hint of it.
	jeddah: { file: "sa-2021", length: 1900, width: 13, dem: "srtm30m", flatten: 0.2 }
};
const STEP = 5, ELEV_STEP = 25, OUT_STEP = 12;
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = {};

for(const [id, conf] of Object.entries(CONF)){
	const coords = JSON.parse(readFileSync(new URL(conf.file + ".geojson", DIR), "utf8")).features[0].geometry.coordinates;
	if(Math.hypot(coords[0][0] - coords.at(-1)[0], coords[0][1] - coords.at(-1)[1]) < 1e-6) coords.pop();
	const lat0 = coords[0][1], lon0 = coords[0][0], kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
	const raw = coords.map(([lo, la]) => ({ x: (lo - lon0) * kx, y: (la - lat0) * ky, lon: lo, lat: la }));

	// Resample every STEP metres around the loop.
	let P = [], L = 0;
	const rawS = [];
	for(let i = 0; i < raw.length; i++){
		rawS.push(L);
		const a = raw[i], b = raw[(i + 1) % raw.length], l = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(l / STEP));
		for(let j = 0; j < n; j++){ const f = j / n; P.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f }); }
		L += l;
	}
	// Even spacing by arc length.
	const cum = [0];
	for(let i = 1; i <= P.length; i++){ const a = P[i - 1], b = P[i % P.length]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y)); }
	L = cum.at(-1);
	const at = s => {
		s = ((s % L) + L) % L;
		let lo = 0, hi = P.length;
		while(hi - lo > 1){ const m = (lo + hi) >> 1; if(cum[m] <= s) lo = m; else hi = m; }
		const a = P[lo], b = P[(lo + 1) % P.length], f = (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]);
		return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f };
	};
	const start = conf.startPoint ? rawS[conf.startPoint] : 0;
	const N = Math.round(L / STEP);
	const Q = Array.from({ length: N }, (_, i) => Object.assign(at(start + i * L / N), { s: i * L / N }));

	// ----- Elevation (cached) -----
	const cacheFile = new URL(id + "-elev.json", DIR);
	const ne = Math.round(L / ELEV_STEP);
	let elev;
	if(existsSync(cacheFile)) elev = JSON.parse(readFileSync(cacheFile, "utf8")).elev;
	if(!elev || elev.length !== ne){
		const pts = Array.from({ length: ne }, (_, i) => at(start + i * L / ne));
		elev = [];
		for(let i = 0; i < pts.length; i += 100){
			const chunk = pts.slice(i, i + 100).map(p => p.lat.toFixed(6) + "," + p.lon.toFixed(6)).join("|");
			const res = await fetch(`https://api.opentopodata.org/v1/${conf.dem}?locations=${chunk}`);
			const json = await res.json();
			if(json.status !== "OK") throw new Error(id + ": elevation request failed: " + JSON.stringify(json).slice(0, 200));
			elev.push(...json.results.map(r => r.elevation ?? null));
			await wait(1200);
		}
		// Fill any gaps from neighbours.
		for(let i = 0; i < elev.length; i++) if(elev[i] == null) elev[i] = elev[(i - 1 + elev.length) % elev.length] ?? 0;
		writeFileSync(cacheFile, JSON.stringify({ dataset: conf.dem, step: L / ne, start, elev }));
		console.log(id, "elevation downloaded");
	}
	// Monaco: heights from known elevations at data points instead of the DEM.
	if(conf.profile){
		const keys = Object.keys(conf.profile).map(Number).sort((a, b) => a - b);
		const prof = keys.map(k => [rawS[k], conf.profile[k]]);
		elev = Array.from({ length: ne }, (_, i) => {
			const sAbs = ((start + i * L / ne) % L + L) % L;
			let j = prof.findIndex(p => p[0] > sAbs);
			const a = j <= 0 ? prof.at(-1) : prof[j - 1], b = j <= 0 ? prof[0] : prof[j];
			const sa = a[0], sb = b[0] < sa ? b[0] + L : b[0], sx = sAbs < sa ? sAbs + L : sAbs;
			const f = (sx - sa) / Math.max(1, sb - sa);
			return a[1] + (b[1] - a[1]) * (0.5 - 0.5 * Math.cos(Math.PI * f));
		});
	}
	// elev[i] is at distance start + i * step, so index by distance from the start.
	const E = s => { const u = ((((s - start) / L) * ne) % ne + ne) % ne, i = Math.floor(u), f = u - i; return elev[i] + (elev[(i + 1) % ne] - elev[i]) * f; };

	// ----- Ease apart sections that run too close -----
	const k = conf.length / L;                       // game units per metre
	const minSep = (conf.width + 4) / k;              // centre to centre, in metres
	const along = (a, b) => { const d = Math.abs(a - b) % N; return Math.min(d, N - d) * (L / N); };
	// The Suzuka crossover really crosses: leave the area around it alone.
	let cross = null;
	if(conf.bridge){
		let best = Infinity;
		for(let i = 0; i < N; i += 2) for(let j = i + 1; j < N; j += 2){
			if(along(i, j) < 500) continue;
			const d = Math.hypot(Q[i].x - Q[j].x, Q[i].y - Q[j].y);
			if(d < best){ best = d; cross = [i, j]; }
		}
	}
	const nearCross = (i, j) => cross && ((along(i, cross[0]) < 140 && along(j, cross[1]) < 140) || (along(i, cross[1]) < 140 && along(j, cross[0]) < 140));
	let passes = 0, worst = 0;
	for(; passes < 120; passes++){
		const dx = new Float64Array(N), dy = new Float64Array(N);
		let any = false;
		worst = Infinity;
		for(let i = 0; i < N; i++) for(let j = i + 1; j < N; j++){
			if(along(i, j) < Math.max(250, minSep * 3) || nearCross(i, j)) continue;
			const ex = Q[i].x - Q[j].x, ey = Q[i].y - Q[j].y, d = Math.hypot(ex, ey);
			if(d < worst) worst = d;
			if(d >= minSep) continue;
			any = true;
			const push = (minSep - d) * 0.3 / Math.max(d, 1e-6);
			dx[i] += ex * push; dy[i] += ey * push;
			dx[j] -= ex * push; dy[j] -= ey * push;
		}
		if(!any) break;
		// Spread the push along the track so corners keep their shape.
		const R = 14, sx = new Float64Array(N), sy = new Float64Array(N);
		for(let i = 0; i < N; i++){
			let wsum = 0;
			for(let o = -R; o <= R; o++){
				const w = Math.exp(-(o * o) / (2 * (R / 2) ** 2)), q = (i + o + N) % N;
				sx[i] += dx[q] * w; sy[i] += dy[q] * w; wsum += w;
			}
			sx[i] /= wsum / 3; sy[i] /= wsum / 3;
		}
		for(let i = 0; i < N; i++){ Q[i].x += sx[i]; Q[i].y += sy[i]; }
	}

	// ----- Elevation profile on the output points -----
	const M = Math.round(L / OUT_STEP);
	const idx = Array.from({ length: M }, (_, i) => Math.round(i * N / M) % N);
	let h = idx.map(i => E(start + Q[i].s));
	// Smooth over about 50 m either way (the DEM is noisy, especially in towns).
	const smooth = (arr, r) => arr.map((_, i) => { let s = 0, w = 0; for(let o = -r; o <= r; o++){ const q = (i + o + arr.length) % arr.length, ww = 1 - Math.abs(o) / (r + 1); s += arr[q] * ww; w += ww; } return s / w; });
	h = smooth(h, 4);
	// Monaco tunnel: the DEM reads the hillside above it; the road runs level-ish underneath.
	let tunnel = null;
	if(conf.tunnel){
		// conf.tunnel is in metres from the data's first point; convert to distance from our start.
		const [a, b] = conf.tunnel.map(m => Math.round((((m - start) % L) + L) % L / OUT_STEP) % M);
		for(let i = a + 1; i < b; i++) h[i] = h[a] + (h[b] - h[a]) * (i - a) / (b - a);
		tunnel = [a / M, b / M];
	}
	// Suzuka: lift the later road over the earlier one on a bridge.
	if(cross){
		const up = Math.round(cross[1] * M / N), low = Math.round(cross[0] * M / N);
		const span = Math.round(160 / OUT_STEP);
		const base = Math.max(h[up], h[low]);
		for(let o = -span; o <= span; o++){
			const q = (up + o + M) % M, f = 0.5 + 0.5 * Math.cos(Math.PI * o / span);
			h[q] = h[q] + (base + conf.bridge - h[q]) * f;
		}
	}
	if(conf.flatten){ const mean = h.reduce((a, b) => a + b, 0) / h.length; h = h.map(v => mean + (v - mean) * conf.flatten); }
	const min = Math.min(...h);
	h = h.map(v => +(v - min).toFixed(2));

	out[id] = {
		meters: Math.round(L),
		pts: idx.map(i => [+Q[i].x.toFixed(1), +Q[i].y.toFixed(1)]),
		elev: h,
		...(tunnel ? { tunnel: tunnel.map(v => +v.toFixed(4)) } : {}),
		...(cross ? { bridge: [+(cross[0] / N).toFixed(4), +(cross[1] / N).toFixed(4)] } : {})
	};
	console.log(`${id}: ${Math.round(L)} m, ${M} points, climb ${(Math.max(...h)).toFixed(1)} m, ${passes} easing passes, tightest gap ${worst.toFixed(0)} m (needed ${minSep.toFixed(0)} m)`);
}

const js = `// Generated by tools/build-circuits.mjs from data/circuits. Don't edit by hand.
// Real circuit centrelines (metres east/north, race direction, from the start line) and
// elevation in metres above the lowest point. Circuit shapes: bacinger/f1-circuits (MIT).
// Elevation: Open Topo Data (EU-DEM, SRTM).
export const CIRCUITS = ${JSON.stringify(out)};
`;
writeFileSync(new URL("../js/circuits.js", import.meta.url), js);
console.log("wrote js/circuits.js", (js.length / 1024).toFixed(0) + " KB");
