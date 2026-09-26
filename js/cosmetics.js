// Unlockable looks. Nothing here changes how a car drives.
//
// Progress comes from two places:
//  - online stats (wins, podiums, races, titles), which the database rules verify,
//    plus lap records held and weekly challenge wins;
//  - a few solo achievements, kept on the device (or on your account if signed in).
// Driver level is worked out from XP, and XP from the online stats.

// ----- Levels -----
export const MAX_LEVEL = 30;
export const XP = { race: 60, podium: 90, win: 150, title: 400 };

export function xpFromStats(s){
	s = s || {};
	return (s.races || 0) * XP.race + (s.podiums || 0) * XP.podium + (s.wins || 0) * XP.win + (s.titles || 0) * XP.title;
}
// XP needed to reach a level: gentle at first, about 150 online races to max out.
export function xpForLevel(level){
	const n = level - 1;
	return 150 * n + 15 * n * n;
}
export function levelFromXp(xp){
	let l = 1;
	while(l < MAX_LEVEL && xpForLevel(l + 1) <= xp) l++;
	return l;
}

// ----- Items -----
// unlock: list of alternative conditions; any one of them unlocks the item.
//   { free } { level } { wins } { podiums } { races } { titles } { records } { weeklyWins } { account } { solo: key }
// Colours: "hue" means the player's own car colour.

// 2026 grid, as colour schemes only (no logos or sponsor names).
const TEAMS = [
	{ id: "team-woking",      name: "Woking Papaya",        main: "#ff8000", second: "#1d1f24", accent: "#35bff0", level: 3 },
	{ id: "team-maranello",   name: "Maranello Red",        main: "#d8001d", second: "#f4f6fa", accent: "#151619", level: 5 },
	{ id: "team-miltonkeynes",name: "Milton Keynes Navy",   main: "#1c2856", second: "#d8102b", accent: "#ffc906", level: 7 },
	{ id: "team-brackley",    name: "Brackley Silver",      main: "#c3c8cd", second: "#15171b", accent: "#00d7b6", level: 9 },
	{ id: "team-silverstone", name: "Silverstone Green",    main: "#00594f", second: "#cedc00", accent: "#0b1c19", level: 10 },
	{ id: "team-enstone",     name: "Enstone Blue",         main: "#0078c1", second: "#ff87bc", accent: "#0b1627", level: 12 },
	{ id: "team-grove",       name: "Grove Blue",           main: "#062f7a", second: "#00a0de", accent: "#f4f6fa", level: 13 },
	{ id: "team-faenza",      name: "Faenza White",         main: "#f1f3f7", second: "#1634cb", accent: "#e3001b", level: 15 },
	{ id: "team-kannapolis",  name: "Kannapolis Stripes",   main: "#f1f3f7", second: "#1b1b1e", accent: "#e6002b", level: 16 },
	{ id: "team-hinwil",      name: "Hinwil Titanium",      main: "#a9adb2", second: "#141518", accent: "#e1002d", level: 17 },
	{ id: "team-fishers",     name: "Fishers Black",        main: "#141518", second: "#e9eaec", accent: "#b8b9bc", level: 19 }
];

// School livery: BVS blue and white (blue body, white wings/roof and stripe).
export const BVS_COLOURS = { main: "#1f4fbf", second: "#f4f6fa", accent: "#f4f6fa" };

