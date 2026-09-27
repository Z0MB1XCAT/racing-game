// Traces the circuit layouts through OpenStreetMap road data (data/osm/<venue>-roads.json).
//   node tools/route-layouts.mjs [layout ...]      -> data/circuits/<layout>.geojson
// Each layout is a list of places the lap passes, in race order ([lat, lon]); between them the
// route follows the mapped roads (the shortest way, keeping to one-way roads unless told not to).
// The line starts at the first place (put it on the start line). Map data © OpenStreetMap
// contributors, ODbL. The Overpass queries are noted in data/osm/README.md.
import { readFileSync, writeFileSync } from "node:fs";

// Each layout: osm (the road data), via (the places the lap passes, in race order; the first is the
// start line, and the line is started exactly there), and optionally:
//   start: the start line, when it isn't the first via (that's then the mapped point before it);
//   avoid: road names (regex) never used, e.g. pit lanes;
//   twoWay: ignore one-way tags (street circuits that race against the normal traffic);
//   snap: join mapped road ends to other roads within this many metres (default 4);
//   smooth: [[lat, lon, m], ...] leave out the mapped road within m of a place (a chicane that
//     wasn't there in the layout's day), so the line runs smoothly past it;
//   bumps: [[lat, lon, m, ramp, hold], ...] a temporary chicane that isn't mapped: the line steps
//     m metres to the left (- = right) over ramp metres, holds it for hold metres and steps back;
//   fillet: [[lat, lon, m], ...] a corner that turns sharply at a point (a V, like a junction between
//     two roads) rounded to an arc of radius m, which the cars can drive round;
//   offsets: [[lat, lon, lat, lon, m, ramp], ...] the lap from the first place to the second (in race
//     order) moved m metres to its left, easing in and out over ramp metres (a carriageway of a
//     road that's mapped as one line);
//   lanes: m. Where the lap uses the same road twice, the two passes run side by side, m apart
//     centre to centre: going the same way, the pass through the start line on the left and the
//     other on the right; going opposite ways, each on its own left. lanesRamp: m to ease back to
//     the mapped line at each end (default 150).
export const LAYOUTS = {
	// Monaco, Formula E 2015-2019: the harbour half of the circuit. Sharp right after Sainte-Devote,
	// east along Avenue J.F. Kennedy, round a squared-off hairpin into the Nouvelle Chicane, then the
	// GP circuit back past Tabac, the pool and La Rascasse. Avenue JFK is used both ways, one
	// carriageway each (mapped as one line, so each way is moved over to its own side). Some of it runs against the normal one-way traffic, hence twoWay.
	"monaco-fe": { osm: "monaco-roads.json", twoWay: true, snap: 20, smooth: [[43.737158, 7.424774, 3], [43.73699, 7.42312, 5]],
		offsets: [[43.73687, 7.42200, 43.737229, 7.425481, 14, 25], [43.737035, 7.424686, 43.73699, 7.42312, 14, 25]], via: [
		[43.735735, 7.421216], [43.736462, 7.421375], [43.736973, 7.422995], [43.737206, 7.425308], [43.737009, 7.425343],
		[43.736883, 7.423068], [43.735303, 7.421899], [43.733691, 7.422263], [43.732482, 7.422747], [43.732314, 7.422970], [43.733901, 7.421569]] },
	// Spa, the motorcycle layout (since 2022): the GP circuit with the old, faster Bus Stop.
	"spa-moto": { osm: "spa-roads.json", avoid: "Pit|Kart|Speaker", via: [
		[50.444251, 5.96502], [50.44622, 5.96338], [50.44156, 5.97188], [50.43091, 5.97680], [50.42937, 5.97401],
		[50.43423, 5.97072], [50.43515, 5.96713], [50.44154, 5.96649]] },
	// Monza: the high-speed oval (Pista di Alta Velocita) on its own: the main straight, the north
	// banking, the oval's back straight and the south banking.
	"monza-oval": { osm: "monza-roads.json", avoid: "Pit|Junior|Pirelli|Tondo|Variante", via: [
		[45.618975, 9.281223], [45.62463, 9.28286], [45.61359, 9.28875], [45.61135, 9.28101]] },
	// Monza 1955-61: the road course then the oval in one 10 km lap, down the main straight twice.
	// There were no chicanes then: the old straight past the Rettifilo is still mapped, but the
	// Roggia and Ascari chicanes are smoothed out (the old road ran straight through the Roggia,
	// and Ascari was the fast Curva del Vialone).
	"monza-combined": { osm: "monza-roads.json", avoid: "Pit|Junior|Pirelli|Tondo|Variante del Rettifilo", lanes: 48,
		smooth: [[45.63029, 9.29149, 100], [45.62160, 9.28560, 110]], via: [
		[45.618975, 9.281223], [45.62575, 9.28202], [45.62915, 9.28358], [45.63029, 9.29149], [45.63124, 9.29617], [45.62843, 9.29679],
		[45.62650, 9.29211], [45.62147, 9.28554], [45.61596, 9.28420], [45.61200, 9.28195], [45.618975, 9.281223],
		[45.62463, 9.28286], [45.61359, 9.28875], [45.61135, 9.28101]] },
	// Suzuka: the GP circuit's final chicane is different for motorcycles (the Hitachi Astemo
	// chicane's bike line); East is the first half with a link back to the pits after Dunlop;
	// West is the second half, from the chicane over a link to Degner (the crossover stays), with its
	// start line by the West Course pits between the hairpin and Spoon;
	// South is the separate 1.3 km course beside the paddock.
	"suzuka-moto": { osm: "suzuka-roads.json", avoid: "Pit", via: [
		[34.843344, 136.540283], [34.84005, 136.54340], [34.84219, 136.53883], [34.84433, 136.53731], [34.84326, 136.53258], [34.84721, 136.53050],
		[34.84829, 136.52355], [34.84594, 136.52435], [34.84404, 136.53193], [34.84604, 136.53557], [34.84605, 136.53696]] },
	"suzuka-east": { osm: "suzuka-roads.json", avoid: "Pit", via: [
		[34.843344, 136.540283], [34.84005, 136.54340], [34.84219, 136.53883], [34.84433, 136.53731], [34.84546, 136.53619], [34.84607, 136.53685]] },
	"suzuka-west": { osm: "suzuka-roads.json", avoid: "Pit", fillet: [[34.84576, 136.53458, 45], [34.84497, 136.53484, 40]], via: [
		[34.84558, 136.52631], [34.84829, 136.52355], [34.84594, 136.52435], [34.84404, 136.53193], [34.84580, 136.53469],
		[34.84512, 136.53509], [34.84326, 136.53258], [34.84721, 136.53050]] },
	"suzuka-south": { osm: "suzuka-roads.json", avoid: "Pit", via: [
		[34.84190, 136.52679], [34.8428966, 136.5271151], [34.8436157, 136.5294707], [34.8417141, 136.5285294], [34.8416406, 136.5274925], [34.84085, 136.5269615]] },
	// Jeddah, Formula E (since 2025): the southern half of the Corniche circuit with a hairpin
	// across to the return road and chicanes on both long runs (Turns 8 and 10-11 are temporary
	// and not mapped, so they're added as bumps).
	"jeddah-fe": { osm: "jeddah-roads.json", avoid: "Pit", start: [21.6327, 39.10447], via: [
		[21.63197, 39.10473], [21.63656, 39.10299], [21.6320, 39.1030], [21.62547, 39.10587], [21.62747, 39.10585], [21.63027, 39.10578], [21.631053, 39.105076]],
		bumps: [[21.63243, 39.10326, 12, 15, 10], [21.63039, 39.10251, 12, 15, 25]] },
	// Daytona, the road course (Rolex 24): the tri-oval, into the infield before Turn 1, back onto
	// the banking in Turn 2, the Bus Stop chicane on the backstretch, then Turns 3 and 4.
	"daytona-road": { osm: "daytona-roads.json", avoid: "Pit|NASCAR|Flat", via: [
		[29.1876815, -81.0728143], [29.18380, -81.07312], [29.18635, -81.06967], [29.18499, -81.07017], [29.18264, -81.07202],
		[29.17996, -81.07231], [29.17888, -81.07309], [29.18497, -81.06547], [29.19140, -81.06648]] }
};

