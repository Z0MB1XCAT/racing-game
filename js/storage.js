// localStorage that never throws (private windows and locked-down school
// browsers can block it). Everything saved here is a nice-to-have.
const PREFIX = "org-gp:";

export function load(key, fallback){
	try {
		const v = localStorage.getItem(PREFIX + key);
		return v == null ? fallback : JSON.parse(v);
	} catch {
		return fallback;
	}
}

export function save(key, value){
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export const defaults = {
	profile: { name: "", hue: Math.floor(Math.random() * 360), body: "classic" },
	settings: { quality: "auto", camera: "classic", volume: 0.7, music: 0.5, sfx: 0.8, engineVol: 0.8, raceMusic: true, mirror: true, shake: true, fps: false, touch: "tilt" }
};

export function getProfile(){ return Object.assign({}, defaults.profile, load("profile", {})); }
export function setProfile(p){ save("profile", p); }
export function getSettings(){
	const saved = load("settings", {});
	// Older saves had an on/off engine switch.
	if(saved.engine === false && saved.engineVol == null) saved.engineVol = 0;
	delete saved.engine;
	return Object.assign({}, defaults.settings, saved);
}
export function setSettings(s){ save("settings", s); }

// Personal bests and ghost laps, per track key (track id + "-rev" when reversed).
export function getBest(key){ return load("best:" + key, null); }
export function setBest(key, ms){ save("best:" + key, ms); }
export function getGhost(key){ return load("ghost:" + key, null); }
export function setGhost(key, ghost){ return save("ghost:" + key, { ms: ghost.ms, s: ghost.s }); }
// Your best time in each sector, per track key: [s1, s2, s3].
export function getSectors(key){ return load("sectors:" + key, null); }
export function setSectors(key, v){ save("sectors:" + key, v); }
// This week's challenge ghost: one slot, { week, ms, s }. Last week's is simply replaced.
export function getWeeklyGhost(week){ const g = load("ghost:weekly", null); return g && g.week === week ? g : null; }
export function setWeeklyGhost(week, ghost){ return save("ghost:weekly", { week, ms: ghost.ms, s: ghost.s }); }

// Tracks saved from the editor: [{ id, name, code, saved }]
export function getCustomTracks(){ return load("customTracks", []); }
export function setCustomTracks(list){ save("customTracks", list); }
