// Track list.
//
// Circuit tracks are a closed loop of points (x = east, y = north), listed in race
// direction and starting on the start/finish line. js/trackgen.js smooths them,
// scales the loop to `length` world units, and turns the start straight to face
// +z so the original starting grid works unchanged.
//
// The five F1 tracks and Daytona use the real circuits (see js/circuits.js). Corners are still opened up
// where the original handling needs room (you can't brake). Remastered tracks have a new
// `key`, so their lap records start fresh.

import { CIRCUITS } from "./circuits.js";

// The original game's only track, unchanged (from jchabin/cars index.html).
export const CLASSIC_CODE = "1,5/0,7 0,7/-1,8 -1,8/-3,9 -3,9/-7,9 -7,9/-9,8 -9,8/-10,7 -10,7/-11,5 -6,7/-4,7 -4,7/-2,6 -2,6/-1,4 -6,7/-8,6 -8,6/-9,4 -1,4/-1,0 1,0/1,5 -11,5/-11,0 -11,0/-10,-1 -10,-1/-8,-1 -8,-1/-7,0 -7,0/-7,2 -9,3/-8,4 -8,4/-6,4 -6,4/-5,3 -5,3/-5,1 -9,1/-9,4 -5,3/-4,4 -4,4/-2,4 -2,4/-1,3 -7,0/-6,-1 -6,-1/-4,-1 -4,-1/-3,0 -3,0/-3,2 -1,0/-1,-2 -1,-2/0,-4 0,-4/2,-5 2,-5/4,-5 4,-5/6,-4 6,-4/7,-2 -3,0/-3,-3 -3,-3/-2,-5 -2,-5/-1,-6 -1,-6/1,-7 1,-7/5,-7 5,-7/7,-6 7,-6/8,-5 8,-5/9,-3 9,-3/9,2 9,2/8,4 8,4/6,5 6,5/4,5 4,5/2,4 2,4/1,2 7,-2/7,2 7,2/6,3 6,3/4,3 4,3/3,2 4,-3/2,-3 2,-3/1,-2 1,-2/1,0 4,-3/5,-2 5,-2/5,1 3,2/3,-1 |-1,3/1,3 6,-4/7,-6 |-7,5 -5,6 -4,5 2,6 1,8 3,9 4,6 3,7 -3,10 -4,12 -10,11 -12,8 -14,8 -12,6 -7,10 -12,2 -15,3 -13,-1 -10,-4 -8,-2 -6,-4 -4,-3 -11,-2 -8,-3 -4,-5 -3,-6 -5,-2 0,-8 -2,-8 -4,-8 -5,-6 -3,-10 2,-9 4,-8 5,-10 6,-8 10,-7 8,-7 9,-11 9,-5 15,-4 11,-2 11,-1 10,3 16,2 12,1 8,6 7,9 6,6 -8,-7 -13,-7 -13,-4 -15,-4 -17,0 |1,3,6/22 0,3,8/55 -2,3,9/77 -8,3,9/115 -10,3,8/148 -11,3,6/166 -8,3,4/-86 -7,3,4/-83 -6,3,4/-90 -10,3,-1/-83 -9,3,-1/-88 -8,3,-1/-90 -6,3,-1/-89 -5,3,-1/-89 -4,3,-1/-89 -4,3,4/-90 -3,3,4/-90 -2,3,4/265 -3,3,-4/194 -2,3,-6/218 0,3,-7/262 6,3,-7/-69 8,3,-6/-42 9,3,-4/-16 9,3,4/40 8,3,5/70 2,3,5/135 3,3,6/122|";

// Figure-8 built from two 270-degree loops joined by diagonal straights that cross in the middle.
function figureEight(c){
	const r = c / Math.SQRT2, pts = [];
	const leg = (x1, y1, x2, y2, n) => { for(let i = 0; i < n; i++) pts.push([x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]); };
	const arc = (cx, a0, a1, n) => { for(let i = 0; i < n; i++){ const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), r * Math.sin(a)]); } };
	const h = c / 2;
	// Start on the leg heading up-right, a little before the crossing.
	leg(-h * 0.55, -h * 0.55, h, h, 5);
	arc(c, Math.PI * 0.75, -Math.PI * 0.75, 9);   // right loop, clockwise
	leg(h, -h, -h, h, 7);
	arc(-c, Math.PI * 0.25, Math.PI * 1.75, 9);    // left loop, anticlockwise
	leg(-h, -h, -h * 0.55, -h * 0.55, 2);
	return pts;
}