export const LIVERIES = [
	{ id: "factory", name: "Factory", pattern: "solid", unlock: [{ free: true }] },
	{ id: "stripe",  name: "Racing Stripe", pattern: "stripe", accent: "#f4f6fa", unlock: [{ level: 2 }, { solo: "race" }] },
	{ id: "twotone", name: "Two-Tone", pattern: "split", second: "#15181f", unlock: [{ level: 4 }, { solo: "winRacer" }] },
	{ id: "twin",    name: "Twin Stripes", pattern: "twin", accent: "#f4f6fa", unlock: [{ level: 6 }] },
	{ id: "check",   name: "Chequered", pattern: "check", unlock: [{ level: 8 }] },
	{ id: "fade",    name: "Fade", pattern: "fade", second: "#0d0f14", unlock: [{ level: 11 }] },
	{ id: "carbon",  name: "Carbon", pattern: "carbon", unlock: [{ level: 14 }, { solo: "allTracks" }] },
	{ id: "neon",    name: "Neon Edge", pattern: "neon", unlock: [{ level: 18 }] },
	{ id: "bvs",     name: "BVS", pattern: "team", ...BVS_COLOURS, unlock: [{ account: true }] },
	...TEAMS.map(t => ({ id: t.id, name: t.name, pattern: "team", main: t.main, second: t.second, accent: t.accent, team: true, unlock: [{ level: t.level }] })),
	{ id: "flames",  name: "Flames", pattern: "flames", unlock: [{ wins: 10 }] },
	{ id: "record",  name: "Record Breaker", pattern: "record", main: "#6d2bd9", second: "#a95cff", accent: "#f4f6fa", unlock: [{ records: 3 }] },
	{ id: "chrome",  name: "Chrome", pattern: "chrome", unlock: [{ titles: 1 }] },
	{ id: "gold",    name: "Gold Rush", pattern: "gold", unlock: [{ wins: 25 }] }
];

export const GLOWS = [
	{ id: "none",    name: "None", color: null, unlock: [{ free: true }] },
	{ id: "cyan",    name: "Cyan", color: "#35e0ff", unlock: [{ level: 5 }] },
	{ id: "magenta", name: "Magenta", color: "#ff3bd8", unlock: [{ level: 9 }] },
	{ id: "lime",    name: "Lime", color: "#9dff2e", unlock: [{ level: 13 }] },
	{ id: "orange",  name: "Orange", color: "#ff8a1f", unlock: [{ level: 17 }] },
	{ id: "white",   name: "Ice", color: "#e8f4ff", unlock: [{ level: 21 }] },
	{ id: "car",     name: "Car colour", color: "hue", unlock: [{ podiums: 10 }] },
	{ id: "rainbow", name: "Rainbow", color: "rainbow", unlock: [{ weeklyWins: 1 }] }
];

export const SMOKES = [
	{ id: "white",   name: "White", color: "#ebebf0", unlock: [{ free: true }] },
	{ id: "blue",    name: "Blue", color: "#4aa8ff", unlock: [{ level: 7 }] },
	{ id: "red",     name: "Red", color: "#ff4a4a", unlock: [{ level: 12 }] },
	{ id: "yellow",  name: "Yellow", color: "#ffd84a", unlock: [{ level: 16 }] },
	{ id: "purple",  name: "Purple", color: "#b86bff", unlock: [{ level: 20 }] },
	{ id: "car",     name: "Car colour", color: "hue", unlock: [{ level: 24 }] },
	{ id: "rainbow", name: "Rainbow", color: "rainbow", unlock: [{ level: 27 }] }
];

export const TITLES = [
	{ id: "rookie",   name: "Rookie", unlock: [{ free: true }] },
	{ id: "botslayer",name: "Bot Slayer", unlock: [{ solo: "winAce" }] },
	{ id: "racer",    name: "Racer", unlock: [{ level: 5 }] },
	{ id: "winner",   name: "Race Winner", unlock: [{ wins: 1 }] },
	{ id: "podium",   name: "Podium Hunter", unlock: [{ podiums: 10 }] },
	{ id: "veteran",  name: "Veteran", unlock: [{ level: 15 }] },
	{ id: "record",   name: "Record Holder", unlock: [{ records: 1 }] },
	{ id: "weekly",   name: "Weekly Winner", unlock: [{ weeklyWins: 1 }] },
	{ id: "serial",   name: "Serial Winner", unlock: [{ wins: 25 }] },
	{ id: "champion", name: "Champion", unlock: [{ titles: 1 }] },
	{ id: "legend",   name: "Legend", unlock: [{ level: 30 }] }
];

export const CATEGORIES = [
	{ id: "livery", name: "Paint", items: LIVERIES },
	{ id: "number", name: "Number", items: null },
	{ id: "glow",   name: "Underglow", items: GLOWS },
	{ id: "smoke",  name: "Tyre smoke", items: SMOKES },
	{ id: "title",  name: "Title", items: TITLES }
];

export const DEFAULT_LOOK = { livery: "factory", number: null, glow: "none", smoke: "white", title: "rookie" };

