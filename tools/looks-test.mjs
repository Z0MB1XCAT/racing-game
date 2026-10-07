// The garage's looks beyond paint: number styles, name effects, start-light themes, and the new titles with their solo goals. No browser.
//   node tools/looks-test.mjs
import { readFileSync } from "node:fs";
import { CATEGORIES, NUMSTYLES, NAMEFX, LIGHTTHEMES, TITLES, SOLO_GOALS, MAX_LEVEL, DEFAULT_LOOK, item, nameFxClass, nameFxById, cleanLook, progress, soloGoals } from "../js/cosmetics.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");

// ---- the tables ----
for(const [name, list, def] of [["number styles", NUMSTYLES, DEFAULT_LOOK.numstyle], ["name effects", NAMEFX, DEFAULT_LOOK.namefx], ["start lights", LIGHTTHEMES, DEFAULT_LOOK.startlights]]){
	ok(new Set(list.map(i => i.id)).size === list.length, `${name}: ${list.length} items with their own ids`);
	const d = list.find(i => i.id === def);
	ok(d && d.unlock.some(c => c.free), `${name}: the default (${def}) is free`);
	ok(list.every(i => i.name && Array.isArray(i.unlock) && i.unlock.length), `${name}: every item has a name and a way to get it`);
}
const levels = [...NUMSTYLES, ...NAMEFX, ...LIGHTTHEMES, ...TITLES].flatMap(i => i.unlock.filter(c => c.level).map(c => c.level));
ok(levels.every(l => l >= 2 && l <= MAX_LEVEL), "every level goal is between 2 and " + MAX_LEVEL);
const solos = [...NUMSTYLES, ...NAMEFX, ...LIGHTTHEMES, ...TITLES].flatMap(i => i.unlock.filter(c => c.solo).map(c => c.solo));
ok(solos.every(s => SOLO_GOALS[s]), "every solo goal named by an item has its text (" + [...new Set(solos)].join(", ") + ")");
ok(NAMEFX.filter(i => i.id !== "none").every(i => i.cls && new RegExp("\\." + i.cls + "\\b").test(css)), "every name effect has its style in the CSS");
ok(LIGHTTHEMES.filter(i => i.id !== "classic").every(i => css.includes(`.lights[data-theme="${i.id}"]`)), "every start-light theme has its colours in the CSS");
const keys = CATEGORIES.flatMap(c => c.items ? c.items.map(i => i.key) : []);
ok(new Set(keys).size === keys.length && keys.every(k => /^[a-z]+:[a-z0-9-]+$/.test(k)), keys.length + " items in all, every key different");
ok(TITLES.length >= 22 && ["wizard", "owl", "underdog", "clean"].every(id => item("title", id)), "the four new titles are there (" + TITLES.length + " titles)");

// ---- names and looks from outside ----
ok(nameFxClass({ namefx: "flame" }) === "nfx-flame" && nameFxById("gold") === "nfx-gold", "a name effect gives its class");
ok(["none", "nope", "constructor", "__proto__", "toString", "", null, undefined].every(id => nameFxById(id) === ""), "plain, unknown and prototype names give no class (nothing odd reaches the page)");
ok(nameFxClass(null) === "" && nameFxClass({}) === "", "no look, no class");
const fresh = progress(null, {});
const wild = cleanLook({ numstyle: "gold", namefx: "rainbow", startlights: "neon", livery: "factory" }, fresh, false);
ok(wild.numstyle === "classic" && wild.namefx === "none" && wild.startlights === "classic", "locked number styles, name effects and lights go back to the defaults");
const earned = progress(null, { solo: { "prize:numstyle:gold": true, "prize:namefx:rainbow": true, "prize:startlights:neon": true } });
const kept = cleanLook({ numstyle: "gold", namefx: "rainbow", startlights: "neon" }, earned, false);
ok(kept.numstyle === "gold" && kept.namefx === "rainbow" && kept.startlights === "neon", "unlocked ones are kept");
ok(cleanLook({ numstyle: "constructor", namefx: "__proto__", startlights: "toString" }, earned, false).numstyle === "classic", "made-up names are replaced");

