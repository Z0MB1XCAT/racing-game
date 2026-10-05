// Unlockable looks. Nothing here changes how a car drives.
//
// Progress comes from two places:
//  - online stats (wins, podiums, races, titles), which the database rules verify,
//    plus lap records held and weekly challenge wins;
//  - a few solo achievements, kept on the device (or on your account if signed in).
// Driver level is worked out from XP, and XP from the online stats.

import { season } from "./season.js";

// ----- Levels -----
// The curve below runs to level 30 (where it stays exactly as it always was); every level after that, up to 100, is a flat
// LEVEL_STEP more XP. Level 100 is about 52,000 XP: a few hundred online wins.
export const MAX_LEVEL = 100;
export const CURVE_END = 30;
export const LEVEL_STEP = 500;
export const XP = { race: 60, podium: 90, win: 150, title: 400 };

export function xpFromStats(s){
	s = s || {};
	return (s.races || 0) * XP.race + (s.podiums || 0) * XP.podium + (s.wins || 0) * XP.win + (s.titles || 0) * XP.title;
}
// XP needed to reach a level: gentle at first (about 150 online races to level 30), then a steady 500 a level.
export function xpForLevel(level){
	const n = Math.min(level, CURVE_END) - 1;
	return 150 * n + 15 * n * n + Math.max(0, level - CURVE_END) * LEVEL_STEP;
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
	{ id: "blackout", name: "Blackout", pattern: "gloss", main: "#0b0c0f", second: "#15171b", accent: "#2a2e36", unlock: [{ free: true }] },
	{ id: "matte",   name: "Matte Black", pattern: "solid", main: "#1b1c20", second: "#0d0e11", accent: "#34373e", unlock: [{ level: 2 }, { solo: "race" }] },
	{ id: "bee",     name: "Bumblebee", pattern: "twin", main: "#ffcc12", second: "#15171b", accent: "#15171b", unlock: [{ level: 3 }] },
	{ id: "monster", name: "Monster", pattern: "monster", glow: true, main: "#0c0d0f", second: "#0c0d0f", accent: "#7dff1a", unlock: [{ level: 4 }, { solo: "winRacer" }] },
	{ id: "stripe",  name: "Racing Stripe", pattern: "stripe", accent: "#f4f6fa", unlock: [{ level: 2 }, { solo: "race" }] },
	{ id: "twotone", name: "Two-Tone", pattern: "split", second: "#15181f", unlock: [{ level: 4 }, { solo: "winRacer" }] },
	{ id: "polka",   name: "Polka Dots", pattern: "polka", accent: "#f4f6fa", unlock: [{ level: 5 }] },
	{ id: "twin",    name: "Twin Stripes", pattern: "twin", accent: "#f4f6fa", unlock: [{ level: 6 }] },
	{ id: "retro",   name: "Retro", pattern: "stripe", main: "#8cc8ea", second: "#8cc8ea", accent: "#ff7a1a", unlock: [{ level: 6 }] },
	{ id: "zebra",   name: "Zebra", pattern: "zebra", main: "#f4f6fa", second: "#15171b", accent: "#15171b", unlock: [{ level: 7 }] },
	{ id: "check",   name: "Chequered", pattern: "check", unlock: [{ level: 8 }] },
	{ id: "candy",   name: "Candy Cane", pattern: "candy", main: "#ff5fa8", second: "#f4f6fa", accent: "#f4f6fa", unlock: [{ level: 8 }] },
	{ id: "camo",    name: "Camo", pattern: "camo", main: "#4b5a2c", second: "#2c3319", accent: "#8a7a4a", unlock: [{ level: 9 }] },
	{ id: "sunset",  name: "Sunset", pattern: "sunset", main: "#ff9a2e", second: "#7b2cbf", accent: "#ff4f8b", unlock: [{ level: 10 }, { solo: "night" }] },
	{ id: "tiger",   name: "Tiger", pattern: "tiger", main: "#ff8a12", second: "#15171b", accent: "#15171b", unlock: [{ level: 11 }] },
	{ id: "fade",    name: "Fade", pattern: "fade", second: "#0d0f14", unlock: [{ level: 11 }] },
	{ id: "arctic",  name: "Arctic Camo", pattern: "camo", main: "#e9eef3", second: "#9aa6b2", accent: "#c7d0d9", unlock: [{ solo: "rain" }, { level: 12 }] },
	{ id: "hazard",  name: "Hazard", pattern: "hazard", main: "#ffcc12", second: "#15171b", accent: "#15171b", unlock: [{ level: 13 }] },
	{ id: "carbon",  name: "Carbon", pattern: "carbon", unlock: [{ level: 14 }, { solo: "allTracks" }] },
	{ id: "galaxy",  name: "Galaxy", pattern: "galaxy", glow: true, main: "#1a0f3a", second: "#0b0820", accent: "#b98cff", unlock: [{ level: 16 }, { solo: "beatGhost" }] },
	{ id: "pixel",   name: "Pixel Camo", pattern: "pixel", unlock: [{ level: 17 }] },
	{ id: "neon",    name: "Neon Edge", pattern: "neon", unlock: [{ level: 18 }] },
	{ id: "midnight",name: "Midnight Gold", pattern: "twin", main: "#0d1530", second: "#0d1530", accent: "#d4af37", unlock: [{ level: 19 }] },
	{ id: "synth",   name: "Synthwave", pattern: "synth", glow: true, main: "#1c0b33", second: "#ff3fa4", accent: "#35e0ff", unlock: [{ level: 22 }] },
	{ id: "bvs",     name: "BVS", pattern: "team", ...BVS_COLOURS, unlock: [{ account: true }] },
	...TEAMS.map(t => ({ id: t.id, name: t.name, pattern: "team", main: t.main, second: t.second, accent: t.accent, team: true, unlock: [{ level: t.level }] })),
	{ id: "lightning", name: "Lightning", pattern: "lightning", main: "#122a6b", second: "#0b1a45", accent: "#ffe03a", unlock: [{ wins: 3 }] },
	{ id: "flames",  name: "Flames", pattern: "flames", unlock: [{ wins: 10 }] },
	{ id: "lava",    name: "Lava", pattern: "lava", glow: true, main: "#140b08", second: "#140b08", accent: "#ff5a12", unlock: [{ wins: 15 }] },
	{ id: "record",  name: "Record Breaker", pattern: "record", main: "#6d2bd9", second: "#a95cff", accent: "#f4f6fa", unlock: [{ records: 3 }] },
	{ id: "chrome",  name: "Chrome", pattern: "chrome", unlock: [{ titles: 1 }] },
	{ id: "gold",    name: "Gold Rush", pattern: "gold", unlock: [{ wins: 25 }] },
	// A limited paint: it's on offer in October only (season: "halloween", see js/season.js), and yours to keep once earned.
	{ id: "platinum", name: "Platinum", pattern: "gloss", main: "#cfd6dd", second: "#8a929b", accent: "#ffffff", unlock: [{ level: 50 }] },
	{ id: "obsidian", name: "Obsidian", pattern: "team", main: "#0d0e12", second: "#d4af37", accent: "#d4af37", unlock: [{ level: 75 }] },
	{ id: "jack",    name: "Jack-o'-Lantern", pattern: "pumpkin", glow: true, main: "#ff7a12", second: "#1b1020", accent: "#ffd23a", season: "halloween", unlock: [{ solo: "halloween" }] }
];

