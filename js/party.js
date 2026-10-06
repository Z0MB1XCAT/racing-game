// Party modes: three ways to race that aren't "first to finish". They sit on top of the normal race and only decide who is out, who
// holds what and who wins: the handling is the same. The host (or the solo game) runs the rules and shares the state (a small object,
// `state`, kept in the room's race data); everyone else just draws it. Because the whole state travels, a new host picks the game
// up exactly where the old one left it.
//
//   potato: one car holds a hot potato with a fuse. Touch another car and it's theirs. When the fuse runs out the holder is out, and a new
//           potato goes to someone else. The last car left wins.
//   mouse:  one car is the cat. Any mouse it touches is caught and out. The cat wins if it catches them all; if the time runs out, the
//           mice still running win (and the cat comes last of those who didn't get caught... see rules()).
//   crown:  whoever leads the race wears the crown, and every second on top scores. When the time is up the most seconds wins.
//
// A Race passes itself in. The parts of it used here: cars (each with id, name, data.x, data.y, elim, finish, gone, model, isBot),
// eliminate(id, order), elimOrder, standings(), rand(), net, authority, onEvent(), active, and endAt.

export const PARTY = {
	potato: { name: "Hot Potato", start: 3000, fuse: [14000, 22000], grace: 2200, touch: 2.5, blurb: "Pass the potato on by touching another car before it goes off. Last car left wins." },
	mouse:  { name: "Cat and mouse", start: 3000, limit: 240000, touch: 2.5, blurb: "One car is the cat. Touch a mouse and it's out. Survive until the time is up." },
	crown:  { name: "Crown chase", start: 0, limit: 180000, blurb: "Lead the race to wear the crown. Every second on top scores." }
};
export const PARTY_KINDS = Object.keys(PARTY);

const SEND_EVERY = 1000;          // how often the host shares scores when nothing else happens

export class Party {
	constructor(race, kind){
		this.race = race;
		this.kind = kind;
		this.cfg = PARTY[kind];
		// n goes up with every change, so an old copy of the state never replaces a newer one.
		// h: who holds the potato / is the cat / wears the crown. f: the potato's fuse, in race time. ph, g: who held it last, and until when they can't take it back.
		// s: crown seconds so far, by car. c: how many mice the cat has caught.
		this.state = { n: 0, k: kind, h: null, f: null, ph: null, g: 0, s: {}, c: 0 };
		this.sentAt = -1e9;
		this.last = null;           // the race time of the previous update (for crown seconds)
		this.over = false;
	}

	get cars(){ return this.race.cars; }
	car(id){ return this.race.byId ? this.race.byId.get(id) : this.cars.find(c => c.id === id); }
	alive(){ return this.cars.filter(c => !c.gone && c.elim === null); }
	holder(){ return this.state.h ? this.car(this.state.h) : null; }
	rand(){ return this.race.rand(); }

	// ---- shared state ----
	// Everyone but the host takes the state it sends.
	apply(state){
		if(!state || state.k !== this.kind || state.n < this.state.n) return;
		// (The database drops empty and null fields, so fill them back in.)
		this.state = Object.assign({ h: null, f: null, ph: null, g: 0, s: {}, c: 0 }, state);
	}
	publish(t, force){
		this.state.n++;
		this.sentAt = t;
		if(this.race.net && this.race.authority) this.race.net.setParty(this.state);
	}

	// ---- the rules: the host / solo only ----
	rules(t){
		if(this.over || t < this.cfg.start) return;
		if(this.kind === "potato") this.potatoRules(t);
		else if(this.kind === "mouse") this.mouseRules(t);
		else this.crownRules(t);
		if(this.kind === "crown" && t - this.sentAt >= SEND_EVERY) this.publish(t);
	}

	nearHolder(H, others, t){
		const r2 = this.cfg.touch * this.cfg.touch;
		return others.find(c => c !== H && (c.data.x - H.data.x) ** 2 + (c.data.y - H.data.y) ** 2 < r2);
	}

	potatoRules(t){
		const st = this.state, alive = this.alive();
		if(alive.length <= 1){ this.finishLast(t); return; }
		let H = this.holder();
		if(!H || H.elim !== null || H.gone){
			// A first potato, or the holder left the race: pick someone.
			H = alive[Math.floor(this.rand() * alive.length)];
			st.h = H.id; st.f = t + this.fuseFor(alive.length); st.ph = null; st.g = 0;
			this.publish(t);
			return;
		}
		// Touch another car and it's theirs (the fuse keeps burning). The one who had it can't take it straight back.
		const next = this.nearHolder(H, alive.filter(c => !(c.id === st.ph && t < st.g)), t);
		if(next){
			st.ph = H.id; st.g = t + this.cfg.grace; st.h = next.id;
			this.race.onEvent("potatoPass", { from: H, car: next });
			this.publish(t);
			return;
		}
		if(t >= st.f){
			this.race.eliminate(H.id, ++this.race.elimOrder);
			this.race.onEvent("potatoBoom", { car: H });
			const left = this.alive();
			if(left.length <= 1){ st.h = null; st.f = null; this.publish(t); this.finishLast(t); return; }
			// A new potato goes to the car nearest the one that went off, so it's in the thick of it.
			const near = left.slice().sort((a, b) => ((a.data.x - H.data.x) ** 2 + (a.data.y - H.data.y) ** 2) - ((b.data.x - H.data.x) ** 2 + (b.data.y - H.data.y) ** 2))[0];
			st.h = near.id; st.f = t + this.fuseFor(left.length); st.ph = null; st.g = t + 1200;
			this.publish(t);
		}
	}
	// Shorter fuses as the field thins out, so the game doesn't drag.
	fuseFor(n){
		const [a, b] = this.cfg.fuse, k = Math.max(0.55, Math.min(1, n / 6));
		return (a + this.rand() * (b - a)) * k;
	}

