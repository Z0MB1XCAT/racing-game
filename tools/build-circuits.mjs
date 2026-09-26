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
	// camber: [from m, to m, degrees] along the lap from the start line (see --corners), only on
	// corners that really have it: + leans into the corner (banked), - away from it (off-camber).
	// Everywhere else the road is level side to side. From track guides and onboard laps.
	// hills: the smallest rise or dip (m) kept from the DEM; anything smaller is noise and is
	// smoothed out, so the road runs in clean climbs and descents.
	monaco: { file: "mc-1929", length: 1300, width: 11, startPoint: 120, dem: "eudem25m", tunnel: [640, 1080], hills: 1,
		profile: { 0: 45, 10: 36, 20: 25, 30: 17, 40: 8, 50: 5, 58: 3, 70: 2, 85: 1, 100: 2, 110: 3, 120: 6, 130: 11, 140: 27, 150: 41 },
		camber: [[792, 864, -4]] },                                      // Casino: off-camber over the crest
	spa: { file: "be-1925", length: 1700, width: 14, dem: "eudem25m", hills: 5,
		camber: [[876, 924, 5], [960, 1080, 3], [1104, 1152, -3],        // Eau Rouge left, Raidillon right, off-camber crest left
			[3600, 3972, 2],                                             // Pouhon
			[5628, 6060, 3]] },                                          // Blanchimont
	monza: { file: "it-1922", length: 1350, width: 14, dem: "eudem25m", hills: 5,
		camber: [[2172, 2304, 3], [2532, 2592, 3]] },                    // the Lesmos
	suzuka: { file: "jp-1962", length: 1650, width: 13, dem: "srtm30m", bridge: 22, hills: 5,   // bridge lift in metres (about 6 units at game scale)
		camber: [[408, 684, 3],                                          // Turns 1-2
			[1464, 1584, -4],                                            // Reverse Bank (gyaku bank)
			[3540, 3828, 3],                                             // Spoon
			[4704, 4920, 2]] },                                          // 130R
	// Jeddah is flat (the 30 m DEM mostly picks up buildings); Turn 13 is banked at 12 degrees.
	jeddah: { file: "sa-2021", length: 1900, width: 13, dem: "srtm30m", flatten: 0,
		camber: [[2292, 2556, 12]] }
};
const STEP = 5, ELEV_STEP = 25, OUT_STEP = 12;

