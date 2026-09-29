// Builds js/places/<venue>.js: the real surroundings of each circuit from OpenStreetMap data
// (data/osm/<venue>.json; tools/fetch-osm.mjs downloads Monaco, Spa, Monza and Suzuka, see
// data/osm/README.md for Jeddah and Daytona). The game loads a venue's file when it needs it.
//   node tools/build-places.mjs
// Everything is in metres east/north of the circuit data's first point, the same frame as
// js/circuits.js, so the game places it with the track's own map transform.
// Map data © OpenStreetMap contributors, ODbL.
//
// Overpass queries used for Jeddah and Daytona (POST to https://overpass-api.de/api/interpreter):
//   jeddah.json: [out:json];(way["building"](21.615,39.085,21.662,39.125);relation["building"](...);
//     way["natural"~"water|coastline|beach|sand"](21.60,39.07,21.68,39.14);way["water"](...);
//     way["leisure"~"park|marina|stadium|track"](...);way["landuse"](...);
//     way["highway"~"motorway|trunk|primary|secondary|tertiary|pedestrian|footway"](...);
//     way["man_made"](...);node["amenity"="place_of_worship"](...);node["man_made"](...););out geom tags;
//   jeddah-lagoon.json: [out:json];rel(17098729);out geom;
//   daytona.json: [out:json];(way["natural"="water"](29.170,-81.085,29.200,-81.055);relation["natural"="water"](...);
//     way["building"](29.176,-81.082,29.196,-81.058);way["leisure"~"stadium|track|pitch"](29.170,-81.085,29.200,-81.055);
//     way["amenity"="parking"](29.176,-81.082,29.196,-81.058););out geom tags;
// The circuit outlines themselves (data/circuits/monza-osm.geojson, daytona-osm.geojson) are
// OpenStreetMap raceway ways joined into one loop:
//   [out:json];way["highway"="raceway"](<bbox round the circuit>);out geom tags;
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

// reach: how far from the circuit (metres) things are kept. land: the full picture (forests,
// fields, trees, railways...) rather than just the city. town: how buildings without a height
// are guessed ("city" Monaco's apartment blocks, "town", "village", "japan").
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
	},
	// Daytona: Lake Lloyd in the infield, the frontstretch grandstand (its real outline and height),
	// and the infield garages and buildings.
	daytona: { circuit: "daytona-osm", osm: ["daytona.json"], reach: 320, heights: {} },
	// Monaco: the whole principality, its apartment blocks (many with their real number of floors),
	// the Casino, the harbour's piers, the Rock with the palace, the gardens and street trees.
	monaco: { circuit: "mc-1929", osm: ["monaco.json"], reach: 1400, land: true, town: "city", heights: {},
		landmarks: { pool: 197170037, yachtclub: 8269572, palace: 393226 },
		// Landmarks the map has as a point: the building round that point.
		landmarkNodes: { casino: 4416197079, grandhotel: 11339077004, hermitage: 1759785871 },
		// Their real heights to the eaves (metres), where the map's are missing or off.
		markHeights: { casino: 21, grandhotel: 24, yachtclub: 19 } },
	// Spa: the Ardennes forest, meadows and the village of Francorchamps, the grandstands.
	spa: { circuit: "be-1925", osm: ["spa.json"], reach: 1500, land: true, town: "village", heights: {} },
	// Monza: the royal park's woods and lawns, Villa Reale's grounds, the town beyond, the grandstands.
	monza: { circuit: "monza-osm", osm: ["monza.json"], reach: 1300, land: true, town: "town", heights: {} },
	// Suzuka: the wooded hills, rice fields, the amusement park with its big wheel, the hotel.
	// fill: land the map leaves blank is wooded where it slopes more than this (1 in 12), paddy fields where flatter.
	suzuka: { circuit: "jp-1962", osm: ["suzuka.json"], reach: 1500, land: true, town: "japan", heights: {}, fill: 0.08 }
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
// Relation members are often pieces of a ring: join them end to end into closed rings.
function joinRings(lines){
	const rings = [], open = lines.map(l => l.slice()).filter(l => l.length > 1);
	const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
	while(open.length){
		let ring = open.shift();
		for(let guard = 0; guard < 5000 && !same(ring[0], ring[ring.length - 1]); guard++){
			const end = ring[ring.length - 1];
			const k = open.findIndex(l => same(l[0], end) || same(l[l.length - 1], end));
			if(k < 0) break;
			const l = open.splice(k, 1)[0];
			ring = ring.concat((same(l[0], end) ? l : l.reverse()).slice(1));
		}
		if(ring.length >= 4) rings.push(ring);
	}
	return rings;
}
// Colours from OpenStreetMap (names or #hex) as numbers.
const NAMED = { white: 0xf2f0ea, beige: 0xe6d6b8, cream: 0xf1e6c8, yellow: 0xecd28a, orange: 0xe0a060, red: 0xb5523e, pink: 0xe8b8b0, brown: 0x8a6448,
	grey: 0xa8a8a8, gray: 0xa8a8a8, lightgrey: 0xcfcfcf, darkgrey: 0x6a6a6a, black: 0x333333, blue: 0x7f9fc0, green: 0x86a67a, silver: 0xc4c8cc, tan: 0xd2b48c, maroon: 0x7a3a2a };
