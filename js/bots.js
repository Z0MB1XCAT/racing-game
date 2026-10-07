// Computer drivers. They only choose a steering angle; the car physics is the same
// as everyone else's (always accelerating, max steer of 30 degrees).
import { MAX_STEER } from "./physics.js";
import { LEVELS, LEVEL_NAMES, lvl, skillLevel, levelId, levelName } from "./botlevels.js";

// Base driving line settings; a track can override these with `botTune`.
const BASE = { look: 19, over: 1.2, gain: 3.4 };

// Skill levels scale the base: slower reactions, keyboard-style steering and a wobbly line.
// These three are the old Rookie, Racer and Ace; they are still the levels 3, 6 and 10 of the ten below.
export const SKILLS = {
	easy:   { label: "Rookie", lookK: 0.8, overK: 0.6, gainK: 0.7, digital: true, react: 0.2, wobble: 0.5, lane: 0.5, draft: false },
	medium: { label: "Racer",  lookK: 0.9, overK: 0.85, gainK: 0.9, digital: true, react: 0.09, wobble: 0.2, lane: 0.3, draft: true },
	hard:   { label: "Ace",    lookK: 1, overK: 1, gainK: 1, digital: false, react: 0, wobble: 0, lane: 0.12, draft: true }
};

// ---------- Ten levels ----------
// Level 3 is Rookie, 6 is Racer and 10 is Ace exactly; the others are worked out in between (and level 1 is a
// little worse than Rookie). A level is only ever how well a bot steers: nothing here touches the car's handling.
// (The names and settings are in js/botlevels.js, which the menus use too.)
export { LEVELS, LEVEL_NAMES, skillLevel, levelId, levelName };
const LEVEL_ONE = { lookK: 0.72, overK: 0.45, gainK: 0.55, digital: true, react: 0.28, wobble: 0.8, lane: 0.6, draft: false };
const ANCHORS = [[1, LEVEL_ONE], [3, SKILLS.easy], [6, SKILLS.medium], [10, SKILLS.hard]];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The skill numbers for a level (fractions work: the adaptive bots slide between levels).
export function levelParams(n){
	n = lvl(n);
	let a = ANCHORS[0], b = ANCHORS[1];
	for(let i = 0; i < ANCHORS.length - 1; i++){ if(n >= ANCHORS[i][0]){ a = ANCHORS[i]; b = ANCHORS[i + 1]; } }
	const k = (n - a[0]) / (b[0] - a[0]), lerp = key => a[1][key] + (b[1][key] - a[1][key]) * k;
	return {
		label: levelName(n), lookK: lerp("lookK"), overK: lerp("overK"), gainK: lerp("gainK"), react: lerp("react"), wobble: lerp("wobble"), lane: lerp("lane"),
		digital: n < 10, draft: n >= 4
	};
}

