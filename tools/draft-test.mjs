// Measures what slipstream does: solo lap vs towed lap, and lead changes in a pack.
//   node tools/draft-test.mjs [trackId]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require(new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const { TRACKS } = await import("../js/tracks.js");
const { buildTrack } = await import("../js/trackgen.js");
const { makeTracker, raceProgress } = await import("../js/progress.js");
const { race } = await import("./sim-core.mjs");
const id = process.argv[2] || "daytona";
const def = TRACKS.find(t => t.id === id);
const track = buildTrack(def), tracker = makeTracker(track);
const f = x => x.toFixed(2);

for(const draft of [false, true]){
	const solo = race(track, tracker, ["hard"], 3, { draft });
	const pair = race(track, tracker, ["hard", "hard"], 3, { draft, seed: 3 });
	const pack = race(track, tracker, ["hard", "hard", "hard", "medium", "medium", "medium", "medium", "medium"], 5, { draft, seed: 9 });
	const lead = pack.cars.filter(c => c.finished).sort((a, b) => a.finished - b.finished);
	const spread = lead.length ? lead[lead.length - 1].finished - lead[0].finished : NaN;
	console.log(`${id} slipstream ${draft ? "ON " : "OFF"} | solo lap ${f(solo.cars[0].laps.at(-1))}s | pair: front ${f(pair.cars[0].laps.at(-1))}s, back ${f(pair.cars[1].laps.at(-1))}s, finish gap ${f(pair.cars[1].finished - pair.cars[0].finished)}s | 8-car: winner ${lead[0] && lead[0].bot.skill}, field spread ${f(spread)}s, lead changes ${pack.leadChanges ?? "?"}`);
}
