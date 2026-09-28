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

function rawPick(monday){
	const chosen = CHOSEN[isoWeek(monday)];
	if(chosen) return { i: TRACKS.findIndex(t => t.id === chosen.track), rev: chosen.rev, chosen: true };
	const rand = seededRandom("weekly:" + isoWeek(monday));
	return { i: Math.floor(rand() * TRACKS.length), rev: rand() < 0.4 };
}

export function weeklyChallenge(now = Date.now(), weeksBack = 0){
	const monday = mondayOf(now) - weeksBack * WEEK;
	let { i, rev, chosen } = rawPick(monday);
	// Never the same track two weeks running (unless it was picked by hand).
	if(!chosen && i === rawPick(monday - WEEK).i) i = (i + 1) % TRACKS.length;
	const id = isoWeek(monday);
	// A challenge that started before a track was remastered finishes on the old layout.
	const def = (LEGACY[id] && LEGACY[id][TRACKS[i].id]) || TRACKS[i];
	const reverse = rev && !def.code;
	return { id, def, reverse, start: monday, end: monday + WEEK };
}

export function timeLeft(ms){
	const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000);
	return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
