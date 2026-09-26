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
export const QUALI_LAPS = 2;            // timed laps in qualifying (after a flying start)
const FINISH_WAIT = 30000;              // after the winner, everyone else gets this long
const AVG_SPEED = 21;
const fmtLap = ms => { const m = Math.floor(ms / 60000), sec = (ms % 60000) / 1000; return m ? m + ":" + sec.toFixed(3).padStart(6, "0") : sec.toFixed(3); };                   // world units per second, for gap estimates

export class Race {
	// opts: { scene, track, tracker?, laps, mode: "race"|"elim"|"trial", entrants, myId, now(), startAt,
	//         authority, net?, ghost?, onEvent(type, data) }
	constructor(opts){
		Object.assign(this, {
			scene: opts.scene, track: opts.track, laps: opts.laps, mode: opts.mode || "race",
			myId: opts.myId, now: opts.now, startAt: opts.startAt, authority: !!opts.authority,
			net: opts.net || null, onEvent: opts.onEvent || (() => {})
		});
		this.draft = opts.draft !== false && opts.mode !== "quali";
		this.contact = opts.contact === "classic" ? "classic" : "soft";
		this.qualiLimit = opts.qualiLimit || null;
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
		// Recording for replays and highlights: every car 20 times a second, plus key moments.
		this.rec = { frames: [] };
		this.events = [];
		this.nextRec = 0;
		this.nextOrder = 0;
		this.prevOrder = null;
		this.pairSeen = new Map();
		this.bestLapAll = null;
		this.finishers = [];
		const lineCount = this.track.lines.length;

		opts.entrants.forEach((e, slot) => {
			const data = phys.newCarData(slot, lineCount);
			const car = {
				id: e.id, name: e.name, hue: e.hue, body: e.body || "classic",
				isBot: !!e.bot, skill: e.bot || null, local: !!e.local, me: e.id === this.myId,
				bot: e.bot && e.local ? new Bot(e.bot, this.rand, this.track.def && this.track.def.botTune) : null,
				data, pos: new THREE.Vector3(data.x, phys.CAR_Y, data.y),
				model: makeCar(e.body || "classic", e.hue, { look: e.look, ghost: opts.mode === "quali" && e.id !== opts.myId }),
				finish: null, elim: null, best: null, lapStart: null, lapTimes: [],
				vis: { x: 0, z: 0, r: 0 }, bestProg: 0, bestProgT: 0
			};
			car.model.position.set(data.x, 0, data.y);
			this.scene.add(car.model);
			this.cars.push(car);
			this.byId.set(car.id, car);
		});
		this.me = this.byId.get(this.myId) || null;

		// Ghost to chase (time trial): your fastest lap ever, or this week's best in the challenge.
		// It only changes when you beat it. lastLap is the lap just driven, for saving.
		this.ghostData = opts.ghost || null;
		this.lastLap = null;
		this.deltaIdx = 0;
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
		if(this.phase === "countdown"){
			this.phase = "racing";
			if(this.mode !== "quali" && this.mode !== "trial" && this.cars[0]) this.addEvent("start", 0, { a: this.cars[0].id, text: "Lights out" + (this.track.name ? " at " + this.track.name : "") });
			this.onEvent("go");
		}

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
		const hit = (type, car, strength, other) => this.onHit(type, car, strength, other);
		if(this.mode === "quali") for(const c of active) phys.stepCars([c], this.track.walls, this.track.lines, this.track.oob, warp, hit);
		else phys.stepCars(active, this.track.walls, this.track.lines, this.track.oob, warp, hit, this.contact);

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
		this.record(t);

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
		const rt = this.raceTime;
		if(this.mode !== "trial" && this.mode !== "quali" && rt > 2000){
			const last = this.events[this.events.length - 1];
			const recent = last && rt - last.t < 1500 && (last.a === car.id || last.b === car.id) && (last.type === "crash" || last.type === "contact");
			if(!recent && type === "wall" && strength > 0.22) this.addEvent("crash", rt, { a: car.id, pos: this.posOf(car), text: `${car.name} hits the wall` });
			else if(!recent && type === "car" && other && strength > 0.18) this.addEvent("contact", rt, { a: car.id, b: other.id, pos: this.posOf(car), text: `${car.name} and ${other.name} make contact` });
		}
	}

