// One race: the cars, the rules and the clock. Physics comes from physics.js untouched.
import * as phys from "./physics.js";
import { makeTracker, raceProgress } from "./progress.js";
import { Bot } from "./bots.js";
import { isOffTrack, noteGoodSpot, rescue, OFF_TRACK_GRACE } from "./rescue.js";
import { makeCar, animateCar, disposeCar } from "./cars.js";
import { seededRandom } from "./trackgen.js";
import { SEND_RATE } from "./config.js";
import { applySlipstream } from "./slipstream.js";

const THREE = globalThis.THREE;
export const COUNTDOWN = 3000;          // same three seconds as the original
const FINISH_WAIT = 30000;              // after the winner, everyone else gets this long
const AVG_SPEED = 21;                   // world units per second, for gap estimates

export class Race {
	// opts: { scene, track, tracker?, laps, mode: "race"|"elim"|"trial", entrants, myId, now(), startAt,
	//         authority, net?, ghost?, onEvent(type, data) }
	constructor(opts){
		Object.assign(this, {
			scene: opts.scene, track: opts.track, laps: opts.laps, mode: opts.mode || "race",
			myId: opts.myId, now: opts.now, startAt: opts.startAt, authority: !!opts.authority,
			net: opts.net || null, onEvent: opts.onEvent || (() => {})
		});
		this.draft = opts.draft !== false;
		this.tracker = opts.tracker || makeTracker(this.track);
		this.lapLen = this.tracker.path ? this.tracker.path.len : 500;
		this.rand = seededRandom("race" + this.startAt);
		this.cars = [];
		this.byId = new Map();
		this.phase = "countdown";
		this.firstFinish = null;
		this.elimOrder = 0;
		this.ended = false;
		this.sendTimer = 0;
		this.hitCooldown = new Map();
		const lineCount = this.track.lines.length;

		opts.entrants.forEach((e, slot) => {
			const data = phys.newCarData(slot, lineCount);
			const car = {
				id: e.id, name: e.name, hue: e.hue, body: e.body || "classic",
				isBot: !!e.bot, skill: e.bot || null, local: !!e.local, me: e.id === this.myId,
				bot: e.bot && e.local ? new Bot(e.bot, this.rand, this.track.def && this.track.def.botTune) : null,
				data, pos: new THREE.Vector3(data.x, phys.CAR_Y, data.y),
				model: makeCar(e.body || "classic", e.hue),
				finish: null, elim: null, best: null, lapStart: null, lapTimes: [],
				vis: { x: 0, z: 0, r: 0 }, bestProg: 0, bestProgT: 0
			};
			car.model.position.set(data.x, 0, data.y);
			this.scene.add(car.model);
			this.cars.push(car);
			this.byId.set(car.id, car);
		});
		this.me = this.byId.get(this.myId) || null;

		// Ghost of your best lap (time trial).
		this.ghostData = opts.ghost || null;
		this.ghostModel = null;
		if(this.mode === "trial" && this.me){
			this.ghostModel = makeCar(this.me.body, this.me.hue, { ghost: true });
			this.ghostModel.visible = false;
			this.scene.add(this.ghostModel);
			this.recording = [];
		}
	}

	get raceTime(){ return this.now() - this.startAt; }
	get active(){ return this.cars.filter(c => c.elim === null && !c.gone); }

