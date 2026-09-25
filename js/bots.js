// Computer drivers. They only choose a steering angle; the car physics is the same
// as everyone else's (always accelerating, max steer of 30 degrees).
import { MAX_STEER } from "./physics.js";

// Base driving line settings; a track can override these with `botTune`.
const BASE = { look: 19, over: 1.2, gain: 3.4 };

// Skill levels scale the base: slower reactions, keyboard-style steering and a wobbly line.
export const SKILLS = {
	easy:   { label: "Rookie", lookK: 0.8, overK: 0.6, gainK: 0.7, digital: true, react: 0.2, wobble: 0.5, lane: 0.5, draft: false },
	medium: { label: "Racer",  lookK: 0.9, overK: 0.85, gainK: 0.9, digital: true, react: 0.09, wobble: 0.2, lane: 0.3, draft: true },
	hard:   { label: "Ace",    lookK: 1, overK: 1, gainK: 1, digital: false, react: 0, wobble: 0, lane: 0.12, draft: true }
};

const wrap = a => {
	while(a > Math.PI) a -= Math.PI * 2;
	while(a < -Math.PI) a += Math.PI * 2;
	return a;
};

export class Bot {
	constructor(skill = "medium", rand = Math.random, tune){
		const s = SKILLS[skill] || SKILLS.medium, b = Object.assign({}, BASE, tune);
		this.p = Object.assign({}, s, { look: b.look * s.lookK, over: b.over * s.overK, gain: b.gain * s.gainK, hairpin: b.hairpin });
		if(b.analog) this.p.digital = false;
		this.skill = skill;
		this.rand = rand;
		this.lane = 0;
		this.laneGoal = 0;
		this.laneTimer = 0;
		this.hold = 0;
		this.out = 0;
		this.wob = 0;
	}

	steer(car, tracker, cars, dt){
		const p = this.p, d = car.data;
		const speed = Math.hypot(d.xv, d.yv);

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
			if(dist < 7){
				// Right on its bumper: pull out to pass.
				const side = dx * Math.cos(d.dir) - dz * Math.sin(d.dir);
				this.laneGoal = side > 0 ? -0.45 : 0.45;
				this.laneTimer = 1.2;
			}else if(p.draft && path && o.ci != null && dist > 9){
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
