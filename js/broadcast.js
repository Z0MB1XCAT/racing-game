// TV coverage: trackside cameras, an automatic director that follows the action,
// highlights built from what happened in the race, and a replay player.
import { seededRandom, nearestOnPath } from "./trackgen.js";
import { animateCar } from "./cars.js";

const THREE = globalThis.THREE;
const SHOTS = ["auto", "track", "chase", "heli", "onboard"];
export const SHOT_NAMES = { auto: "Auto", track: "Trackside", chase: "Chase", heli: "Helicopter", onboard: "Onboard" };

// Camera spots every ~55 units, alternating sides, a bit back from the barriers.
function makeSpots(track, path){
	if(!path) return [];
	const hw = track.center ? track.center.hw : 5;
	const rand = seededRandom("tv:" + track.id);
	const every = Math.max(20, Math.round(55 / path.step));
	const out = [];
	for(let i = 0; i < path.n; i += every){
		const side = out.length % 2 ? 1 : -1;
		const off = hw + 6 + rand() * 7;
		out.push({ i, x: path.x[i] + path.tz[i] * off * side, z: path.z[i] - path.tx[i] * off * side, y: 3.5 + rand() * 5 });
	}
	return out;
}

export class Director {
	constructor(camera, track, tracker){
		this.camera = camera;
		this.track = track;
		this.path = tracker.path;
		this.spots = makeSpots(track, tracker.path);
		this.shot = "auto";          // what the viewer asked for
		this.current = "track";      // what is on screen now
		this.nextSwitch = 0;
		this.spot = null;
		this.look = new THREE.Vector3();
		this.pos = new THREE.Vector3();
		this.hint = 0;
		this.cut = true;
	}
	cycleShot(){
		this.shot = SHOTS[(SHOTS.indexOf(this.shot) + 1) % SHOTS.length];
		this.cut = true;
		return this.shot;
	}
	// Called when the focused car changes, so the next frame cuts instead of panning.
	newFocus(){ this.cut = true; this.spot = null; }

	// focus: { x, z, dir, speed }. t: seconds (only used to time shot changes).
	update(dt, t, focus){
		if(!focus) return;
		const cam = this.camera;
		const path = this.path;
		if(path) this.hint = nearestOnPath(path, focus.x, focus.z, this.hint);
		// Pick the shot.
		if(this.shot !== "auto") this.current = this.shot;
		else if(t >= this.nextSwitch){
			// Mostly trackside, with a helicopter or chase shot now and then.
			if(this.current === "track"){
				this.current = Math.random() < 0.55 ? "heli" : "chase";
				this.nextSwitch = t + 4 + Math.random() * 2;
			}else{
				this.current = "track";
				this.nextSwitch = t + 12 + Math.random() * 8;
			}
			this.cut = true;
		}
		const sx = Math.sin(focus.dir), cz = Math.cos(focus.dir);
		let fov = 60, px, py, pz, lx = focus.x, ly = 0.8, lz = focus.z, smooth = 6;
		if(this.current === "track" && this.spots.length && path){
			// Nearest camera the car is driving towards; move on once it's well past.
			const n = path.n, ahead = s => ((s.i - this.hint) % n + n) % n;
			const passedBy = s => { const a = ahead(s); return a > n / 2 ? n - a : 0; };
			if(!this.spot || passedBy(this.spot) * path.step > 22){
				let best = null, bestA = Infinity;
				for(const s of this.spots){ const a = ahead(s); if(a > 8 && a < bestA){ bestA = a; best = s; } }
				if(best !== this.spot){ this.spot = best; this.cut = true; }
			}
			const s = this.spot;
			px = s.x; py = s.y; pz = s.z;
			const dist = Math.hypot(focus.x - s.x, focus.z - s.z);
			fov = Math.max(16, Math.min(70, 2 * Math.atan(9 / Math.max(1, dist)) * 180 / Math.PI));
			lx = focus.x + sx * 2; lz = focus.z + cz * 2;
			smooth = 10;
		}else if(this.current === "heli"){
			px = focus.x - sx * 20; py = 17; pz = focus.z - cz * 20;
			lx = focus.x + sx * 8; lz = focus.z + cz * 8; ly = 0;
			fov = 55; smooth = 3;
		}else if(this.current === "onboard"){
			px = focus.x + sx * 0.3; py = 1.25; pz = focus.z + cz * 0.3;
			lx = focus.x + sx * 20; ly = 1; lz = focus.z + cz * 20;
			fov = 80; smooth = 1000;
		}else{
			px = focus.x - sx * 7; py = 2.8; pz = focus.z - cz * 7;
			fov = 70; smooth = 5;
		}
		const k = this.cut ? 1 : Math.min(1, dt * smooth);
		this.pos.set(this.cut ? px : this.pos.x + (px - this.pos.x) * k, py, this.cut ? pz : this.pos.z + (pz - this.pos.z) * k);
		if(this.current === "track" && !this.cut) this.pos.set(px, py, pz);   // trackside cameras don't move, they pan
		this.look.set(this.cut ? lx : this.look.x + (lx - this.look.x) * Math.min(1, dt * 8), ly, this.cut ? lz : this.look.z + (lz - this.look.z) * Math.min(1, dt * 8));
		cam.position.copy(this.pos);
		cam.lookAt(this.look);
		if(Math.abs(cam.fov - fov) > 0.1){
			cam.fov = this.cut ? fov : cam.fov + (fov - cam.fov) * Math.min(1, dt * 4);
			cam.updateProjectionMatrix();
		}
		this.cut = false;
	}
	release(){
		this.camera.fov = 90;
		this.camera.updateProjectionMatrix();
	}
}