// ---------- Personalities ----------
// A name always comes with the same personality, so "Lockup Leo" is always bold. These change how a bot drives round
// other cars and when it is at its best; none of them make a bot a lot quicker or slower than its level.
export const PERSONAS = {
	bold:    { label: "Bold", blurb: "Pulls out early to pass and swings about the track. Quick to react, and makes more mistakes.", pass: 9.5, tuck: 14, lane: 1.3, gain: 1.08, wobble: 1.6 },
	careful: { label: "Careful", blurb: "Gives other cars room and keeps a steady line, a touch slower.", passLane: 0.65, lane: 0.5, wobble: 0.5, gain: 0.95, shift: () => -0.5 },
	wet:     { label: "Wet weather", blurb: "A wet-weather specialist: two levels better in rain, snow and storms, one worse when it's dry.", shift: c => c.wet ? 2 : -1 },
	slip:    { label: "Slipstreamer", blurb: "Tucks into the tow from close up and stays in it.", tuck: 6, draft: true },
	late:    { label: "Late charger", blurb: "Starts a level and a half down and gets better every lap.", shift: c => clamp(-1.5 + 0.8 * Math.max(0, (c.lap || 1) - 1), -1.5, 1.5) }
};
// Twenty made-up names (the first eleven are the ones the commentary has clips for) and the personality each one drives like.
export const BOT_ROSTER = [
	["Pixel Pete", "careful"], ["Nitro Nia", "bold"], ["Captain Kerb", "bold"], ["Slipstream Sam", "slip"], ["Apex Ava", "careful"],
	["Chicane Charlie", "wet"], ["Grid Greta", "late"], ["Lockup Leo", "bold"], ["Drift Dana", "wet"], ["Pitlane Pat", "late"], ["Turbo Tia", "slip"],
	["Rev Rory", "bold"], ["Hairpin Hal", "careful"], ["Gearbox Gus", "late"], ["Tarmac Tess", "wet"], ["Camber Cleo", "slip"],
	["Throttle Theo", "bold"], ["Podium Percy", "careful"], ["Wing Wanda", "slip"], ["Visor Vic", "wet"]
].map(([name, persona]) => ({ name, persona }));
const PERSONA_OF = new Map(BOT_ROSTER.map(r => [r.name, r.persona]));
export const personaOf = name => PERSONA_OF.get(name) || null;

// ---------- Adaptive bots ----------
// "Bots stay within about a second of you": each frame a bot's level moves up when it's more than a second behind the
// driver, down when it's more than a second ahead, and drifts back towards its own level when it's close. gap is in
// seconds, positive when the bot is ahead.
export const ADAPT_WINDOW = 1;
export function adaptLevel({ level, base, gap, dt }){
	const over = Math.abs(gap) - ADAPT_WINDOW;
	let v = level;
	if(over > 0) v += (gap > 0 ? -1 : 1) * Math.min(2.5, 0.3 + 0.55 * over) * dt;
	else v += (base - v) * Math.min(1, dt * 0.2);
	return lvl(v);
}

const wrap = a => {
	while(a > Math.PI) a -= Math.PI * 2;
	while(a < -Math.PI) a += Math.PI * 2;
	return a;
};

export class Bot {
	constructor(skill = "medium", rand = Math.random, tune, persona = null){
		this.b = Object.assign({}, BASE, tune);
		this.skill = skill;
		this.persona = PERSONAS[persona] || null;
		// The three old skills keep their exact numbers (SKILLS), so nothing about them has changed.
		this.legacy = SKILLS[skill] ? skill : null;
		this.base = skillLevel(skill);
		this.level = this.base;          // where it is now (the adaptive controller moves this)
		this.cond = { wet: false, lap: 1 };
		this.cur = null;
		this.rand = rand;
		this.lane = 0;
		this.laneGoal = 0;
		this.laneTimer = 0;
		this.hold = 0;
		this.out = 0;
		this.wob = 0;
		this.refresh();
	}

	// The level it is driving at now: its own (or the adaptive one), nudged by its personality.
	get effective(){
		const sh = this.persona && this.persona.shift ? this.persona.shift(this.cond) : 0;
		return lvl(this.level + sh);
	}
	// Called when the weather or lap changes (the race tells it).
	setConditions(wet, lap){
		if(this.cond.wet === !!wet && this.cond.lap === lap) return;
		this.cond = { wet: !!wet, lap };
		this.refresh();
	}
	setLevel(v){ this.level = lvl(v); this.refresh(); }
	refresh(){
		const eff = this.effective;
		if(this.cur !== null && Math.abs(eff - this.cur) < 0.03) return;
		this.cur = eff;
		const b = this.b, pe = this.persona || {};
		// An unchanged, personality-less Rookie, Racer or Ace uses the old numbers; everything else is worked out from its level.
		const s = this.legacy && !pe.shift && this.level === this.base ? SKILLS[this.legacy] : levelParams(eff);
		this.p = Object.assign({}, s, { look: b.look * s.lookK, over: b.over * s.overK, gain: b.gain * s.gainK * (pe.gain || 1), hairpin: b.hairpin });
		this.p.lane = s.lane * (pe.lane || 1);
		this.p.wobble = s.wobble * (pe.wobble || 1);
		if(pe.draft) this.p.draft = true;
		if(b.analog) this.p.digital = false;
	}