export const GLOWS = [
	{ id: "none",    name: "None", color: null, unlock: [{ free: true }] },
	{ id: "cyan",    name: "Cyan", color: "#35e0ff", unlock: [{ level: 5 }] },
	{ id: "magenta", name: "Magenta", color: "#ff3bd8", unlock: [{ level: 9 }] },
	{ id: "lime",    name: "Lime", color: "#9dff2e", unlock: [{ level: 13 }] },
	{ id: "orange",  name: "Orange", color: "#ff8a1f", unlock: [{ level: 17 }] },
	{ id: "white",   name: "Ice", color: "#e8f4ff", unlock: [{ level: 21 }] },
	{ id: "red",     name: "Red", color: "#ff2e3e", unlock: [{ level: 3 }] },
	{ id: "purple",  name: "Purple", color: "#9a4bff", unlock: [{ level: 7 }] },
	{ id: "toxic",   name: "Toxic", color: "#39ff6a", unlock: [{ solo: "winRacer" }, { level: 11 }] },
	{ id: "gold",    name: "Gold", color: "#ffc233", unlock: [{ wins: 10 }] },
	{ id: "police",  name: "Blues and Twos", color: "police", unlock: [{ solo: "night" }, { level: 23 }] },
	{ id: "car",     name: "Car colour", color: "hue", unlock: [{ podiums: 10 }] },
	{ id: "rainbow", name: "Rainbow", color: "rainbow", unlock: [{ weeklyWins: 1 }] }
];

