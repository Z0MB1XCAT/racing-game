// Plays the adaptive quality controller (js/adaptive.js) against simulated computers and checks it
// settles where it should, doesn't flap, recovers, and ignores stalls. No browser needed.
//   node tools/adaptive-test.mjs
import { Adaptive } from "../js/adaptive.js";

let bad = 0;
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) bad++; };

// A computer: costs[step] is how long a frame takes to draw at each step (ms). The screen shows a frame at
// its refresh ticks, so a frame that misses one waits for the next (60 Hz: 16.7 ms, then 33.3 ms).
// The real ladder (js/gfx.js), for the tests that need to know what a step is.
import { LADDERS } from "../js/ladders.js";
function simulate({ costs, gpuCosts, hz = 60, seconds = 120, start = 0, noise = 0.06, changeAt = [], hitchEvery = 0, seed = 7, steps }){
	// costs[step]: the frame's cost in ms (the slower of the processor and the graphics chip); with gpuCosts, the chip's
	// own time is reported too (as the browser's timer would), and costs is the processor's.
	const a = new Adaptive(steps || costs.length, { start });
	let t = 0, step = a.step, rnd = seed, changes = 0, slowTime = 0, total = 0, hitches = 0, costScale = 1;
	const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
	const tick = 1000 / hz, trace = [];
	let nextHitch = hitchEvery ? hitchEvery * 1000 : Infinity;
	while(t < seconds * 1000){
		for(const [at, scale] of changeAt) if(t >= at * 1000 && costScale !== scale && t < at * 1000 + 50) costScale = scale;
		const jitter = 1 + (rand() - 0.5) * 2 * noise;
		const gpuMs = gpuCosts ? gpuCosts[step] * costScale * jitter : null;
		const cost = (gpuCosts ? Math.max(costs[step] * costScale, gpuMs) : costs[step] * costScale * jitter);
		let ms = Math.max(tick, Math.ceil(cost / tick) * tick);
		if(t >= nextHitch){ ms = 320; nextHitch += hitchEvery * 1000; hitches++; }
		t += ms; total += ms;
		if(ms > tick * 1.15 && ms < 250) slowTime += ms;
		const r = a.frame(ms, t, gpuMs);
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
console.log("the graphics chip can be timed (the browser says how long it took)");
{
	const ladder = LADDERS.high;
	// A chip that needs 26, 23, 21, 16, 13, 10, 7 ms at each step, with a processor that's never the limit.
	const gpu = [26, 23, 21, 16, 13, 10, 7], cpu = [5, 5, 5, 5, 5, 5, 5];
	const r = simulate({ costs: cpu, gpuCosts: gpu, steps: ladder, seconds: 120 });
	ok(r.step === 3 || r.step === 4, "settles on the first step that holds 60 (step " + r.step + ", 16 ms), no further down");
	ok(r.trace.length <= 6, "without flailing: " + r.trace.map(x => x.join(" ")).join(", "));
	// Plenty of room: it climbs on its own timing, without waiting out the long wait or making blind tries.
	const up = simulate({ costs: [5, 5, 5, 5, 5, 5, 5], gpuCosts: [9, 8, 7, 6, 5, 4, 3], steps: ladder, start: 5, seconds: 60 });
	ok(up.step === 0, "with lots of room it climbs to the best step in under a minute (step " + up.step + ")");
	ok(up.a.cpuBound === false, "and doesn't think it's held back by the processor");
}
console.log("held back by the processor (slow frames while the graphics chip is nearly idle)");
{
	const ladder = LADDERS.high;
	// The processor takes 30 ms at the best step; glow saves it 3, shadows 6. The chip never takes more than 6 ms.
	const cpu = [30, 30, 27, 27, 21, 21, 21], gpu = [6, 5.5, 5, 4.5, 4, 3.5, 3];
	const r = simulate({ costs: cpu, gpuCosts: gpu, steps: ladder, seconds: 90 });
	ok(r.step >= 2 && r.step <= 4, "it turns off the glow and shadows (which save the processor work), not just the sharpness: step " + r.step);
	ok(ladder[r.step].scale >= 0.75, "and leaves the picture sharp (sharpness " + Math.round(ladder[r.step].scale * 100) + "%), which wouldn't have helped");
	ok(r.a.cpuBound, "it knows the processor is the limit");
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