	steer(car, tracker, cars, dt){
		const p = this.p, d = car.data, pe = this.persona || {};
		const speed = Math.hypot(d.xv, d.yv);
		const passAt = pe.pass || 7, tuckFrom = pe.tuck || 9, passLane = pe.passLane || 0.45;

		// Drift between lanes now and then, and pull out to pass a car right in front.
		this.laneTimer -= dt;
		if(this.laneTimer <= 0){
			this.laneTimer = 2 + this.rand() * 4;
			this.laneGoal = (this.rand() * 2 - 1) * p.lane;
		}
		const path = tracker.path;
		let closest = Infinity;
		for(const o of cars){
			if(o === car) continue;
			const dx = o.data.x - d.x, dz = o.data.y - d.y, dist = Math.hypot(dx, dz);
			if(dist > 24 || dist < 0.1) continue;
			const fwd = (dx * Math.sin(d.dir) + dz * Math.cos(d.dir)) / dist;
			if(fwd < 0.85 || dist > closest) continue;
			closest = dist;
			if(dist < passAt){
				// Right on its bumper: pull out to pass.
				const side = dx * Math.cos(d.dir) - dz * Math.sin(d.dir);
				this.laneGoal = side > 0 ? -passLane : passLane;
				this.laneTimer = 1.2;
			}else if(p.draft && path && o.ci != null && dist > tuckFrom){
				// Close enough to feel the tow: tuck in behind it.
				const i = o.ci, span = Math.max(1, path.hw - 2);
				const lat = (o.data.x - path.x[i]) * path.tz[i] - (o.data.y - path.z[i]) * path.tx[i];
				this.laneGoal = Math.max(-0.6, Math.min(0.6, lat / span));
				this.laneTimer = 0.8;
			}
		}
		this.lane += (this.laneGoal - this.lane) * Math.min(1, dt * 1.5);

		const c = tracker.path;
		if(!c) return 0;
		let look = p.look * (0.55 + speed / 0.4 * 0.6);
		// Look less far into hairpins, or the aim point ends up behind the inside wall.
		const i0 = car.ci ?? 0, far = (i0 + Math.round(look / c.step)) % c.n;
		const turn = Math.abs(wrap(Math.atan2(c.tx[far], c.tz[far]) - Math.atan2(c.tx[i0], c.tz[i0])));
		if(p.hairpin && turn > 1.2) look *= Math.max(p.hairpin, 1.2 / turn);
		const j = (i0 + Math.round(look / c.step)) % c.n;
		const off = this.lane * Math.max(0, c.hw - 2);
		const tx = c.x[j] + c.tz[j] * off;
		const tz = c.z[j] - c.tx[j] * off;

		const want = Math.atan2(tx - d.x, tz - d.y);
		const moving = speed > 0.05 ? Math.atan2(d.xv, d.yv) : d.dir;
		const aim = want + p.over * wrap(want - moving);
		let s = p.gain * wrap(aim - d.dir);

		if(p.wobble){
			this.wob += (this.rand() * 2 - 1) * dt * 3;
			this.wob *= Math.pow(0.3, dt);
			s += this.wob * p.wobble;
		}
		s = Math.max(-MAX_STEER, Math.min(MAX_STEER, s));

		if(p.digital){
			// Keyboard-style: full lock or nothing, with a reaction delay.
			this.hold -= dt;
			if(this.hold <= 0){
				this.hold = p.react * (0.6 + this.rand() * 0.8);
				this.out = Math.abs(s) < MAX_STEER * 0.22 ? 0 : Math.sign(s) * MAX_STEER;
			}
			return this.out;
		}
		return s;
	}
}
