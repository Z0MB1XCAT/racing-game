// Prize codes (js/codes.js, tools/codes.mjs) and look codes (js/cosmetics.js). No browser.
//   - a code is found whatever its case, spaces or dashes; a wrong one, a short one and an expired one are not;
//   - the shipped list holds no plain codes, and the tool can add, list, check and remove on a copy of it;
//   - a prize unlocks any item for good, even one that's normally earned or out of season;
//   - a look code survives a round trip for every item, and nothing that isn't a look code gets in.
//   node tools/codes-test.mjs
import { copyFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CODES, hashCode, normalise, findCode } from "../js/codes.js";
import { CATEGORIES, DEFAULT_LOOK, progress, isUnlocked, item, itemByKey, lookToCode, parseLookCode, applyLook, cleanLook, nextUnlock, shown } from "../js/cosmetics.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };

// ---- finding a code ----
const table = [
	{ h: await hashCode("TIGER-4821"), grants: ["livery:gold"], label: "winner" },
	{ h: await hashCode("OLD CODE 1"), grants: ["title:legend"], until: "2020-01-31" },
	{ h: await hashCode("future-code"), grants: ["horn:train"], until: "2099-12-31" }
];
ok(normalise(" tiger - 4821 ") === "TIGER4821", "case, spaces and dashes are ignored");
for(const t of ["TIGER-4821", "tiger-4821", "Tiger 4821", "TIGER4821", "  t-i-g-e-r4821 "]) if(!(await findCode(t, table))?.entry) ok(false, `"${t}" finds the code`);
ok(true, "five spellings of one code all find it");
ok((await findCode("TIGER-4822", table)) === null, "one digit out: not found");
ok((await findCode("TIG", table)) === null && (await findCode("", table)) === null && (await findCode(null, table)) === null, "too short or empty: not found, no error");
ok((await findCode("OLD CODE 1", table, Date.parse("2026-10-05")))?.expired?.grants[0] === "title:legend", "a code past its date says it has run out");
ok((await findCode("future-code", table, Date.parse("2026-10-05")))?.entry, "and one with a later date works");
ok((await findCode("TIGER-4821", table, Date.parse("2099-01-01")))?.entry, "a code with no date never runs out");
ok((await hashCode("abc1")) === (await hashCode("ABC-1")) && (await hashCode("abc1")).length === 24, "the fingerprint is 24 hex digits and ignores spelling");
ok(CODES.every(e => /^[0-9a-f]{24}$/.test(e.h) && e.grants.every(g => itemByKey(g))), "every shipped code is a fingerprint that grants real items (" + CODES.length + " shipped)");
ok(!/[A-Z]{4,}-\d{4}/.test(readFileSync(new URL("../js/codes.js", import.meta.url), "utf8").split("// BEGIN CODES")[1].split("// END CODES")[0]), "the list holds no plain codes");

