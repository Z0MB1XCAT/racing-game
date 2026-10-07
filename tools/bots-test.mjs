// The computer drivers (js/bots.js): ten levels that include the old three exactly, a personality for each name, and bots that
// keep within about a second of you. The first half needs no browser at all; the second drives bots round real tracks.
//   node tools/bots-test.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE = require(process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const B = await import("../js/bots.js");
const { BOT_NAMES } = await import("../js/voicelines.js");
const { TRACKS: MAIN, LAYOUTS } = await import("../js/tracks.js");
const { buildTrack } = await import("../js/trackgen.js");
const { makeTracker, raceProgress } = await import("../js/progress.js");
const { race } = await import("./sim-core.mjs");

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const rand = () => 0.5;
const same = (a, b) => Object.keys(b).every(k => a[k] === b[k]);

// ---------- the ladder ----------
console.log("ten levels");
ok(B.LEVELS === 10 && B.LEVEL_NAMES.length === 10 && new Set(B.LEVEL_NAMES).size === 10, "ten levels, each with its own name (" + B.LEVEL_NAMES.join(", ") + ")");
ok(B.levelName(3) === "Rookie" && B.levelName(6) === "Racer" && B.levelName(10) === "Ace", "level 3 is Rookie, 6 is Racer and 10 is Ace");
let roundTrip = true;
for(let n = 1; n <= 10; n++) if(B.skillLevel(B.levelId(n)) !== n) roundTrip = false;
ok(roundTrip && B.levelId(3) === "easy" && B.levelId(6) === "medium" && B.levelId(10) === "hard" && B.levelId(7) === "l7", "a level saves as a setting and comes back the same; 3, 6 and 10 keep their old names so older versions in a room understand them");
const junk = ["", "nope", "L5", "l", "lx", "l-3", "l1.5", "__proto__", "constructor", null, undefined, 7, {}, "l 5"];
ok(junk.every(j => B.skillLevel(j) === 6), "anything that isn't a level is Racer (" + junk.length + " tries)");
ok(B.skillLevel("l0") === 1 && B.skillLevel("l11") === 10 && B.skillLevel("l99") === 10, "levels outside 1 to 10 are held to the ends");
for(const [n, key] of [[3, "easy"], [6, "medium"], [10, "hard"]]){
	const p = B.levelParams(n), s = B.SKILLS[key];
	ok(["lookK", "overK", "gainK", "react", "wobble", "lane", "digital", "draft"].every(k => p[k] === s[k]), "level " + n + " has exactly the old " + s.label + " numbers");
}
let mono = true;
for(let n = 1; n < 10; n += 0.25){
	const a = B.levelParams(n), b = B.levelParams(n + 0.25);
	if(b.lookK < a.lookK - 1e-9 || b.overK < a.overK - 1e-9 || b.gainK < a.gainK - 1e-9 || b.react > a.react + 1e-9 || b.wobble > a.wobble + 1e-9 || b.lane > a.lane + 1e-9) mono = false;
}
ok(mono, "every step up the ladder (even in between levels) looks further ahead, reacts quicker and wobbles less");
const finite = [0, 0.4, 1, 5.5, 10, 12, -3, NaN].every(n => { const p = B.levelParams(n); return ["lookK", "overK", "gainK", "react", "wobble", "lane"].every(k => Number.isFinite(p[k])); });
ok(finite, "any number given as a level gives real numbers (past the ends it is held there, NaN included)");
// The old three, untouched: same numbers as before this update.
const old = { easy: { look: 19 * 0.8, over: 1.2 * 0.6, gain: 3.4 * 0.7, digital: true }, medium: { look: 19 * 0.9, over: 1.2 * 0.85, gain: 3.4 * 0.9, digital: true }, hard: { look: 19, over: 1.2, gain: 3.4, digital: false } };
ok(Object.entries(old).every(([k, v]) => same(new B.Bot(k, rand).p, v)), "a Rookie, Racer or Ace with no personality drives on exactly the old numbers");