	mouseRules(t){
		const st = this.state;
		const alive = this.alive();
		let cat = this.holder();
		if(!cat || cat.gone){
			if(alive.length < 2){ this.finishLast(t); return; }
			cat = alive[Math.floor(this.rand() * alive.length)];
			st.h = cat.id;
			this.publish(t);
			return;
		}
		const mice = alive.filter(c => c !== cat);
		const r2 = this.cfg.touch * this.cfg.touch;
		for(const m of mice){
			if((m.data.x - cat.data.x) ** 2 + (m.data.y - cat.data.y) ** 2 < r2){
				this.race.eliminate(m.id, ++this.race.elimOrder);
				st.c++;
				this.race.onEvent("caught", { cat, car: m });
				this.publish(t);
			}
		}
		const left = this.alive().filter(c => c !== cat);
		if(!left.length){ this.finishLast(t); return; }          // the cat caught them all: it wins
		if(t >= this.cfg.limit){
			// Time's up: the cat didn't get them all, so it ranks below the mice that got away, and they finish in the order they're running.
			this.race.eliminate(cat.id, ++this.race.elimOrder);
			this.finishOrder(t, this.alive());
		}
	}

	crownRules(t){
		const st = this.state;
		const dt = this.last == null ? 0 : Math.min(500, t - this.last);
		this.last = t;
		const lead = this.race.standings().find(s => s.car.elim === null && !s.car.gone);
		if(lead){
			const id = lead.car.id;
			if(st.h !== id){ st.h = id; this.publish(t); }
			st.s[id] = (st.s[id] || 0) + dt;
		}
		if(t >= this.cfg.limit){
			const order = this.alive().slice().sort((a, b) => (st.s[b.id] || 0) - (st.s[a.id] || 0));
			this.finishOrder(t, order);
		}
	}

	// ---- ending ----
	// The last car running wins.
	finishLast(t){
		if(this.over) return;
		this.over = true;
		const w = this.alive()[0];
		if(w && w.finish === null){ w.finish = t; this.race.onEvent("finish", { car: w, ms: t, position: 1 }); }
		this.race.endAt = t + 2500;
		this.publish(t);
	}
	// Everyone still running finishes in this order.
	finishOrder(t, order){
		if(this.over) return;
		this.over = true;
		order.forEach((c, i) => { if(c.finish === null){ c.finish = t + i; if(i === 0) this.race.onEvent("finish", { car: c, ms: t, position: 1 }); } });
		this.race.endAt = t + 2500;
		this.publish(t);
	}

	// ---- what the screen says ----
	// A line for the HUD, from your car's point of view.
	hudText(meId, raceMs){
		const st = this.state, H = this.holder(), me = meId === st.h;
		if(this.kind === "potato"){
			if(!H) return raceMs < this.cfg.start ? "Hot Potato: get ready" : "";
			const left = Math.max(0, Math.ceil((st.f - raceMs) / 1000));
			return me ? `You have the potato! ${left}s: touch someone!` : `${H.name} has the potato: ${left}s`;
		}
		if(this.kind === "mouse"){
			if(!H) return raceMs < this.cfg.start ? "Cat and mouse: get ready" : "";
			const me2 = this.race.byId && this.race.byId.get(meId);
			if(me) return `You're the cat! Catch the mice (${st.c} so far)`;
			if(me2 && me2.elim !== null) return `Caught by ${H.name}`;
			return `${H.name} is the cat: run!`;
		}
		const mine = Math.round((st.s[meId] || 0) / 1000);
		const left = Math.max(0, Math.ceil((this.cfg.limit - raceMs) / 1000));
		return `${H ? (me ? "You wear" : H.name + " wears") : "Nobody wears"} the crown · you ${mine}s · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`;
	}
	// For the results table: what a car scored (crown seconds), or "".
	score(car){
		if(this.kind === "crown") return Math.round((this.state.s[car.id] || 0) / 100) / 10 + " s on top";
		if(this.kind === "mouse" && car.id === this.state.h) return this.state.c + " caught";
		return "";
	}
	// How far the fuse has burned, 0 to 1 (for the marker's pulse); 0 when there's no potato.
	burn(raceMs){
		const st = this.state;
		if(this.kind !== "potato" || !st.f) return 0;
		return Math.max(0, Math.min(1, 1 - (st.f - raceMs) / 18000));
	}
}