	onLap(c, t){
		// Lap 0 -> 1 is crossing the line from the grid; timing starts there.
		if(c.lapStart !== null){
			const lapMs = t - c.lapStart;
			c.lapTimes.push(lapMs);
			const pb = c.best === null || lapMs < c.best;
			if(pb) c.best = lapMs;
			if(c.me && this.ghostModel){
				this.lastLap = this.recording && this.recording.length > 1 ? { ms: lapMs, s: this.recording } : null;
				if(this.lastLap && (!this.ghostData || lapMs < this.ghostData.ms)) this.ghostData = this.lastLap;
			}
			this.onEvent("lap", { car: c, ms: lapMs, best: pb });
			if(this.mode !== "trial" && (this.bestLapAll === null || lapMs < this.bestLapAll)){
				if(this.bestLapAll !== null) this.addEvent("fastest", t, { a: c.id, text: `${c.name} sets the fastest lap: ${fmtLap(lapMs)}` });
				this.bestLapAll = lapMs;
			}
		}
		c.lapStart = t;
		if(c.me && this.ghostModel){ this.recording = []; this.deltaIdx = 0; }
		if(this.mode === "quali" && c.lapTimes.length >= this.laps && c.finish === null){
			c.finish = t;
			this.onEvent("qualiDone", { car: c, ms: c.best });
		}
		if(this.mode === "race" && c.data.lap > this.laps && c.finish === null){
			c.finish = t;
			if(this.firstFinish === null) this.firstFinish = t;
			this.noteFinish(c, t);
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

	// Live gap to the ghost (ms, negative = ahead): where was the ghost's lap when it was
	// at the point on the track where you are now? null when there's nothing to compare.
	liveDelta(){
		const c = this.me, g = this.ghostData;
		if(!c || !g || !g.s || g.s.length < 3 || c.lapStart === null) return null;
		const lt = this.raceTime - c.lapStart;
		if(lt < 250) return null;
		const s = g.s, x = c.data.x, z = c.data.y;
		const near = (from, to) => {
			let best = -1, bd = Infinity;
			for(let i = Math.max(0, from); i <= Math.min(s.length - 2, to); i++){
				const d = (s[i][1] - x) ** 2 + (s[i][2] - z) ** 2;
				if(d < bd){ bd = d; best = i; }
			}
			return [best, bd];
		};
		// The ghost moves forward, so look just around where we matched last time.
		let [i, d2] = near(this.deltaIdx - 4, this.deltaIdx + 60);
		if(d2 > 15 * 15) [i, d2] = near(0, s.length - 2);        // after a reset: search the whole lap
		if(i < 0 || d2 > 25 * 25) return null;
		this.deltaIdx = i;
		const a = s[i], b = s[i + 1];
		const vx = b[1] - a[1], vz = b[2] - a[2], len2 = vx * vx + vz * vz;
		const f = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[1]) * vx + (z - a[2]) * vz) / len2)) : 0;
		return lt - (a[0] + (b[0] - a[0]) * f);
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
		}else if(this.mode === "quali"){
			const limit = this.qualiLimit || (this.laps + 1.4) * this.lapLen / 17 * 1000 + 20000;
			if(!this.endAt && (active.every(c => c.finish !== null) || t > limit)) this.endAt = t + 1500;
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
		this.addEvent("out", this.raceTime, { a: c.id, text: `${c.name} is eliminated` });
		this.onEvent("eliminated", { car: c });
		if(this.net && this.authority) this.net.eliminate(id, order);
	}

	// ----- replay recording -----
	addEvent(type, t, data){
		this.events.push(Object.assign({ type, t }, data));
	}
	posOf(car){ return this.standings().findIndex(s => s.car === car) + 1; }
	noteFinish(c, t){
		if(this.mode !== "race" || this.finishers.includes(c.id)) return;
		this.finishers.push(c.id);
		if(this.finishers.length === 1) this.addEvent("finish", t, { a: c.id, text: `${c.name} wins` });
		else if(this.finishers.length === 2){
			const w = this.byId.get(this.finishers[0]);
			const gap = t - (w.finish ?? t);
			if(gap < 500){
				const i = this.events.findIndex(e => e.type === "finish");
				if(i >= 0) this.events.splice(i, 1);
				this.addEvent("photo", w.finish, { a: w.id, b: c.id, text: `Photo finish! ${w.name} beats ${c.name} by ${(gap / 1000).toFixed(3)}s` });
			}
		}
	}
	record(t){
		if(t < 0 || this.mode === "trial") return;
		if(t >= this.nextRec){
			this.nextRec = t + 50;
			const f = new Float32Array(this.cars.length * 6);
			this.cars.forEach((c, i) => {
				const o = i * 6;
				f[o] = c.model.position.x; f[o + 1] = c.model.position.z; f[o + 2] = c.model.rotation.y;
				f[o + 3] = c.data.steer; f[o + 4] = Math.hypot(c.data.xv, c.data.yv);
				f[o + 5] = c.gone || c.elim !== null ? 0 : 1;
			});
			this.rec.frames.push({ t, f });
			if(this.rec.frames.length > 14000) this.rec.frames.shift();
		}
		// Overtakes: two cars next to each other in the order swap places.
		if(this.mode !== "quali" && t > 4000 && t >= this.nextOrder){
			this.nextOrder = t + 500;
			const st = this.standings();
			const done = st.filter(x => x.car.finish !== null).length;
			const order = st.filter(x => x.car.elim === null && x.car.finish === null && !x.car.gone).map(x => x.car.id);
			if(this.prevOrder){
				for(let i = 0; i < order.length - 1; i++){
					const a = order[i], b = order[i + 1];
					if(this.prevOrder.indexOf(a) !== i + 1 || this.prevOrder.indexOf(b) !== i) continue;
					const again = this.pairSeen.get(a + ">" + b), back = this.pairSeen.get(b + ">" + a);
					this.pairSeen.set(a + ">" + b, t);
					if((again && t - again < 6000) || (back && t - back < 3000)) continue;
					const A = this.byId.get(a), B = this.byId.get(b), pos = done + i + 1;
					this.addEvent("pass", t, { a, b, pos, text: pos === 1 ? `${A.name} takes the lead from ${B.name}` : `${A.name} passes ${B.name} for P${pos}` });
				}
			}
			this.prevOrder = order;
		}
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
		if(this.mode === "quali"){
			const q = this.cars.filter(c => !c.gone).map(car => ({ car, prog: raceProgress(car) }));
			q.sort((a, b) => (a.car.best ?? Infinity) - (b.car.best ?? Infinity) || b.prog - a.prog);
			const top = q[0] && q[0].car.best;
			q.forEach((s, i) => { s.gap = s.car.best == null ? "NO TIME" : i === 0 ? fmtLap(s.car.best) : "+" + ((s.car.best - top) / 1000).toFixed(3); });
			return q;
		}
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
		if(this.mode === "quali") return this.standings().map((s, i) => ({
			id: s.car.id, name: s.car.name, hue: s.car.hue, body: s.car.body, bot: s.car.isBot,
			pos: i + 1, time: s.car.best, best: s.car.best, status: s.car.best != null ? "finished" : "dnf", gap: i ? s.gap : ""
		}));
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
			this.noteFinish(c, s.f);
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
