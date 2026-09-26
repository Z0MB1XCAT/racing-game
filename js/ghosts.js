// Ghost laps: compact storage and sector splits.
// A ghost is { ms, s: [[t, x, y, dir], ...] } with a sample about every 50 ms.
import { nearestOnPath } from "./trackgen.js";

// Where the three sectors end, as fractions of the lap.
export const SPLITS = [1 / 3, 2 / 3];

// "v2|" then one entry per sample: the change in time, x, y and heading since the last
// sample, in base 36 (positions to 5 cm, heading to 0.01 rad). About a third the size of JSON.
export function packGhost(s){
	let p = [0, 0, 0, 0];
	const out = [];
	for(const q of s){
		const v = [Math.round(q[0]), Math.round(q[1] * 20), Math.round(q[2] * 20), Math.round(q[3] * 100)];
		out.push(v.map((x, i) => (x - p[i]).toString(36)).join(","));
		p = v;
	}
	return "v2|" + out.join(";");
}
export function unpackGhost(str){
	if(typeof str !== "string") return null;
	if(!str.startsWith("v2|")){ try { return JSON.parse(str); } catch { return null; } }
	const p = [0, 0, 0, 0];
	return str.slice(3).split(";").map(r => {
		const d = r.split(",");
		for(let i = 0; i < 4; i++) p[i] += parseInt(d[i], 36);
		return [p[0], p[1] / 20, p[2] / 20, p[3] / 100];
	});
}

// Sector times [s1, s2, s3] of a ghost lap, worked out from where it was on the track.
export function ghostSectors(ghost, path){
	if(!ghost || !ghost.s || ghost.s.length < 10 || !path) return null;
	const s = ghost.s;
	let ci = nearestOnPath(path, s[0][1], s[0][2], -1);
	const at = [null, null];
	for(const q of s){
		ci = nearestOnPath(path, q[1], q[2], ci);
		let f = ci / path.n;
		if(f > 0.9 && q[0] < ghost.ms * 0.2) f = 0;       // just after the line
		if(at[0] === null && f >= SPLITS[0] && f < 0.6) at[0] = q[0];
		else if(at[0] !== null && at[1] === null && f >= SPLITS[1] && f < 0.95) at[1] = q[0];
	}
	if(at[0] === null || at[1] === null || at[1] <= at[0] || ghost.ms <= at[1]) return null;
	return [at[0], at[1] - at[0], ghost.ms - at[1]];
}