export const SMOKES = [
	{ id: "white",   name: "White", color: "#ebebf0", unlock: [{ free: true }] },
	{ id: "blue",    name: "Blue", color: "#4aa8ff", unlock: [{ level: 7 }] },
	{ id: "red",     name: "Red", color: "#ff4a4a", unlock: [{ level: 12 }] },
	{ id: "yellow",  name: "Yellow", color: "#ffd84a", unlock: [{ level: 16 }] },
	{ id: "purple",  name: "Purple", color: "#b86bff", unlock: [{ level: 20 }] },
	{ id: "black",   name: "Black", color: "#1c1d21", unlock: [{ level: 4 }, { solo: "winRacer" }] },
	{ id: "green",   name: "Green", color: "#56e05a", unlock: [{ level: 9 }] },
	{ id: "pink",    name: "Pink", color: "#ff7ac8", unlock: [{ level: 14 }] },
	{ id: "orange",  name: "Orange", color: "#ff9a3a", unlock: [{ level: 18 }] },
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
	{ id: "legend",   name: "Legend", unlock: [{ level: 30 }] },
	{ id: "monster",  name: "Monster", unlock: [{ level: 4 }, { solo: "winRacer" }] },
	{ id: "night",    name: "Night Rider", unlock: [{ solo: "night" }] },
	{ id: "rain",     name: "Rain Master", unlock: [{ solo: "rain" }] },
	{ id: "ghost",    name: "Ghostbuster", unlock: [{ solo: "beatGhost" }] },
	{ id: "tourist",  name: "Globetrotter", unlock: [{ solo: "allTracks" }] },
	{ id: "demon",    name: "Speed Demon", unlock: [{ records: 5 }] },
	{ id: "spooky",   name: "Trick or Treater", season: "halloween", unlock: [{ solo: "halloween" }] },
	{ id: "wizard",   name: "Wet Weather Wizard", unlock: [{ solo: "winRain" }] },
	{ id: "owl",      name: "Night Owl", unlock: [{ solo: "winNight" }] },
	{ id: "underdog", name: "Underdog", unlock: [{ solo: "underdog" }] },
	{ id: "clean",    name: "Clean Racer", unlock: [{ solo: "cleanRace" }] },
	{ id: "hof",      name: "Hall of Famer", unlock: [{ level: 50 }] },
	{ id: "immortal", name: "Immortal", unlock: [{ level: 75 }] },
	{ id: "centurion", name: "Centurion", unlock: [{ level: 100 }] }
];

// Headlight colour: the lamps on the car and the beam on the road at night.
export const LIGHTS = [
	{ id: "warm",    name: "Halogen", color: "#fff2cd", unlock: [{ free: true }] },
	{ id: "xenon",   name: "Xenon", color: "#e4eeff", unlock: [{ free: true }] },
	{ id: "yellow",  name: "Rally Yellow", color: "#ffd23a", unlock: [{ level: 2 }, { solo: "race" }] },
	{ id: "ice",     name: "Ice Blue", color: "#8fd0ff", unlock: [{ level: 4 }] },
	{ id: "green",   name: "Green", color: "#7dff4a", unlock: [{ level: 6 }] },
	{ id: "pink",    name: "Pink", color: "#ff78d2", unlock: [{ level: 8 }] },
	{ id: "purple",  name: "Purple", color: "#b27aff", unlock: [{ level: 10 }, { solo: "night" }] },
	{ id: "red",     name: "Red", color: "#ff4a5a", unlock: [{ level: 12 }] },
	{ id: "car",     name: "Car colour", color: "hue", unlock: [{ level: 15 }, { podiums: 5 }] },
	{ id: "rainbow", name: "Rainbow", color: "rainbow", unlock: [{ level: 22 }, { weeklyWins: 1 }] }
];

// The horn (H in a race). The sounds themselves are made in js/audio.js, by id.
export const HORNS = [
	{ id: "classic", name: "Classic", unlock: [{ free: true }] },
	{ id: "bicycle", name: "Bicycle Bell", unlock: [{ level: 3 }, { solo: "race" }] },
	{ id: "duck",    name: "Duck", unlock: [{ level: 6 }] },
	{ id: "air",     name: "Air Horn", unlock: [{ level: 9 }] },
	{ id: "cow",     name: "Cow", unlock: [{ level: 12 }] },
	{ id: "train",   name: "Train Horn", unlock: [{ level: 15 }] }
];

