// The race engineer on the team radio: short, calm messages to the player, only when there is something to say.
//   Engineer: start(race) at the beginning of a race, update(dt, look) every frame, event(type, data) with the race's events.
// It talks about the player's own race: position changes, the gaps to the cars either side, laps to go, incidents,
// the weather, the finish. The sentences are built from clips (js/voicelines.js, js/speechkit.js) and handed to `say`
// (js/voice.js). Level "important" keeps only what matters (incidents, the final lap, elimination, the finish).
import { build, makePicker, gapPiece, posPiece } from "./speechkit.js";

const STOP = { parts: [], text: "." };       // (a full stop in the subtitles, after a number)

export class Engineer {
	// say(item): plays an item. rand: random numbers. level: "full" | "important" | "off".
	constructor({ say, rand = Math.random, level = "full" }){
		this.say = say; this.rand = rand; this.level = level; this.pick = makePicker(rand);
		this.r = null;
		this.reset();
	}
	reset(){
		this.cool = new Map();            // message kind -> race time it was last said
		this.lastMsg = -1e9;
		this.acc = 0;
		this.stable = null; this.cand = null; this.candSince = 0; this.lastPosCall = -1e9;
		this.goPos = null; this.goT = null; this.startChecked = false;
		this.closeAhead = 0; this.closeBehind = 0;
		this.history = []; this.nextHist = 0;
		this.rain = false; this.heavy = false; this.night = false;
		this.flags = {};
		this.elimLap = -1;
	}
	start(r){ this.reset(); this.r = r; }
	stop(){ this.r = null; }

	// ---- saying things ----
	msg(kind, pieces, { priority = 4, imp = false, cool = 15000, expires = 7000, interrupt = false } = {}){
		const r = this.r;
		if(!r || this.level === "off" || (this.level === "important" && !imp)) return false;
		const t = r.raceTime;
		if(t - (this.cool.get(kind) ?? -1e9) < cool) return false;
		const s = build(...pieces);
		if(!s.parts.length) return false;
		this.cool.set(kind, t); this.lastMsg = t;
		this.say({ parts: s.parts, text: s.text, kind: "radio", who: "eng", priority, expires, interrupt, key: "eng." + kind });
		return true;
	}
	quiet(ms){ return this.r.raceTime - this.lastMsg > ms; }
	line(family){ return this.pick("eng." + family); }