	update(dt, mySteer){
		const t = this.raceTime;
		if(t < 0){
			this.phase = "countdown";
			for(const c of this.cars) this.placeModel(c, dt);
			return;
		}
		if(this.phase === "countdown"){ this.phase = "racing"; this.onEvent("go"); }

		const warp = Math.min(phys.MAX_WARP, dt * 1000 / 16);
		const active = this.active;
		for(const c of active){
			if(c.me) c.data.steer = phys.clampSteer(mySteer);
			else if(c.bot){
				this.tracker.update(c);
				c.data.steer = phys.clampSteer(c.bot.steer(c, this.tracker, active, dt));
			}
		}
		const lapsBefore = active.map(c => c.data.lap);
		if(this.draft) applySlipstream(active, warp);
		phys.stepCars(active, this.track.walls, this.track.lines, this.track.oob, warp, (type, car, strength, other) => this.onHit(type, car, strength, other));

		active.forEach((c, k) => {
			this.tracker.update(c);
			if(c.local){
				this.rescueRules(c, t);
				if(c.data.lap > lapsBefore[k]) this.onLap(c, t);
			}
			const p = raceProgress(c);
			if(p > c.bestProg + 0.001){ c.bestProg = p; c.bestProgT = t; }
		});

		if(this.me && this.ghostModel) this.ghostStep(t);
		if(this.me && this.me.elim === null) this.wrongWayCheck(dt);

		if(this.authority && !this.ended) this.rules(t);
		for(const c of this.cars) this.placeModel(c, dt);

		if(this.net){
			this.sendTimer -= dt;
			if(this.sendTimer <= 0){
				this.sendTimer = 1 / (this.net.sendRate ? this.net.sendRate() : SEND_RATE);
				for(const c of this.cars) if(c.local && !c.gone) this.net.sendState(c.id, this.packState(c));
			}
		}
	}

	onHit(type, car, strength, other){
		const key = car.id + type;
		const last = this.hitCooldown.get(key) || 0;
		const t = performance.now();
		if(t - last < 120) return;
		this.hitCooldown.set(key, t);
		this.onEvent("hit", { type, car, strength, other });
	}

	onLap(c, t){
		// Lap 0 -> 1 is crossing the line from the grid; timing starts there.
		if(c.lapStart !== null){
			const lapMs = t - c.lapStart;
			c.lapTimes.push(lapMs);
			const pb = c.best === null || lapMs < c.best;
			if(pb) c.best = lapMs;
			this.onEvent("lap", { car: c, ms: lapMs, best: pb });
			if(c.me && this.ghostModel && this.recording){
				if(pb) this.ghostData = { ms: lapMs, s: this.recording };
				this.recording = [];
			}
		}
		c.lapStart = t;
		if(c.me && this.recording) this.recording = [];
		if(this.mode === "race" && c.data.lap > this.laps && c.finish === null){
			c.finish = t;
			if(this.firstFinish === null) this.firstFinish = t;
			this.onEvent("finish", { car: c, ms: t, position: this.standings().findIndex(s => s.car === c) + 1 });
		}else if(this.mode === "race" && c.me && c.data.lap === this.laps && this.laps > 1){
			this.onEvent("finalLap", {});
		}
	}

	rescueRules(c, t){
		noteGoodSpot(this.track, this.tracker, c, t / 1000);
		if(isOffTrack(this.track, this.tracker, c)){
			if(c.offSince == null) c.offSince = t;
			if(t - c.offSince > OFF_TRACK_GRACE * 1000) this.doRescue(c);
		}else c.offSince = null;
		if(c.bot && t - c.bestProgT > 4000 && t > 5000 && c.finish === null){
			this.doRescue(c);
			c.bestProgT = t;
		}
	}

	doRescue(c){
		rescue(this.track, this.tracker, c, this.active);
		c.vis.x = c.vis.z = c.vis.r = 0;
		if(c.me) this.onEvent("rescued", { car: c });
	}

	// Manual reset (R key). Short cooldown so it can't be spammed.
	requestRescue(){
		if(!this.me || this.phase !== "racing" || this.me.elim !== null) return false;
		const t = this.raceTime;
		if(this.me.lastManual && t - this.me.lastManual < 3000) return false;
		this.me.lastManual = t;
		this.doRescue(this.me);
		return true;
	}

	wrongWayCheck(dt){
		const c = this.me, d = c.data;
		const speed = Math.hypot(d.xv, d.yv);
		const back = speed > 0.08 && (d.xv * (c.tanX || 0) + d.yv * (c.tanZ || 0)) / speed < -0.5;
		c.wrongFor = back ? (c.wrongFor || 0) + dt : 0;
		const wrong = c.wrongFor > 1.2;
		if(wrong !== !!this.wrongWay){ this.wrongWay = wrong; this.onEvent("wrongWay", wrong); }
	}

