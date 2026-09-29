// Builds js/circuits.js from the real-world circuit data in data/circuits.
//   node tools/build-circuits.mjs
// For each real circuit (the five F1 tracks and the Daytona oval, and their other layouts, which
// tools/route-layouts.mjs traces from OpenStreetMap):
//   - the real centreline (GeoJSON, race direction) in metres east/north;
//   - the start line moved where needed;
//   - sections that run side by side closer than the game's road width allows are eased
//     apart just enough to leave barriers between them (the real crossover at Suzuka stays);
//   - real elevation (Open Topo Data, cached), smoothed, with the Monaco tunnel levelled out
//     and the Suzuka crossover raised onto a bridge.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = new URL("../data/circuits/", import.meta.url);
// Monza: at 2000 game units (a bigger scale than the other F1 tracks) with a narrower road, the
// Rettifilo, Roggia and Ascari chicanes keep their real shape. The Lesmos lean into the right.
const MONZA_LENGTH = 2000, MONZA_WIDTH = 12, MONZA_CAMBER = [[2172, 2316, 3, "R"], [2532, 2604, 3, "R"]];
// Daytona, metres from the start line: tri-oval 18, Turns 1-2 31, backstretch 3, Turns 3-4 31.
// The real banked surface is 40 ft (12.2 m) wide, so at 31 degrees the outside edge is 20.6 ft
// (6.3 m) above the inside. The game's road is about three times wider than the real one next to
// the cars (a car is 2 units, about 4.5 m), so the banking is set to rise exactly as high as the
// real one, in car lengths, across the whole road: the real height, at a gentler angle.
const DAYTONA_LENGTH = 1000, DAYTONA_WIDTH = 18, BANK_SURFACE_M = 12.19, METRES_PER_UNIT = 2.25;
const DAYTONA_BANK = [[0, 18], [420, 18], [640, 31], [1400, 31], [1580, 3], [2380, 3], [2560, 31], [3280, 31], [3500, 18]];
const CONF = {
	// Monaco's data starts at Casino Square; the start line is ~140 m before Ste Devote (point 120).
	// The town is too steep for a 25 m DEM (it has the pit straight climbing the hillside), so the
	// heights come from the corners' real elevations instead (metres, by data point).
	// camber: [from m, to m, degrees, "L" | "R"] along the lap from the start line (see --corners),
	// only on corners that really have it: the way the corner turns, and + leans into it (banked),
	// - away from it (off-camber).
	// Everywhere else the road is level side to side. From track guides and onboard laps.
	// hills: the smallest rise or dip (m) kept from the DEM; anything smaller is noise and is
	// smoothed out, so the road runs in clean climbs and descents.
	// hairpin: [tip m, leg m, gap m]: a hairpin whose legs are closer than the game's road allows.
	// The legs are widened just enough (each pair of points level with each other, about their
	// middle) to this centre-to-centre gap, keeping them parallel and the tip a half circle.
	monaco: { file: "mc-1929", length: 1800, width: 10, hairpin: [1195, 90, 24], startPoint: 120, dem: "eudem25m", tunnel: [640, 1080], hills: 1,
		profile: { 0: 45, 10: 36, 20: 25, 30: 17, 40: 8, 50: 5, 58: 3, 70: 2, 85: 1, 100: 2, 110: 3, 120: 6, 130: 11, 140: 27, 150: 41 } },
	// (Monaco is level side to side all round: Casino's off-camber read as a drop.)
	// heights: [metres from the start line, height m] at the corners, from real altitudes; joined by
	// steady climbs and descents (used instead of the DEM, which adds dips and humps that aren't there).
	spa: { file: "be-1925", length: 1700, width: 14, dem: "eudem25m",
		heights: [[0, 419], [150, 419], [330, 417],                      // level through La Source
			[600, 408], [880, 392],                                      // down past the old pits to Eau Rouge
			[1180, 428],                                                 // steeply up Raidillon
			[2250, 466], [2480, 471],                                    // up the Kemmel straight to Les Combes
			[2900, 454], [3150, 447],                                    // Rivage, the left after it
			[3450, 425], [3700, 405], [4150, 385],                       // steadily down through Pouhon to Fagnes
			[4950, 366],                                                 // Stavelot, the lowest point
			[5600, 390], [6050, 402], [6560, 416], [6954, 419]],         // up past Blanchimont to the Bus Stop
		camber: [[950, 1090, 3, "R"],                                         // Raidillon, leaning into the right-hander
			[3600, 3972, 2, "L"],                                             // Pouhon
			[5628, 6060, 3, "L"]] },                                          // Blanchimont
	// Monza and Daytona come from OpenStreetMap (much finer than the other outlines: every chicane
	// is mapped). Monza's data starts at the Parabolica exit; point 1 is the start line.
	monza: { file: "monza-osm", startPoint: 1, length: MONZA_LENGTH, width: MONZA_WIDTH, dem: "eudem25m", hills: 5,
		camber: MONZA_CAMBER },
	// Daytona: the 2.5-mile oval (not the road course). Flat ground at sea level, so no DEM; what
	// matters is the banking: 31 degrees in all four turns, 18 through the tri-oval (the whole
	// frontstretch), 3 on the backstretch. Real transitions are long, so they ease over bankRamp m.
	// The data starts at Turn 3; point 116 is the start/finish line, at the apex of the tri-oval.
	daytona: { file: "daytona-osm", startPoint: 116, length: DAYTONA_LENGTH, width: DAYTONA_WIDTH, flat: true,
		bank: DAYTONA_BANK, bankRise: { surface: BANK_SURFACE_M, perUnit: METRES_PER_UNIT } },
	suzuka: { file: "jp-1962", length: 1650, width: 13, dem: "srtm30m", bridge: 22, hills: 5,   // bridge lift in metres (about 6 units at game scale)
		camber: [[408, 684, 3, "R"],                                          // Turns 1-2
			[1464, 1584, -4, "L"],                                            // Reverse Bank (gyaku bank)
			[3540, 3828, 3, "L"],                                             // Spoon
			[4704, 4920, 2, "L"]] },                                          // 130R
	// Jeddah is flat (the 30 m DEM mostly picks up buildings); Turn 13 is banked at 12 degrees.
	jeddah: { file: "sa-2021", length: 1900, width: 13, dem: "srtm30m", flatten: 0,
		camber: [[2292, 2556, 12, "L"]] },

	// ----- Other layouts of the same venues (routed through OpenStreetMap by tools/route-layouts.mjs) -----
	// origin: the parent circuit's data file, so the layout sits in the same place (its real
	// surroundings line up). scale: the parent's game units per metre, unless the layout sets its own
	// (length is then worked out from the layout's real length). from: heights and camber are the
	// parent's wherever the layout runs on the same road (near it, going the same way); in between
	// the heights ease from one end to the other (flat: stay at ground level) and the road is level.
	// snapTo: follow the parent's own (eased) line where they share the road.
	// (Avenue JFK runs along the harbour just below Beau Rivage, which climbs: keep it at harbour level.)
	"monaco-fe": { file: "monaco-fe", origin: "mc-1929", scale: "monaco", width: 10, from: ["monaco"], skip: [[43.73725, 7.4240, 110]] },
	"spa-moto": { file: "spa-moto", origin: "be-1925", scale: "spa", width: 14, from: ["spa"] },
	// Monza's oval: its bankings are progressive (steeper the higher you go, 80% at the top); no
	// survey of their height is published, so they're taken as a 12 m wide surface at an average
	// 30 degrees, rising 6 m (an estimate; in car lengths across the road, as at Daytona).
	"monza-oval": { file: "monza-oval", origin: "monza-osm", scale: "monza", width: MONZA_WIDTH, from: ["monza"],
		bank: [[0, 0], [560, 0], [700, -30], [1250, -30], [1390, 0], [2730, 0], [2870, -30], [3400, -30], [3540, 0]], bankRise: { surface: 12, perUnit: METRES_PER_UNIT } },
	// GP + oval: the GP lap, then the oval; the main straight is used twice. (The road course passes
	// under the oval's north banking at the Serraglio: bridge lift in metres.)
	// (Eased apart gently: the Parabolica and the south banking run close side by side.)
	"monza-combined": { file: "monza-combined", origin: "monza-osm", scale: "monza", width: MONZA_WIDTH, from: ["monza", "monza-oval"], bridge: 12, ease: "steady" },
	"suzuka-moto": { file: "suzuka-moto", origin: "jp-1962", scale: "suzuka", width: 13, from: ["suzuka"], snapTo: true, bridge: true },
	"suzuka-east": { file: "suzuka-east", origin: "jp-1962", scale: "suzuka", width: 13, from: ["suzuka"], snapTo: true },
	// (West: from the chicane the link back to Degner turns right round next to 130R, too tight for the
	// game's road at Suzuka's scale, so this layout is a little bigger with a slightly narrower road.)
	"suzuka-west": { file: "suzuka-west", origin: "jp-1962", perMetre: 0.36, width: 12, from: ["suzuka"], snapTo: true, bridge: true },
	"suzuka-south": { file: "suzuka-south", origin: "jp-1962", perMetre: 0.4, width: 12, dem: "srtm30m", hills: 2 },   // (small and twisty: a bigger scale, so the grid fits on its straight either way round)
	"jeddah-fe": { file: "jeddah-fe", origin: "sa-2021", scale: "jeddah", width: 13, from: ["jeddah"] },
	// Daytona's road course: the infield is twisty, so it's at a bigger scale than the oval with a
	// narrower road (the banking still rises its real height).
	"daytona-road": { file: "daytona-road", origin: "daytona-osm", perMetre: 0.33, width: 13, from: ["daytona"], flat: true }
};
const STEP = 5, ELEV_STEP = 25, OUT_STEP = 12;