	// ---- the race's events ----
	event(type, d){
		const r = this.r;
		if(!r || !r.me) return;
		const me = r.me, t = r.raceTime;
		switch(type){
			case "go":
				if(r.mode === "quali") this.msg("qualiGo", [this.line("qualiGo")], { priority: 5, imp: true });
				else if(r.mode === "trial") break;
				else{ this.goT = t; this.goPos = this.position(); }
				break;
			case "hit": {
				if(!d || (d.car !== me && d.other !== me)) break;
				if(d.type === "wall" && d.strength > 0.22) this.msg("wall", [this.line("wall")], { priority: 7, imp: true, cool: 20000, expires: 4000 });
				else if(d.type === "car" && d.strength > 0.15) this.msg("contact", [this.line("contact")], { priority: 7, imp: true, cool: 15000, expires: 4000 });
				break;
			}
			case "wrongWay":
				if(d) this.msg("wrong", [this.line("wrong")], { priority: 8, imp: true, cool: 15000, expires: 3000 });
				break;
			case "rescued":
				this.msg("back", [this.line("back")], { priority: 6, imp: true, cool: 12000, expires: 4000 });
				break;
			case "lap": this.onLap(d); break;
			case "finalLap":
				this.msg("final", [this.line("final")], { priority: 8, imp: true, cool: 1e9, expires: 5000 });
				break;
			case "finish":
				if(d.car === me) this.onFinish(d.position);
				break;
			case "qualiDone":
				if(d.car === me && d.ms != null){
					const p = r.standings().findIndex(s => s.car === me) + 1;
					this.msg("qualiP", [this.line("youAre"), posPiece(p), "eng.qualiP"], { priority: 7, imp: true, cool: 1e9, expires: 6000 });
				}
				break;
			case "eliminated":
				if(d.car === me) this.msg("elimOut", [this.line("elimOut")], { priority: 8, imp: true, cool: 1e9 });
				else if(me.elim === null && this.rand() < 0.5) this.msg("elimSafe", [this.line("elimSafe")], { priority: 4, imp: true, cool: 20000, expires: 4000 });
				break;
			case "sector":
				if(r.mode === "trial" && d.car === me){
					if(d.color === "purple") this.msg("purple", [this.line("purple")], { priority: 3, cool: 8000, expires: 2500 });
					else if(d.color === "green" && this.rand() < 0.5) this.msg("green", [this.line("green")], { priority: 3, cool: 8000, expires: 2500 });
				}
				break;
			case "thunder":
				if(this.rand() < 0.6) this.msg("storm", [this.line("storm")], { priority: 3, cool: 1e9 });
				break;
		}
	}
	onLap(d){
		const r = this.r, me = r.me;
		if(!d || d.car !== me) return;
		if(r.mode === "trial"){
			if(d.best) this.msg("pb", [this.line("pb")], { priority: 5, cool: 6000, expires: 5000 });
			return;
		}
		if(r.mode !== "race") return;
		const L = me.data.lap, N = r.laps, togo = N - L + 1;
		const before = me.lapTimes.length > 1 ? Math.min(...me.lapTimes.slice(0, -1)) : null;
		if(r.bestLapAll !== null && d.ms < r.bestLapAll) this.msg("fastest", [this.line("fastest")], { priority: 5, cool: 20000, expires: 5000 });
		else if(before !== null && d.ms > before + 1100) this.msg("pace", [this.line("paceOff")], { priority: 3, cool: 30000, expires: 5000 });
		else if(before !== null && d.ms <= before && L % 2 === 0) this.msg("pace", [this.line("paceGood")], { priority: 3, cool: 30000, expires: 5000 });
		if(N >= 5 && togo === 3) this.msg("togo", ["eng.togo.3"], { priority: 4, cool: 1e9, expires: 5000 });
		else if(N >= 3 && togo === 2) this.msg("togo", ["eng.togo.2"], { priority: 5, cool: 1e9, expires: 5000 });
		else if(N >= 6 && togo === Math.ceil(N / 2)) this.msg("half", [this.line("half")], { priority: 3, cool: 1e9, expires: 5000 });
	}
	onFinish(position){
		const r = this.r;
		if(r.mode === "trial") return;
		const p = Number.isFinite(position) && position > 0 ? position : this.position();
		const opts = { priority: 9, imp: true, cool: 1e9, expires: 8000, interrupt: true };
		if(p === 1) this.msg("finish", [this.line("win")], opts);
		else if(p <= 3) this.msg("finish", [this.line("podium")], opts);
		else if(posPiece(p)) this.msg("finish", [this.line("finP"), posPiece(p), STOP, this.line("goodJob")], opts);
		else this.msg("finish", [this.line("finOther")], opts);
	}
	// The player's place, 1 first (0 if they aren't in the order).
	position(){
		const r = this.r;
		return r.standings().findIndex(s => s.car === r.me) + 1;
	}