// ---------- names and personalities ----------
console.log("names and personalities");
const names = B.BOT_ROSTER.map(r => r.name);
ok(names.length === 20 && new Set(names).size === 20, "twenty different bot names, enough for 19 bots and you");
ok(BOT_NAMES.every((n, i) => names[i] === n), "the first eleven are the names the commentary already has clips for, in the same order");
ok(B.BOT_ROSTER.every(r => B.PERSONAS[r.persona]) && Object.keys(B.PERSONAS).every(id => B.BOT_ROSTER.filter(r => r.persona === id).length >= 3), "every name has a real personality and every personality has at least three names");
ok(B.personaOf("Lockup Leo") === "bold" && B.personaOf("Drift Dana") === "wet" && B.personaOf("A Human") === null && B.personaOf("__proto__") === null && B.personaOf(undefined) === null, "a name always gives the same personality; people's names, odd names and nothing give none");
ok(Object.values(B.PERSONAS).every(p => p.label && p.blurb), "each personality has a label and a plain description for the menus");
const wet = new B.Bot("l5", rand, null, "wet");
const dry = wet.effective;
wet.setConditions(true, 1);
ok(Math.abs(dry - 4) < 1e-9 && Math.abs(wet.effective - 7) < 1e-9, "the wet-weather specialist drives a level down in the dry (" + dry + ") and two up in the wet (" + wet.effective + ")");
const late = new B.Bot("l5", rand, null, "late");
const l1 = late.effective; late.setConditions(false, 4); const l4 = late.effective; late.setConditions(false, 30);
ok(Math.abs(l1 - 3.5) < 1e-9 && l4 > l1 + 2 && late.effective <= 6.5 + 1e-9, "the late charger starts a level and a half down, gets better every lap and stops improving (" + l1 + " > " + l4 + " > " + late.effective + ")");
ok(new B.Bot("l5", rand, null, "careful").effective === 4.5 && new B.Bot("l5", rand, null, "bold").effective === 5 && new B.Bot("l5", rand, null, "slip").effective === 5, "careful is half a level down; bold and slipstreamer stay at their level");
ok(new B.Bot("l5", rand, null, "bold").p.wobble > new B.Bot("l5", rand).p.wobble, "bold bots wobble more than the same level without a personality");
ok(new B.Bot("easy", rand, null, "slip").p.draft === true && new B.Bot("easy", rand).p.draft === false, "a slipstreamer uses the tow even at the lowest levels");
ok(new B.Bot("l5", rand, null, "no-such-personality").effective === 5 && new B.Bot("l5", rand, null, "__proto__").effective === 5, "an unknown personality is no personality");

// ---------- adaptive ----------
console.log("adaptive bots");
const step = (gap, level = 6, base = 6, dt = 1) => B.adaptLevel({ level, base, gap, dt });
ok(step(3) < 6 && step(-3) > 6, "a bot 3 seconds ahead slows down a little; one 3 seconds behind speeds up");
ok(step(0.6) === 6 && step(-0.9) === 6, "inside the window (about a second) it leaves its level alone when it's at its own");
ok(step(0.5, 3, 6) > 3 && step(-0.5, 9, 6) < 9, "inside the window it drifts back towards its own level");
ok(step(6) < step(3) && step(-6) > step(-3), "the further away it is, the faster it changes");
ok(step(500, 1.2) >= 1 && step(-500, 9.9) <= 10 && step(1e9) >= 1, "it never leaves levels 1 to 10, however far off it is");
ok([NaN, Infinity, -Infinity, undefined].every(g => Number.isFinite(step(g))) && step(5, 6, 6, 0) === 6, "odd gaps (NaN, infinity) and a zero-length frame leave real numbers and no jump");

