// The weekly challenge picks itself: every Monday (00:00 UTC) a new track and direction
// are chosen from the date, the same for everyone, with a fresh leaderboard.
import { TRACKS, LEGACY } from "./tracks.js";
import { seededRandom } from "./trackgen.js";

const DAY = 86400000, WEEK = DAY * 7;

function mondayOf(t){
	const d = new Date(t);
	const back = (d.getUTCDay() + 6) % 7;
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - back * DAY;
}

// ISO week label, e.g. "2026-W39".
function isoWeek(monday){
	const thursday = new Date(monday + 3 * DAY);
	const year = thursday.getUTCFullYear();
	const jan4 = Date.UTC(year, 0, 4);
	const week = 1 + Math.round((monday - mondayOf(jan4)) / WEEK);
	return `${year}-W${String(week).padStart(2, "0")}`;
}

// Weeks picked by hand (the owner's choice); every other week picks itself as usual.
const CHOSEN = {
	"2026-W40": { track: "monaco", rev: false }
};

// The Halloween challenge: the week with 31 October in it, every year. Night and fog (looks only: the handling is the
// same, so the board stays fair) on a forest circuit, with a board of its own like any other week. 2026 is Spa; other
// years pick one of these from the year.
const SPOOKY = ["spa", "suzuka", "monza"];
const HALLOWEEN_CHOSEN = { 2026: { track: "spa", rev: false } };
const HALLOWEEN = { tod: "night", weather: "fog", theme: "halloween", label: "Halloween week" };
function halloweenOf(monday){
	const year = new Date(monday + 3 * DAY).getUTCFullYear(), h = Date.UTC(year, 9, 31);
	return h >= monday && h < monday + WEEK ? year : null;
}

function rawPick(monday){
	const chosen = CHOSEN[isoWeek(monday)];
	if(chosen) return { i: TRACKS.findIndex(t => t.id === chosen.track), rev: chosen.rev, chosen: true };
	const year = halloweenOf(monday);
	if(year){
		const rand = seededRandom("halloween:" + year), pick = HALLOWEEN_CHOSEN[year] || { track: SPOOKY[Math.floor(rand() * SPOOKY.length)], rev: rand() < 0.3 };
		return { i: TRACKS.findIndex(t => t.id === pick.track), rev: pick.rev, chosen: true, theme: HALLOWEEN };
	}
	const rand = seededRandom("weekly:" + isoWeek(monday));
	return { i: Math.floor(rand() * TRACKS.length), rev: rand() < 0.4 };
}

export function weeklyChallenge(now = Date.now(), weeksBack = 0){
	const monday = mondayOf(now) - weeksBack * WEEK;
	let { i, rev, chosen, theme } = rawPick(monday);
	// Never the same track two weeks running (unless it was picked by hand), either side of a week that was.
	if(!chosen && (i === rawPick(monday - WEEK).i || (rawPick(monday + WEEK).chosen && i === rawPick(monday + WEEK).i))) i = (i + 1) % TRACKS.length;
	const id = isoWeek(monday);
	// A challenge that started before a track was remastered finishes on the old layout.
	const def = (LEGACY[id] && LEGACY[id][TRACKS[i].id]) || TRACKS[i];
	const reverse = rev && !def.code;
	return Object.assign({ id, def, reverse, start: monday, end: monday + WEEK }, theme || {});
}

export function timeLeft(ms){
	const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000);
	return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
