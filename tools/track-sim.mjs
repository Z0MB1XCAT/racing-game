// Drives bots round every track with the real physics and reports lap times,
// wall hits and anything that gets stuck.
//   node tools/track-sim.mjs [trackId] [--rev] [--tune]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require(process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const THREE = globalThis.THREE;
const { TRACKS } = await import("../js/tracks.js");
const { buildTrack, badGridSlots, seededRandom, tuning } = await import("../js/trackgen.js");
const phys = await import("../js/physics.js");
const { makeTracker, raceProgress } = await import("../js/progress.js");
const { Bot } = await import("../js/bots.js");

const args = process.argv.slice(2);
const only = args.find(a => !a.startsWith("--"));
const tolArg = args.find(a => a.startsWith("--tol=")); if(tolArg) tuning.WALL_TOL = parseFloat(tolArg.slice(6));
const rev = args.includes("--rev");

const { race } = await import("./sim-core.mjs");

const fmt = s => s.toFixed(1);
let problems = 0;
for(const def of TRACKS.filter(t => !only || t.id === only)){
	const track = buildTrack(def, rev);
	const tracker = makeTracker(track);
	const bad = badGridSlots(track, 12);
	if(bad.length){ problems++; console.log(`${def.id}: grid slots in walls: ${bad}`); }
	if(!track.center && !tracker.field){ problems++; console.log(`${def.id}: no nav field`); }

	if(args.includes("--tune")){
		let best = null;
		for(const look of [14, 17, 20, 24]) for(const over of [0.6, 1.0, 1.4]) for(const gain of [2.5, 3.5, 5]){
			const r = race(track, tracker, ["hard"], 2, { overrides: { look, over, gain } });
			const c = r.cars[0];
			const score = c.finished ?? 1e9;
			if(!best || score < best.score) best = { score, look, over, gain, laps: c.laps.map(fmt), hits: c.hits };
		}
		console.log(def.id, JSON.stringify(best));
		continue;
	}

	const solo = race(track, tracker, ["hard"], 3);
	const s = solo.cars[0];
	const field = ["hard", "hard", "medium", "medium", "medium", "easy", "easy", "easy"];
	const pack = race(track, tracker, field, def.laps || 3, { seed: 7 });
	const done = pack.cars.filter(c => c.finished !== null).length;
	const worstStuck = Math.max(...pack.cars.map(c => c.stuck));
	const oob = pack.cars.reduce((a, c) => a + c.oob, 0) + s.oob;
	const esc = pack.cars.reduce((a, c) => a + (c.escapes || 0), 0), soloEsc = s.escapes || 0, unst = pack.cars.reduce((a, c) => a + (c.unsticks || 0), 0);
	const line = `${def.id.padEnd(8)} ace laps ${s.laps.map(fmt).join(" / ").padEnd(20)} hits/lap ${(s.hits / Math.max(1, s.laps.length + 1)).toFixed(1).padStart(4)}` +
		` | 8-car race: ${done}/8 finished, winner ${pack.cars.filter(c => c.finished).map(c => c.finished).sort((a, b) => a - b).map(fmt)[0] ?? "-"}s,` +
		` last ${fmt(Math.max(...pack.cars.map(c => c.finished ?? pack.t)))}s, stall ${fmt(worstStuck)}s, escapes solo ${soloEsc} pack ${esc}, unsticks ${unst}${oob ? ", OOB " + oob : ""}${track.pinches && track.pinches.length ? ", PINCH x" + track.pinches.length : ""}`;
	if(s.finished === null || done < 8 || soloEsc > 0) problems++;
	console.log(line);
}
if(problems) { console.log(`\n${problems} problem(s)`); process.exitCode = 1; }
