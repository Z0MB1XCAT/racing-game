// Time of day and weather. The host (or solo setup) picks each one, or "dynamic" to let it change during the race.
// Everything comes from the race's seed and the race clock, so every screen in a room shows the same sky at the same
// moment, and the forecast can look ahead along the same timeline. Looks only: the handling never changes.
import { seededRandom } from "./trackgen.js";

export const TIMES = { default: "Default", day: "Day", sunset: "Sunset", night: "Night", dynamic: "Dynamic" };
export const WEATHERS = { clear: "Clear", cloudy: "Cloudy", fog: "Fog", rain: "Rain", storm: "Storm", snow: "Snow", dynamic: "Dynamic" };

// Each condition as the numbers the world draws (all 0..1): cloud cover, rain, mist, snow, wind and storm (lightning).
export const CONDITIONS = {
	clear: { cloud: 0.08, rain: 0, fog: 0, snow: 0, wind: 0.08, storm: 0 },
	cloudy: { cloud: 0.78, rain: 0, fog: 0, snow: 0, wind: 0.2, storm: 0 },
	fog: { cloud: 0.62, rain: 0, fog: 0.9, snow: 0, wind: 0.05, storm: 0 },
	rain: { cloud: 1, rain: 0.8, fog: 0.12, snow: 0, wind: 0.3, storm: 0 },
	storm: { cloud: 1, rain: 1, fog: 0.18, snow: 0, wind: 0.9, storm: 1 },
	snow: { cloud: 0.9, rain: 0, fog: 0.3, snow: 1, wind: 0.2, storm: 0 }
};
const FIELDS = Object.keys(CONDITIONS.clear);
// What a circuit's weather is usually like: the chance of each kind of spell when the weather is dynamic.
export const DEFAULT_CLIMATE = { clear: 0.48, cloudy: 0.34, rain: 0.1, fog: 0.05, storm: 0.03 };

// Each circuit's usual weather (keyed by its theme in js/world.js), and a line about it for the setup screens.
export const CLIMATES = {
	classic: DEFAULT_CLIMATE,
	monaco: { clear: 0.6, cloudy: 0.27, rain: 0.09, fog: 0.02, storm: 0.02 },
	spa: { clear: 0.3, cloudy: 0.4, rain: 0.2, fog: 0.07, storm: 0.03 },
	monza: { clear: 0.42, cloudy: 0.3, rain: 0.1, fog: 0.15, storm: 0.03 },
	suzuka: { clear: 0.3, cloudy: 0.33, rain: 0.25, fog: 0.04, storm: 0.08 },
	jeddah: { clear: 0.75, cloudy: 0.15, fog: 0.1 },
	daytona: { clear: 0.5, cloudy: 0.22, rain: 0.08, storm: 0.2 },
	dusk: DEFAULT_CLIMATE,
	snow: { cloudy: 0.3, snow: 0.55, fog: 0.15 }
};
export const CLIMATE_NOTES = {
	classic: "Mostly bright, with the odd shower.",
	monaco: "Mostly sunny, with a short shower now and then.",
	spa: "Changeable: cloud, mist and showers.",
	monza: "Bright, with mist some mornings.",
	suzuka: "Often damp, with the odd storm.",
	jeddah: "Warm and dry, with a haze now and then.",
	daytona: "Hot and bright, with thunderstorms about.",
	dusk: "Mostly bright, with the odd shower.",
	snow: "Snow, with spells of mist."
};

const HOUR = { day: 13, sunset: 18.9, night: 23 };
const MS_PER_HOUR = 30000;          // dynamic time: one hour of daylight every 30 s of racing
// Dynamic weather is slow on purpose: a spell lasts minutes, not seconds, it changes over a minute, the cloud comes
// before the rain, and a shower is never followed by another within two spells. A five-lap race sees one change, or
// two, and rain in roughly one race in five.
const SPELL = { clear: [170000, 280000], cloudy: [150000, 260000], fog: [150000, 230000], rain: [100000, 190000], storm: [80000, 140000] };
const BLEND = 55000;                // a change fades in over this long
const CLOUD_LEAD = 60000;           // and the sky darkens this much earlier than the rain starts
const WET = new Set(["rain", "storm", "snow"]);

// The kind of weather a condition's numbers amount to: for the forecast and the "it's raining" messages.
export function kindOf(a){
	return a.storm > 0.5 ? "storm" : a.snow > 0.35 ? "snow" : a.rain > 0.28 ? "rain" : a.fog > 0.45 ? "fog" : a.cloud > 0.55 ? "cloudy" : "clear";
}