// Height at distance s from a list of [distance, height] points: monotone cubic (Fritsch-Carlson),
// so it never overshoots between points (no dips or humps that aren't in the list).
function profileAt(P, s){
	const n = P.length, d = [], m = [];
	for(let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
	for(let i = 0; i < n; i++){
		if(i === 0 || i === n - 1){ m.push(0); continue; }
		if(d[i - 1] * d[i] <= 0){ m.push(0); continue; }
		const h0 = P[i][0] - P[i - 1][0], h1 = P[i + 1][0] - P[i][0], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
		m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
	}
	let k = 0;
	while(k < n - 2 && s > P[k + 1][0]) k++;
	const h = P[k + 1][0] - P[k][0], t = Math.max(0, Math.min(1, (s - P[k][0]) / h));
	const t2 = t * t, t3 = t2 * t;
	return (2 * t3 - 3 * t2 + 1) * P[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * P[k + 1][1] + (t3 - t2) * h * m[k + 1];
}

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
const out = {}, built = {};

// For each output point of a layout: the height and camber of the nearest point of its parent
// circuit(s) running the same way within 30 m, or null (also inside conf.skip: [lat, lon, m], a road
// that runs beside the parent but isn't on it). Heights are the parent's ground heights (before
// any banking lifts the centreline); a parent's banking made to rise its real height (bankRise) is
// rescaled so it rises the same height across this road.
function fromParents(conf, Q, idx, M, k, toXY){
	const skip = (conf.skip || []).map(([la, lo, r]) => [...toXY(la, lo), r]);
	const dir = (P, i) => { const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
	const pts = idx.map(i => [Q[i].x, Q[i].y]);
	return pts.map((p, m) => {
		const [hx, hy] = dir(pts, m);
		if(skip.some(([x, y, r]) => Math.hypot(p[0] - x, p[1] - y) < r)) return null;
		for(const pid of conf.from){
			const B = built[pid];
			let best = -1, bd = 30;
			for(let j = 0; j < B.pts.length; j++){
				const d = Math.hypot(B.pts[j][0] - p[0], B.pts[j][1] - p[1]);
				if(d >= bd) continue;
				const [dx, dy] = dir(B.pts, j);
				if(dx * hx + dy * hy < 0.8) continue;
				bd = d; best = j;
			}
			if(best < 0) continue;
			const f = B.conf.bankRise ? B.conf.width / conf.width : 1;
			return { h: B.h[best], c: B.camber ? B.camber[best] * f : 0 };
		}
		return null;
	});
}

for(const [id, conf] of Object.entries(CONF)){
	const coords = JSON.parse(readFileSync(new URL(conf.file + ".geojson", DIR), "utf8")).features[0].geometry.coordinates;
	if(Math.hypot(coords[0][0] - coords.at(-1)[0], coords[0][1] - coords.at(-1)[1]) < 1e-6) coords.pop();
	const o = conf.origin ? JSON.parse(readFileSync(new URL(conf.origin + ".geojson", DIR), "utf8")).features[0].geometry.coordinates[0] : coords[0];
	const lat0 = o[1], lon0 = o[0], kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
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
	if(conf.flat || conf.from) elev = new Array(ne).fill(0);
	else if(existsSync(cacheFile)) elev = JSON.parse(readFileSync(cacheFile, "utf8")).elev;
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

	// ----- A layout on the same road as its parent follows the parent's final line there -----
	// (conf.snapTo: where the parent was eased apart, the layout gets the same room; off the parent,
	// the shift fades from one end of the stretch to the other.)
	if(conf.snapTo){
		const B = built[conf.from[0]].pts, nb = B.length;
		const off = Q.map((q, i) => {
			const a = Q[(i - 2 + N) % N], b = Q[(i + 2) % N], hl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
			let best = null, bd = 30;
			for(let j = 0; j < nb; j++){
				const p = B[j], r = B[(j + 1) % nb], vx = r[0] - p[0], vy = r[1] - p[1], vl = Math.hypot(vx, vy) || 1;
				if(((b.x - a.x) * vx + (b.y - a.y) * vy) / hl / vl < 0.8) continue;
				const t = Math.max(0, Math.min(1, ((q.x - p[0]) * vx + (q.y - p[1]) * vy) / (vl * vl)));
				const px = p[0] + vx * t, py = p[1] + vy * t, d = Math.hypot(px - q.x, py - q.y);
				if(d < bd){ bd = d; best = [px - q.x, py - q.y]; }
			}
			return best;
		});
		const first = off.findIndex(o => o);
		for(let k = 1; k <= N; k++){
			const i = (first + k) % N;
			if(off[i]) continue;
			const a = (i - 1 + N) % N;
			let b = i; while(!off[b]) b = (b + 1) % N;
			const len = (b - a + N) % N;
			for(let t = 1; t < len; t++) off[(a + t) % N] = [off[a][0] + (off[b][0] - off[a][0]) * t / len, off[a][1] + (off[b][1] - off[a][1]) * t / len];
			k += len - 2;
		}
		// (Smoothed along the lap, so the line never jumps where the nearest bit of parent changes.)
		const sm = off.map((_, i) => { let x = 0, y = 0, w = 0; for(let o = -8; o <= 8; o++){ const v = off[(i + o + N) % N], ww = 9 - Math.abs(o); x += v[0] * ww; y += v[1] * ww; w += ww; } return [x / w, y / w]; });
		Q.forEach((q, i) => { q.x += sm[i][0]; q.y += sm[i][1]; });
	}

	// ----- Hairpin legs -----
	if(conf.hairpin){
		const [tipM, legM, gap] = conf.hairpin, r = gap / 2, sM = L / N;
		// The tip: the point near tipM farthest from where the legs start.
		const i0 = Math.round(tipM / sM), K0 = Math.round(legM / sM);
		const ex = (Q[(i0 - K0 + N) % N].x + Q[(i0 + K0) % N].x) / 2, ey = (Q[(i0 - K0 + N) % N].y + Q[(i0 + K0) % N].y) / 2;
		let tip = i0, best = -1;
		for(let o = -Math.round(40 / sM); o <= Math.round(40 / sM); o++){
			const i = (i0 + o + N) % N, d = Math.hypot(Q[i].x - ex, Q[i].y - ey);
			if(d > best){ best = d; tip = i; }
		}
		const orig = Q.map(q => ({ x: q.x, y: q.y }));
		if(process.env.DEBUG_HILLS) console.log("hairpin tip", tip, (tip * sM).toFixed(0) + " m", [5, 10, 15].map(k => Math.hypot(orig[(tip + k) % N].x - orig[(tip - k + N) % N].x, orig[(tip + k) % N].y - orig[(tip - k + N) % N].y).toFixed(1)).join(" "));
		const K = Math.round(legM / sM);
		for(let k = 1; k <= K; k++){
			const a = orig[(tip - k + N) % N], b = orig[(tip + k) % N];
			const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, half = Math.hypot(b.x - a.x, b.y - a.y) / 2 || 1e-6;
			const want = r * Math.sin(Math.min(k * sM / r, Math.PI / 2));
			// Ease back to the real line over the last third of the legs.
			const w = Math.min(1, (K - k) / (K / 3));
			const h2 = half + Math.max(0, want - half) * w;
			const ux = (b.x - a.x) / (2 * half), uy = (b.y - a.y) / (2 * half);
			Object.assign(Q[(tip - k + N) % N], { x: mx - ux * h2, y: my - uy * h2 });
			Object.assign(Q[(tip + k) % N], { x: mx + ux * h2, y: my + uy * h2 });
		}
	}

	// ----- Ease apart sections that run too close -----
	if(!conf.length) conf.length = Math.round(L * (conf.perMetre || CONF[conf.scale].length / out[conf.scale].meters));
	const k = conf.length / L;                       // game units per metre
	const minSep = (conf.width + 4) / k;              // centre to centre, in metres
	const along = (a, b) => { const d = Math.abs(a - b) % N; return Math.min(d, N - d) * (L / N); };
	// The Suzuka crossover really crosses: leave the area around it alone.
	let cross = null;
	// A lap that uses the same road twice (Monza's GP + oval, down the main straight twice): points
	// on the same line going the same way are the same road, not a crossing or roads too close.
	const dirQ = i => { const a = Q[(i - 1 + N) % N], b = Q[(i + 1) % N], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
	const sameRoad = (i, j) => {
		const [ax, ay] = dirQ(i), [bx, by] = dirQ(j);
		if(ax * bx + ay * by < 0.9) return false;
		return Math.abs((Q[j].x - Q[i].x) * ay - (Q[j].y - Q[i].y) * ax) < 3;
	};
	// (And near where they part or meet, a fork: not a crossing either, and left as it is.)
	const shared = new Uint8Array(N);
	for(let i = 0; i < N; i += 2) for(let j = 0; j < N; j += 2) if(along(i, j) > 500 && Math.hypot(Q[i].x - Q[j].x, Q[i].y - Q[j].y) < 12 && sameRoad(i, j)){ shared[i] = shared[j] = 1; }
	const nearShared = new Uint8Array(N), FORK = Math.round(200 / (L / N));
	for(let i = 0; i < N; i++) if(shared[i]) for(let o = -FORK; o <= FORK; o++) nearShared[(i + o + N) % N] = 1;
	if(conf.bridge){
		let best = Infinity;
		for(let i = 0; i < N; i += 2) for(let j = i + 1; j < N; j += 2){
			if(along(i, j) < 500 || nearShared[i] || nearShared[j]) continue;
			const d = Math.hypot(Q[i].x - Q[j].x, Q[i].y - Q[j].y);
			if(d < best){ best = d; cross = [i, j]; }
		}
	}
	if(process.env.DEBUG_HILLS && cross) console.log(id, "crossing", cross, Q[cross[0]].lat.toFixed(5), Q[cross[0]].lon.toFixed(5), Math.hypot(Q[cross[0]].x - Q[cross[1]].x, Q[cross[0]].y - Q[cross[1]].y).toFixed(1));
	const nearCross = (i, j) => cross && ((along(i, cross[0]) < 140 && along(j, cross[1]) < 140) || (along(i, cross[1]) < 140 && along(j, cross[0]) < 140));
	let passes = 0, worst = 0;
	for(; passes < 120; passes++){
		const dx = new Float64Array(N), dy = new Float64Array(N), cnt = new Uint16Array(N);
		let any = false;
		worst = Infinity;
		for(let i = 0; i < N; i++) for(let j = i + 1; j < N; j++){
			if(along(i, j) < Math.max(250, minSep * 3) || nearCross(i, j) || nearShared[i] || nearShared[j]) continue;
			const ex = Q[i].x - Q[j].x, ey = Q[i].y - Q[j].y, d = Math.hypot(ex, ey);
			if(d < worst) worst = d;
			if(d >= minSep) continue;
			any = true;
			const push = (minSep - d) * 0.3 / Math.max(d, 1e-6);
			dx[i] += ex * push; dy[i] += ey * push;
			dx[j] -= ex * push; dy[j] -= ey * push;
			cnt[i]++; cnt[j]++;
		}
		if(!any) break;
		// (ease: "steady": each point moves by the average of its pushes, not their sum, so long
		// stretches side by side part gently instead of being thrown apart in one go.)
		if(conf.ease === "steady") for(let i = 0; i < N; i++) if(cnt[i] > 1){ dx[i] /= cnt[i]; dy[i] /= cnt[i]; }
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
	if(conf.heights) h = Array.from({ length: M }, (_, m) => profileAt(conf.heights, m * OUT_STEP));
	let fromCam = null;
	if(conf.from){
		const got = fromParents(conf, Q, idx, M, k, (la, lo) => [(lo - lon0) * kx, (la - lat0) * ky]);
		const miss = got.filter(g => !g).length;
		if(miss === M) throw new Error(id + ": doesn't run on any of " + conf.from.join(", "));
		// Between matched stretches: heights ease from one end to the other (or stay on the ground).
		h = new Array(M); fromCam = new Array(M).fill(0);
		for(let m = 0; m < M; m++) if(got[m]){ h[m] = got[m].h; fromCam[m] = got[m].c; }
		for(let m0 = 0; m0 < M; m0++){
			if(got[m0] || !got[(m0 - 1 + M) % M]) continue;          // (the start of a stretch off the parent)
			const a = (m0 - 1 + M) % M;
			let b = m0; while(!got[b]) b = (b + 1) % M;
			const len = (b - a + M) % M;
			for(let t = 1; t < len; t++) h[(a + t) % M] = conf.flat ? 0 : got[a].h + (got[b].h - got[a].h) * t / len;
		}
		// Ease the joins (heights and camber) over about 60 m.
		const edge = new Uint8Array(M);
		for(let m = 0; m < M; m++) if(!got[m] !== !got[(m + 1) % M]) for(let o = -6; o <= 6; o++) edge[(m + o + M) % M] = 1;
		const hs = smooth(h, 5), cs = smooth(fromCam, 5);
		h = h.map((v, m) => edge[m] ? hs[m] : v);
		fromCam = fromCam.map((v, m) => edge[m] ? cs[m] : v);
		console.log(`${id}: ${M - miss} of ${M} points on ${conf.from.join(" / ")}`);
	}
	// Monaco tunnel: the DEM reads the hillside above it; the road runs level-ish underneath.
	let tunnel = null;
	if(conf.tunnel){
		// conf.tunnel is in metres from the data's first point; convert to distance from our start.
		const [a, b] = conf.tunnel.map(m => Math.round((((m - start) % L) + L) % L / OUT_STEP) % M);
		for(let i = a + 1; i < b; i++) h[i] = h[a] + (h[b] - h[a]) * (i - a) / (b - a);
		tunnel = [a / M, b / M];
	}
	// Suzuka: lift the later road over the earlier one on a bridge.
	if(cross && typeof conf.bridge === "number"){
		const up = Math.round(cross[1] * M / N), low = Math.round(cross[0] * M / N);
		const span = Math.round(220 / OUT_STEP);
		const base = Math.max(h[up], h[low]);
		for(let o = -span; o <= span; o++){
			const q = (up + o + M) % M, f = 0.5 + 0.5 * Math.cos(Math.PI * o / span);
			h[q] = h[q] + (base + conf.bridge - h[q]) * f;
		}
	}
	// (Again after the bridge, so its ramps join the hills either side without a dip.)
	if(cross && conf.hills && typeof conf.bridge === "number") h = cleanHills(h, conf.hills);
	if(conf.flatten !== undefined){ const mean = h.reduce((a, b) => a + b, 0) / h.length; h = h.map(v => mean + (v - mean) * conf.flatten); }
	// Camber, per output point: how much the road rises per metre to the left (so a right-hander
	// banked into the corner is +), eased in and out over ~60 m.
	let camber = null;
	// bank: [metres from the start line, degrees] all the way round a lap (+ = leaning into a left turn
	// here, since ovals turn left), eased between points and wrapping round past the line.
	if(conf.bank){
		const B = conf.bank, deg = s => {
			let j = B.findIndex(p => p[0] > s);
			const a = j <= 0 ? B.at(-1) : B[j - 1], b = j <= 0 ? B[0] : B[j];
			const sa = a[0], sb = b[0] <= sa ? b[0] + L : b[0], sx = s < sa ? s + L : s;
			const f = (sx - sa) / Math.max(1, sb - sa);
			return a[1] + (b[1] - a[1]) * (0.5 - 0.5 * Math.cos(Math.PI * f));
		};
		// The slope across the game's road: the real angle, or (bankRise) the real rise from the inside
		// edge to the outside one, spread across the game's wider road.
		const R = conf.bankRise, slope = d => R ? Math.sin(d) * R.surface / R.perUnit / conf.width : Math.tan(d);
		camber = Array.from({ length: M }, (_, m) => -slope(deg(m * OUT_STEP) * Math.PI / 180));
	}
	if(conf.camber){
		camber = new Array(M).fill(0);
		for(const [a, b, deg, dir] of conf.camber) for(let m = 0; m < M; m++){
			const s = m * OUT_STEP, ramp = conf.bankRamp || 60;
			const w = Math.max(0, Math.min(1, (s - a + ramp) / ramp, (b + ramp - s) / ramp));
			if(w > 0) camber[m] += (dir === "R" ? 1 : -1) * Math.tan(deg * Math.PI / 180) * (0.5 - 0.5 * Math.cos(Math.PI * w));
		}
	}
	// A layout's camber comes from its parent, with its own banking (Monza's oval) where the parent has none.
	if(fromCam) camber = camber ? fromCam.map((v, m) => v || camber[m]) : fromCam;
	const ground = h.slice();
	const min = Math.min(...h);
	h = h.map(v => +(v - min).toFixed(2));
	// A banked oval sits on flat ground: the inside edge of the track is at ground level and the
	// banking rises from there to the outside wall, so the centreline is half a road-width up it.
	const banked = conf.bank || (conf.from && conf.from.some(p => CONF[p].bank));
	if(banked) h = h.map((v, m) => +(v + Math.abs(camber[m]) * conf.width / 2 / k).toFixed(2));

	built[id] = { conf, k, pts: idx.map(i => [Q[i].x, Q[i].y]), h: ground, camber };
	out[id] = {
		meters: Math.round(L),
		...(conf.origin ? { length: conf.length } : {}),
		base: +min.toFixed(2),
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
// elevation in metres above the lowest point (base: that point's real height, so a venue's layouts
// line up with each other). Circuit shapes: bacinger/f1-circuits (MIT).
// Elevation: Open Topo Data (EU-DEM, SRTM).
export const CIRCUITS = ${JSON.stringify(out)};
`;
writeFileSync(new URL("../js/circuits.js", import.meta.url), js);
console.log("wrote js/circuits.js", (js.length / 1024).toFixed(0) + " KB");