// The plate behind the race number on the car (drawn in cars.js, numberCanvas).
export const NUMSTYLES = [
	{ id: "classic", name: "Classic", unlock: [{ free: true }] },
	{ id: "night",   name: "Blackout", unlock: [{ level: 3 }] },
	{ id: "plate",   name: "Plate", unlock: [{ level: 6 }, { solo: "race" }] },
	{ id: "chequer", name: "Chequered", unlock: [{ level: 9 }] },
	{ id: "neon",    name: "Neon", unlock: [{ level: 12 }] },
	{ id: "gold",    name: "Gold", unlock: [{ podiums: 5 }, { level: 20 }] }
];

// How your name looks on the timing tower, over your car and in lists (the .nfx-* classes in css/style.css).
export const NAMEFX = [
	{ id: "none",    name: "Plain", unlock: [{ free: true }] },
	{ id: "ice",     name: "Ice", cls: "nfx-ice", unlock: [{ level: 10 }] },
	{ id: "flame",   name: "Flame", cls: "nfx-flame", unlock: [{ wins: 10 }] },
	{ id: "neon",    name: "Neon", cls: "nfx-neon", unlock: [{ level: 18 }] },
	{ id: "gold",    name: "Gold", cls: "nfx-gold", unlock: [{ titles: 1 }, { wins: 25 }] },
	{ id: "border",  name: "Gold Border", cls: "nfx-border", unlock: [{ level: 31 }] },
	{ id: "rainbow", name: "Rainbow", cls: "nfx-rainbow", unlock: [{ weeklyWins: 1 }] }
];

// The five start lights over the track before a race. Only you see yours (js/hud.js, .lights[data-theme] in css/style.css).
export const LIGHTTHEMES = [
	{ id: "classic", name: "Red", color: "#ff2432", unlock: [{ free: true }] },
	{ id: "amber",   name: "Amber", color: "#ffb02e", unlock: [{ level: 4 }] },
	{ id: "ice",     name: "Ice", color: "#5ad7ff", unlock: [{ level: 8 }] },
	{ id: "green",   name: "Green", color: "#3ddc84", unlock: [{ level: 12 }] },
	{ id: "neon",    name: "Neon", color: "#ff3bd8", unlock: [{ level: 16 }] },
	{ id: "pumpkin", name: "Pumpkin", color: "#ff7a12", season: "halloween", unlock: [{ solo: "halloween" }] }
];

export const CATEGORIES = [
	{ id: "livery", name: "Paint", items: LIVERIES },
	{ id: "number", name: "Number", items: null },
	{ id: "glow",   name: "Underglow", items: GLOWS },
	{ id: "lights", name: "Headlights", items: LIGHTS },
	{ id: "smoke",  name: "Tyre smoke", items: SMOKES },
	{ id: "title",  name: "Title", items: TITLES },
	{ id: "horn",   name: "Horn", items: HORNS },
	{ id: "numstyle", name: "Number style", items: NUMSTYLES },
	{ id: "namefx", name: "Name effect", items: NAMEFX },
	{ id: "startlights", name: "Start lights", items: LIGHTTHEMES }
];

export const DEFAULT_LOOK = { livery: "factory", number: null, glow: "none", smoke: "white", lights: "warm", title: "rookie", horn: "classic", numstyle: "classic", namefx: "none", startlights: "classic" };

export const SOLO_GOALS = {
	race: "Finish a race against bots",
	winRacer: "Beat Racer bots",
	winAce: "Beat Ace bots",
	allTracks: "Set a time trial lap on every track",
	night: "Finish a race against bots at night",
	rain: "Finish a race against bots in the rain",
	beatGhost: "Beat someone else's ghost in time trial",
	halloween: "Finish a lap of the Halloween challenge, or a bot race at night in fog (October only)",
	winRain: "Win a bot race in the rain",
	winNight: "Win a bot race at night",
	underdog: "Win a bot race (3 or more bots) after starting at the back of the grid",
	cleanRace: "Finish a bot race (2 or more bots) without touching another car"
};

