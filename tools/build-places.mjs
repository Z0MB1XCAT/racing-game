// Builds js/places.js: the real surroundings of a circuit from OpenStreetMap data
// (data/osm/<id>.json, downloaded with the Overpass API; see data/osm/README.md).
//   node tools/build-places.mjs
// Everything is in metres east/north of the circuit data's first point, the same frame as
// js/circuits.js, so the game places it with the track's own map transform.
// Map data © OpenStreetMap contributors, ODbL.
//
// Overpass queries used (POST to https://overpass-api.de/api/interpreter, save as data/osm/...):
//   jeddah.json: [out:json];(way["building"](21.615,39.085,21.662,39.125);relation["building"](...);
//     way["natural"~"water|coastline|beach|sand"](21.60,39.07,21.68,39.14);way["water"](...);
//     way["leisure"~"park|marina|stadium|track"](...);way["landuse"](...);
//     way["highway"~"motorway|trunk|primary|secondary|tertiary|pedestrian|footway"](...);
//     way["man_made"](...);node["amenity"="place_of_worship"](...);node["man_made"](...););out geom tags;
//   jeddah-lagoon.json: [out:json];rel(17098729);out geom;
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITES = {
	jeddah: {
		circuit: "sa-2021", osm: ["jeddah.json", "jeddah-lagoon.json"], reach: 1500,
		// Heights we know that OpenStreetMap doesn't have (metres), by building id.
		heights: { 1041158265: 22 },           // Shangri-La: the podium (the tower is Sail Tower, tagged)
		// Landmarks drawn specially (by OSM id): Al-Rahma "floating" mosque, the Corniche mosque.
		mosques: ["Al Rahma Mosque", "Corniche Mosque"],
		// Towers OpenStreetMap doesn't have: placed from satellite imagery, heights estimated from
		// the length of their shadows (Diamond Tower, 432 m, gives the sun angle). [east, north, height, width] m.
		towers: [[-150, 1244, 140, 34], [-111, 832, 200, 38], [-9, 487, 190, 36], [207, 18, 225, 40]]
	}
};