// Who's worth watching right now: the closest fight, favouring the front of the field,
// or a car that has just crashed.
export function pickFocus(race, current, holdUntil, t){
	if(t < holdUntil && race.byId.get(current) && !race.byId.get(current).gone) return current;
	const recent = race.events.filter(e => (e.type === "crash" || e.type === "pass") && t * 1000 - e.t < 2500 && e.t > 0);
	if(recent.length){
		const e = recent[recent.length - 1];
		const car = race.byId.get(e.a);
		if(car && car.elim === null && !car.gone) return e.a;
	}
	const st = race.standings().filter(s => s.car.elim === null && !s.car.gone && s.car.finish === null);
	if(!st.length){ const any = race.standings()[0]; return any ? any.car.id : current; }
	let best = st[0].car.id, bestScore = Infinity;
	for(let i = 1; i < st.length; i++){
		const gap = (st[i - 1].prog - st[i].prog) * race.lapLen / 21;
		const score = gap + i * 0.25;
		if(score < bestScore){ bestScore = score; best = st[i].car.id; }
	}
	return bestScore < 2.5 ? best : st[0].car.id;
}

// ----- Highlights -----
const SCORE = { photo: 10, lead: 7, finish: 6, start: 5, out: 4, podiumPass: 5, pass: 3, crash: 3, contact: 2, fastest: 2 };

