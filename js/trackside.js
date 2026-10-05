// Life along the track, from the models in assets/ (the Kenney racing kit, CC0, see assets/models/kenney/):
// a marshal post with a flag and a few cones behind the barrier at the outside of each tight corner, flags
// along the roof of the pit building, and paddock tents behind the pits. All of it is extra: each kind is
// skipped if its models aren't loaded (or, for the Fast setting, aren't wanted: "min": "high" in the manifest),
// and everything is checked against the road and against what's already placed, like the rest of the scenery.
import { instantiate, hasModel } from "./assets.js";

const THREE = globalThis.THREE;
// The jack-o'-lanterns' faces: lit all the time, like a candle behind them.
const PUMPKIN_GLOW = THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial({ color: 0xffb02e }) : null;

// track, sp (the room-checker from scenery.js), c (the centreline), hw, n, G (ground height), group, rand,
// pitSide (+1 left / -1 right), garages (the pit garages' frames, from sp.at), quality ("low" | "high"),
// place (registers something as a view-blocker for the TV cameras).
export function buildTrackside({ track, sp, hw, G, group, rand, pitSide, garages, quality, season, place }){
	const out = { posts: 0, flags: 0, tents: 0, cones: 0, pumpkins: 0 };
	const can = name => hasModel(name, quality);
	const lists = new Map();
	const add = (name, x, z, y, ry, s) => { if(!lists.has(name)) lists.set(name, []); lists.get(name).push({ x, y, z, ry, s }); };

	// The tight corners, tightest first (for the marshal posts and, in October, the pumpkins).
	const corners = [];
	for(const k of track.kerbs){
		if(k.end - k.start < 8) continue;
		const apex = sp.wrap(Math.round((k.start + k.end) / 2)), bend = sp.bend(apex, 4);
		if(bend < 1 / 75) continue;
		corners.push({ apex, bend, side: k.side === 0 ? -1 : 1 });
	}
	corners.sort((a, b) => b.bend - a.bend);
	const dist = (i, j) => Math.min(Math.abs(i - j), sp.n - Math.abs(i - j));

	// ----- Marshal posts at the tight corners: on the outside, behind the barrier -----
	if(can("marshal-post-red") && can("marshal-post-green")){
		const used = [];
		let posts = 0;
		for(const k of corners){
			if(posts >= 14) break;
			if(Math.min(dist(k.apex, 0), 1e9) < 120 || used.some(j => dist(j, k.apex) < 110)) continue;
			const f = sp.at(k.apex + 3, k.side, hw + 3.6);
			if(!sp.boxClear(f.x, f.z, f.ry, 3, 3, 1) || !sp.free(f.x, f.z, 2.6, "marshal")) continue;
			used.push(k.apex);
			sp.take(f.x, f.z, 2.6, "marshal");
			const y = G(f.x, f.z);
			add(posts % 2 ? "marshal-post-green" : "marshal-post-red", f.x, f.z, y, f.ry, 3.6);
			out.posts++; posts++;
			// A flag beside it and three cones in a row in front.
			if(can("flag-red") && can("flag-green") && can("flag-checkers")){
				const [fx, fz] = f.local(1.9, 0.3);
				add(["flag-red", "flag-green", "flag-checkers"][posts % 3], fx, fz, G(fx, fz), f.ry + 0.4, 5);
				out.flags++;
			}
			if(can("cone")) for(let q = -1; q <= 1; q++){
				const [cx, cz] = f.local(q * 1.1 - 0.3, -1.6);
				if(sp.edge(cx, cz, 4) < 1.6) continue;
				add("cone", cx, cz, G(cx, cz), rand() * 6, 8);
				out.cones++;
			}
			place({ x: f.x, z: f.z, ry: f.ry, hw: 0.6, hd: 0.6, y0: 0, y1: 3.4 });
		}
	}

	// ----- Halloween: jack-o'-lanterns behind the barrier, a little group at the tight corners and some along the straights -----
	// (Only in October: js/season.js. They go where nothing else is, and face the road.)
	if(season && can("pumpkin")){
		const spots = corners.map(k => ({ i: sp.wrap(k.apex - 6), side: k.side }));
		for(let i = 60, side = 1; i < sp.n - 60; i += 70 + Math.floor(rand() * 40), side = -side) spots.push({ i, side });
		spots.push({ i: sp.wrap(26), side: pitSide }, { i: sp.wrap(26), side: -pitSide });         // beside the start line
		const used = [];
		for(const k of spots){
			if(out.pumpkins >= 90) break;
			if(used.some(u => dist(u, k.i) < 36)) continue;
			const f = sp.at(k.i, k.side, hw + 3.0);
			if(!sp.boxClear(f.x, f.z, f.ry, 5.4, 3.2, 1) || !sp.free(f.x, f.z, 3.2, "pumpkin")) continue;
			used.push(k.i);
			sp.take(f.x, f.z, 3.2, "pumpkin");
			// One big one, with two smaller beside it.
			let n = 0;
			for(const [lx, lz, s] of [[0, 0, 4.6], [-3.1, -0.8, 2.8], [2.9, -0.4, 3.4]]){
				const [px, pz] = f.local(lx, lz);
				if(sp.edge(px, pz, 4) < 1.4) continue;
				add("pumpkin", px, pz, G(px, pz), f.ry + (rand() - 0.5) * 0.7, s * (0.9 + rand() * 0.2));
				out.pumpkins++; n++;
			}
			if(n) place({ x: f.x, z: f.z, ry: f.ry, hw: 3.2, hd: 2.2, y0: 0, y1: 4.6 });
		}
	}

	// ----- Flags along the roof of the pit building -----
	const flags = ["flag-red", "flag-green", "flag-checkers", "flag-red"];
	if(garages.length > 3 && flags.every(can)){
		garages.forEach((f, k) => {
			if(k % 2) return;
			const [x, z] = f.local(0, -3.4);             // (the front edge of the hospitality floor, above the garages)
			add(flags[(k >> 1) % flags.length], x, z, G(x, z) + 8.4, f.ry, 5);
			out.flags++;
		});
	}

	// ----- Paddock tents behind the pit garages -----
	const tents = ["tent", "tent-closed", "tent-long"];
	if(garages.length > 3 && tents.every(can)){
		garages.forEach((f, k) => {
			if(k % 2 === 0 && k) return;
			const off = 11.5 + rand() * 2.5, [x, z] = f.local(0, -off);
			const name = tents[Math.floor(rand() * tents.length)], s = 5.4 + rand() * 1.4;
			if(!sp.boxClear(x, z, f.ry, s * 1.1, s * 1.1, 1.4) || !sp.free(x, z, s * 0.6, "paddock")) return;
			sp.take(x, z, s * 0.6, "paddock");
			add(name, x, z, G(x, z), f.ry + (rand() - 0.5) * 0.3, s);
			place({ x, z, ry: f.ry, hw: s * 0.5, hd: s * 0.5, y0: 0, y1: s * 0.7 });
			out.tents++;
		});
	}

	for(const [name, list] of lists){
		const g = instantiate(name, list, name === "pumpkin" && PUMPKIN_GLOW ? { quality, materials: { glow: PUMPKIN_GLOW } } : { quality });
		if(g) group.add(g);
	}
	out.at = Object.fromEntries(lists);       // (where everything went: for the tests and the screenshot tools)
	return out;
}