const R = 6371000;
const metres = (a, b) => {
	const kx = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180) * Math.PI / 180 * R, ky = Math.PI / 180 * R;
	return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky);
};

// Road graph: every mapped node with its links to the next node along each way.
function graph(file, conf){
	const d = JSON.parse(readFileSync(new URL("../data/osm/" + file, import.meta.url), "utf8"));
	const nodes = new Map(), out = new Map();
	const avoid = conf.avoid ? new RegExp(conf.avoid, "i") : null;
	for(const w of d.elements){
		if(w.type !== "way" || !w.nodes || !w.geometry) continue;
		const t = w.tags || {};
		if(avoid && avoid.test(t.name || "")) continue;
		w.nodes.forEach((id, i) => nodes.set(id, w.geometry[i]));
		const one = conf.twoWay ? "no" : t.oneway === "yes" || t.junction === "roundabout" ? "yes" : t.oneway === "-1" ? "-1" : "no";
		for(let i = 0; i < w.nodes.length - 1; i++){
			const a = w.nodes[i], b = w.nodes[i + 1], len = metres(w.geometry[i], w.geometry[i + 1]);
			if(one !== "-1") (out.get(a) || out.set(a, []).get(a)).push([b, len, w.id]);
			if(one !== "yes") (out.get(b) || out.set(b, []).get(b)).push([a, len, w.id]);
		}
	}
	// Mapped road ends that stop just short of another road (a couple of metres) are joined to it.
	const deg = new Map();
	for(const [a, list] of out) for(const [b] of list){ deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
	const ends = [...nodes.keys()].filter(id => (deg.get(id) || 0) <= 2);
	for(const a of ends) for(const [b, pb] of nodes){
		if(a === b) continue;
		const len = metres(nodes.get(a), pb);
		if(len > (conf.snap ?? 4)) continue;
		(out.get(a) || out.set(a, []).get(a)).push([b, len, 0]);
		(out.get(b) || out.set(b, []).get(b)).push([a, len, 0]);
	}
	return { nodes, out };
}

function nearestNode(G, [lat, lon]){
	let best = null, bd = Infinity;
	for(const [id, p] of G.nodes){ if(!G.out.has(id)) continue; const d = metres(p, { lat, lon }); if(d < bd){ bd = d; best = id; } }
	return [best, bd];
}

// Shortest path from a to b (Dijkstra), as a list of node ids.
function path(G, a, b){
	const dist = new Map([[a, 0]]), prev = new Map(), done = new Set();
	const open = [[0, a]];
	while(open.length){
		let k = 0;
		for(let i = 1; i < open.length; i++) if(open[i][0] < open[k][0]) k = i;
		const [d, u] = open.splice(k, 1)[0];
		if(done.has(u)) continue;
		done.add(u);
		if(u === b) break;
		for(const [v, len] of G.out.get(u) || []){
			const nd = d + len;
			if(nd < (dist.get(v) ?? Infinity)){ dist.set(v, nd); prev.set(v, u); open.push([nd, v]); }
		}
	}
	if(!done.has(b)) return null;
	const p = [b];
	while(p[0] !== a) p.unshift(prev.get(p[0]));
	return p;
}

export function route(name){
	const conf = LAYOUTS[name], G = graph(conf.osm, conf);
	const stops = conf.via.map(v => { const [id, d] = nearestNode(G, v); if(d > 150) console.warn(`${name}: a via point is ${d.toFixed(0)} m from the nearest road`); return id; });
	let ids = [];
	for(let k = 0; k < stops.length; k++){
		const a = stops[k], b = stops[(k + 1) % stops.length];
		const p = path(G, a, b);
		if(!p) throw new Error(`${name}: no route from via ${k} to via ${(k + 1) % stops.length}`);
		ids.push(...p.slice(0, -1));
	}
	// Work in metres east/north of the first via.
	const [lat0, lon0] = conf.start || conf.via[0], kx = Math.cos(lat0 * Math.PI / 180) * Math.PI / 180 * R, ky = Math.PI / 180 * R;
	const toM = p => [(p.lon - lon0) * kx, (p.lat - lat0) * ky], toLL = ([x, y]) => [lon0 + x / kx, lat0 + y / ky];
	let pts = ids.map(id => ({ id, p: toM(G.nodes.get(id)) }));
	// Start exactly on the start line: on the road either side of the first via's node.
	{
		const n = pts.length, proj = (a, b) => {
			const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, (-a[0] * vx - a[1] * vy) / (vx * vx + vy * vy || 1)));
			const q = [a[0] + vx * t, a[1] + vy * t];
			return { q, d: Math.hypot(q[0], q[1]) };
		};
		const before = proj(pts[n - 1].p, pts[0].p), after = proj(pts[0].p, pts[1].p);
		if(after.d <= before.d) pts = [{ id: 0, p: after.q }, ...pts.slice(1), pts[0]];
		else pts = [{ id: 0, p: before.q }, ...pts];
		pts = pts.filter((q, i) => i === 0 || Math.hypot(q.p[0] - pts[i - 1].p[0], q.p[1] - pts[i - 1].p[1]) > 0.5);
		if(Math.hypot(pts.at(-1).p[0] - pts[0].p[0], pts.at(-1).p[1] - pts[0].p[1]) <= 0.5) pts.pop();
	}
	// Little spikes where joined-up road ends meet (the line goes a few metres and straight back).
	const despike = (maxCos, len) => {
		for(let again = true; again;){
			again = false;
			for(let i = 1; i < pts.length && !again; i++){
				const a = pts[i - 1].p, b = pts[i].p, c = pts[(i + 1) % pts.length].p;
				const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
				const cos = ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (l1 * l2 || 1);
				if(l1 < 0.3 || (cos < maxCos && Math.min(l1, l2) < len)){ pts.splice(i, 1); again = true; }
			}
		}
	};
	despike(-0.85, 8);
	// Smoothed-out chicanes.
	for(const [la, lo, r] of conf.smooth || []){
		const c = toM({ lat: la, lon: lo });
		pts = pts.filter((q, i) => i === 0 || Math.hypot(q.p[0] - c[0], q.p[1] - c[1]) > r);
	}
	// Sharp junction corners rounded off.
	for(const [la, lo, R] of conf.fillet || []){
		const c = toM({ lat: la, lon: lo }), n = pts.length;
		let k = 0, bd = Infinity;
		pts.forEach((q, i) => { const d = Math.hypot(q.p[0] - c[0], q.p[1] - c[1]); if(d < bd){ bd = d; k = i; } });
		// The point dist metres before (-1) or after (+1) the apex along the line, and its index.
		const walk = (dir, dist) => {
			let i = k, left = dist;
			for(;;){
				const j = (i + dir + n) % n, l = Math.hypot(pts[j].p[0] - pts[i].p[0], pts[j].p[1] - pts[i].p[1]);
				if(l >= left){ const f = left / l; return { i, j, p: [pts[i].p[0] + (pts[j].p[0] - pts[i].p[0]) * f, pts[i].p[1] + (pts[j].p[1] - pts[i].p[1]) * f] }; }
				left -= l; i = j;
			}
		};
		const A = pts[k].p, a = walk(-1, 60).p, b = walk(1, 60).p;
		const u1 = [(A[0] - a[0]) / Math.hypot(A[0] - a[0], A[1] - a[1]), (A[1] - a[1]) / Math.hypot(A[0] - a[0], A[1] - a[1])];
		const u2 = [(b[0] - A[0]) / Math.hypot(b[0] - A[0], b[1] - A[1]), (b[1] - A[1]) / Math.hypot(b[0] - A[0], b[1] - A[1])];
		const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]), T = R * Math.tan(Math.abs(turn) / 2);
		// A smooth curve from the road T before the corner to T after it, leaving each the way the road
		// goes there (a cubic Bezier; about the arc of radius R when the roads either side are straight).
		const unit = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
		const P1 = walk(-1, T).p, P2 = walk(1, T).p, d1 = unit(walk(-1, T + 10).p, P1), d2 = unit(P2, walk(1, T + 10).p);
		const h = T * 0.55 * (4 / 3) * Math.tan(Math.abs(turn) / 4) / Math.tan(Math.abs(turn) / 2) / 0.55;
		const C1 = [P1[0] + d1[0] * h, P1[1] + d1[1] * h], C2 = [P2[0] - d2[0] * h, P2[1] - d2[1] * h];
		const arc = [], m = Math.ceil(Math.abs(turn) * R / 4);
		for(let t = 0; t <= m; t++){ const u = t / m, v = 1 - u; arc.push({ id: -1, p: [0, 1].map(c => v * v * v * P1[c] + 3 * v * v * u * C1[c] + 3 * v * u * u * C2[c] + u * u * u * P2[c]) }); }
		const before = walk(-1, T), after = walk(1, T);
		// Replace the line from T before the apex to T after it (never across the start).
		const i0 = before.j, i1 = after.i;
		if(i0 > i1 || i0 === 0) throw new Error(`${name}: a fillet runs across the start line`);
		pts = [...pts.slice(0, i0), ...arc, ...pts.slice(i1 + 1)];
	}
	// Distance along the lap, and the direction of travel, at each point.
	const along = () => { const s = [0]; for(let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].p[0] - pts[i - 1].p[0], pts[i].p[1] - pts[i - 1].p[1])); return s; };
	const leftAt = i => {
		const a = pts[(i - 1 + pts.length) % pts.length].p, b = pts[(i + 1) % pts.length].p, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
	};
	// Sideways offsets (metres to the left), then applied all at once.
	const densify = step => {
		const out = [];
		for(let i = 0; i < pts.length; i++){
			const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]), m = Math.ceil(l / step);
			out.push(a);
			for(let j = 1; j < m; j++) out.push({ id: -1, tw: a.tw && b.tw, p: [a.p[0] + (b.p[0] - a.p[0]) * j / m, a.p[1] + (b.p[1] - a.p[1]) * j / m] });
		}
		pts = out;
	};
	if(conf.bumps || conf.lanes || conf.offsets){
		if(conf.lanes){
			// Road used twice: mapped nodes that come up twice (and the start point, if its neighbours do).
			const count = new Map();
			for(const q of pts) if(q.id > 0) count.set(q.id, (count.get(q.id) || 0) + 1);
			for(const q of pts) q.tw = count.get(q.id) > 1;
			pts[0].tw = pts[1].tw && pts.at(-1).tw;
		}
		densify(4);
		const s = along(), L = s.at(-1) + Math.hypot(pts[0].p[0] - pts.at(-1).p[0], pts[0].p[1] - pts.at(-1).p[1]), off = new Float64Array(pts.length);
		const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
		for(const [la, lo, m, ramp, hold] of conf.bumps || []){
			const c = toM({ lat: la, lon: lo });
			let k = 0, bd = Infinity;
			pts.forEach((q, i) => { const d = Math.hypot(q.p[0] - c[0], q.p[1] - c[1]); if(d < bd){ bd = d; k = i; } });
			const s0 = s[k] - hold / 2;
			pts.forEach((q, i) => { const u = s[i] - s0; off[i] += m * Math.min(ease((u + ramp) / ramp), ease((hold + ramp - u) / ramp)); });
		}
		for(const [la0, lo0, la1, lo1, m, ramp] of conf.offsets || []){
			const A = toM({ lat: la0, lon: lo0 }), B = toM({ lat: la1, lon: lo1 }), n = pts.length;
			const near = (c, from, span) => { let k = -1, bd = Infinity; for(let t = 0; t < span; t++){ const i = (from + t) % n, d = Math.hypot(pts[i].p[0] - c[0], pts[i].p[1] - c[1]); if(d < bd){ bd = d; k = i; } } return k; };
			const ia = near(A, 0, n), ib = near(B, ia, Math.round(n / 2));
			const sa = s[ia], len = ((s[ib] - sa) % L + L) % L;
			pts.forEach((q, i) => { const u = ((s[i] - sa) % L + L) % L, v = u > L / 2 ? u - L : u; off[i] += m * Math.min(ease((v + ramp) / ramp), ease((len + ramp - v) / ramp)); });
		}
		if(conf.lanes){
			// The run through the start line takes the left lane, the other pass the right; each eases
			// back to the mapped line after it.
			const twice = Uint8Array.from(pts, q => q.tw ? 1 : 0);
			// Runs, and which of them is the start's.
			const lane = new Float64Array(pts.length);
			let i0 = twice.findIndex(v => !v);
			const runs = [];
			for(let k = 1; k <= pts.length; k++){
				const i = (i0 + k) % pts.length;
				if(twice[i]){ if(!runs.length || runs.at(-1).end !== (i - 1 + pts.length) % pts.length) runs.push({ start: i, end: i }); else runs.at(-1).end = i; }
			}
			const inRun = (r, i) => r.start <= r.end ? i >= r.start && i <= r.end : i >= r.start || i <= r.end;
			// (Passes the opposite way round, like both sides of a boulevard, each keep to their left.)
			const dirAt = i => { const a = pts[(i - 1 + pts.length) % pts.length].p, b = pts[(i + 1) % pts.length].p; return [b[0] - a[0], b[1] - a[1]]; };
			const mid = r => (r.start + (((r.end - r.start) % pts.length + pts.length) % pts.length >> 1)) % pts.length;
			const opposite = runs.length === 2 && (() => { const a = dirAt(mid(runs[0])), b = dirAt(mid(runs[1])); return a[0] * b[0] + a[1] * b[1] < 0; })();
			for(const r of runs){
				const side = opposite || inRun(r, 0) ? 1 : -1, RAMP = conf.lanesRamp || 150;
				const sA = s[r.start], sB = s[r.end];
				pts.forEach((q, i) => {
					let d;
					if(inRun(r, i)) d = 0;
					else {
						const da = ((sA - s[i]) % L + L) % L, db = ((s[i] - sB) % L + L) % L;
						d = Math.min(da, db);
					}
					if(d < RAMP) lane[i] = side * conf.lanes / 2 * ease(1 - d / RAMP);
				});
			}
			for(let i = 0; i < pts.length; i++) off[i] += lane[i];
		}
		const moved = pts.map((q, i) => { const [lx, ly] = leftAt(i); return { id: q.id, p: [q.p[0] + lx * off[i], q.p[1] + ly * off[i]] }; });
		pts = moved;
		despike(-0.3, 15);          // (moving a line sideways round a sharp turn can fold it back)
	}
	const s = along();
	const L = s.at(-1) + Math.hypot(pts[0].p[0] - pts.at(-1).p[0], pts[0].p[1] - pts.at(-1).p[1]);
	const coords = pts.map(q => toLL(q.p).map(v => +v.toFixed(7)));
	coords.push(coords[0]);
	return { coords, length: L };
}

if(import.meta.url === `file://${process.argv[1]}`){
	const want = process.argv.slice(2);
	for(const name of want.length ? want : Object.keys(LAYOUTS)){
		const { coords, length } = route(name);
		writeFileSync(new URL(`../data/circuits/${name}.geojson`, import.meta.url), JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature",
			properties: { layout: name, source: "OpenStreetMap contributors (ODbL), routed by tools/route-layouts.mjs" }, geometry: { type: "LineString", coordinates: coords } }] }));
		console.log(`${name}: ${coords.length - 1} points, ${Math.round(length)} m`);
	}
}