const colour = v => { if(!v) return undefined; v = String(v).trim().toLowerCase(); if(/^#[0-9a-f]{6}$/.test(v)) return parseInt(v.slice(1), 16); if(/^#[0-9a-f]{3}$/.test(v)) return parseInt(v.slice(1).split("").map(c => c + c).join(""), 16); return NAMED[v]; };

// A building's height (metres) when OpenStreetMap doesn't say, by the kind of place.
function guessHeight(t, A, id, town){
	const b = t.building, r = rnd(id);
	if(b === "grandstand" || t.grandstand) return 12 + r * 4;
	if(/^(garage|garages|shed|carport|hut|kiosk|toilets|container|cabin|greenhouse|roof|service|transformer_tower)$/.test(b)) return 3 + r;
	if(/^(industrial|warehouse|retail|commercial|supermarket|farm_auxiliary|barn|sports_hall|hangar|construction)$/.test(b)) return 7 + r * 5;
	if(/^(church|chapel|cathedral)$/.test(b)) return 14 + r * 6;
	if(/^(hotel)$/.test(b) || t.tourism === "hotel") return town === "village" ? 12 + r * 5 : 25 + r * 20;
	if(/^(house|detached|semidetached_house|bungalow|farm|villa)$/.test(b)) return 6.5 + r * 2.5;
	if(town === "city"){
		if(A < 120) return 8 + r * 6;
		if(A < 600) return 16 + r * 18;
		return 22 + r * 30;
	}
	if(town === "village") return A < 250 ? 6.5 + r * 2.5 : A < 1500 ? 8 + r * 4 : 9 + r * 4;
	if(town === "japan") return A < 200 ? 6 + r * 2 : A < 1500 ? 9 + r * 6 : 10 + r * 8;
	// town (Monza and its neighbours): houses, blocks of flats, sheds.
	if(b === "apartments" || b === "residential") return A < 300 ? 10 + r * 5 : 13 + r * 12;
	if(b === "terrace") return 9 + r * 3;
	return A < 150 ? 6 + r * 2 : A < 600 ? 8 + r * 6 : 10 + r * 6;
}
// Kinds of ground cover, from the tags of an area.
function landKind(t){
	if(t.landuse === "forest" || t.natural === "wood") return "forest";
	if(t.natural === "scrub" || t.natural === "heath") return "scrub";
	if(t.natural === "water" || t.water || t.landuse === "reservoir" || t.landuse === "basin" || t.waterway === "riverbank") return "water";
	if(t.leisure === "swimming_pool") return t.location === "indoor" ? null : "pool";
	if(t.leisure === "pitch" || t.leisure === "track" && t.area === "yes") return "pitch";
	if(t.amenity === "parking" && (!t.parking || /surface/.test(t.parking))) return "paved";
	if(/^(railway|garages)$/.test(t.landuse) || t.amenity === "fuel") return "paved";
	if(t.landuse === "construction" || t.landuse === "brownfield" || t.landuse === "landfill" || t.landuse === "quarry") return "dirt";
	if(t.natural === "beach" || t.natural === "sand") return "sand";
	if(t.natural === "shingle" || t.natural === "bare_rock" || t.natural === "scree") return "gravel";
	if(/^(farmland|farmyard|allotments|plant_nursery)$/.test(t.landuse)) return "farm";
	if(/^(orchard|vineyard)$/.test(t.landuse)) return "orchard";
	if(/^(meadow|grass|village_green|recreation_ground|cemetery|greenfield)$/.test(t.landuse) || /^(grassland)$/.test(t.natural) || /^(park|garden|golf_course|playground|dog_park)$/.test(t.leisure)) return "grass";
	if(t.landuse === "residential") return "res";
	if(/^(industrial|commercial|retail)$/.test(t.landuse)) return "ind";
	return null;
}
const ROAD_W = { motorway: 20, trunk: 16, primary: 12, secondary: 10, tertiary: 8, unclassified: 6, residential: 6, pedestrian: 5 };

mkdirSync(new URL("../js/places/", import.meta.url), { recursive: true });
for(const [site, conf] of Object.entries(SITES)){
	const els = [];
	for(const f of conf.osm){
		const u = new URL("../data/osm/" + f, import.meta.url);
		if(existsSync(u)) els.push(...JSON.parse(readFileSync(u, "utf8")).elements);
	}
	const coords = JSON.parse(readFileSync(new URL(`../data/circuits/${conf.circuit}.geojson`, import.meta.url), "utf8")).features[0].geometry.coordinates;
	const lon0 = coords[0][0], lat0 = coords[0][1], kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
	const P = g => g.filter(Boolean).map(p => [(p.lon - lon0) * kx, (p.lat - lat0) * ky]);
	// Only things near the circuit (a coarse grid of its points, for speed).
	const track = coords.map(([lo, la]) => [(lo - lon0) * kx, (la - lat0) * ky]);
	const nearDist = (x, y) => { let b = Infinity; for(const [tx, ty] of track) b = Math.min(b, Math.hypot(tx - x, ty - y)); return b; };
	const near = (x, y) => nearDist(x, y) < conf.reach;
	const centre = p => [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length];
	const ringOf = (g, tol = 0.8) => simplifyRing(g, tol).map(([x, y]) => [r1(x), r1(y)]);
	const poly = (g, tol) => ringOf(P(g), tol);
	const line = (g, tol = 1.5) => simplify(P(g), tol).map(([x, y]) => [r1(x), r1(y)]);
	const closed = g => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

	const S = { coast: [], water: [], buildings: [], parks: [], sand: [], roads: [], flags: [], piers: [], mosques: [] };
	if(conf.land) Object.assign(S, { land: [], trees: [], rails: [], wheels: [], marks: {} });
	const ids = conf.landmarks ? new Map(Object.entries(conf.landmarks).map(([k, v]) => [v, k])) : new Map();
	const addLand = (k, rings, extra) => {
		const [outer, ...holes] = rings;
		if(!outer || outer.length < 3) return;
		const A = area(outer);
		if(A < (k === "pool" ? 20 : 150)) return;
		const [cx, cy] = centre(outer);
		if(nearDist(cx, cy) > conf.reach + Math.sqrt(A)) return;
		S.land.push({ k, p: outer, ...(holes.length ? { h: holes } : {}), ...extra });
	};
	for(const e of els){
		const t = e.tags || {};
		if(e.type === "way" && e.geometry){
			const c = centre(P(e.geometry));
			if(t.natural === "coastline"){ S.coast.push(simplify(P(e.geometry), 2).map(([x, y]) => [r1(x), r1(y)])); continue; }
			if(!conf.land && !near(c[0], c[1])) continue;
			if(t.building && (!conf.land || t.building !== "no" && closed(e.geometry))){
				if(!near(c[0], c[1])) continue;
				// (Tunnels and bridges tagged as buildings, and underground ones, aren't buildings you see.)
				if(conf.land && (t.building === "bridge" || +t.layer < 0 || t.location === "underground")) continue;
				const pr = P(e.geometry), A0 = area(pr);
				if(conf.land && A0 < 12) continue;
				const p = ringOf(pr, conf.land && A0 > 800 ? 1.2 : 0.8);
				if(p.length < 3) continue;
				const A = area(p);
				let h = (conf.land ? +parseFloat(t.height) : +t.height) || (t["building:levels"] ? +t["building:levels"] * (conf.land ? 3.1 : 3.3) + (conf.land ? 1 : 0) : 0) || conf.heights[e.id] || 0, k = "b";
				if(!h){
					if(!conf.land){
						if(t.building === "grandstand") h = 14;
						else if(t.building === "mosque") h = 12;
						else if(t.building === "terrace") h = 9 + rnd(e.id) * 3;
						else if(t.building === "retail" || t.building === "commercial") h = 18;
						else if(A < 250) h = 7 + rnd(e.id) * 4;               // villas
						else if(A < 700) h = 10 + rnd(e.id) * 10;
						else if(A < 2500) h = 16 + rnd(e.id) * 26;             // apartment and office blocks
						else h = 16 + rnd(e.id) * 8;                            // malls, halls
					}else h = guessHeight(t, A, e.id, conf.town);
				}
				if(t.building === "grandstand" || t.grandstand === "yes") k = "stand";
				else if(h > 60) k = "tower";
				else if(conf.land && /^(garage|garages|shed|carport|hut|industrial|warehouse|farm_auxiliary|barn|service|roof|hangar|greenhouse|container|construction|transformer_tower)$/.test(t.building)) k = t.building === "roof" || t.building === "carport" ? "roof" : "shed";
				else if(conf.land && /^(church|chapel|cathedral)$/.test(t.building)) k = "church";
				else if(conf.land && (/^(house|detached|semidetached_house|bungalow|farm|villa|terrace)$/.test(t.building) || (conf.town !== "city" && A < 260 && h < 11))) k = "house";
				const b = { p, h: conf.land ? Math.round(h * 2) / 2 : Math.round(h), k, ...(t.name ? { n: t["name:en"] || t.name } : {}) };
				if(conf.land){
					const bc = colour(t["building:colour"]), rc = colour(t["roof:colour"]);
					if(bc !== undefined) b.c = bc;
					if(rc !== undefined) b.r = rc;
					if(t["roof:shape"] && t["roof:shape"] !== "flat") b.g = 1;
					if(t.attraction === "big_wheel"){ const xs = p.map(q => q[0]), ys = p.map(q => q[1]); S.wheels.push({ at: centre(p).map(r1), d: Math.round(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))) }); continue; }
					if(ids.has(e.id)) b.m = ids.get(e.id);
				}
				S.buildings.push(b);
			}else if(conf.land && t.attraction === "big_wheel" && closed(e.geometry)){
				const p = poly(e.geometry), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
				S.wheels.push({ at: centre(p).map(r1), d: Math.round(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))) });
			}else if(conf.land){
				// Ground cover, water, trees in a row, roads and railways.
				const k = closed(e.geometry) ? landKind(t) : null;
				if(ids.has(e.id)) S.marks[ids.get(e.id)] = { p: poly(e.geometry) };
				if(k){ addLand(k, [poly(e.geometry, k === "forest" || k === "farm" || k === "grass" ? 2 : 0.8)]); if(k === "water") S.water.push([poly(e.geometry)]); continue; }
				if(!near(c[0], c[1])) continue;
				if(t.natural === "tree_row"){ S.land.push({ k: "row", p: line(e.geometry, 1) }); continue; }
				if(t.man_made === "pier" || t.man_made === "groyne" || t.man_made === "breakwater"){
					S.piers.push({ a: closed(e.geometry) ? 1 : 0, p: closed(e.geometry) ? poly(e.geometry) : line(e.geometry, 0.8) });
					continue;
				}
				const hw = t.highway && t.highway.replace("_link", "");
				if(hw && ROAD_W[hw] && t.tunnel !== "yes" && !(+t.layer < 0) && t.area !== "yes"){ S.roads.push({ w: ROAD_W[hw], p: line(e.geometry) }); continue; }
				if(t.railway && t.tunnel !== "yes" && !(+t.layer < 0)) S.rails.push(line(e.geometry));
			}else if(t.natural === "water" || t.water){
				S.water.push([poly(e.geometry)]);
			}else if(t.leisure === "park" || t.landuse === "grass"){
				S.parks.push(poly(e.geometry));
			}else if(t.natural === "beach" || t.natural === "sand"){
				S.sand.push(poly(e.geometry));
			}else if(t.man_made === "pier" || t.man_made === "groyne"){
				const g = e.geometry;
				S.piers.push({ a: closed(g) ? 1 : 0, p: closed(g) ? poly(g) : simplify(P(g), 0.8).map(([x, y]) => [r1(x), r1(y)]) });
			}else if(t.highway && /^(trunk|primary|secondary|tertiary)(_link)?$/.test(t.highway)){
				S.roads.push({ w: /trunk|primary/.test(t.highway) ? 16 : 10, p: simplify(P(e.geometry), 1.5).map(([x, y]) => [r1(x), r1(y)]) });
			}
		}else if(e.type === "relation" && e.members){
			const outer = joinRings(e.members.filter(m => m.role !== "inner").map(m => P(m.geometry)));
			const inner = joinRings(e.members.filter(m => m.role === "inner").map(m => P(m.geometry)));
			if(!conf.land){
				if(t.natural === "water"){ const rings = [...outer, ...inner].map(r => ringOf(r)); if(rings.length) S.water.push(rings); }
				continue;
			}
			if(ids.has(e.id) && outer.length) S.marks[ids.get(e.id)] = { p: ringOf(outer[0]) };
			if(t.building){
				for(const o of outer){
					const [cx, cy] = centre(o);
					if(!near(cx, cy)) continue;
					const p = ringOf(o), A = area(p), h = +parseFloat(t.height) || (t["building:levels"] ? +t["building:levels"] * 3.1 + 1 : 0) || guessHeight(t, A, e.id, conf.town);
					S.buildings.push({ p, h: Math.round(h * 2) / 2, k: t.building === "grandstand" ? "stand" : "b", ...(t.name ? { n: t["name:en"] || t.name } : {}), ...(ids.has(e.id) ? { m: ids.get(e.id) } : {}) });
				}
				continue;
			}
			const k = landKind(t);
			if(!k) continue;
			const tol = k === "forest" || k === "farm" || k === "grass" ? 2 : 0.8;
			for(const o of outer){
				const ring = ringOf(o, tol), holes = inner.filter(h => { const [hx, hy] = h[0]; return inside(o, hx, hy); }).map(h => ringOf(h, tol));
				addLand(k, [ring, ...holes]);
				if(k === "water") S.water.push([ring, ...holes]);
			}
		}else if(e.type === "node"){
			const [x, y] = [(e.lon - lon0) * kx, (e.lat - lat0) * ky];
			if(!near(x, y)) continue;
			if(t.man_made === "flagpole") S.flags.push([r1(x), r1(y)]);
			else if(!conf.land && t.amenity === "place_of_worship" && t.name) S.mosques.push({ at: [r1(x), r1(y)], n: t["name:en"] || t.name });
			else if(conf.land && t.natural === "tree") S.trees.push([r1(x), r1(y)]);
		}
	}
	for(const [name, id] of Object.entries(conf.landmarkNodes || {})){
		const nd = els.find(e => e.type === "node" && e.id === id);
		if(!nd) continue;
		const x = (nd.lon - lon0) * kx, y = (nd.lat - lat0) * ky;
		let best = null, bd = 25;
		for(const b of S.buildings){
			if(b.m) continue;
			if(inside(b.p, x, y)){ best = b; break; }
			const [cx, cy] = centre(b.p), d = Math.hypot(cx - x, cy - y);
			if(d < bd){ bd = d; best = b; }
		}
		if(best) best.m = name;
	}
	for(const b of S.buildings) if(b.m && conf.markHeights && conf.markHeights[b.m]) b.h = conf.markHeights[b.m];
	for(const [x, y, h, w] of conf.towers || []){
		const r = w / 2;
		S.buildings.push({ p: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], h, k: "tower", est: 1 });
	}
	// Mosques come from the whole data for Jeddah (they're nodes); drop what's empty.
	for(const k of Object.keys(S)) if(Array.isArray(S[k]) && !S[k].length && !["coast", "water", "buildings", "parks", "sand", "roads", "flags", "piers", "mosques"].includes(k)) delete S[k];
	if(conf.land) S.town = conf.town;
	if(conf.fill) S.fill = conf.fill;
	// The lie of the land (data/dem/<venue>.json, from tools/fetch-dem.mjs): a grid of real ground
	// heights (metres above sea level, to 10 cm), its corner and spacing in metres east/north.
	const demFile = new URL(`../data/dem/${site}.json`, import.meta.url);
	if(conf.land && existsSync(demFile)){
		const d = JSON.parse(readFileSync(demFile, "utf8"));
		S.dem = { e0: +((d.west - lon0) * kx).toFixed(2), n0: +((d.south - lat0) * ky).toFixed(2), de: +(d.dlon * kx).toFixed(4), dn: +(d.dlat * ky).toFixed(4), nx: d.nx, ny: d.ny,
			h: d.h.map(v => Math.round(v * 10) / 10) };
	}
	const js = `// Generated by tools/build-places.mjs from data/osm. Don't edit by hand.
// The real surroundings of ${site}, in metres east/north of the circuit data's first point.
// Map data © OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright
export default ${JSON.stringify(S)};
`;
	writeFileSync(new URL(`../js/places/${site}.js`, import.meta.url), js);
	console.log(site + ":", Object.entries(S).map(([k, v]) => k + " " + (Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).join("/") : v)).join(", "), "->", (js.length / 1024).toFixed(0) + " KB");
}

function inside(ring, x, y){
	let r = false;
	for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
		const [xi, yi] = ring[i], [xj, yj] = ring[j];
		if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r;
	}
	return r;
}
