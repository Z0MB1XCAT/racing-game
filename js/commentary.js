// The two commentators: a lead who calls what happens (lights out, overtakes, crashes, the finish) and a co-commentator
// who adds a word of colour. Like a real broadcast they don't talk all the time: there's a gap between lines, a moment
// that has passed is dropped rather than called late, and when it's quiet for long enough they say something about the
// circuit instead.
//   Commentary: start(race, def) at the start of a race (a race you're in, or one you're watching), update(dt, look)
//   every frame, event(type, data) with the race's events, clip(clip) for a highlight in the replay.
// Sentences are stitched from clips (js/voicelines.js, js/speechkit.js) and handed to `say` (js/voice.js).
import { build, makePicker, carPiece, posPiece } from "./speechkit.js";

const VENUES = new Set(["classic", "monaco", "spa", "monza", "suzuka", "jeddah", "daytona", "figure8", "glacier"]);

export class Commentary {
	// say(item): plays an item. rand: random numbers. level: "on" | "off".
	constructor({ say, rand = Math.random, level = "on" }){
		this.say = say; this.rand = rand; this.level = level; this.pick = makePicker(rand);
		this.r = null;
		this.reset();
	}
	reset(){
		this.cool = new Map();
		this.lastSpoke = -1e9;
		this.acc = 0; this.accBattle = 0;
		this.seen = new WeakSet();
		this.flags = {};
		this.pairs = new Map();           // "idA>idB" -> seconds they have been together
		this.venueDone = false;
		this.rain = false; this.night = false;
		this.goT = null;
	}
	start(r, def){
		this.reset(); this.r = r;
		const base = def && (def.layoutOf || def.id);
		this.venue = VENUES.has(base) ? base : "custom";
		for(const e of r.events) this.seen.add(e);
		// The welcome only if there's time to say it before the lights.
		if(this.level !== "off" && (r.mode === "race" || r.mode === "elim") && r.raceTime < -5200){
			this.talk("welcome", ["lead.welcome." + this.venue], { priority: 4, expires: 4000, cool: 1e9 });
			if(r.mode === "race" && r.laps >= 1 && r.laps <= 99) this.talk("laps", [this.line("lead", "raceIs"), { id: `lead.n.${r.laps}`, text: String(r.laps) }, "lead.lapRace"], { priority: 4, expires: 4000, cool: 1e9 });
		}
	}
	stop(){ this.r = null; }

	// ---- saying things ----
	line(voice, family){ return this.pick(`${voice}.${family}`); }
	// kind: what it is (for the cool-down). pieces: clip ids and pieces from speechkit. who: "lead" | "col".
	talk(kind, pieces, { who = "lead", priority = 4, expires = 5000, cool = 8000, interrupt = false } = {}){
		const r = this.r;
		if(!r || this.level === "off") return false;
		const t = r.raceTime;
		if(t - (this.cool.get(kind) ?? -1e9) < cool) return false;
		const s = build(...pieces);
		if(!s.parts.length) return false;
		this.cool.set(kind, t); this.lastSpoke = t;
		this.say({ parts: s.parts, text: s.text, kind: "cast", who, pan: who === "col" ? 0.14 : -0.08, priority, expires, interrupt, key: "cast." + kind });
		return true;
	}
	chance(p){ return this.rand() < p; }
	car(id){ return this.r.byId.get(id); }
	involvesMe(...ids){ return this.r.me && ids.includes(this.r.me.id); }
	// A word of reaction from the co-commentator, a moment after the lead.
	react(p, family = "react", gap = 0.25){
		if(this.chance(p)) this.talk("react", [{ parts: [{ pause: gap }], text: "" }, this.line("col", family)], { who: "col", priority: 3, expires: 6000, cool: 12000 });
	}