export const SOLO_GOALS = {
	race: "Finish a race against bots",
	winRacer: "Beat Racer bots",
	winAce: "Beat Ace bots",
	allTracks: "Set a time trial lap on every track"
};

const byId = list => Object.fromEntries(list.map(i => [i.id, i]));
const INDEX = { livery: byId(LIVERIES), glow: byId(GLOWS), smoke: byId(SMOKES), title: byId(TITLES) };
export function item(cat, id){ return INDEX[cat] && INDEX[cat][id]; }

// Everything the unlock checks need. `stats` from Firebase, `extra` = { records, weeklyWins, account, solo }.
export function progress(stats, extra = {}){
	const s = stats || {};
	const xp = xpFromStats(s);
	const level = levelFromXp(xp);
	return {
		xp, level,
		levelXp: xpForLevel(level), nextXp: level < MAX_LEVEL ? xpForLevel(level + 1) : null,
		wins: s.wins || 0, podiums: s.podiums || 0, races: s.races || 0, titles: s.titles || 0,
		records: extra.records || 0, weeklyWins: extra.weeklyWins || 0,
		account: !!extra.account, solo: extra.solo || {}
	};
}

function met(c, P){
	if(c.free) return true;
	if(c.level) return P.level >= c.level;
	if(c.account) return P.account;
	if(c.solo) return !!P.solo[c.solo];
	for(const k of ["wins", "podiums", "races", "titles", "records", "weeklyWins"]) if(c[k]) return P[k] >= c[k];
	return false;
}
export function isUnlocked(it, P){ return !!it && it.unlock.some(c => met(c, P)); }

const PLURAL = { wins: ["Win", "online race", "online races"], podiums: ["Get", "online podium", "online podiums"], races: ["Finish", "online race", "online races"],
	titles: ["Win", "championship", "championships"], records: ["Hold", "lap record", "lap records"], weeklyWins: ["Win", "weekly challenge", "weekly challenges"] };

// Plain-English requirement for the easiest remaining route, with progress.
export function requirement(it, P){
	let best = null;
	for(const c of it.unlock){
		let text, have = 0, need = 1;
		if(c.free) continue;
		if(c.level){ text = `Reach level ${c.level}`; have = P.level; need = c.level; }
		else if(c.account){ text = "Sign in with an account"; have = P.account ? 1 : 0; }
		else if(c.solo){ text = SOLO_GOALS[c.solo]; have = P.solo[c.solo] ? 1 : 0; }
		else for(const k in PLURAL) if(c[k]){
			const [verb, one, many] = PLURAL[k];
			text = `${verb} ${c[k]} ${c[k] === 1 ? one : many}`; have = P[k]; need = c[k];
		}
		const frac = Math.min(1, have / need);
		if(!best || frac > best.frac) best = { text, have: Math.min(have, need), need, frac };
	}
	return best || { text: "", have: 1, need: 1, frac: 1 };
}

export function unlockedIds(P){
	const out = new Set();
	for(const c of CATEGORIES) if(c.items) for(const it of c.items) if(isUnlocked(it, P)) out.add(c.id + ":" + it.id);
	return out;
}

// Keep a saved look valid: anything no longer unlocked goes back to default.
// The crown holder is the only one who may wear #1.
export function cleanLook(look, P, isCrown){
	const l = Object.assign({}, DEFAULT_LOOK, look);
	for(const cat of ["livery", "glow", "smoke", "title"]){
		const it = item(cat, l[cat]);
		if(!it || !isUnlocked(it, P)) l[cat] = DEFAULT_LOOK[cat];
	}
	if(l.number === 1 && !isCrown) l.number = null;
	if(l.number != null && (l.number < 1 || l.number > 99 || !Number.isInteger(l.number))) l.number = null;
	return l;
}

// Random looks for bots: mostly team colours, some patterns.
export function botLook(rand = Math.random){
	const pool = ["factory", "stripe", "twin", "check", "fade", "twotone", ...TEAMS.map(t => t.id), ...TEAMS.map(t => t.id)];
	return { livery: pool[Math.floor(rand() * pool.length)], number: 2 + Math.floor(rand() * 98), glow: "none", smoke: "white", title: "rookie" };
}
