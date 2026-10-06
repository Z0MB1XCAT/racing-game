// The winner's celebration (js/podium.js) and its place in the garage. No browser: the canvas is a stand-in that draws nothing.
//   node tools/podium-test.mjs
import { PODIUM_STYLES, spawn, rate, startPodium } from "../js/podium.js";
import { PODIUMS, CATEGORIES, DEFAULT_LOOK, cleanLook, progress, isUnlocked } from "../js/cosmetics.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const seeded = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// The list the garage offers and the list the show can draw are the same.
ok(JSON.stringify(PODIUM_STYLES) === JSON.stringify(PODIUMS.map(p => p.id)), "the garage's podium styles are the ones the show can draw (" + PODIUM_STYLES.join(", ") + ")");
ok(CATEGORIES.some(c => c.id === "podium" && c.items === PODIUMS) && DEFAULT_LOOK.podium === "confetti", "it's a garage category, and the default look has the free Confetti");
ok(isUnlocked(PODIUMS[0], progress(null, {})) && PODIUMS.slice(1).every(p => !isUnlocked(p, progress(null, {}))), "a new driver has Confetti and nothing else");
ok(cleanLook({ podium: "fireworks" }, progress(null, {})).podium === "confetti" && cleanLook({ podium: "nope" }, progress(null, {})).podium === "confetti", "a style you haven't unlocked, or one that doesn't exist, falls back to Confetti");
ok(cleanLook({ podium: "flame" }, progress({ wins: 10 }, {})).podium === "flame", "and one you've earned is kept");

// Particles: every one is made of real numbers and starts where it should.
for(const style of PODIUM_STYLES){
	let bad = 0, kinds = new Set();
	for(const [w, h] of [[360, 640], [1280, 800], [2560, 1440]]){
		const rand = seeded(w + style.length);
		for(let i = 0; i < 300; i++){
			const p = spawn(style, w, h, (i * 37) % 360, rand, (i * 20) % 6500);
			kinds.add(p.kind);
			const nums = [p.x, p.y, p.vx, p.vy, p.g, p.drag, p.size, p.life, p.age];
			if(nums.some(n => !Number.isFinite(n)) || typeof p.color !== "string" || p.life <= 0 || p.size <= 0 || p.x < -20 || p.x > w + 20 || p.y < -h * 0.1 || p.y > h + 40) bad++;
		}
	}
	ok(bad === 0, style + ": 900 particles over three screen sizes, all finite and starting on or just off the screen (" + [...kinds].join(", ") + ")");
}
// Rockets burst while they're still on screen, whatever the screen's height.
let offscreen = 0;
for(const h of [320, 640, 800, 1200, 2000]){
	const rand = seeded(h);
	for(let i = 0; i < 200; i++){
		const p = spawn("fireworks", 1000, h, 200, rand), t = p.fuse;
		const y = p.y + p.vy * t + 0.5 * p.g * t * t;
		if(!(y > h * 0.1 && y < h * 0.7) || p.fuse >= p.life) offscreen++;
	}
}
ok(offscreen === 0, "a firework bursts in the upper part of the screen, before it runs out of life, on screens from 320 to 2000 px tall");
ok(spawn("fizz", 1000, 800, 200, seeded(1)).kind === "drop" || spawn("fizz", 1000, 800, 200, seeded(2)).kind === "bubble", "fizz sprays drops and floats bubbles");

// The show builds, plays and stops.
for(const style of PODIUM_STYLES){
	let total = 0;
	for(let t = 0; t < 8000; t += 16) total += rate(style, t) * 0.016;
	ok(rate(style, 0) > 0 && rate(style, 6500) === 0 && rate(style, 20000) === 0 && total > 5 && total < 2000, style + ": starts straight away, has stopped making more by 6.5 s, about " + Math.round(total) + " particles in all");
}
ok(rate("confetti", 100) > rate("confetti", 2000) && rate("confetti", 2000) > 0, "confetti opens with a burst, then a lighter shower");

// Drawing, against a canvas that draws nothing and a clock we move by hand.
const calls = { fill: 0 };
const ctxStub = new Proxy({}, { get: (_, k) => k === "fillRect" || k === "fill" ? () => calls.fill++ : () => ctxStub, set: () => true });   // (every call gives it back, so a gradient's addColorStop works)
const makeCanvas = () => ({ hidden: true, width: 0, height: 0, clientWidth: 1000, clientHeight: 700, getContext: () => ctxStub });
let clock = 0, queue = [];
Object.defineProperty(globalThis, "performance", { value: { now: () => clock }, configurable: true });
globalThis.window = { devicePixelRatio: 1 };
globalThis.innerWidth = 1000; globalThis.innerHeight = 700;
globalThis.requestAnimationFrame = f => queue.push(f);
globalThis.cancelAnimationFrame = () => { queue = []; };
const run = (canvas, style, ms, rand = seeded(5)) => {
	clock = 0; queue = []; calls.fill = 0;
	const show = startPodium(canvas, style, 200, { rand });
	let peak = 0;
	for(let t = 16; t <= ms && queue.length; t += 16){ clock = t; const f = queue.shift(); f(t); peak = Math.max(peak, show.count()); }
	return { show, peak, running: queue.length > 0 };
};
for(const style of PODIUM_STYLES){
	const c = makeCanvas(), r = run(c, style, 3000);
	const during = { hidden: c.hidden, drew: calls.fill > 0, running: r.running, peak: r.peak };
	const end = run(makeCanvas(), style, 12000);
	ok(!during.hidden && during.drew && during.running && during.peak > 0 && during.peak < 1200, style + ": shows and draws for the first three seconds (up to " + during.peak + " particles at once)");
	ok(!end.running, style + ": has stopped drawing by itself well inside 12 s");
}
const cc = makeCanvas(); const { show } = run(cc, "confetti", 1000);
show.stop();
ok(cc.hidden && queue.length === 0, "stop() hides the canvas and ends the loop");
show.stop();
ok(true, "and stopping twice is fine");
const nothing = [startPodium(null, "confetti", 200), startPodium(makeCanvas(), "nope", 200), startPodium(makeCanvas(), undefined, 200)];
ok(nothing.every(s => s && typeof s.stop === "function" && s.count() === 0), "no canvas or an unknown style: a quiet no-op, no error");
const still = makeCanvas();
globalThis.matchMedia = () => ({ matches: true });
const calm = startPodium(still, "confetti", 200);
ok(still.hidden && calm.count() === 0 && queue.length === 0, "someone who asked for less motion gets no show at all (and the canvas is never shown)");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\npodium-test: OK");
