// Downloads the real surroundings of a circuit from OpenStreetMap (Overpass API) into
// data/osm/<venue>.json, for tools/build-places.mjs. One query per kind of thing (the public
// servers time out on one big query), merged into one file.
//   node tools/fetch-osm.mjs [venue ...]        (venues: monaco, spa, monza, suzuka)
// Map data © OpenStreetMap contributors, ODbL.
import { writeFileSync } from "node:fs";

// South, west, north, east: the circuit plus about a kilometre and a half round it.
export const BOXES = {
	monaco: [43.7235, 7.4050, 43.7520, 7.4420],
	spa: [50.4180, 5.9400, 50.4560, 5.9980],
	monza: [45.6000, 9.2650, 45.6420, 9.3120],
	suzuka: [34.8300, 136.5080, 34.8580, 136.5560]
};
const PARTS = [
	'way["building"];relation["building"];',
	'way["building:part"];',
	'way["landuse"];relation["landuse"];',
	'way["natural"];relation["natural"~"wood|water|scrub|grassland|beach|bare_rock"];',
	'way["leisure"];relation["leisure"];',
	'way["water"];relation["water"];way["waterway"~"river|stream|canal"];',
	'way["amenity"~"^(parking|fuel)$"];',
	'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|pedestrian)(_link)?$"];',
	'way["railway"~"^(rail|light_rail|monorail|narrow_gauge)$"];',
	'way["man_made"];way["tourism"];way["attraction"];',
	'node["attraction"];node["man_made"];node["natural"="tree"];node["tourism"];'
];
const SERVERS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"];

async function query(q){
	for(let attempt = 0; attempt < 6; attempt++){
		const url = SERVERS[attempt % SERVERS.length];
		try{
			const r = await fetch(url, { method: "POST", headers: { "User-Agent": "racing-game-scenery/1.0", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
			const text = await r.text();
			if(r.ok && text.trimStart().startsWith("{")) return JSON.parse(text).elements;
			console.log("  retry (" + r.status + ")");
		}catch(e){ console.log("  retry (" + e.message + ")"); }
		await new Promise(res => setTimeout(res, 4000 * (attempt + 1)));
	}
	throw new Error("Overpass failed: " + q.slice(0, 80));
}

// Only what tools/build-places.mjs uses, to keep the files small: these tags, and positions to
// about 10 cm.
const TAGS = /^(building|building:levels|building:colour|building:part|height|min_height|roof:colour|roof:shape|layer|location|name|name:en|landuse|natural|leisure|amenity|highway|railway|man_made|tourism|attraction|water|waterway|grandstand|tunnel|bridge|covered|sport|area|historic|parking|leaf_type)$/;
const r6 = v => Math.round(v * 1e6) / 1e6;
function slim(e){
	const o = { type: e.type, id: e.id };
	if(e.tags){ o.tags = {}; for(const [k, v] of Object.entries(e.tags)) if(TAGS.test(k)) o.tags[k] = v; }
	if(e.type === "node"){ o.lat = r6(e.lat); o.lon = r6(e.lon); }
	if(e.geometry) o.geometry = e.geometry.map(p => p && { lat: r6(p.lat), lon: r6(p.lon) });
	if(e.members) o.members = e.members.filter(m => m.geometry && m.type === "way").map(m => ({ role: m.role, geometry: m.geometry.map(p => p && { lat: r6(p.lat), lon: r6(p.lon) }) }));
	return o;
}
export { slim };

const venues = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOXES);
if(!process.env.OSM_NO_FETCH) for(const v of venues){
	const bb = BOXES[v].join(","), seen = new Set(), elements = [];
	for(const part of PARTS){
		const q = `[out:json][timeout:170];(${part.replace(/;/g, `(${bb});`)});out geom;`;   // ("out geom", not "out geom tags": that leaves out relations' members)
		const els = await query(q);
		let added = 0;
		for(const e of els){ const k = e.type + e.id; if(seen.has(k)) continue; seen.add(k); elements.push(slim(e)); added++; }
		console.log(v, part.slice(0, 40).padEnd(40), added);
	}
	writeFileSync(new URL(`../data/osm/${v}.json`, import.meta.url), JSON.stringify({ elements }));
	console.log(v, "->", elements.length, "elements");
}
