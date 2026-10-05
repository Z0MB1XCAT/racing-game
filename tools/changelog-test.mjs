// The "What's new" changelog (js/changelog.js): entries are well formed and newest first, no entry is newer than the game, and the
// version comparison is right (-9 comes before -10). No browser.
//   node tools/changelog-test.mjs
import { CHANGELOG, cmpVersion, entriesSince } from "../js/changelog.js";
import { VERSION } from "../js/config.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const FORMAT = /^\d{4}\.\d{2}\.\d{2}-\d+$/;

ok(FORMAT.test(VERSION), "the game's version looks like YYYY.MM.DD-N (" + VERSION + ")");
ok(CHANGELOG.length > 0, CHANGELOG.length + " entries");
ok(CHANGELOG.every(e => FORMAT.test(e.version) && e.title && e.date && Array.isArray(e.items) && e.items.length > 0), "every entry has a version, a title, a date and items");
ok(CHANGELOG.every(e => e.items.every(t => typeof t === "string" && t.length > 8 && t.length <= 220)), "every item is a short sentence (9 to 220 characters)");
ok(CHANGELOG.every((e, i) => i === 0 || cmpVersion(CHANGELOG[i - 1].version, e.version) > 0), "newest first, no repeats");
ok(CHANGELOG.every(e => cmpVersion(e.version, VERSION) <= 0), "no entry is for a version newer than the game's");
ok(cmpVersion("2026.10.05-9", "2026.10.05-10") < 0 && cmpVersion("2026.10.05-10", "2026.10.05-9") > 0, "-9 comes before -10");
ok(cmpVersion("2026.10.05-1", "2026.10.05-1") === 0 && cmpVersion("2026.09.30-9", "2026.10.01-1") < 0 && cmpVersion("2027.01.01-1", "2026.12.31-9") > 0, "dates and the same version compare right");
const mk = v => ({ version: v, date: "x", title: "t", items: ["an item here"] });
const list = ["2026.10.07-1", "2026.10.05-12", "2026.10.05-9", "2026.10.01-4", "2026.09.01-1"].map(mk);
ok(entriesSince("2026.10.05-9", list).map(e => e.version).join() === "2026.10.07-1,2026.10.05-12", "entriesSince: only what is newer than the last seen, in order");
ok(entriesSince("2026.01.01-1", list, 3).length === 3, "entriesSince: at most three");
ok(entriesSince("2027.01.01-1", list).length === 0, "entriesSince: nothing when you're up to date");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nchangelog-test: OK");
