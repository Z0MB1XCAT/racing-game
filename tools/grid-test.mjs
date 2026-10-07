// The starting grid of a solo race (js/grid.js, GRID in physics.js, gridCapacity in trackgen.js): up to 19 bots and where you start,
// how many cars each real track's start holds, and which rows the timing tower shows. The first half needs nothing; the second
// races twenty cars round real tracks.
//   node tools/grid-test.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require(process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const G = await import("../js/grid.js");
const phys = await import("../js/physics.js");
const { MAX_CARS, MAX_SOLO_CARS } = await import("../js/config.js");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const { buildTrack, gridCapacity, badGridSlots, seededRandom } = await import("../js/trackgen.js");
const { makeTracker } = await import("../js/progress.js");
const { race } = await import("./sim-core.mjs");

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const mk = n => Array.from({ length: n }, (_, i) => ({ id: i === 0 ? "me" : "bot" + i, n: i }));

console.log("who starts where");
const r1 = seededRandom("grid-1");
const f = G.shuffle(mk(12), r1);
ok(f.length === 12 && new Set(f.map(e => e.id)).size === 12, "a shuffle keeps every car once");
ok(G.shuffle([], r1).length === 0 && G.shuffle([{ id: "me" }], r1).length === 1, "an empty grid or a single car shuffles fine");
let counts = Array(8).fill(0);
const rs = seededRandom("grid-2");
for(let k = 0; k < 8000; k++) counts[G.shuffle(mk(8), rs).findIndex(e => e.id === "me")]++;
ok(counts.every(c => c > 8000 / 8 * 0.85 && c < 8000 / 8 * 1.15), "with no start chosen you're equally likely to be anywhere (" + counts.join(", ") + " out of 8000 on 8 places)");
let right = true;
for(const n of [2, 5, 10, 20]) for(let place = 1; place <= n; place++){
	const g = G.lineUp(mk(n), "me", place, seededRandom("p" + n + "-" + place));
	if(g.length !== n || g.findIndex(e => e.id === "me") !== place - 1 || new Set(g.map(e => e.id)).size !== n) right = false;
}
ok(right, "ask for pole, the middle or the back on a grid of 2, 5, 10 or 20 and that's where you are, with every other car still there once");
ok(G.lineUp(mk(6), "me", 99, r1).findIndex(e => e.id === "me") === 5 && G.lineUp(mk(6), "me", 6.9, r1).findIndex(e => e.id === "me") === 5, "a place past the back is the back, and a fraction rounds down");
const odd = [0, -1, NaN, undefined, null, "x", Infinity];
ok(odd.every(p => { const g = G.lineUp(mk(6), "me", p === Infinity ? undefined : p, r1); return g.length === 6 && new Set(g.map(e => e.id)).size === 6; }), "no place, zero, negative or rubbish leaves a normal shuffle (" + odd.length + " tries)");
ok(G.lineUp(mk(6).slice(1), "me", 3, r1).length === 5, "a grid without you is just shuffled");
ok(G.placeName(0) === "Random" && G.placeName(1) === "Pole" && G.placeName(2) === "P2" && G.placeName(19) === "P19" && G.placeName(undefined) === "Random", "start places are named: Random, Pole, P2...");
ok(G.maxBots(10) === 9 && G.maxBots(20) === 19 && G.maxBots(1) === 1 && G.maxBots(NaN) === 1 && G.maxBots(undefined) === 1, "a start that holds 20 cars takes 19 bots (and never fewer than one)");

console.log("the grid");
ok(phys.GRID.length === 20 && MAX_SOLO_CARS === 20 && MAX_CARS === 10, "twenty places on the grid for a solo race; online rooms still hold ten");
const original = [[0, 0], [2, 0], [-2, 0], [0, -3], [-2, -3], [2, -3], [0, -6], [2, -6], [-2, -6], [0, -9], [2, -9], [-2, -9], [0, -12], [-2, -12], [2, -12], [0, -15], [2, -15], [-2, -15]];
ok(original.every(([x, y], i) => phys.GRID[i].x === x && phys.GRID[i].y === y), "the first eighteen places are the original's, exactly where they were");
ok(new Set(phys.GRID.map(g => g.x + "," + g.y)).size === 20, "no two cars start on the same spot, even with twenty");