export function buildHighlights(events, endT, maxClips = 7){
	const scored = events.map(e => {
		let s = SCORE[e.type] || 1;
		if(e.type === "pass" && e.pos === 1) s = SCORE.lead;
		else if(e.type === "pass" && e.pos <= 3) s = SCORE.podiumPass;
		if(e.type === "crash" && e.pos && e.pos <= 3) s += 2;
		return Object.assign({ score: s }, e);
	});
	const start = scored.find(e => e.type === "start");
	const finish = scored.find(e => e.type === "photo") || scored.find(e => e.type === "finish");
	const middle = scored.filter(e => e !== start && e !== finish && e.type !== "start" && e.type !== "finish" && e.type !== "photo")
		.sort((a, b) => b.score - a.score);
	// Variety: only a couple of crashes, one contact, one fastest lap, and never the
	// same driver twice for the same kind of moment.
	const CAP = { crash: 2, contact: 1, fastest: 1, out: 3 };
	const picked = [], count = {};
	for(const e of middle){
		if(picked.length >= maxClips - 2) break;
		if(picked.some(p => Math.abs(p.t - e.t) < 5000)) continue;
		if(start && e.t < 6000) continue;
		if(CAP[e.type] && (count[e.type] || 0) >= CAP[e.type]) continue;
		if(picked.some(p => p.type === e.type && p.a === e.a)) continue;
		count[e.type] = (count[e.type] || 0) + 1;
		picked.push(e);
	}
	const clips = [];
	if(start) clips.push({ from: 0, to: 5500, focus: start.a, text: start.text, type: "start" });
	for(const e of picked.sort((a, b) => a.t - b.t)) clips.push({ from: Math.max(0, e.t - 3500), to: Math.min(endT, e.t + 2500), focus: e.a, text: e.text, type: e.type });
	if(finish) clips.push({ from: Math.max(0, finish.t - 4500), to: Math.min(endT, finish.t + 2000), focus: finish.a, text: finish.text, type: finish.type });
	return clips;
}

// ----- Replay player -----
export class Replay {
	// race: finished Race (with .rec); clips: highlight clips, or null for the full race.
	constructor(race, clips, focusId){
		this.race = race;
		this.frames = race.rec.frames;
		this.clips = clips;
		this.clip = 0;
		this.speed = 1;
		this.playing = true;
		this.start = this.frames.length ? this.frames[0].t : 0;
		this.end = this.frames.length ? this.frames[this.frames.length - 1].t : 0;
		this.t = clips && clips.length ? clips[0].from : this.start;
		this.focusId = clips && clips.length ? clips[0].focus : focusId;
		this.done = !this.frames.length;
		this.idx = 0;
	}
	get caption(){ return this.clips && this.clips[this.clip] ? this.clips[this.clip].text : ""; }
	step(dt){
		if(this.done || !this.playing) return;
		this.t += dt * 1000 * this.speed;
		if(this.clips){
			const c = this.clips[this.clip];
			if(this.t >= c.to){
				this.clip++;
				if(this.clip >= this.clips.length){ this.done = true; return; }
				this.t = this.clips[this.clip].from;
				this.focusId = this.clips[this.clip].focus || this.focusId;
				this.cutNeeded = true;
			}
		}else if(this.t >= this.end){ this.t = this.end; this.playing = false; }
	}
	seek(frac){ this.t = this.start + (this.end - this.start) * frac; this.cutNeeded = true; }
	// Put every car where it was at time t. Returns the focused car's pose.
	apply(dt){
		const fr = this.frames;
		if(!fr.length) return null;
		let i = Math.min(this.idx, fr.length - 1);
		while(i > 0 && fr[i].t > this.t) i--;
		while(i < fr.length - 2 && fr[i + 1].t <= this.t) i++;
		this.idx = i;
		const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
		const f = b.t > a.t ? Math.max(0, Math.min(1, (this.t - a.t) / (b.t - a.t))) : 0;
		let focus = null;
		this.race.cars.forEach((c, k) => {
			const o = k * 6;
			const vis = a.f[o + 5] > 0.5;
			c.model.visible = vis;
			if(!vis) return;
			const x = a.f[o] + (b.f[o] - a.f[o]) * f, z = a.f[o + 1] + (b.f[o + 1] - a.f[o + 1]) * f;
			let dr = b.f[o + 2] - a.f[o + 2];
			while(dr > Math.PI) dr -= Math.PI * 2;
			while(dr < -Math.PI) dr += Math.PI * 2;
			const dir = a.f[o + 2] + dr * f;
			c.model.position.set(x, 0, z);
			c.model.rotation.y = dir;
			animateCar(c.model, a.f[o + 3], this.playing ? a.f[o + 4] * this.speed : 0, dt);
			if(c.id === this.focusId) focus = { x, z, dir, speed: a.f[o + 4], car: c };
		});
		return focus;
	}
}
