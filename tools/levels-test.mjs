// Driver levels, now to 100. No browser.
//   - levels 1 to 30 need exactly the XP they always did (so nothing already earned or unlocked moves);
//   - every level after 30 is a flat 500 XP more, to level 100;
//   - the level you get from any amount of XP is the right one, and it stops at 100.
//   node tools/levels-test.mjs
import { MAX_LEVEL, CURVE_END, LEVEL_STEP, XP, xpForLevel, levelFromXp, progress, xpFromStats, CATEGORIES, isUnlocked } from "../js/cosmetics.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const oldXp = level => { const n = level - 1; return 150 * n + 15 * n * n; };     // (the curve before levels past 30)

ok(MAX_LEVEL === 100 && CURVE_END === 30 && LEVEL_STEP === 500, "levels run to 100: the old curve to 30, then 500 XP a level");
let moved = [];
for(let l = 1; l <= 30; l++) if(xpForLevel(l) !== oldXp(l)) moved.push(l);
ok(moved.length === 0, "levels 1 to 30 need exactly the XP they did before" + (moved.length ? " (changed: " + moved.join() + ")" : "") + " (level 30: " + xpForLevel(30).toLocaleString() + " XP)");
let flat = true;
for(let l = 31; l <= 100; l++) if(xpForLevel(l) - xpForLevel(l - 1) !== 500) flat = false;
ok(flat, "every level from 31 to 100 is exactly 500 XP more than the last");
ok(xpForLevel(31) === oldXp(30) + 500 && xpForLevel(100) === oldXp(30) + 70 * 500, "level 31 is " + xpForLevel(31).toLocaleString() + " XP, level 100 is " + xpForLevel(100).toLocaleString());
let mono = true;
for(let l = 2; l <= 100; l++) if(xpForLevel(l) <= xpForLevel(l - 1)) mono = false;
ok(mono, "every level needs more XP than the one before");
let wrong = [];
for(let l = 1; l <= 100; l++){
	if(levelFromXp(xpForLevel(l)) !== l) wrong.push(l + " at its XP");
	if(l > 1 && levelFromXp(xpForLevel(l) - 1) !== l - 1) wrong.push(l + " one short");
	if(l < 100 && levelFromXp(xpForLevel(l + 1) - 1) !== l) wrong.push(l + " just under the next");
}
ok(wrong.length === 0, "the level from any XP is right at every boundary, 1 to 100" + (wrong.length ? ": " + wrong.slice(0, 3).join(", ") : ""));
ok(levelFromXp(0) === 1 && levelFromXp(-5) === 1 && levelFromXp(1e9) === 100 && levelFromXp(xpForLevel(100) + 1e6) === 100, "no XP is level 1, and it stops at 100");
const top = progress({ races: 500, wins: 300, podiums: 300, titles: 10 }, {});
ok(top.level === 100 && top.nextXp === null, "level 100 has no next level (" + top.xp.toLocaleString() + " XP)");
const mid = progress({ races: 300, wins: 40, podiums: 90, titles: 1 }, {});
ok(mid.level > 30 && mid.level < 100 && mid.nextXp === xpForLevel(mid.level + 1) && mid.levelXp === xpForLevel(mid.level), "a level past 30 has its own XP window (level " + mid.level + ", " + mid.xp.toLocaleString() + " XP)");

// What it takes in play: a rough guide.
const perWin = XP.race + XP.podium + XP.win;
console.log(`    (a win is ${perWin} XP: level 30 is about ${Math.round(xpForLevel(30) / perWin)} wins, level 100 about ${Math.round(xpForLevel(100) / perWin)})`);

// The rewards past 30.
const at = lvl => CATEGORIES.flatMap(c => c.items || []).filter(i => i.unlock.some(u => u.level === lvl)).map(i => i.key);
for(const l of [31, 50, 75, 100]) ok(at(l).length > 0, `level ${l} unlocks something (${at(l).join(", ")})`);
const items = CATEGORIES.flatMap(c => c.items || []).filter(i => i.unlock.some(u => u.level > 30));
ok(items.length >= 6 && items.every(i => { const lv = Math.max(...i.unlock.filter(u => u.level).map(u => u.level)); return lv >= 31 && lv <= 100; }), items.length + " items sit past level 30, every one at a level that exists");
ok(items.every(i => !isUnlocked(i, progress({ races: 100 }, {}))), "and none is open to someone still at the start");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nlevels-test: OK");