	ghostStep(t){
		const c = this.me;
		if(this.recording && c.lapStart !== null){
			const lt = t - c.lapStart;
			const last = this.recording[this.recording.length - 1];
			if(!last || lt - last[0] >= 50) this.recording.push([Math.round(lt), +c.data.x.toFixed(2), +c.data.y.toFixed(2), +c.data.dir.toFixed(3)]);
			if(this.recording.length > 6000) this.recording = null;
		}
		const g = this.ghostData;
		if(!g || c.lapStart === null){ this.ghostModel.visible = false; return; }
		const lt = t - c.lapStart, s = g.s;
		if(lt > g.ms || !s.length){ this.ghostModel.visible = false; return; }
		let i = Math.min(s.length - 2, Math.max(0, Math.floor(lt / 50)));
		while(i > 0 && s[i][0] > lt) i--;
		while(i < s.length - 2 && s[i + 1][0] < lt) i++;
		const a = s[i], b = s[i + 1] || a;
		const f = b[0] > a[0] ? Math.min(1, Math.max(0, (lt - a[0]) / (b[0] - a[0]))) : 0;
		this.ghostModel.visible = true;
		this.ghostModel.position.set(a[1] + (b[1] - a[1]) * f, 0, a[2] + (b[2] - a[2]) * f);
		let dr = b[3] - a[3];
		while(dr > Math.PI) dr -= Math.PI * 2;
		while(dr < -Math.PI) dr += Math.PI * 2;
		this.ghostModel.rotation.y = a[3] + dr * f;
	}

	// Host / solo only: eliminations and deciding when the race is over.
	rules(t){
		const active = this.active;
		if(this.mode === "elim"){
			const leaderDone = Math.max(0, ...active.map(c => c.data.lap - 1));
			const out = this.cars.filter(c => c.elim !== null).length;
			if(active.length > 1 && leaderDone > out){
				const order = this.standings().filter(s => s.car.elim === null);
				const last = order[order.length - 1].car;
				this.eliminate(last.id, ++this.elimOrder);
			}
			if(active.length <= 1 && !this.endAt){
				if(active[0] && active[0].finish === null){ active[0].finish = t; this.onEvent("finish", { car: active[0], ms: t, position: 1 }); }
				this.endAt = t + 2500;
			}
		}else if(this.mode === "race"){
			const unfinished = active.filter(c => c.finish === null);
			const humansLeft = unfinished.filter(c => !c.isBot).length;
			if(!this.endAt){
				if(!unfinished.length) this.endAt = t + 1500;
				else if(this.firstFinish !== null && humansLeft === 0 && active.some(c => !c.isBot)) this.endAt = t + 6000;
				else if(this.firstFinish !== null) this.endAt = this.firstFinish + FINISH_WAIT;
			}
		}
		if(this.endAt && t >= this.endAt){
			this.ended = true;
			this.onEvent("end", this.results());
		}
	}

	eliminate(id, order){
		const c = this.byId.get(id);
		if(!c || c.elim !== null) return;
		c.elim = order;
		this.elimOrder = Math.max(this.elimOrder, order);
		c.model.visible = false;
		this.onEvent("eliminated", { car: c });
		if(this.net && this.authority) this.net.eliminate(id, order);
	}

	// Host migration: the new host starts driving the bots and running the rules.
	setAuthority(isHost){
		if(this.authority === isHost) return;
		this.authority = isHost;
		for(const c of this.cars){
			if(!c.isBot) continue;
			c.local = isHost;
			c.bot = isHost ? new Bot(c.skill || "medium", this.rand, this.track.def && this.track.def.botTune) : null;
			c.bestProgT = this.raceTime;
		}
	}

	// Race order, best first.
	standings(){
		const list = this.cars.filter(c => !c.gone).map(car => ({ car, prog: raceProgress(car) }));
		list.sort((a, b) => {
			const fa = a.car.finish, fb = b.car.finish;
			if(fa !== null || fb !== null){
				if(fa !== null && fb !== null) return fa - fb;
				return fa !== null ? -1 : 1;
			}
			const ea = a.car.elim, eb = b.car.elim;
			if(ea !== null || eb !== null){
				if(ea !== null && eb !== null) return eb - ea;
				return ea !== null ? 1 : -1;
			}
			return b.prog - a.prog;
		});
		const lead = list[0];
		for(const s of list){
			if(s === lead){ s.gap = null; continue; }
			if(s.car.elim !== null){ s.gap = "OUT"; continue; }
			if(s.car.finish !== null && lead.car.finish !== null){ s.gap = "+" + ((s.car.finish - lead.car.finish) / 1000).toFixed(1); continue; }
			const laps = Math.floor(lead.prog - s.prog);
			s.gap = laps >= 1 ? `+${laps} LAP${laps > 1 ? "S" : ""}` : "+" + ((lead.prog - s.prog) * this.lapLen / AVG_SPEED).toFixed(1);
		}
		return list;
	}

