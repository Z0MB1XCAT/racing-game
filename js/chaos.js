// The wheel of chaos: a new rule on every lap after the first. It's picked from the race's seed and the lap number, so every driver
// gets the same rule on the same lap with nothing to send over the network, and a lap never gets the rule the lap before had.
// The sky ones are looks only; mirror and wobble change what your own keys do before they reach the car, and nothing else.
// The handling (js/physics.js) is untouched.
import { seededRandom } from "./trackgen.js";

export const CHAOS = [
	{ id: "night",  name: "Night falls", text: "The lights go out", sky: { tod: "night", weather: "clear" } },
	{ id: "fog",    name: "Thick fog", text: "You can hardly see", sky: { tod: "day", weather: "fog" } },
	{ id: "storm",  name: "Storm", text: "Rain and lightning", sky: { tod: "sunset", weather: "storm" } },
	{ id: "snow",   name: "Snowfall", text: "It's snowing", sky: { tod: "day", weather: "snow" } },
	{ id: "mirror", name: "Mirror steering", text: "Left is right", mirror: true },
	{ id: "wobble", name: "Wobbly hands", text: "Your steering shakes", wobble: 0.22 },
	{ id: "blind",  name: "Blindfold", text: "No HUD, no map", blind: true }
];

// The rule for a lap (1 is the first lap): null for lap 1, a rule from CHAOS after it. (Worked out from the start each time, so a
// lap's rule never depends on which laps were asked about first.)
export function chaosFor(seed, lap){
	if(!(lap >= 2)) return null;
	const rand = seededRandom("chaos:" + seed);
	let prev = -1;
	for(let l = 2; l <= Math.min(lap, 200); l++){
		let i = Math.floor(rand() * CHAOS.length);
		if(i === prev) i = (i + 1) % CHAOS.length;
		prev = i;
	}
	return CHAOS[prev];
}

// Your steering after the rule has had its say. steer is what your keys or tilt asked for (about -0.52 to 0.52), t is seconds.
export function chaosSteer(rule, steer, t){
	if(!rule) return steer;
	if(rule.mirror) return -steer;
	if(rule.wobble) return steer + rule.wobble * (Math.sin(t * 5.3) * 0.7 + Math.sin(t * 12.9 + 1) * 0.3);
	return steer;
}