	// ---- every frame ----
	// look: the world's { rain, night, ... } (js/world.js), or null.
	update(dt, look){
		const r = this.r;
		if(!r || !r.me || r.me.gone || this.level === "off") return;
		this.acc += dt;
		if(this.acc < 0.25) return;
		this.acc = 0;
		const t = r.raceTime;
		if(t < 0){
			// A word on the grid, in the last moments before the lights.
			if(!this.flags.grid && t > -3400 && t < -400 && (r.mode === "race" || r.mode === "elim")){
				this.flags.grid = true;
				this.msg("grid", [this.rand() < 0.3 ? this.line("rc") : this.line("grid")], { priority: 4, cool: 1e9, expires: 3000 });
			}
			if(!this.flags.trial && r.mode === "trial" && t > -3400){ this.flags.trial = true; if(this.rand() < 0.5) this.msg("trialGo", [this.line("trialGo")], { priority: 3, cool: 1e9, expires: 3000 }); }
			return;
		}
		if(r.mode === "trial" || r.mode === "quali") return;
		const st = r.standings(), idx = st.findIndex(s => s.car === r.me), pos = idx + 1;
		if(idx < 0 || r.me.finish !== null || r.me.elim !== null) return;

		// The first seconds: did the start go well?
		if(!this.startChecked && this.goT !== null && t - this.goT > 9000){
			this.startChecked = true;
			if(this.goPos && pos < this.goPos) this.msg("start", [this.line("startGood")], { priority: 4, cool: 1e9, expires: 6000 });
			else if(this.goPos && pos >= this.goPos + 2) this.msg("start", [this.line("startBad")], { priority: 4, cool: 1e9, expires: 6000 });
			this.stable = pos;
		}

		// Gaps to the cars either side (the leader has nobody ahead, the last car nobody behind).
		const racing = s => s && s.car.elim === null && s.car.finish === null && !s.car.gone;
		const a = idx > 0 && racing(st[idx - 1]) ? r.gapSeconds(st[idx - 1].car, r.me) : null;
		const b = idx < st.length - 1 && racing(st[idx + 1]) ? r.gapSeconds(r.me, st[idx + 1].car) : null;
		if(t >= this.nextHist){ this.nextHist = t + 1000; this.history.push({ t, a, b }); if(this.history.length > 40) this.history.shift(); }

		// Position changes: said once the new place has held for a moment, not for every swap.
		if(this.stable === null) this.stable = pos;
		if(pos !== this.cand){ this.cand = pos; this.candSince = t; }
		else if(pos !== this.stable && t > 5000 && t - this.candSince > 1600 && t - this.lastPosCall > 6500){
			const up = pos < this.stable;
			this.stable = pos; this.lastPosCall = t;
			if(pos === 1) this.msg("lead", [this.line("leading")], { priority: 6, imp: true, cool: 12000, expires: 5000 });
			else if(posPiece(pos)) this.msg(up ? "up" : "down", [this.line(up ? "upTo" : "downTo"), posPiece(pos), STOP], { priority: 5, cool: 8000, expires: 5000 });
		}

		// Someone close: a tow to use, a car to defend against (not in the scrum of the start).
		this.closeAhead = t > 9000 && a !== null && a < 0.9 ? this.closeAhead + 0.25 : 0;
		this.closeBehind = t > 9000 && b !== null && b < 0.7 ? this.closeBehind + 0.25 : 0;
		if(this.closeAhead >= 2 && r.draft) this.msg("tow", [this.line(this.rand() < 0.4 ? "slipUse" : "aheadClose")], { priority: 4, cool: 32000, expires: 4000 });
		if(this.closeBehind >= 2) this.msg("defend", [this.line(this.rand() < 0.35 ? "defend" : "behindClose")], { priority: 5, cool: 28000, expires: 4000 });

		// The gaps, every so often: "Gap ahead, one point two. Gap behind, point eight."
		if(t > 15000 && t - (this.cool.get("gaps") ?? -1e9) > 42000 && this.quiet(7000)){
			const pa = a !== null && a < 25 ? gapPiece(a) : null, pb = b !== null && b < 25 ? gapPiece(b) : null;
			if(pa && pb) this.msg("gaps", [this.line("gapAhead"), pa, STOP, this.line("gapBehind"), pb, STOP], { priority: 3, cool: 42000, expires: 6000 });
			else if(pa) this.msg("gaps", [this.line("gapAhead"), pa, STOP], { priority: 3, cool: 42000, expires: 6000 });
			else if(pb) this.msg("gaps", [this.line("gapBehind"), pb, STOP], { priority: 3, cool: 42000, expires: 6000 });
			else if(idx > 0 && r.mode === "race"){ const g = gapPiece(r.gapSeconds(st[0].car, r.me)); if(g) this.msg("gaps", [this.line("gapLeader"), g, STOP], { priority: 3, cool: 42000, expires: 6000 }); }
		}
		// And which way they are going.
		if(t > 25000 && t - (this.cool.get("trend") ?? -1e9) > 55000 && this.quiet(9000) && this.history.length > 12){
			const then = this.history[this.history.length - 11];
			if(a !== null && then.a !== null && Math.abs(a - then.a) > 0.5) this.msg("trend", [this.line(a < then.a ? "closing" : "pulling")], { priority: 3, cool: 55000, expires: 5000 });
			else if(b !== null && then.b !== null && Math.abs(b - then.b) > 0.5) this.msg("trend", [this.line(b < then.b ? "behindClosing" : "behindDropping")], { priority: 3, cool: 55000, expires: 5000 });
		}

		// Elimination: the last car goes when the leader completes the lap.
		if(r.mode === "elim"){
			const alive = st.filter(s => s.car.elim === null && !s.car.gone);
			const last = alive[alive.length - 1], lead = alive[0];
			if(last && last.car === r.me && alive.length > 2 && lead){
				const frac = lead.prog - Math.floor(lead.prog), lap = Math.floor(lead.prog);
				if(frac > 0.8 && lap !== this.elimLap){ this.elimLap = lap; this.msg("elimDanger", [this.line("elimDanger")], { priority: 8, imp: true, cool: 8000, expires: 5000 }); }
			}
		}

		// The weather and the light.
		if(look){
			if(!this.rain && look.rain > 0.2 && t > 20000){ this.rain = true; this.msg("rain", [this.line("rainStart")], { priority: 3, cool: 1e9 }); }
			else if(this.rain && !this.heavy && look.rain > 0.65){ this.heavy = true; this.msg("rainHeavy", [this.line("rainHeavy")], { priority: 3, cool: 1e9 }); }
			else if(this.heavy && look.rain < 0.35){ this.heavy = false; this.msg("rainEase", [this.line("rainEase")], { priority: 3, cool: 1e9 }); }
			else if(this.rain && look.rain < 0.04){ this.rain = false; this.msg("dry", [this.line("dry")], { priority: 3, cool: 30000 }); }
			if(!this.night && look.night > 0.55 && t > 15000){ this.night = true; this.msg("night", [this.line("night")], { priority: 3, cool: 1e9 }); }
		}
	}
}