const byId = list => Object.fromEntries(list.map(i => [i.id, i]));
const INDEX = { livery: byId(LIVERIES), glow: byId(GLOWS), smoke: byId(SMOKES), lights: byId(LIGHTS), title: byId(TITLES), horn: byId(HORNS), numstyle: byId(NUMSTYLES), namefx: byId(NAMEFX), startlights: byId(LIGHTTHEMES) };
// (Only the game's own items: a look from outside can name anything, even "constructor" or "__proto__".)
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function item(cat, id){ return own(INDEX, cat) && own(INDEX[cat], id) ? INDEX[cat][id] : undefined; }
// Every item knows its own key ("livery:flames"), which is how a prize code names it (js/codes.js).
for(const c of CATEGORIES) if(c.items) for(const it of c.items) it.key = c.id + ":" + it.id;
export function itemByKey(key){
	const [cat, id] = String(key).split(":");
	const it = item(cat, id);
	return it ? { cat, item: it } : null;
}

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

// Items that are only on offer at one time of year (item.season) show up in the garage then, or once you have them.
export const inSeason = (it, now) => !it.season || season(now) === it.season;
export const shown = (it, P, now) => inSeason(it, now) || isUnlocked(it, P);

function met(c, P){
	if(c.free) return true;
	if(c.level) return P.level >= c.level;
	if(c.account) return P.account;
	if(c.solo) return !!P.solo[c.solo];
	for(const k of ["wins", "podiums", "races", "titles", "records", "weeklyWins"]) if(c[k]) return P[k] >= c[k];
	return false;
}
// (A prize code (js/codes.js) unlocks any item for good: it's kept as the flag "prize:<key>" beside the solo goals.)
export function isUnlocked(it, P){ return !!it && (it.unlock.some(c => met(c, P)) || !!(P.solo && P.solo["prize:" + it.key])); }

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

// What each kind of item is called in a sentence ("Flames paint").
export const CAT_NOUN = { livery: "paint", glow: "underglow", smoke: "tyre smoke", lights: "headlights", title: "title", horn: "horn", numstyle: "number style", namefx: "name effect", startlights: "start lights" };

// Roughly how much play each requirement still needs, in XP (a race is worth 60, a win 150): used to pick what's closest.
const COST_PER = { races: 60, podiums: 90, wins: 150, titles: 400, records: 400, weeklyWins: 700 };
// The locked item that's cheapest to get, with how far along you are: { cat, id, name, noun, text, have, need, unit, frac, left }.
// (Levels count in XP, so "level 12" shows how much XP is left, not "level 10 of 12". Signing in isn't something a race gets you, so it's skipped.)
export function nextUnlock(P, now){
	let best = null;
	for(const c of CATEGORIES) if(c.items) for(const it of c.items){
		if(isUnlocked(it, P) || !inSeason(it, now)) continue;
		for(const cond of it.unlock){
			if(cond.free || cond.account) continue;
			let text = "", have = 0, need = 1, unit = "", cost = 0;
			if(cond.level){ text = `Reach level ${cond.level}`; have = P.xp; need = xpForLevel(cond.level); unit = "XP"; cost = need - have; }
			else if(cond.solo){ text = SOLO_GOALS[cond.solo] || ""; cost = 200; }
			else for(const k in PLURAL) if(cond[k]){
				const [verb, one, many] = PLURAL[k];
				text = `${verb} ${cond[k]} ${cond[k] === 1 ? one : many}`; have = P[k]; need = cond[k]; cost = (need - have) * COST_PER[k];
			}
			if(!text || have >= need) continue;
			if(!best || cost < best.cost) best = { cat: c.id, id: it.id, name: it.name, noun: CAT_NOUN[c.id], text, have: Math.min(have, need), need, unit, frac: Math.min(1, have / need), left: need - have, cost };
		}
	}
	return best;
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
	for(const cat of ["livery", "glow", "smoke", "lights", "title", "horn", "numstyle", "namefx", "startlights"]){
		const it = item(cat, l[cat]);
		if(!it || !isUnlocked(it, P)) l[cat] = DEFAULT_LOOK[cat];
	}
	if(l.number === 1 && !isCrown) l.number = null;
	if(l.number != null && (l.number < 1 || l.number > 99 || !Number.isInteger(l.number))) l.number = null;
	return l;
}