	results(){
		return this.standings().map((s, i) => ({
			id: s.car.id, name: s.car.name, hue: s.car.hue, body: s.car.body, bot: s.car.isBot,
			pos: i + 1, time: s.car.finish, best: s.car.best,
			status: s.car.finish !== null ? "finished" : s.car.elim !== null ? "out" : "dnf",
			gap: s.gap
		}));
	}

	// ----- network -----
	packState(c){
		const d = c.data, r = v => Math.round(v * 1000) / 1000;
		// Stamped with race time (a clock every client shares), so updates stay in order
		// even when a new host takes over sending the bots.
		return { q: Math.round(this.raceTime * 10) / 10, x: r(d.x), y: r(d.y), u: Math.round(d.xv * 1e5) / 1e5, v: Math.round(d.yv * 1e5) / 1e5, d: Math.round(d.dir * 1e4) / 1e4,
			s: Math.round(d.steer * 1e4) / 1e4, l: d.lap, c: d.checkpoint, f: c.finish, b: c.best };
	}

	applyRemote(id, s){
		const c = this.byId.get(id);
		if(!c || c.local || !s) return;
		// The same update can arrive twice (direct and via Firebase); only take newer ones.
		if(s.q != null){
			if(c.lastQ != null && s.q <= c.lastQ) return;
			c.lastQ = s.q;
		}
		const d = c.data;
		const ox = d.x + d.xv, oz = d.y + d.yv, od = d.dir;
		d.x = s.x; d.y = s.y; d.xv = s.u; d.yv = s.v; d.dir = s.d; d.steer = s.s;
		d.lap = s.l; d.checkpoint = s.c;
		c.pos.x = d.x + d.xv; c.pos.z = d.y + d.yv;
		// Smooth the correction on screen instead of snapping.
		c.vis.x += ox - c.pos.x; c.vis.z += oz - c.pos.z;
		let dr = od - d.dir;
		while(dr > Math.PI) dr -= Math.PI * 2;
		while(dr < -Math.PI) dr += Math.PI * 2;
		c.vis.r += dr;
		if(Math.hypot(c.vis.x, c.vis.z) > 8){ c.vis.x = c.vis.z = 0; c.vis.r = 0; }
		if(s.f != null && c.finish === null){
			c.finish = s.f;
			if(this.firstFinish === null || s.f < this.firstFinish) this.firstFinish = s.f;
			this.onEvent("finish", { car: c, ms: s.f });
		}
		if(s.b != null) c.best = s.b;
	}

	applyElims(map){
		if(!map) return;
		for(const id in map) this.eliminate(id, map[id]);
	}

	removeCar(id){
		const c = this.byId.get(id);
		if(!c || c.local) return;
		c.gone = true;
		c.model.visible = false;
		if(c.label) c.label.remove();
	}

	placeModel(c, dt){
		const k = Math.exp(-dt / 0.12);
		c.vis.x *= k; c.vis.z *= k; c.vis.r *= k;
		c.model.position.set(c.pos.x + c.vis.x, 0, c.pos.z + c.vis.z);
		c.model.rotation.y = c.data.dir + c.vis.r;
		animateCar(c.model, c.data.steer, Math.hypot(c.data.xv, c.data.yv), dt);
	}

	dispose(){
		for(const c of this.cars){
			this.scene.remove(c.model);
			disposeCar(c.model);
			if(c.label) c.label.remove();
		}
		if(this.ghostModel){ this.scene.remove(this.ghostModel); disposeCar(this.ghostModel); }
	}
}