const r1 = v => Math.round(v * 2) / 2;
// Ramer-Douglas-Peucker on a polyline.
function simplify(pts, tol){
	if(pts.length < 3) return pts;
	const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
	const st = [[0, pts.length - 1]];
	while(st.length){
		const [a, b] = st.pop();
		let best = -1, bd = tol;
		const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
		for(let i = a + 1; i < b; i++){
			const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
			if(d > bd){ bd = d; best = i; }
		}
		if(best >= 0){ keep[best] = 1; st.push([a, best], [best, b]); }
	}
	return pts.filter((_, i) => keep[i]);
}
// A closed ring (first point = last): simplify the two halves either side of the point
// farthest from the start, so it doesn't collapse.
function simplifyRing(pts, tol){
	const p = pts.slice();
	if(p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
	if(p.length < 4) return p;
	let m = 1, md = -1;
	for(let i = 1; i < p.length; i++){ const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if(d > md){ md = d; m = i; } }
	const a = simplify(p.slice(0, m + 1), tol), b = simplify([...p.slice(m), p[0]], tol);
	return [...a, ...b.slice(1, -1)];
}
const area = p => { let a = 0; for(let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2); };
// Small deterministic random from an id.
const rnd = (id, k = 0) => { const x = Math.sin((id % 100000) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

const out = {};
for(const [site, conf] of Object.entries(SITES)){
	const els = [];
	for(const f of conf.osm){
		const u = new URL("../data/osm/" + f, import.meta.url);
		if(existsSync(u)) els.push(...JSON.parse(readFileSync(u, "utf8")).elements);
	}
	const coords = JSON.parse(readFileSync(new URL(`../data/circuits/${conf.circuit}.geojson`, import.meta.url), "utf8")).features[0].geometry.coordinates;
	const lon0 = coords[0][0], lat0 = coords[0][1], kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
	const P = g => g.map(p => [(p.lon - lon0) * kx, (p.lat - lat0) * ky]);
	// Only things near the circuit.
	const track = coords.map(([lo, la]) => [(lo - lon0) * kx, (la - lat0) * ky]);
	const near = (x, y) => track.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < conf.reach);
	const centre = p => [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length];
	const poly = g => simplifyRing(P(g), 0.8).map(([x, y]) => [r1(x), r1(y)]);

	const S = { coast: [], water: [], buildings: [], parks: [], sand: [], roads: [], flags: [], piers: [], mosques: [] };
	for(const e of els){
		const t = e.tags || {};
		if(e.type === "way" && e.geometry){
			const c = centre(P(e.geometry));
			if(t.natural === "coastline"){ S.coast.push(simplify(P(e.geometry), 2).map(([x, y]) => [r1(x), r1(y)])); continue; }
			if(!near(c[0], c[1])) continue;
			if(t.building){
				const p = poly(e.geometry);
				if(p.length < 3) continue;
				const A = area(p);
				let h = +t.height || (t["building:levels"] ? +t["building:levels"] * 3.3 : 0) || conf.heights[e.id] || 0, k = "b";
				if(!h){
					if(t.building === "grandstand") h = 14;
					else if(t.building === "mosque") h = 12;
					else if(t.building === "terrace") h = 9 + rnd(e.id) * 3;
					else if(t.building === "retail" || t.building === "commercial") h = 18;
					else if(A < 250) h = 7 + rnd(e.id) * 4;               // villas
					else if(A < 700) h = 10 + rnd(e.id) * 10;
					else if(A < 2500) h = 16 + rnd(e.id) * 26;             // apartment and office blocks
					else h = 16 + rnd(e.id) * 8;                            // malls, halls
				}
				if(t.building === "grandstand") k = "stand";
				else if(h > 60) k = "tower";
				S.buildings.push({ p, h: Math.round(h), k, ...(t.name ? { n: t["name:en"] || t.name } : {}) });
			}else if(t.natural === "water" || t.water){
				S.water.push([poly(e.geometry)]);
			}else if(t.leisure === "park" || t.landuse === "grass"){
				S.parks.push(poly(e.geometry));
			}else if(t.natural === "beach" || t.natural === "sand"){
				S.sand.push(poly(e.geometry));
			}else if(t.man_made === "pier" || t.man_made === "groyne"){
				const g = e.geometry, closed = g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
				S.piers.push({ a: closed ? 1 : 0, p: closed ? poly(g) : simplify(P(g), 0.8).map(([x, y]) => [r1(x), r1(y)]) });
			}else if(t.highway && /^(trunk|primary|secondary|tertiary)(_link)?$/.test(t.highway)){
				S.roads.push({ w: /trunk|primary/.test(t.highway) ? 16 : 10, p: simplify(P(e.geometry), 1.5).map(([x, y]) => [r1(x), r1(y)]) });
			}
		}else if(e.type === "relation" && t.natural === "water" && e.members){
			const rings = e.members.filter(m => m.geometry).sort((a, b) => (a.role === "outer" ? -1 : 1) - (b.role === "outer" ? -1 : 1)).map(m => poly(m.geometry));
			if(rings.length) S.water.push(rings);
		}else if(e.type === "node"){
			const [x, y] = [(e.lon - lon0) * kx, (e.lat - lat0) * ky];
			if(!near(x, y)) continue;
			if(t.man_made === "flagpole") S.flags.push([r1(x), r1(y)]);
			else if(t.amenity === "place_of_worship" && t.name) S.mosques.push({ at: [r1(x), r1(y)], n: t["name:en"] || t.name });
		}
	}
	for(const [x, y, h, w] of conf.towers || []){
		const r = w / 2;
		S.buildings.push({ p: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], h, k: "tower", est: 1 });
	}
	out[site] = S;
	console.log(site + ":", Object.entries(S).map(([k, v]) => k + " " + v.length).join(", "));
}

const js = `// Generated by tools/build-places.mjs from data/osm. Don't edit by hand.
// Real surroundings of circuits, in metres east/north of the circuit data's first point.
// Map data © OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright
export const PLACES = ${JSON.stringify(out)};
`;
writeFileSync(new URL("../js/places.js", import.meta.url), js);
console.log("wrote js/places.js", (js.length / 1024).toFixed(0) + " KB");
