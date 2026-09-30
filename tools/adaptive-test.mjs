// Plays the adaptive quality controller (js/adaptive.js) against simulated computers and checks it
// settles where it should, doesn't flap, recovers, and ignores stalls. No browser needed.
//   node tools/adaptive-test.mjs
import { Adaptive } from "../js/adaptive.js";

let bad = 0;
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) bad++; };

// A computer: costs[step] is how long a frame takes to draw at each step (ms). The screen shows a frame at
// its refresh ticks, so a frame that misses one waits for the next (60 Hz: 16.7 ms, then 33.3 ms).
function simulate({ costs, hz = 60, seconds = 120, start = 0, noise = 0.06, changeAt = [], hitchEvery = 0, seed = 7 }){
	const a = new Adaptive(costs.length, { start });
	let t = 0, step = a.step, rnd = seed, changes = 0, slowTime = 0, total = 0, hitches = 0, costScale = 1;
	const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
	const tick = 1000 / hz, trace = [];
	let nextHitch = hitchEvery ? hitchEvery * 1000 : Infinity;
	while(t < seconds * 1000){
		for(const [at, scale] of changeAt) if(t >= at * 1000 && costScale !== scale && t < at * 1000 + 50) costScale = scale;
		const cost = costs[step] * costScale * (1 + (rand() - 0.5) * 2 * noise);
		let ms = Math.max(tick, Math.ceil(cost / tick) * tick);
		if(t >= nextHitch){ ms = 320; nextHitch += hitchEvery * 1000; hitches++; }
		t += ms; total += ms;
		if(ms > tick * 1.15 && ms < 250) slowTime += ms;
		const r = a.frame(ms, t);
		if(r){ step = r.to; changes++; trace.push([Math.round(t / 1000), r.from + ">" + r.to]); }
	}
	return { step, changes, slowShare: slowTime / total, trace, a, hitches };
}

console.log("a strong computer (9 ms a frame at the best step)");
{
	const r = simulate({ costs: [9, 8, 7, 6, 5, 4, 3] });
	ok(r.step === 0 && r.changes === 0, "stays at the best step, no changes");
}
console.log("a weak computer (40 ms at the best step; 13 ms is the first step that holds 60)");
{
	const r = simulate({ costs: [40, 30, 26, 20, 17, 13, 9], seconds: 300 });
	ok(r.step === 5, "settles on step 5 (got " + r.step + ")");
	ok(r.slowShare < 0.12, "spends under 12% of the time slow (" + (r.slowShare * 100).toFixed(1) + "%), tries included");
	ok(r.changes <= 12, "doesn't flap: " + r.changes + " changes in 5 minutes (" + r.trace.map(x => x.join(" ")).join(", ") + ")");
	ok(r.trace[0][0] <= 5, "gets off the worst step within 5 s (first change at " + r.trace[0][0] + " s)");
}
console.log("a computer that's far too slow at first (100 ms a frame)");
{
	const r = simulate({ costs: [100, 70, 45, 30, 22, 16, 11], seconds: 90 });
	ok(r.step >= 5, "gets to a step that holds 60 (" + r.step + ")");
	ok(r.trace.length && r.trace[0][0] <= 3, "and quickly: first move at " + (r.trace[0] || ["none"])[0] + " s");
	ok(r.trace.length <= 8, "without a fuss: " + r.trace.length + " moves");
}
console.log("a computer that speeds up (a busy stretch of track ends: costs halve at 100 s)");
{
	const r = simulate({ costs: [40, 30, 26, 20, 17, 13, 9], seconds: 400, changeAt: [[100, 0.5]] });
	ok(r.step <= 3, "climbs back up (ends on step " + r.step + ")");
}
console.log("a faster screen with time to spare (144 Hz)");
{
	const up = simulate({ costs: [9, 8, 7, 6, 5, 4, 3], hz: 144, start: 4, seconds: 60 });
	ok(up.step === 0, "climbs to the best step quickly (step " + up.step + " after 60 s)");
	const r = simulate({ costs: [20, 14, 11, 9, 7, 5, 4], hz: 144, seconds: 200 });
	ok(r.step >= 1 && r.step <= 2, "a 144 Hz screen with a 20 ms step 0 settles on step " + r.step);
}
console.log("stalls are ignored (a 320 ms frame every 10 s, e.g. switching tabs)");
{
	const r = simulate({ costs: [9, 8, 7, 6, 5, 4, 3], hitchEvery: 10, seconds: 120 });
	ok(r.step === 0 && r.changes === 0, "a strong computer isn't marked down for them (" + r.hitches + " stalls, " + r.changes + " changes)");
	ok(r.a.stalls === r.hitches, "they're counted (" + r.a.stalls + ")");
}
console.log("a stall on request (a track being built)");
{
	const a = new Adaptive(4);
	let t = 0, changed = false;
	a.stall(t, 3000);
	for(let i = 0; i < 100; i++){ t += 120; if(a.frame(120, t)) changed = true; }   // (slow frames, but inside the hold)
	ok(!changed || t > 3000, "frames inside the hold aren't measured");
}
console.log("a computer that crawls (every frame over 250 ms, like a few frames a second)");
{
	const r = simulate({ costs: [2000, 1200, 700, 400, 200, 70, 30], seconds: 120 });
	ok(r.step >= 5, "it isn't taken for stalls: it steps down to step " + r.step + " (first move at " + (r.trace[0] || ["never"])[0] + " s)");
	ok(r.trace.length && r.trace[0][0] <= 10, "and sooner than 10 s");
}
console.log("a hopeless computer (slow even at the cheapest step)");
{
	const r = simulate({ costs: [80, 60, 50, 40, 35, 30, 25], seconds: 60 });
	ok(r.step === 6 && r.a.floorSlow > 20, "ends on the cheapest step and knows it's still slow (" + r.a.floorSlow.toFixed(0) + " s)");
}
if(bad){ console.log("\n" + bad + " failed"); process.exit(1); }
console.log("\nadaptive quality ok");