	// ---- events ----
	event(type, d){
		const r = this.r;
		if(!r || this.level === "off") return;
		switch(type){
			case "go":
				this.goT = r.raceTime;
				if(r.mode === "quali"){ this.talk("qualiStart", [this.line("lead", "qualiStart")], { priority: 6, cool: 1e9 }); break; }
				if(r.mode === "trial") break;
				this.talk("lights", [this.line("lead", "lightsOut")], { priority: 9, interrupt: true, expires: 3000, cool: 1e9 });
				break;
			case "finish":
				// (The winner is called from the race's own events.) The others, in order.
				if(d && d.position >= 2 && d.position <= 4 && d.car){
					this.talk("fin" + d.position, [carPiece(d.car), `lead.takes.${d.position}`], { priority: 6, expires: 7000, cool: 3000 });
				}
				break;
			case "finalLap": break;
			case "thunder":
				this.talk("thunder", [this.line("lead", "thunder")], { priority: 3, cool: 60000, expires: 3000 });
				break;
			case "qualiDone":
				if(r.mode === "quali" && d && d.car && d.ms != null && r.standings()[0].car === d.car) this.talk("pole", [carPiece(d.car), this.line("lead", "onPole")], { priority: 5, expires: 6000, cool: 4000 });
				break;
		}
	}
	// A moment from the race's own list (js/race.js addEvent).
	onEvent(e){
		const r = this.r, A = e.a !== undefined ? this.car(e.a) : null, B = e.b !== undefined ? this.car(e.b) : null;
		if(!A) return;
		switch(e.type){
			case "pass": {
				const mine = this.involvesMe(e.a, e.b), p = e.pos <= 1 ? 1 : e.pos <= 3 ? 0.9 : mine ? 0.8 : e.pos <= 6 ? 0.55 : 0.3;
				if(!B || !this.chance(p) || r.raceTime - (this.cool.get("pass") ?? -1e9) < 3500) break;
				if(e.pos === 1){
					const lead = this.chance(0.4) ? [this.line("lead", "newLeader")] : [];
					this.talk("pass", [...lead, carPiece(A), this.line("lead", "takesLead"), carPiece(B, { final: true })], { priority: 7, cool: 3500 });
					this.react(0.4);
				}else{
					const tail = e.pos >= 2 && e.pos <= 6 && this.chance(0.55) ? [`lead.for.${e.pos}`] : [];
					const last = tail.length ? carPiece(B) : carPiece(B, { final: true });
					this.talk("pass", [carPiece(A), this.line("lead", "goes"), last, ...tail], { priority: e.pos <= 3 ? 6 : 5, cool: 3500 });
					if(e.pos <= 3) this.react(0.25);
				}
				break;
			}
			case "crash": {
				const lead = this.chance(0.45) ? [this.line("lead", "oh")] : [];
				if(this.talk("crash", [...lead, carPiece(A), this.line("lead", "hitsWall")], { priority: 7, cool: 6000 })) this.react(0.4, "afterCrash", 0.3);
				break;
			}
			case "contact":
				if(B && this.chance(0.6) && this.talk("contact", [carPiece(A), "lead.and", carPiece(B), this.line("lead", "contact")], { priority: 5, cool: 10000 })) this.react(0.35, "afterContact", 0.3);
				break;
			case "fastest":
				if(this.chance(0.7)) this.talk("fastest", [carPiece(A), this.line("lead", "fastestLap")], { priority: 4, cool: 12000 });
				break;
			case "out":
				this.talk("out", [carPiece(A), this.line("lead", "isOut")], { priority: 7, cool: 2500 });
				break;
			case "finish":
				this.talk("win", [carPiece(A), this.line("lead", "takesFlag")], { priority: 9, interrupt: true, expires: 8000, cool: 1e9 });
				this.react(0.55, "winC", 0.5);
				break;
			case "photo":
				if(B) this.talk("photo", [this.line("lead", "photo"), carPiece(A), "lead.beats", carPiece(B), this.line("lead", "margin")], { priority: 9, interrupt: true, expires: 8000, cool: 1e9 });
				break;
		}
	}

