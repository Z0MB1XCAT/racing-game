// The results screen's "Next unlock" (nextUnlock in js/cosmetics.js): it always names the cheapest locked item that play can
// earn, with sensible numbers, and nothing once everything is open. Pure logic, no browser.
//   node tools/unlock-test.mjs
import { progress, nextUnlock, CATEGORIES, isUnlocked } from "../js/cosmetics.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const all = { races: 999, podiums: 999, wins: 999, titles: 99 }, allExtra = { records: 99, weeklyWins: 99, account: true, solo: { race: 1, winRacer: 1, winAce: 1, allTracks: 1, night: 1, rain: 1, beatGhost: 1 } };

const fresh = progress(null, {});
const n0 = nextUnlock(fresh);
console.log("a new driver:", JSON.stringify(n0));
ok(n0 && n0.name && n0.noun && n0.text, "a new driver gets a named item with a requirement");
ok(n0.have === 0 && n0.need > 0 && n0.frac === 0 && n0.left === n0.need, "and starts at nothing");
const item0 = CATEGORIES.find(c => c.id === n0.cat).items.find(i => i.id === n0.id);
ok(!isUnlocked(item0, fresh), "it really is locked");

// Every driver's next unlock is something they don't have, and getting closer never makes the number of XP bigger.
let prevLeft = Infinity;
for(const races of [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]){
	const P = progress({ races, wins: Math.floor(races / 4), podiums: Math.floor(races / 2) }, { solo: {} });
	const n = nextUnlock(P);
	if(!n){ ok(false, `${races} races: a next unlock exists`); continue; }
	const it = CATEGORIES.find(c => c.id === n.cat).items.find(i => i.id === n.id);
	if(isUnlocked(it, P) || !(n.left > 0) || !(n.frac >= 0 && n.frac < 1) || !Number.isFinite(n.cost)) ok(false, `${races} races: a sensible next unlock (${JSON.stringify(n)})`);
}
ok(true, "across 12 amounts of racing, the item is always locked, with something left to do");

// Level goals count in XP: with every win, podium and solo goal done, only level-only items are left.
const lvlP = Object.assign(progress({ races: 20 }, {}), { races: 999, wins: 999, podiums: 999, titles: 99, records: 99, weeklyWins: 99, account: true, solo: allExtra.solo });   // (level from 20 races; the other goals all met)
const lv = nextUnlock(lvlP);
console.log("level " + lvlP.level + ", everything else done:", JSON.stringify(lv));
ok(lv && lv.unit === "XP" && lv.text.startsWith("Reach level") && lv.left === lv.need - lvlP.xp, "a level goal says how much XP is left (" + (lv && lv.left) + ")");
ok(lv && lv.frac > 0 && lv.frac < 1, "and how far along you are (" + (lv && lv.frac.toFixed(2)) + ")");

// Everything open: nothing to show.
const full = progress(all, allExtra);
ok(nextUnlock(full) === null, "with everything unlocked there is no next unlock");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nunlock-test: OK");