// ---- the solo goals ----
const R = n => Array.from({ length: n }, (_, i) => ({ pos: i + 1 }));
const win = { pos: 1, status: "finished" }, second = { pos: 2, status: "finished" };
const g = o => soloGoals(Object.assign({ me: win, results: R(6), sky: null, level: "easy", mode: "race", hits: 5, lastOnGrid: false, october: false }, o));
ok(g({}).join() === "race", "an easy win with some contact ticks off just 'race'");
ok(g({ level: "hard" }).includes("winRacer") && g({ level: "hard" }).includes("winAce") && !g({ level: "easy" }).includes("winRacer"), "winning against Racers and Aces");
ok(g({ level: "l6" }).includes("winRacer") && g({ level: "l7" }).includes("winRacer") && !g({ level: "l5" }).includes("winRacer") && !g({ level: "l3" }).includes("winRacer"), "with ten levels a Racer win is level 6 or above");
ok(g({ level: "l10" }).includes("winAce") && !g({ level: "l9" }).includes("winAce") && !g({ level: "medium" }).includes("winAce"), "and an Ace win is level 10 only");
ok(!g({ level: "hard", adaptive: true }).includes("winRacer") && !g({ level: "hard", adaptive: true }).includes("winAce") && g({ level: "hard", adaptive: true }).includes("race"), "bots that adapt to you don't count for the Racer and Ace goals (the race itself still counts)");
ok(!g({ lastOnGrid: true, chosenStart: true }).includes("underdog") && g({ lastOnGrid: true, chosenStart: false }).includes("underdog"), "Underdog isn't earned from a start you picked yourself");
ok(g({ sky: { night: true } }).includes("winNight") && g({ sky: { night: true } }).includes("night") && !g({ sky: { rain: true } }).includes("winNight"), "a win at night: Night Owl (and 'night')");
ok(g({ sky: { rain: true } }).includes("winRain") && g({ sky: { rain: true } }).includes("rain"), "a win in the rain: Wet Weather Wizard (and 'rain')");
ok(!g({ me: second, sky: { rain: true, night: true } }).includes("winRain") && g({ me: second, sky: { rain: true } }).includes("rain"), "finishing second in the rain ticks 'rain' but isn't a win");
ok(g({ lastOnGrid: true }).includes("underdog") && !g({ lastOnGrid: false }).includes("underdog"), "Underdog: a win from the back of the grid");
ok(!g({ lastOnGrid: true, results: R(3) }).includes("underdog") && g({ lastOnGrid: true, results: R(4) }).includes("underdog"), "which needs at least three bots");
ok(!g({ me: second, lastOnGrid: true }).includes("underdog"), "and a win");
ok(g({ hits: 0 }).includes("cleanRace") && g({ hits: undefined }).includes("cleanRace") && !g({ hits: 1 }).includes("cleanRace"), "Clean Racer: no touches at all");
ok(!g({ hits: 0, results: R(2) }).includes("cleanRace") && g({ hits: 0, me: second, results: R(3) }).includes("cleanRace"), "which needs at least two bots, but not a win");
ok(!g({ hits: 0, me: { pos: 5, status: "dnf" } }).includes("cleanRace") && g({ me: { pos: 5, status: "dnf" } }).length === 0, "a car that didn't finish ticks off nothing");
ok(g({ mode: "elim", me: { pos: 1, status: "out" } }).includes("race"), "winning an elimination counts as finishing");
ok(g({ sky: { night: true, fog: true }, october: true }).includes("halloween") && !g({ sky: { night: true, fog: true }, october: false }).includes("halloween") && !g({ sky: { night: true }, october: true }).includes("halloween"), "the Halloween paint: night and fog, in October only");
ok(soloGoals({ me: null, results: [] }).length === 0, "no car, no goals");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nlooks-test: OK");