// ---- the tool, on a copy ----
const dir = mkdtempSync(join(tmpdir(), "codes-"));
const copy = join(dir, "codes.js");
copyFileSync(new URL("../js/codes.js", import.meta.url), copy);
const tool = (...a) => spawnSync(process.execPath, [new URL("./codes.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), ...a, "--file", copy], { encoding: "utf8" });
let r = tool("add", "MY-SECRET-77", "livery:flames", "title:champion", "--label", "Year 9 \"cup\" winner", "--until", "2030-06-30");
ok(r.status === 0 && /MY-SECRET-77/.test(r.stdout), "the tool adds a code");
r = tool("list");
ok(/livery:flames, title:champion/.test(r.stdout) && /until 2030-06-30/.test(r.stdout) && !/MY-SECRET/.test(r.stdout), "list shows what it gives and when it ends, never the code");
ok(!readFileSync(copy, "utf8").includes("MY-SECRET-77"), "the plain code isn't written into the file");
r = tool("check", "my secret 77");
ok(/^Yes: gives livery:flames, title:champion/.test(r.stdout), "check finds it however it's typed");
ok(/^No/.test(tool("check", "MY-SECRET-78").stdout), "and says no to a wrong one");
r = tool("random", "3", "horn:cow");
const made = r.stdout.split("\n").filter(l => /^[A-Z]+-\d{4}$/.test(l));
ok(r.status === 0 && made.length === 3 && new Set(made).size === 3, "random makes three different codes like " + made[0]);
for(const m of made) if(!(await findCode(m, parseTable(copy)))?.entry) ok(false, "random code " + m + " works");
ok(tool("list").stdout.trim().split("\n").length === 4, "list now has four entries");
ok(tool("add", "bad", "livery:flames").status !== 0 && tool("add", "VALID-1", "livery:nope").status !== 0 && tool("add", "VALID-2").status !== 0, "a too-short code, an unknown item and no item are refused");
const first = tool("list").stdout.split("\n")[0].slice(0, 8);
ok(tool("remove", first).status === 0 && tool("list").stdout.trim().split("\n").length === 3, "remove takes one out by the start of its hash");
rmSync(dir, { recursive: true, force: true });
function parseTable(path){ // (read the copy back the way the game would)
	const body = readFileSync(path, "utf8").split("// BEGIN CODES")[1].split("// END CODES")[0];
	return [...body.matchAll(/\{ h: "([0-9a-f]+)", grants: (\[[^\]]*\])/g)].map(m => ({ h: m[1], grants: JSON.parse(m[2]) }));
}

// ---- a prize unlocks an item ----
const fresh = progress(null, {});
const gold = item("livery", "gold"), jack = item("livery", "jack");
ok(!isUnlocked(gold, fresh) && isUnlocked(gold, progress(null, { solo: { "prize:livery:gold": true } })), "a prize unlocks an item that's normally earned");
ok(isUnlocked(jack, progress(null, { solo: { "prize:livery:jack": true } })), "and the limited Halloween paint, out of season");
ok(shown(jack, progress(null, { solo: { "prize:livery:jack": true } }), new Date(2026, 3, 15)), "which then shows in the garage in April");
ok(!isUnlocked(gold, progress(null, { solo: { "prize:livery:chrome": true } })), "a prize only unlocks what it names");
const kept = cleanLook({ livery: "gold" }, progress(null, { solo: { "prize:livery:gold": true } }), false);
ok(kept.livery === "gold", "an equipped prize item survives the garage's tidy-up");
ok(!nextUnlock(progress(null, { solo: { "prize:title:winner": true } }), new Date(2026, 3, 15))?.id.includes("winner"), "and isn't offered as the next unlock once you have it");

// ---- look codes ----
let bad = 0, n = 0;
const all = Object.fromEntries(CATEGORIES.filter(c => c.items).map(c => [c.id, c.items.map(i => i.id)]));
for(const livery of all.livery) for(const [num, glow, horn] of [[null, "none", "classic"], [7, all.glow[3], all.horn[2]], [99, all.glow.at(-1), all.horn.at(-1)], [1, "none", "classic"]]){
	const look = { livery, number: num, glow, smoke: all.smoke[n % all.smoke.length], lights: all.lights[n % all.lights.length], title: all.title[n % all.title.length], horn };
	n++;
	const code = lookToCode(look), back = parseLookCode(code);
	if(!back || Object.keys(look).some(k => back[k] !== look[k])) bad++;
}
ok(bad === 0, `${n} looks (every paint) go to a code and come back identical, e.g. ${lookToCode({ livery: "flames", number: 7, glow: "none" })}`);
ok(lookToCode({}) === "GPL1.factory.-.none.white.warm.rookie.classic" && parseLookCode(lookToCode({}))?.number === null, "the default look is GPL1.factory.-.none.white.warm.rookie.classic");
let accepted = 0;
const junk = ["", "hello", "GPL1", "GPL1.a.b.c", "GPL2.factory.-.none.white.warm.rookie.classic", "GPL1.nope.-.none.white.warm.rookie.classic", "GPL1.factory.0.none.white.warm.rookie.classic", "GPL1.factory.100.none.white.warm.rookie.classic", "GPL1.factory.-1.none.white.warm.rookie.classic", "GPL1.factory.x.none.white.warm.rookie.classic", "GPL1.factory.-.none.white.warm.rookie.classic.extra", "<script>", "GPL1.factory.-.none.white.warm.rookie.<img>", "__proto__", "GPL1.constructor.-.none.white.warm.rookie.classic", "GPL1.factory.-.none.white.warm.rookie.toString"];
for(const j of junk) if(parseLookCode(j)) accepted++;
ok(accepted === 0, "nothing that isn't a look code gets in (" + junk.length + " tries, including prototype names)");
ok(parseLookCode("  " + lookToCode({ livery: "stripe" }) + "  ") !== null, "spaces round a pasted code are fine");

// Using a friend's look gives you what you've unlocked and lists the rest.
const mine = Object.assign({}, DEFAULT_LOOK, { livery: "factory", number: 5 });
const theirs = parseLookCode("GPL1.flames.1.rainbow.white.warm.champion.train");
const res = applyLook(mine, theirs, fresh, false);
ok(res.look.livery === "factory" && res.look.glow === "none" && res.look.horn === "classic", "locked paint, glow and horn stay as they were");
ok(res.look.number === 5 && res.skipped.some(s => s.name === "#1"), "#1 isn't taken unless it's yours, and is listed");
ok(res.skipped.length >= 5 && res.skipped.every(s => s.name && s.need), "each thing left out comes with what it takes (" + res.skipped.map(s => s.name).join(", ") + ")");
const rich = progress(null, { solo: { "prize:livery:flames": true, "prize:glow:rainbow": true, "prize:title:champion": true, "prize:horn:train": true } });
const res2 = applyLook(mine, theirs, rich, true);
ok(res2.look.livery === "flames" && res2.look.glow === "rainbow" && res2.look.title === "champion" && res2.look.horn === "train" && res2.look.number === 1 && res2.skipped.length === 0, "with everything unlocked (and the crown) the whole look comes across");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\ncodes-test: OK");
