// The seasons, and the Halloween challenge week. No browser.
//   - the Halloween look comes on at the start of 1 October and goes off at the start of 1 November, every year;
//   - ?season= and the Settings switch change what is drawn but never what can be earned;
//   - the Halloween challenge is the week with 31 October in it, on a spooky circuit, at night in fog, and the
//     other weeks of the year are untouched (and never repeat a track two weeks running).
//   node tools/season-test.mjs
import { seasonAt, configureSeason, season, looks } from "../js/season.js";
import { weeklyChallenge } from "../js/weekly.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const on = d => seasonAt(d) === "halloween";

// Local-time dates, the way the game reads the player's calendar.
ok(!on(new Date(2026, 8, 30, 23, 59, 59)), "30 September, one second to midnight: not yet");
ok(on(new Date(2026, 9, 1, 0, 0, 0)), "1 October at midnight: on");
ok(on(new Date(2026, 9, 31, 23, 59, 59)), "31 October, one second to midnight: still on");
ok(!on(new Date(2026, 10, 1, 0, 0, 0)), "1 November at midnight: off");
let wrong = [];
for(const y of [2026, 2027, 2028, 2030, 2100]) for(let m = 0; m < 12; m++) for(const day of [1, 15, 28]) if(on(new Date(y, m, day)) !== (m === 9)) wrong.push(`${y}-${m + 1}-${day}`);
ok(wrong.length === 0, "on in every October and in no other month, across years" + (wrong.length ? ": " + wrong.join() : ""));
ok(on(new Date(2028, 9, 29, 12)) && !on(new Date(2028, 10, 1, 0, 0, 1)), "a leap year (2028) too");

// The switches.
const d = new Date(2026, 9, 10), n = new Date(2026, 5, 10);
configureSeason({ search: "", decorations: true });
ok(looks(d) === "halloween" && looks(n) === null, "by default the look follows the calendar");
configureSeason({ search: "?season=halloween", decorations: true });
ok(looks(n) === "halloween" && season(n) === null, "?season=halloween shows the look in June, but doesn't make it the season for earning");
configureSeason({ search: "?x=1&season=off", decorations: true });
ok(looks(d) === null && season(d) === "halloween", "?season=off hides the look in October, but the season for earning stays");
configureSeason({ search: "", decorations: false });
ok(looks(d) === null && season(d) === "halloween", "the Settings switch hides the look in October, the season for earning stays");
configureSeason({ search: "?season=bogus", decorations: true });
ok(looks(d) === "halloween" && looks(n) === null, "a made-up ?season= is ignored");
configureSeason({});

// The Halloween challenge week.
const day = 86400000;
const week = (y, m, dd) => weeklyChallenge(Date.UTC(y, m - 1, dd, 12));
const w44 = week(2026, 10, 28);
console.log("2026 Halloween week:", JSON.stringify({ id: w44.id, track: w44.def.id, reverse: w44.reverse, tod: w44.tod, weather: w44.weather, theme: w44.theme }));
ok(w44.id === "2026-W44" && w44.theme === "halloween" && w44.tod === "night" && w44.weather === "fog", "2026-W44 is the Halloween week: night and fog");
ok(w44.def.id === "spa" && w44.reverse === false, "on Spa, the right way round");
ok(week(2026, 10, 26).id === "2026-W44" && week(2026, 11, 1).id === "2026-W44" && week(2026, 11, 1).theme === "halloween", "it runs Monday 26 October to Sunday 1 November");
ok(!week(2026, 10, 25).theme && !week(2026, 11, 2).theme, "the weeks either side are ordinary (no night, no fog)");
ok(!week(2026, 10, 25).tod && !week(2026, 10, 25).weather, "and say nothing about time or weather");
ok(w44.end - w44.start === 7 * day, "a week long");
// Every year's Halloween week has 31 October in it, a spooky circuit, and a different track from the weeks next to it.
const spooky = new Set(["spa", "suzuka", "monza"]);
let bad = [];
for(let y = 2026; y <= 2060; y++){
	const h = Date.UTC(y, 9, 31, 12), w = weeklyChallenge(h), before = weeklyChallenge(h, 1), after = weeklyChallenge(h + 7 * day);
	if(w.theme !== "halloween" || w.start > h || w.end <= h) bad.push(y + " (week)");
	if(!spooky.has(w.def.id)) bad.push(y + " (track " + w.def.id + ")");
	if(w.tod !== "night" || w.weather !== "fog") bad.push(y + " (conditions)");
	if(before.theme || after.theme) bad.push(y + " (neighbours themed)");
	if(before.def.id === w.def.id || after.def.id === w.def.id) bad.push(y + " (repeats a neighbour: " + before.def.id + "," + w.def.id + "," + after.def.id + ")");
	// And exactly one themed week in the year.
	let themed = 0; for(let k = 0; k < 53; k++) if(weeklyChallenge(Date.UTC(y, 0, 1, 12) + k * 7 * day).theme) themed++;
	if(themed !== 1) bad.push(y + " (" + themed + " themed weeks)");
}
ok(bad.length === 0, "2026 to 2060: one Halloween week a year, with 31 October in it, a spooky circuit and fog at night, never a repeat" + (bad.length ? ": " + bad.slice(0, 4).join("; ") : ""));

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nseason-test: OK");
