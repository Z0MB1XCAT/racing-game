// The weekly challenge picks itself: every Monday (00:00 UTC) a new track and direction
// are chosen from the date, the same for everyone, with a fresh leaderboard.
import { TRACKS } from "./tracks.js";
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

function rawPick(monday){
	const rand = seededRandom("weekly:" + isoWeek(monday));
	return { i: Math.floor(rand() * TRACKS.length), rev: rand() < 0.4 };
}

export function weeklyChallenge(now = Date.now(), weeksBack = 0){
	const monday = mondayOf(now) - weeksBack * WEEK;
	let { i, rev } = rawPick(monday);
	// Never the same track two weeks running.
	if(i === rawPick(monday - WEEK).i) i = (i + 1) % TRACKS.length;
	const def = TRACKS[i];
	const reverse = rev && !def.code;
	return { id: isoWeek(monday), def, reverse, start: monday, end: monday + WEEK };
}

export function timeLeft(ms){
	const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000);
	return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