// ---------- on real tracks ----------
console.log("on real tracks (driving bots round them)");
const TRACKS = [...MAIN, ...LAYOUTS];
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const lapsAt = (track, tracker, skill, seeds, persona) => {
	const out = [];
	for(const seed of seeds){ const c = race(track, tracker, [skill], 4, { seed, personas: [persona] }).cars[0]; for(const l of c.laps.slice(1)) out.push(l); }   // (the first lap is a standing start)
	return out.length ? mean(out) : null;
};
const sims = {};
for(const id of ["figure8", "spa", "jeddah"]){
	const def = TRACKS.find(t => t.id === id), track = buildTrack(def, false), tracker = makeTracker(track);
	sims[id] = { track, tracker, def, t: {} };
	for(const n of [1, 3, 6, 9]) sims[id].t[n] = lapsAt(track, tracker, B.levelId(n), [1, 2, 3]);
	const t = sims[id].t;
	ok(t[1] > t[3] && t[3] > t[6] && t[6] >= t[9] - 0.5, id + ": lap times fall as the level goes up (level 1: " + t[1].toFixed(1) + " s, 3: " + t[3].toFixed(1) + ", 6: " + t[6].toFixed(1) + ", 9: " + t[9].toFixed(1) + ")");
}
const spread = Object.values(sims).map(s => (s.t[1] - s.t[9]) / s.t[9]);
ok(spread.every(x => x > 0.08 && x < 0.4), "level 1 is clearly slower than level 9 on every track, but not hopeless (" + spread.map(x => (x * 100).toFixed(0) + "%").join(", ") + " slower)");
// Personalities: a different style, not a different speed.
for(const id of ["spa", "figure8"]){
	const { track, tracker } = sims[id], base = lapsAt(track, tracker, "l6", [1, 2, 3]);
	const res = Object.fromEntries(Object.keys(B.PERSONAS).map(p => [p, lapsAt(track, tracker, "l6", [1, 2, 3], p)]));
	ok(Object.entries(res).every(([p, v]) => v !== null && Math.abs(v - base) / base < 0.07), id + ": no personality changes a level 6 lap by more than 7% (" + Object.entries(res).map(([p, v]) => p + " " + (((v - base) / base) * 100).toFixed(1) + "%").join(", ") + ")");
}
// Adaptive: a steady driver (a level 6 bot standing in for you) and five bots, two slow and three quick.
const LAPS = 4;
function field(adaptive){
	const { track, tracker } = sims.spa, lapLen = track.center ? track.center.len : tracker.field.max;
	const gaps = [];
	const r = race(track, tracker, ["l6", "l2", "l2", "l10", "l10", "l10"], LAPS, {
		seed: 11,
		frame: (t, cars) => {
			const me = cars[0];
			for(let k = 1; k < cars.length; k++){
				const c = cars[k], gap = (raceProgress(c) - raceProgress(me)) * lapLen / 21;
				if(adaptive) c.bot.setLevel(B.adaptLevel({ level: c.bot.level, base: c.bot.base, gap, dt: 1 / 60 }));
				if(t > 40 && Math.round(t * 60) % 30 === 0 && me.finished === null) gaps.push(Math.abs(gap));
			}
		}
	});
	gaps.sort((a, b) => a - b);
	return { median: gaps[Math.floor(gaps.length * 0.5)], p80: gaps[Math.floor(gaps.length * 0.8)], r };
}
const fixed = field(false), adapt = field(true);
ok(adapt.median < 2.5 && adapt.p80 < 5, "with adaptive bots the five bots stay close to the driver: half the time within " + adapt.median.toFixed(1) + " s, four times in five within " + adapt.p80.toFixed(1) + " s");
ok(fixed.median > adapt.median * 2, "with the same bots not adapting they drift much further away (half the time beyond " + fixed.median.toFixed(1) + " s)");
ok(adapt.r.cars.every(c => c.finished !== null) && adapt.r.cars.every(c => (c.escapes || 0) === 0), "and everyone still finishes, with no car stuck or thrown off the track");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nbots-test: OK");