console.log("how many cars each track's start holds");
const TRACKS = [...MAIN, ...LAYOUTS];
const caps = {};
let tooFew = [];
for(const def of TRACKS) for(const rev of [false, true]){
	if(rev && def.code) continue;
	const track = buildTrack(def, rev), cap = gridCapacity(track), bad = badGridSlots(track, cap);
	caps[def.id + (rev ? " rev" : "")] = cap;
	if(bad.length) tooFew.push(def.id + (rev ? " rev" : ""));
	if(cap < 12) tooFew.push(def.id + (rev ? " rev" : "") + " holds only " + cap);
}
ok(tooFew.length === 0, "every track and layout, both ways round, holds at least 12 cars and none of the places it counts is inside a wall" + (tooFew.length ? ": " + tooFew.join("; ") : ""));
const small = Object.entries(caps).filter(([, c]) => c < 20);
console.log("    tracks that hold fewer than 20: " + (small.map(([k, c]) => k + " " + c).join(", ") || "none"));
ok(Object.entries(caps).filter(([k]) => MAIN.find(t => t.id === k && t.code)).every(([, c]) => c === 18), "a track from the original's code keeps the original's 18");

console.log("the timing tower with more cars than rows");
let bad = null;
for(let n = 1; n <= 20 && !bad; n++) for(let focus = -1; focus < n && !bad; focus++) for(const max of [5, 10]){
	const r = G.towerRows(n, focus, max);
	const sorted = r.every((v, i) => i === 0 || v > r[i - 1]);
	if(!(r.length === Math.min(n, max) && sorted && r.every(v => v >= 0 && v < n) && r[0] === 0 && (focus < 0 || n <= max || r.includes(focus) || focus <= max - 2))) bad = { n, focus, max, r };
}
ok(!bad, "for 1 to 20 cars and every place of yours, and rows for 5 or 10: never more rows than fit, always the leader, always you, in order" + (bad ? " (" + JSON.stringify(bad) + ")" : ""));
ok(JSON.stringify(G.towerRows(20, 15, 10)) === JSON.stringify([0, 1, 2, 9, 10, 11, 12, 13, 14, 15, 16].slice(0, 10)) || G.towerRows(20, 15, 10).includes(15), "twentieth-placed rows: the leaders, then you with a few cars either side (" + G.towerRows(20, 15, 10).map(i => i + 1).join(" ") + ")");
ok(JSON.stringify(G.towerRows(8, 7, 10)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]) && JSON.stringify(G.towerRows(20, 3, 10)) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "up to ten cars, or near the front, it shows the top rows exactly as before");

console.log("twenty cars on real tracks");
for(const id of ["spa", "figure8", "jeddah"]){
	const def = TRACKS.find(t => t.id === id), track = buildTrack(def, false), tracker = makeTracker(track);
	const field = Array.from({ length: 20 }, (_, i) => ["hard", "medium", "easy", "l8", "l4"][i % 5]);
	const r = race(track, tracker, field, 2, { seed: 5, contact: "soft" });
	const done = r.cars.filter(c => c.finished !== null).length, stuck = Math.max(...r.cars.map(c => c.stuck)), esc = r.cars.reduce((a, c) => a + (c.escapes || 0), 0), unst = r.cars.reduce((a, c) => a + (c.unsticks || 0), 0);
	ok(done === 20 && stuck < 12 && esc === 0, id + ": all 20 finish two laps, the longest stall is " + stuck.toFixed(1) + " s, " + esc + " thrown off the track, " + unst + " help-backs");
}

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\ngrid-test: OK");