// Before the 2026 remaster, Jeddah was traced from a diagram. The weekly challenge that was
// running when the new version arrived (2026-W39) keeps using it, with its old record key,
// so everyone that week races the same map.
export const LEGACY = {
	"2026-W39": {
		jeddah: {
			id: "jeddah", key: "jeddah", name: "Jeddah", place: "Saudi Arabia", kind: "gp", flag: "SA",
			blurb: "A night race on the seafront. Fast, blind and lined with walls.",
			realLength: "6.174 km", length: 1500, width: 13, laps: 2, theme: "jeddah",
			px: [[765, 140], [700, 190], [640, 235], [600, 262], [592, 285], [565, 300], [520, 315], [460, 340], [452, 372], [432, 395], [405, 400], [378, 400], [345, 420], [328, 442], [298, 458], [275, 450], [250, 445], [200, 448], [170, 455], [100, 482], [40, 510], [25, 540], [55, 568], [90, 556], [125, 522], [165, 512], [205, 515], [240, 508], [258, 518], [280, 528], [318, 525], [368, 495], [410, 458], [450, 438], [492, 405], [545, 355], [592, 335], [628, 322], [648, 302], [668, 282], [698, 268], [750, 265], [800, 252], [860, 210], [915, 120], [935, 55], [918, 38], [880, 55], [820, 100]]
		}
	}
};