// ----- Solo goals -----
// Which solo goals a finished bot race ticks off in the garage. me and results are from the race ({ pos, status }); sky is what the
// sky was doing as you finished ({ night, rain, fog }) or null; level is the bots' level; hits is how many times you touched another
// car; lastOnGrid says you started at the back; october says it's the Halloween season.
export function soloGoals({ me, results, sky, level, mode, hits, lastOnGrid, october }){
	const flags = [];
	if(!me) return flags;
	if(me.status === "finished" || (me.pos === 1 && mode === "elim")){
		flags.push("race");
		if(sky && sky.night) flags.push("night");
		if(sky && sky.rain) flags.push("rain");
		if(sky && sky.night && sky.fog && october) flags.push("halloween");        // the limited Halloween paint
	}
	if(me.pos === 1 && me.status !== "dnf"){
		if(level === "medium" || level === "hard") flags.push("winRacer");
		if(level === "hard") flags.push("winAce");
		if(sky && sky.rain) flags.push("winRain");
		if(sky && sky.night) flags.push("winNight");
		if(results.length >= 4 && lastOnGrid) flags.push("underdog");      // (won from the back, against at least three bots)
	}
	if(me.status === "finished" && results.length >= 3 && !hits) flags.push("cleanRace");
	return flags;
}

// ----- Look codes -----
// A look as one line of text to send a friend: GPL1.<paint>.<number or ->.<underglow>.<smoke>.<headlights>.<title>.<horn>
// e.g. "GPL1.flames.7.none.white.warm.rookie.classic". Pasting one gives you whatever of it you've unlocked; the rest stays as it was.
// (The last three parts, the number style, name effect and start lights, can be left off: older codes stop at the horn.)
const LOOK_PARTS = ["livery", "glow", "smoke", "lights", "title", "horn", "numstyle", "namefx", "startlights"];
export function lookToCode(look){
	const l = Object.assign({}, DEFAULT_LOOK, look);
	return ["GPL1", l.livery, l.number == null ? "-" : l.number, l.glow, l.smoke, l.lights, l.title, l.horn, l.numstyle, l.namefx, l.startlights].join(".");
}
// The look a code describes, or null if it isn't a look code (or names something that doesn't exist).
export function parseLookCode(text){
	const parts = String(text || "").trim().split(".");
	if(parts.length < 8 || parts.length > 11 || parts[0] !== "GPL1") return null;
	const [, livery, number, glow, smoke, lights, title, horn, numstyle = DEFAULT_LOOK.numstyle, namefx = DEFAULT_LOOK.namefx, startlights = DEFAULT_LOOK.startlights] = parts;
	const look = { livery, glow, smoke, lights, title, horn, numstyle, namefx, startlights, number: number === "-" ? null : /^\d{1,2}$/.test(number) ? Number(number) : NaN };
	if(Number.isNaN(look.number) || (look.number != null && look.number < 1)) return null;
	for(const c of LOOK_PARTS) if(!item(c, look[c])) return null;
	return look;
}
// Your look with a code's look applied: { look, skipped: [{ part, name, need }] }. Anything you haven't unlocked (and #1 unless it's
// yours) is left as it was and listed with what it takes to get it.
export function applyLook(mine, wanted, P, isCrown){
	const out = Object.assign({}, DEFAULT_LOOK, mine), skipped = [];
	for(const c of LOOK_PARTS){
		const it = item(c, wanted[c]);
		if(isUnlocked(it, P)) out[c] = it.id;
		else skipped.push({ part: CAT_NOUN[c], name: it.name, need: requirement(it, P).text });
	}
	if(wanted.number === 1 && !isCrown) skipped.push({ part: "number", name: "#1", need: "Win the weekly challenge" });
	else out.number = wanted.number;
	return { look: out, skipped };
}

// The CSS class that dresses a name for a look's name effect ("" for plain, or for anything that isn't one of ours).
export const nameFxById = id => { const it = item("namefx", id); return it && it.cls ? it.cls : ""; };
export const nameFxClass = look => nameFxById(look && look.namefx);

// Random looks for bots: mostly team colours, some patterns.
export function botLook(rand = Math.random){
	const pool = ["factory", "stripe", "twin", "check", "fade", "twotone", "blackout", "monster", "retro", "tiger", "camo", "hazard", ...TEAMS.map(t => t.id), ...TEAMS.map(t => t.id)];
	const lights = ["warm", "warm", "xenon", "xenon", "yellow", "ice"];
	return { livery: pool[Math.floor(rand() * pool.length)], number: 2 + Math.floor(rand() * 98), glow: "none", smoke: "white", lights: lights[Math.floor(rand() * lights.length)], title: "rookie" };
}