	// ---- every frame ----
	update(dt, look){
		const r = this.r;
		if(!r || this.level === "off") return;
		this.acc += dt;
		if(this.acc < 0.25) return;
		const step = this.acc; this.acc = 0;
		const t = r.raceTime;
		if(t < 0 || r.phase !== "racing") return;
		for(const e of r.events){ if(!this.seen.has(e)){ this.seen.add(e); if(r.mode !== "trial") this.onEvent(e); } }
		if(r.mode === "trial" || r.mode === "quali") return;
		const st = r.standings();
		const racing = s => s && s.car.elim === null && s.car.finish === null && !s.car.gone;

		// Into the first corner.
		if(!this.flags.turn1 && this.goT !== null && t - this.goT > 5500){
			this.flags.turn1 = true;
			if(racing(st[0])) this.talk("turn1", [carPiece(st[0].car), this.line("lead", "leadsTurn1")], { priority: 5, expires: 4000, cool: 1e9 });
		}
		// The first look round the circuit.
		if(!this.venueDone && this.goT !== null && t - this.goT > 17000 && t - this.lastSpoke > 3500){
			this.venueDone = true;
			this.talk("venue", [`col.venue.${this.venue === "custom" ? "classic" : this.venue}`], { who: "col", priority: 3, expires: 6000, cool: 1e9 });
		}
		// The final lap, as the leader starts it.
		const lead = st[0];
		if(r.mode === "race" && !this.flags.final && racing(lead) && r.laps > 1 && lead.car.data.lap === r.laps){
			this.flags.final = true;
			this.talk("final", [this.line("lead", "finalLap")], { priority: 8, interrupt: true, expires: 4000, cool: 1e9 });
			this.talk("finalLead", [carPiece(lead.car), this.line("lead", "leadsFinal")], { priority: 7, expires: 7000, cool: 1e9 });
			this.react(0.5, "finalTip", 0.3);
		}

		// Battles: two cars nose to tail for a while.
		this.accBattle += step;
		if(this.accBattle >= 1){
			const dt1 = this.accBattle; this.accBattle = 0;
			for(let i = 0; i < Math.min(8, st.length - 1); i++){
				const a = st[i], b = st[i + 1];
				const key = a.car.id + ">" + b.car.id;
				if(!racing(a) || !racing(b)){ this.pairs.delete(key); continue; }
				const gap = r.gapSeconds(a.car, b.car);
				if(gap > 0.5 || gap < 0){ this.pairs.delete(key); continue; }
				const together = (this.pairs.get(key) || 0) + dt1;
				this.pairs.set(key, together);
				if(together >= 6 && t - (this.cool.get("battle:" + key) ?? -1e9) > 45000 && t - this.lastSpoke > 4000){
					this.cool.set("battle:" + key, t);
					if(this.talk("battle", [carPiece(b.car), this.line("lead", "allOver"), carPiece(a.car, { final: true })], { priority: 4, expires: 5000, cool: 20000 })){
						if(this.chance(0.4)) this.talk("battle2", [this.line("lead", "battle")], { priority: 3, expires: 6000, cool: 30000 });
					}
				}
			}
		}

		// Weather and light.
		if(look){
			if(!this.rain && look.rain > 0.25 && t > 15000){ this.rain = true; this.talk("rain", [this.line("lead", "rain")], { priority: 3, cool: 1e9, expires: 6000 }); }
			else if(this.rain && look.rain < 0.04){ this.rain = false; this.talk("dry", [this.line("lead", "dry")], { priority: 3, cool: 60000, expires: 6000 }); }
			if(!this.night && look.night > 0.55 && t > 15000){ this.night = true; this.talk("night", [this.line("lead", "night")], { priority: 3, cool: 1e9, expires: 6000 }); }
		}

		// Quiet for a while: something about the race or the circuit.
		if(t > 14000 && t - this.lastSpoke > 26000){
			const k = this.rand();
			if(k < 0.45) this.talk("tip", [this.line("col", "tip")], { who: "col", priority: 2, expires: 4000, cool: 20000 });
			else if(k < 0.75) this.talk("fill", [this.line("lead", "fill")], { priority: 2, expires: 4000, cool: 20000 });
			else if(lead && racing(lead) && st[1] && racing(st[1])){
				const g = r.gapSeconds(lead.car, st[1].car);
				this.talk("gapC", [this.line("col", g > 6 ? "gapBig" : "gapClosing")], { who: "col", priority: 2, expires: 4000, cool: 20000 });
			}
		}
	}

	// ---- replays ----
	// The line for a highlight in the replay: the clip says what happened (type, a, b, pos). Interrupts the last one.
	clip(c, race){
		this.r = race ?? this.r;
		const r = this.r;
		if(!r || this.level === "off" || !c) return;
		const A = c.a !== undefined ? this.car(c.a) : c.focus !== undefined ? this.car(c.focus) : null;
		const B = c.b !== undefined ? this.car(c.b) : null;
		const o = { priority: 8, interrupt: true, expires: 4000, cool: 0 };
		const key = "clip" + Math.random();
		if(c.type === "start") this.talk(key, [this.line("lead", "lightsOut")], o);
		else if(!A) return;
		else if(c.type === "pass" && B){
			if(c.pos === 1) this.talk(key, [carPiece(A), this.line("lead", "takesLead"), carPiece(B, { final: true })], o);
			else this.talk(key, [carPiece(A), this.line("lead", "goes"), carPiece(B, { final: true })], o);
		}
		else if(c.type === "crash") this.talk(key, [carPiece(A), this.line("lead", "hitsWall")], o);
		else if(c.type === "contact" && B) this.talk(key, [carPiece(A), "lead.and", carPiece(B), this.line("lead", "contact")], o);
		else if(c.type === "fastest") this.talk(key, [carPiece(A), this.line("lead", "fastestLap")], o);
		else if(c.type === "out") this.talk(key, [carPiece(A), this.line("lead", "isOut")], o);
		else if(c.type === "finish") this.talk(key, [carPiece(A), this.line("lead", "takesFlag")], o);
		else if(c.type === "photo" && B) this.talk(key, [this.line("lead", "photo"), carPiece(A), "lead.beats", carPiece(B), this.line("lead", "margin")], o);
	}
}
