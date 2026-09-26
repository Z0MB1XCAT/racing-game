// Time of day and weather. The host (or solo setup) picks each one, or "dynamic" to let it
// change during the race. Everything comes from the race's seed and the race clock, so every
// screen in a room shows the same sky at the same moment. Looks only: the handling never changes.
import { seededRandom } from "./trackgen.js";

export const TIMES = { default: "Default", day: "Day", sunset: "Sunset", night: "Night", dynamic: "Dynamic" };
export const WEATHERS = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", dynamic: "Dynamic" };

const HOUR = { day: 13, sunset: 18.9, night: 23 };
const LOOK = { clear: [0.08, 0], cloudy: [0.78, 0], rain: [1, 0.85] };   // [cloud, rain]
const MS_PER_HOUR = 30000;          // dynamic time: one hour of daylight every 30 s of racing
const BLEND = 15000;                // weather changes fade in over 15 s

// The hour a track looks like by default (Jeddah is a night race, Crossroads is at dusk).
export function naturalHour(theme){ return theme.night ? HOUR.night : theme.tod === "sunset" ? HOUR.sunset : HOUR.day; }

// settings: { tod, weather }. Returns { at(raceMs) -> { hour, cloud, rain }, dynamic }.
export function makeAtmosphere(settings, theme, seed){
	const rand = seededRandom("sky:" + seed);
	const tod = TIMES[settings.tod] ? settings.tod : "default";
	const weather = WEATHERS[settings.weather] ? settings.weather : "clear";
	const startHour = tod === "dynamic" ? 8 + rand() * 12 : tod === "default" ? naturalHour(theme) : HOUR[tod];
	const perMs = tod === "dynamic" ? 1 / MS_PER_HOUR : 0;
	// Dynamic weather: a run of spells, each different from the last, 45-100 s long.
	let spells = null;
	if(weather === "dynamic"){
		const pick = () => { const r = rand(); return r < 0.38 ? "clear" : r < 0.7 ? "cloudy" : "rain"; };
		spells = [];
		let t = 0, kind = pick();
		for(let k = 0; k < 60; k++){
			const len = 45000 + rand() * 55000;
			spells.push({ from: t, to: t + len, look: kind === "rain" ? [1, 0.55 + rand() * 0.45] : LOOK[kind] });
			t += len;
			let next = pick();
			while(next === kind) next = pick();
			kind = next;
		}
	}
	return {
		dynamic: tod === "dynamic" || weather === "dynamic",
		at(ms){
			ms = Math.max(0, ms || 0);
			const hour = ((startHour + ms * perMs) % 24 + 24) % 24;
			let cloud, rain;
			if(!spells) [cloud, rain] = LOOK[weather];
			else {
				let i = spells.findIndex(s => ms < s.to);
				if(i < 0) i = spells.length - 1;
				const a = spells[i].look, b = (spells[i + 1] || spells[i]).look;
				const f = Math.max(0, Math.min(1, (ms - (spells[i].to - BLEND)) / BLEND));
				const e = f * f * (3 - 2 * f);
				cloud = a[0] + (b[0] - a[0]) * e;
				rain = a[1] + (b[1] - a[1]) * e;
			}
			return { hour, cloud, rain };
		}
	};
}