export const TRACKS = [
	{
		id: "classic", name: "Classic", place: "The original", kind: "classic",
		blurb: "The track everyone learned on. Same walls, same trees.",
		code: CLASSIC_CODE, laps: 3, theme: "classic",
		// Tight corridors: bots look close ahead and steer hard to scrub speed.
		botTune: { look: 6, over: 1.2, gain: 6, hairpin: 0.25, analog: true }
	},
	{
		id: "monaco", key: "monaco-v3", layoutName: "GP", name: "Monaco", place: "Monte Carlo", kind: "gp", flag: "MC",
		blurb: "Up the hill to the Casino, down through the hairpin and the tunnel. Barriers everywhere.",
		realLength: "3.337 km", length: 1800, width: 10, laps: 3, theme: "monaco",
		// The Grand Hotel hairpin and the chicane after the tunnel keep their real tightness
		// (metres from the start line).
		tight: [[1130, 1250, 0.5], [1995, 2080, 4]].map(([a, b, room]) => [a / CIRCUITS.monaco.meters, b / CIRCUITS.monaco.meters, room]),
		// The harbour runs beside the track from the tunnel exit to La Rascasse (on the left).
		harbour: [1905 / CIRCUITS.monaco.meters, 2840 / CIRCUITS.monaco.meters],
		// The real circuit (js/circuits.js): centreline, elevation, the tunnel.
		pts: CIRCUITS.monaco.pts, elev: CIRCUITS.monaco.elev, camber: CIRCUITS.monaco.camber, tunnel: CIRCUITS.monaco.tunnel
	},
	{
		id: "spa", key: "spa-v2", layoutName: "GP", name: "Spa-Francorchamps", place: "Belgium", kind: "gp", flag: "BE",
		blurb: "Down to Eau Rouge, up Raidillon, the Kemmel straight and a long run through the forest.",
		realLength: "7.004 km", length: 1700, width: 14, laps: 2, theme: "spa",
		// The real circuit (js/circuits.js): centreline, elevation.
		pts: CIRCUITS.spa.pts, elev: CIRCUITS.spa.elev, camber: CIRCUITS.spa.camber
	},
	{
		id: "monza", key: "monza-v3", layoutName: "GP", name: "Monza", place: "Italy", kind: "gp", flag: "IT",
		blurb: "The Temple of Speed. Long straights, chicanes and the Parabolica.",
		realLength: "5.793 km", length: 2000, width: 12, laps: 2, theme: "monza",
		// The Rettifilo and Roggia chicanes keep their real tightness (metres from the start line).
		tight: [[570, 730, 1], [1780, 1930, 3]].map(([a, b, room]) => [a / CIRCUITS.monza.meters, b / CIRCUITS.monza.meters, room]),
		// The real GP circuit from OpenStreetMap (js/circuits.js): centreline, elevation, the Lesmos' camber.
		pts: CIRCUITS.monza.pts, elev: CIRCUITS.monza.elev, camber: CIRCUITS.monza.camber
	},
	{
		id: "suzuka", key: "suzuka-v2", layoutName: "GP", name: "Suzuka", place: "Japan", kind: "gp", flag: "JP",
		blurb: "The only figure-of-eight on the calendar: the back straight crosses the Degner run on a bridge.",
		realLength: "5.807 km", length: 1650, width: 13, laps: 2, theme: "suzuka",
		// The real circuit (js/circuits.js): centreline, elevation, the crossover bridge.
		pts: CIRCUITS.suzuka.pts, elev: CIRCUITS.suzuka.elev, camber: CIRCUITS.suzuka.camber, bridge: CIRCUITS.suzuka.bridge
	},
	{
		id: "jeddah", key: "jeddah-v2", layoutName: "GP", name: "Jeddah", place: "Saudi Arabia", kind: "gp", flag: "SA",
		blurb: "A night race on the seafront. Fast, blind and lined with walls.",
		realLength: "6.174 km", length: 1900, width: 13, laps: 2, theme: "jeddah",
		// The real circuit (js/circuits.js): centreline, elevation.
		pts: CIRCUITS.jeddah.pts, elev: CIRCUITS.jeddah.elev, camber: CIRCUITS.jeddah.camber
	},
	{
		id: "daytona", key: "daytona-v2", layoutName: "Oval", name: "Daytona", place: "Florida, USA", kind: "oval", flag: "US",
		blurb: "2.5-mile tri-oval, banked at 31 degrees in the turns. Stay in the pack and time your move.",
		realLength: "4.023 km", length: 1000, width: 18, laps: 4, theme: "daytona",
		// The real oval from OpenStreetMap (js/circuits.js), flat ground, and its banking:
		// 31 degrees in the turns, 18 through the tri-oval, 3 on the backstretch (looks only).
		pts: CIRCUITS.daytona.pts, elev: CIRCUITS.daytona.elev, camber: CIRCUITS.daytona.camber
	},
	{
		id: "figure8", name: "Crossroads", place: "Figure-8 speedway", kind: "fantasy",
		blurb: "Two loops, one flat crossing in the middle. Watch your left.",
		length: 620, width: 13, laps: 5, theme: "dusk",
		pts: figureEight(10)
	},
	{
		id: "glacier", name: "Glacier Pass", place: "Somewhere cold", kind: "fantasy",
		blurb: "Switchbacks up the mountain and a long sweeper back down.",
		length: 1250, width: 13, laps: 3, theme: "snow",
		pts: [
			[0, 0], [0, 3], [0.3, 4.6], [1.2, 5.3], [2.6, 5.4], [3.6, 6.0], [3.8, 7.0], [3.2, 7.6], [2.0, 7.6],
			[1.0, 8.0], [0.8, 9.0], [1.4, 9.7], [2.8, 9.8], [4.4, 9.8], [5.6, 9.4], [6.2, 8.4], [6.1, 7.0],
			[6.5, 5.8], [7.4, 5.2], [7.8, 4.2], [7.4, 3.2], [6.4, 2.9], [5.6, 3.4], [5.0, 3.1], [4.8, 2.0],
			[5.2, 0.8], [5.0, -0.4], [4.0, -1.2], [2.6, -1.5], [1.2, -1.4], [0.3, -0.9]
		]
	}
];

// Other layouts of the same venues. Each is a track of its own (its own key, records and lap limits),
// built like the main one from js/circuits.js (routed through OpenStreetMap, see
// tools/route-layouts.mjs). The track pickers show each venue once, with a Layout switch.
// layoutOf: the venue's main track (its theme and real surroundings are shared).
const layout = (id, venue, o) => Object.assign({ id, key: id, layoutOf: venue, kind: "gp",
	length: CIRCUITS[id].length, pts: CIRCUITS[id].pts, elev: CIRCUITS[id].elev, camber: CIRCUITS[id].camber, bridge: CIRCUITS[id].bridge }, o);
