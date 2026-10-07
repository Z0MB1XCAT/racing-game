// The ten bot levels as names and settings (no driving in here, so menus and goals can use it without the physics).
// js/bots.js turns a level into steering.

export const LEVELS = 10;
export const LEVEL_NAMES = ["Learner", "Beginner", "Rookie", "Improver", "Club", "Racer", "Contender", "Expert", "Pro", "Ace"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A level as a number from 1 to 10: anything that isn't a number is Racer.
export const lvl = n => clamp(Number.isFinite(n) ? n : 6, 1, LEVELS);

// What a bot's skill setting means as a level: "easy", "medium" and "hard" (as saved by older versions and rooms), or "l7".
export function skillLevel(skill){
	if(skill === "easy") return 3;
	if(skill === "medium") return 6;
	if(skill === "hard") return 10;
	const m = /^l(\d{1,2})$/.exec(String(skill));
	return m ? clamp(+m[1], 1, LEVELS) : 6;
}
// The setting to save for a level. 3, 6 and 10 keep their old names so a room with an older version in it still understands them.
export const levelId = n => ({ 3: "easy", 6: "medium", 10: "hard" })[Math.round(lvl(n))] || "l" + Math.round(lvl(n));
export const levelName = n => LEVEL_NAMES[Math.round(lvl(n)) - 1];
