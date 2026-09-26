// Compares the original car-to-car collision with the soft one.
//   node tools/contact-test.mjs [trackId]
// 1) Two cars side by side, one drifting into the other: how far the hit car gets knocked sideways.
// 2) A rear-end tap: speed of both cars afterwards.
// 3) An 8-bot pack race: rescues, wall hits and finishing spread.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require(new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const THREE = globalThis.THREE;
const phys = await import("../js/physics.js");
const { TRACKS } = await import("../js/tracks.js");
const { buildTrack } = await import("../js/trackgen.js");
const { makeTracker } = await import("../js/progress.js");
const { race } = await import("./sim-core.mjs");
const f = x => x.toFixed(3);

function pair(a, b, contact, frames = 90){
	const cars = [a, b].map(s => ({ data: Object.assign({ steer: 0, checkpoint: 1, lap: 0 }, s), pos: new THREE.Vector3(s.x, 0.6, s.y) }));
	for(let i = 0; i < frames; i++) phys.stepCars(cars, [], [], 1e9, 1, null, contact);
	return cars.map(c => c.data);
}
const v = 0.35; // near top speed
for(const contact of [undefined, "soft"]){
	const name = contact ? "soft    " : "original";
	// Side hit: B on the right moves left into A at 0.06 a frame (a firm swerve).
	const side = pair({ x: 0, y: 0, xv: 0, yv: v, dir: 0 }, { x: 2.1, y: 0, xv: -0.06, yv: v, dir: 0 }, contact, 30);
	// Rear-end: A is 5% faster and 3 units behind B.
	const rear = pair({ x: 0, y: -3, xv: 0, yv: v * 1.05, dir: 0 }, { x: 0, y: 0, xv: 0, yv: v, dir: 0 }, contact);
	console.log(`${name} | side hit: A thrown sideways at ${f(-side[0].xv)}/frame, B bounces back at ${f(side[1].xv)}/frame | rear tap: A speed ${f(Math.hypot(rear[0].xv, rear[0].yv))}, B speed ${f(Math.hypot(rear[1].xv, rear[1].yv))}`);
}

const id = process.argv[2] || "monaco";
const def = TRACKS.find(t => t.id === id);
const track = buildTrack(def), tracker = makeTracker(track);
for(const contact of [undefined, "soft"]){
	const r = race(track, tracker, ["hard", "hard", "hard", "medium", "medium", "medium", "medium", "easy"], 3, { draft: true, seed: 4, contact });
	const sum = k => r.cars.reduce((a, c) => a + (c[k] || 0), 0);
	const fin = r.cars.map(c => c.finished).filter(x => x !== null);
	console.log(`${id} ${contact || "original"}: finished ${fin.length}/8 in ${f(Math.max(...fin))}s, contacts ${sum("contacts")}, wall hits ${sum("hits")}, rescues ${sum("escapes") + sum("unsticks")}`);
}