export const LAYOUTS = [
	layout("monaco-fe", "monaco", { name: "Monaco Formula E", layoutName: "Formula E", place: "Monte Carlo", flag: "MC",
		blurb: "Formula E's Monaco (2015-2019): Sainte-Devote, along the harbour to a hairpin, then Tabac, the pool and La Rascasse.",
		realLength: "1.765 km", width: 10, laps: 5, theme: "monaco",
		// The harbour beside the lap from the Nouvelle Chicane round Tabac and the pool to La Rascasse
		// (on the left).
		harbour: [0.31, 0.77] }),
	layout("spa-moto", "spa", { name: "Spa-Francorchamps Moto", layoutName: "Moto", place: "Belgium", flag: "BE",
		blurb: "The motorcycle layout: the full lap, with the old, faster Bus Stop at the end.",
		realLength: "6.985 km", width: 14, laps: 2, theme: "spa" }),
	layout("monza-oval", "monza", { name: "Monza Oval", layoutName: "Oval", place: "Italy", flag: "IT",
		blurb: "The 1955 high-speed ring on its own: two steep bankings joined by the main straight and the back straight.",
		realLength: "4.250 km", width: 12, laps: 3, theme: "monza" }),
	layout("monza-combined", "monza", { name: "Monza Road + Oval", layoutName: "Road + Oval", place: "Italy", flag: "IT",
		blurb: "The 10 km lap of 1955-61: the road course with no chicanes, then round the bankings. The main straight twice, side by side.",
		realLength: "10.000 km", width: 12, laps: 1, theme: "monza" }),
	layout("suzuka-moto", "suzuka", { name: "Suzuka Moto", layoutName: "Moto", place: "Japan", flag: "JP",
		blurb: "The full figure-of-eight with the motorcycle line through the final chicane.",
		realLength: "5.821 km", width: 13, laps: 2, theme: "suzuka" }),
	layout("suzuka-east", "suzuka", { name: "Suzuka East", layoutName: "East", place: "Japan", flag: "JP",
		blurb: "The first half: Turns 1 and 2, the Esses and Dunlop, then a link straight back to the pits.",
		realLength: "2.243 km", width: 13, laps: 4, theme: "suzuka" }),
	layout("suzuka-west", "suzuka", { name: "Suzuka West", layoutName: "West", place: "Japan", flag: "JP",
		blurb: "The second half: Degner, the hairpin, Spoon, 130R and the chicane, still over the crossover bridge.",
		realLength: "3.466 km", width: 12, laps: 3, theme: "suzuka" }),
	layout("suzuka-south", "suzuka", { name: "Suzuka South", layoutName: "South", place: "Japan", flag: "JP",
		blurb: "The little South Course beside the paddock: tight, twisty and short.",
		realLength: "1.264 km", width: 12, laps: 6, theme: "suzuka" }),
	layout("jeddah-fe", "jeddah", { name: "Jeddah Formula E", layoutName: "Formula E", place: "Saudi Arabia", flag: "SA",
		blurb: "Formula E's night race on the southern half of the Corniche, with chicanes on both long runs.",
		realLength: "3.001 km", width: 13, laps: 4, theme: "jeddah" }),
	layout("daytona-road", "daytona", { name: "Daytona Road Course", layoutName: "Road course", place: "Florida, USA", flag: "US", kind: "oval",
		blurb: "The Rolex 24 lap: the tri-oval, the infield, the Bus Stop chicane on the backstretch and the banking in Turns 3 and 4.",
		realLength: "5.729 km", width: 13, laps: 2, theme: "daytona" })
];

export function trackById(id){
	return TRACKS.find(t => t.id === id) || LAYOUTS.find(t => t.id === id);
}
// The main track of a track's venue (itself, for a main track or a track with no other layouts).
export function venueOf(id){
	const d = trackById(id);
	return (d && d.layoutOf) || id;
}
// Every layout of a track's venue, the main one first.
export function layoutsOf(id){
	const v = venueOf(id), main = trackById(v);
	return main ? [main, ...LAYOUTS.filter(l => l.layoutOf === v)] : [];
}