// A loop of heights with every rise and dip smaller than `min` removed: find the turning points
// that matter, then between each pair make the road climb (or descend) steadily, following the
// DEM's shape but never reversing, and smooth it lightly.
function cleanHills(h, min){
	const M = h.length;
	// Work from the highest point (always a real crest) round to itself again.
	const top = h.indexOf(Math.max(...h));
	const H = Array.from({ length: M + 1 }, (_, i) => h[(top + i) % M]);
	let ext = [0];
	for(let i = 1; i < M; i++){
		const a = H[i - 1], b = H[i], c = H[i + 1];
		if((b >= a && b > c) || (b <= a && b < c)) ext.push(i);
	}
	ext.push(M);
	const fix = list => {
		// Alternate high/low, keeping the more extreme of any run going the same way.
		const out = [list[0]];
		for(let k = 1; k < list.length; k++){
			const i = list[k], last = out.at(-1), before = out.at(-2);
			if(before !== undefined && (H[last] - H[before]) * (H[i] - H[last]) >= 0 && k < list.length - 1){ out[out.length - 1] = i; continue; }
			out.push(i);
		}
		return out;
	};
	ext = fix(ext);
	for(;;){
		let k = -1, best = min;
		for(let j = 0; j < ext.length - 1; j++){ const d = Math.abs(H[ext[j + 1]] - H[ext[j]]); if(d < best){ best = d; k = j; } }
		if(k < 0 || ext.length <= 3) break;
		// Remove that rise or dip (never the end points).
		const j = Math.min(Math.max(k, 1), ext.length - 3);
		ext.splice(j, 2);
		ext = fix(ext);
	}
	// Between turning points: the closest steady climb (or descent) to the DEM (a least-squares
	// monotone fit), held between the two end heights.
	if(process.env.DEBUG_HILLS) console.log("turning points", ext.map(i => ((i + top) % M) * 12 + ":" + H[i].toFixed(1)).join(" "));
	const out = H.slice();
	for(let j = 0; j < ext.length - 1; j++){
		const a = ext[j], b = ext[j + 1], sgn = H[b] > H[a] ? 1 : -1;
		const blocks = [];
		for(let q = a; q <= b; q++){
			blocks.push({ v: sgn * H[q], n: 1 });
			while(blocks.length > 1 && blocks.at(-2).v > blocks.at(-1).v){
				const y = blocks.pop(), x = blocks.at(-1);
				x.v = (x.v * x.n + y.v * y.n) / (x.n + y.n); x.n += y.n;
			}
		}
		let q = a;
		for(const blk of blocks) for(let t = 0; t < blk.n; t++, q++) out[q] = Math.max(Math.min(H[a], H[b]), Math.min(Math.max(H[a], H[b]), sgn * blk.v));
	}
	const res = new Array(M);
	for(let i = 0; i < M; i++) res[(top + i) % M] = out[i];
	// Light smoothing keeps it monotonic between turning points and rounds off the crests.
	return res.map((_, i) => { let s = 0, w = 0; for(let o = -5; o <= 5; o++){ const ww = 6 - Math.abs(o); s += res[(i + o + M) % M] * ww; w += ww; } return s / w; });
}

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
	// Signed curvature at each output point (+ = turning left), over about 24 m either way.
	const curvAt = m => {
		const a = Q[idx[(m - 2 + M) % M]], b = Q[idx[m]], c = Q[idx[(m + 2) % M]];
		const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
		let d = h2 - h1; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI;
		return d / (2 * OUT_STEP);
	};
	const curv = Array.from({ length: M }, (_, m) => curvAt(m));
	if(process.argv.includes("--corners")){
		// Corners in lap order: runs tighter than a 400 m radius (numbered as the game sees them).
		const list = [];
		for(let m = 0; m < M; m++){
			if(Math.abs(curv[m]) < 1 / 400) continue;
			const dir = Math.sign(curv[m]), last = list.at(-1);
			if(last && last.dir === dir && m - last.to <= 3){ last.to = m; last.turn += curv[m] * OUT_STEP; last.minR = Math.min(last.minR, 1 / Math.abs(curv[m])); }
			else list.push({ from: m, to: m, dir, turn: curv[m] * OUT_STEP, minR: 1 / Math.abs(curv[m]) });
		}
		console.log(id, "corners (metres from the start line):");
		for(const [k, c] of list.entries()) if(Math.abs(c.turn) > 0.25)
			console.log(`  #${k} ${c.dir > 0 ? "L" : "R"} ${Math.round(c.from * OUT_STEP)}-${Math.round(c.to * OUT_STEP)} m, turns ${Math.round(Math.abs(c.turn) * 180 / Math.PI)} deg, tightest radius ${Math.round(c.minR)} m`);
	}
	let h = idx.map(i => E(start + Q[i].s));
	// Smooth over about 50 m either way (the DEM is noisy, especially in towns).
	const smooth = (arr, r) => arr.map((_, i) => { let s = 0, w = 0; for(let o = -r; o <= r; o++){ const q = (i + o + arr.length) % arr.length, ww = 1 - Math.abs(o) / (r + 1); s += arr[q] * ww; w += ww; } return s / w; });
	h = smooth(h, 4);
	// Keep only real hills: drop any rise or dip smaller than conf.hills, then make each climb and
	// descent run one way only (no ripples), and ease it.
	if(conf.hills) h = cleanHills(h, conf.hills);
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
		const span = Math.round(220 / OUT_STEP);
		const base = Math.max(h[up], h[low]);
		for(let o = -span; o <= span; o++){
			const q = (up + o + M) % M, f = 0.5 + 0.5 * Math.cos(Math.PI * o / span);
			h[q] = h[q] + (base + conf.bridge - h[q]) * f;
		}
	}
	// (Again after the bridge, so its ramps join the hills either side without a dip.)
	if(cross && conf.hills) h = cleanHills(h, conf.hills);
	if(conf.flatten !== undefined){ const mean = h.reduce((a, b) => a + b, 0) / h.length; h = h.map(v => mean + (v - mean) * conf.flatten); }
	// Camber, per output point: tan of the angle (+ = into the corner), eased in and out over ~30 m.
	let camber = null;
	if(conf.camber){
		camber = new Array(M).fill(0);
		for(const [a, b, deg] of conf.camber) for(let m = 0; m < M; m++){
			const s = m * OUT_STEP, ramp = 30;
			const w = Math.max(0, Math.min(1, (s - a + ramp) / ramp, (b + ramp - s) / ramp));
			if(w > 0) camber[m] += Math.tan(deg * Math.PI / 180) * (0.5 - 0.5 * Math.cos(Math.PI * w));
		}
	}
	const min = Math.min(...h);
	h = h.map(v => +(v - min).toFixed(2));

	out[id] = {
		meters: Math.round(L),
		pts: idx.map(i => [+Q[i].x.toFixed(1), +Q[i].y.toFixed(1)]),
		elev: h,
		...(tunnel ? { tunnel: tunnel.map(v => +v.toFixed(4)) } : {}),
		...(camber ? { camber: camber.map(v => +v.toFixed(3)) } : {}),
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