// settings: { tod, weather }. theme.climate: the chances for this circuit. Returns
// { at(raceMs) -> { hour, cloud, rain, fog, snow, wind, storm }, forecast(raceMs), next(raceMs), dynamic }.
export function makeAtmosphere(settings, theme, seed){
	const rand = seededRandom("sky:" + seed);
	const tod = TIMES[settings.tod] ? settings.tod : "default";
	const weather = WEATHERS[settings.weather] ? settings.weather : "clear";
	const startHour = tod === "dynamic" ? 8 + rand() * 12 : tod === "default" ? naturalHour(theme) : HOUR[tod];
	const perMs = tod === "dynamic" ? 1 / MS_PER_HOUR : 0;
	const spells = weather === "dynamic" ? makeSpells((theme && theme.climate) || DEFAULT_CLIMATE, rand) : null;
	const fixed = CONDITIONS[weather];

	function conditions(ms){
		if(!spells) return fixed;
		let i = spells.findIndex(s => ms < s.to);
		if(i < 0) i = spells.length - 1;
		const a = spells[i].look, b = (spells[i + 1] || spells[i]).look, end = spells[i].to;
		const out = {};
		for(const k of FIELDS){
			// A rising cloud cover leads the rain; everything else changes together, over the end of the spell.
			const lead = k === "cloud" && b.cloud > a.cloud ? CLOUD_LEAD : 0, len = BLEND + lead;
			const f = Math.max(0, Math.min(1, (ms - (end - len)) / len));
			out[k] = a[k] + (b[k] - a[k]) * (f * f * (3 - 2 * f));
		}
		return out;
	}
	function at(ms){
		ms = Math.max(0, ms || 0);
		const hour = ((startHour + ms * perMs) % 24 + 24) % 24;
		return Object.assign({ hour }, conditions(ms));
	}
	return {
		dynamic: tod === "dynamic" || weather === "dynamic",
		changes: weather === "dynamic",
		at,
		// The next `horizon` ms as cells of `step` ms: the kind of weather in each (the first is now).
		forecast(ms, horizon = 360000, step = 10000){
			const cells = [];
			for(let t = 0; t <= horizon; t += step) cells.push(kindOf(conditions(Math.max(0, ms) + t)));
			return cells;
		},
		// The next change in the kind of weather within `horizon` ms: { kind, in (seconds), from } or null.
		next(ms, horizon = 150000){
			const now = kindOf(conditions(Math.max(0, ms)));
			for(let t = 5000; t <= horizon; t += 5000){
				const k = kindOf(conditions(Math.max(0, ms) + t));
				if(k !== now) return { kind: k, in: t / 1000, from: now };
			}
			return null;
		}
	};
}

function makeSpells(climate, rand){
	const kinds = Object.keys(CONDITIONS).filter(k => k !== "snow" || (climate.snow || 0) > 0);
	const weight = (k, n) => (climate[k] || 0) * (WET.has(k) && n === 1 ? 0.3 : 1);     // (rain is much less likely in the second spell)
	const pick = (ok, n) => {
		let total = 0;
		for(const k of kinds) if(ok(k)) total += weight(k, n);
		if(total <= 0) return "clear";
		let r = rand() * total;
		for(const k of kinds) if(ok(k)){ r -= weight(k, n); if(r <= 0) return k; }
		return "clear";
	};
	const spells = [];
	let t = 0, last = null, sinceWet = 99;
	for(let n = 0; n < 40; n++){
		// The first spell is dry (mostly a bright one): a race doesn't start in the rain unless it's chosen to.
		const kind = n === 0 ? (rand() < 0.62 && weight("clear", n) > 0 ? "clear" : "cloudy")
			: pick(k => k !== last && !(WET.has(k) && sinceWet < 3), n);
		const [lo, hi] = SPELL[kind] || SPELL.cloudy, len = lo + rand() * (hi - lo);
		spells.push({ from: t, to: t + len, kind, look: jitter(kind, rand) });
		t += len; last = kind; sinceWet = WET.has(kind) ? 0 : sinceWet + 1;
	}
	return spells;
}
// A spell's own numbers: no two showers are the same (drizzle, steady rain), nor two mists.
function jitter(kind, rand){
	const c = Object.assign({}, CONDITIONS[kind]);
	if(kind === "rain") c.rain = 0.35 + rand() * 0.5;
	else if(kind === "cloudy") c.cloud = 0.62 + rand() * 0.3;
	else if(kind === "fog") c.fog = 0.6 + rand() * 0.35;
	else if(kind === "clear") c.cloud = 0.02 + rand() * 0.2;
	if(kind === "rain") c.cloud = 0.85 + rand() * 0.15;
	c.wind = Math.min(1, c.wind * (0.7 + rand() * 0.6));
	return c;
}

// The hour a track looks like by default (Jeddah is a night race, Crossroads is at dusk).
export function naturalHour(theme){ return theme.night ? HOUR.night : theme.tod === "sunset" ? HOUR.sunset : HOUR.day; }
