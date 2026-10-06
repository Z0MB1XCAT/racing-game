// The party modes (js/party.js) and the wheel of chaos (js/chaos.js), against a pretend race. No browser.
//   Hot Potato: one holder; a touch passes it on (never straight back); the fuse takes the holder out; the last car wins.
//   Cat and mouse: touched mice are out; the cat wins if it catches them all; when time runs out the mice that got away win.
//   Crown chase: time on top scores; when the time is up the most seconds wins.
//   A new host carries on from the state the old one shared. The wheel of chaos is the same for everyone and never repeats a lap.
//   node tools/party-test.mjs
import { Party, PARTY, PARTY_KINDS } from "../js/party.js";
import { CHAOS, chaosFor, chaosSteer } from "../js/chaos.js";
import { seededRandom } from "../js/trackgen.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };

// A pretend race: cars on a line, the rules called every 50 ms of race time, just the parts of Race that party.js uses.
function pretend(n, kind, seed = "x", positions){
	const sent = [];
	const race = {
		cars: Array.from({ length: n }, (_, i) => ({ id: "c" + i, name: "Car " + i, data: { x: positions ? positions[i][0] : i * 30, y: positions ? positions[i][1] : 0 }, elim: null, finish: null, gone: false, isBot: false, prog: i })),
		elimOrder: 0, endAt: 0, authority: true, rand: seededRandom(seed), events: [], net: { setParty: s => sent.push(JSON.parse(JSON.stringify(s))), eliminate(){} },
		eliminate(id, order){ const c = this.byId.get(id); if(!c || c.elim !== null) return; c.elim = order; this.elimOrder = Math.max(this.elimOrder, order); },
		standings(){ return this.cars.filter(c => !c.gone).map(car => ({ car })).sort((a, b) => (a.car.finish !== null || b.car.finish !== null ? (a.car.finish ?? 1e12) - (b.car.finish ?? 1e12) : (a.car.elim !== null || b.car.elim !== null ? (b.car.elim ?? -1) - (a.car.elim ?? -1) : b.car.prog - a.car.prog))); },
		onEvent(t, d){ this.events.push([t, d]); },
		get active(){ return this.cars.filter(c => c.elim === null && !c.gone); }
	};
	race.byId = new Map(race.cars.map(c => [c.id, c]));
	race.party = new Party(race, kind);
	race.sent = sent;
	return race;
}
const run = (race, from, to, each) => { for(let t = from; t <= to; t += 50){ race.party.rules(t); if(each) each(t); } };

console.log("the three modes");
ok(PARTY_KINDS.join() === "potato,mouse,crown" && PARTY_KINDS.every(k => PARTY[k].name && PARTY[k].blurb), "three modes, each with a name and a one-line rule");

// ---------- Hot Potato ----------
console.log("hot potato");
{
	const r = pretend(5, "potato");
	run(r, 0, 2900);
	ok(r.party.state.h === null && r.sent.length === 0, "nobody has the potato in the first three seconds");
	run(r, 3000, 3100);
	const first = r.party.state.h;
	ok(first && r.byId.has(first) && r.party.state.f > 3000, "then one car has it, with a fuse (" + first + ", " + Math.round(r.party.state.f / 1000) + " s)");
	ok(r.sent.length > 0 && r.sent.at(-1).h === first, "and the host shares it");
	// The holder drives into a neighbour: the potato changes hands, and the fuse keeps burning.
	const H = r.byId.get(first), N = r.cars.find(c => c !== H && Math.abs(c.data.x - H.data.x) <= 30);
	const fuse = r.party.state.f;
	N.data.x = H.data.x + 1.2; N.data.y = 0;
	run(r, 3150, 3200);
	ok(r.party.state.h === N.id && r.party.state.f === fuse && r.party.state.ph === H.id, "touching a car passes it on and the fuse keeps burning (to " + N.id + ")");
	// Straight back is not allowed during the grace time, but allowed after it.
	run(r, 3250, 3600);
	ok(r.party.state.h === N.id, "the one who passed it can't take it straight back while the cars stay touching");
	run(r, 3650, 6000);
	ok(r.party.state.h === H.id, "but once the grace time is over, it can go back (" + r.party.state.h + ")");
	// Now keep everyone apart: the fuse runs out and the holder is out.
	for(const c of r.cars) c.data.x = r.cars.indexOf(c) * 100;
	const before = r.cars.filter(c => c.elim === null).length;
	const holder = r.party.state.h;
	run(r, 6050, fuse + 100);
	ok(r.byId.get(holder).elim === 1 && r.cars.filter(c => c.elim === null).length === before - 1, "when the fuse runs out the holder is out (first out)");
	ok(r.events.some(([t, d]) => t === "potatoBoom" && d.car.id === holder), "and there's a boom to show");
	ok(r.party.state.h && r.party.state.h !== holder && r.byId.get(r.party.state.h).elim === null, "a new potato goes to a car that's still running (" + r.party.state.h + ")");
	// Play it out apart: the fuse takes one car each time until one is left.
	run(r, fuse + 150, 400000);
	const left = r.cars.filter(c => c.elim === null);
	ok(left.length === 1 && left[0].finish !== null, "the last car left wins (" + left[0].id + ")");
	ok(r.endAt > 0 && r.party.over, "and the race is set to end");
	const orders = r.cars.filter(c => c.elim !== null).map(c => c.elim).sort((a, b) => a - b);
	ok(orders.join() === "1,2,3,4", "everyone else went out in order, 1 to 4 (" + orders.join() + ")");
	let st = r.standings();
	ok(st[0].car === left[0] && st.at(-1).car.elim === 1, "the standings put the winner first and the first out last");
}
{
	// Fuses get shorter as the field thins, and are never longer than the longest.
	const r = pretend(2, "potato"); const f = r.party.fuseFor.bind(r.party);
	const long = Math.max(...Array.from({ length: 200 }, () => f(8))), short = Math.max(...Array.from({ length: 200 }, () => f(2)));
	ok(long <= PARTY.potato.fuse[1] + 1 && short < long * 0.7, "fuses shorten as the field thins (" + Math.round(long / 1000) + " s with 8 cars, at most " + Math.round(short / 1000) + " s with 2)");
}
{
	// A car that leaves mid-race while holding it: the potato moves on.
	const r = pretend(4, "potato", "y");
	run(r, 0, 3100);
	const h = r.byId.get(r.party.state.h); h.gone = true;
	run(r, 3150, 3250);
	ok(r.party.state.h && r.party.state.h !== h.id && !r.byId.get(r.party.state.h).gone, "if the holder leaves, the potato goes to someone still racing");
	const two = pretend(2, "potato");
	two.cars[1].gone = true; run(two, 3000, 3200);
	ok(two.party.over && two.cars[0].finish !== null, "a lone car left is the winner at once");
}

// ---------- Cat and mouse ----------
console.log("cat and mouse");
{
	const r = pretend(5, "mouse", "m");
	run(r, 3000, 3100);
	const cat = r.byId.get(r.party.state.h);
	ok(cat && r.party.state.c === 0, "after three seconds one car is the cat (" + cat.id + ")");
	const mice = r.cars.filter(c => c !== cat);
	for(const m of mice) m.data.x = cat.data.x + 200 + mice.indexOf(m) * 40;
	run(r, 3150, 8000);
	ok(r.cars.every(c => c.elim === null), "a cat that touches nobody catches nobody");
	// Catch one at a time, then check the order.
	mice[0].data.x = cat.data.x + 1; run(r, 8050, 8100);
	ok(mice[0].elim === 1 && r.party.state.c === 1 && r.events.some(([t, d]) => t === "caught" && d.car === mice[0]), "touching a mouse catches it (out, and counted)");
	mice[1].data.x = cat.data.x + 1; run(r, 8150, 8200);
	ok(mice[1].elim === 2 && cat.elim === null, "the next one is out second, and the cat is never out");
	mice[2].data.x = cat.data.x + 1; mice[3].data.x = cat.data.x + 1.5; run(r, 8250, 8350);
	ok(mice[2].elim && mice[3].elim && r.party.over && cat.finish !== null, "catching the last of them: the cat wins");
	ok(r.standings()[0].car === cat, "and tops the standings (" + r.standings().map(s => s.car.id + (s.car.elim ? ":" + s.car.elim : "")).join(" ") + ")");
	ok(/4 caught/.test(r.party.score(cat)), "it scores what it caught (" + r.party.score(cat) + ")");
}
{
	const r = pretend(4, "mouse", "n");
	run(r, 3000, 3100);
	const cat = r.byId.get(r.party.state.h), mice = r.cars.filter(c => c !== cat);
	for(const m of mice) m.data.x = cat.data.x + 300 + mice.indexOf(m) * 50;
	mice.forEach((m, i) => m.prog = 10 - i);     // (mouse 0 is furthest on)
	mice[2].data.x = cat.data.x + 1; run(r, 3150, 3200);          // one is caught early
	run(r, 3250, PARTY.mouse.limit + 200);
	ok(r.party.over && r.endAt > 0, "when the time runs out the game ends");
	ok(cat.elim !== null && mice[2].elim !== null && cat.elim > mice[2].elim, "the cat that didn't get them all comes below the mice that got away, but above the one it did catch");
	ok(mice[0].finish !== null && mice[1].finish !== null && mice[0].finish < mice[1].finish && mice[2].finish === null, "the survivors finish in the order they're running");
	const st = r.standings().map(s => s.car);
	ok(st[0] === mice[0] && st[1] === mice[1] && st[2] === cat && st[3] === mice[2], "standings: survivors, then the cat, then the caught mouse");
}

// ---------- Crown chase ----------
console.log("crown chase");
{
	const r = pretend(3, "crown", "k");
	// Car 0 leads for 40 s, then car 1 for 100 s, then car 0 again till the end.
	const lead = t => t < 40000 ? 0 : t < 140000 ? 1 : 0;
	run(r, 0, PARTY.crown.limit + 100, t => { r.cars.forEach((c, i) => { c.prog = i === lead(t) ? 9 : i; }); });
	const s = r.party.state.s;
	ok(Math.abs(s.c0 - 80000) < 1500 && Math.abs(s.c1 - 100000) < 1500, "seconds on top add up (car 0 " + Math.round(s.c0 / 1000) + " s, car 1 " + Math.round(s.c1 / 1000) + " s)");
	ok(r.party.over && r.endAt > 0, "the game ends at the time limit");
	const st = r.standings().map(x => x.car.id);
	ok(st[0] === "c1", "the most seconds on top wins, not whoever leads at the end (" + st.join(" ") + ")");
	ok(r.party.score(r.byId.get("c1")) === "100 s on top" || /^\d+(\.\d)? s on top$/.test(r.party.score(r.byId.get("c1"))), "the results say how long: " + r.party.score(r.byId.get("c1")));
	ok(r.sent.length > 100 && r.sent.length < 400, "the host shares scores about once a second, not every frame (" + r.sent.length + " updates in 3 minutes)");
	ok(/wears the crown/.test(r.party.hudText("c2", 5000)), "the HUD names who wears it");
}
{
	// An eliminated or departed leader doesn't keep scoring.
	const r = pretend(2, "crown", "q");
	r.cars[0].prog = 5; r.cars[0].gone = true;
	run(r, 0, 5000, () => {});
	ok((r.party.state.s.c0 || 0) === 0 && r.party.state.s.c1 > 4000, "a car that's left never wears the crown");
}

// ---------- hosts and copies ----------
console.log("sharing the state");
{
	const r = pretend(4, "potato", "h");
	run(r, 0, 3100);
	const shared = JSON.parse(JSON.stringify(r.party.state));
	// A second screen (not the host) takes what the host sends, ignoring older copies and other kinds.
	const other = pretend(4, "potato", "h"); other.authority = false;
	other.party.apply(shared);
	ok(other.party.state.h === shared.h && other.party.state.f === shared.f, "another screen takes the host's state");
	other.party.apply({ k: "potato", n: 0, h: "c9", f: 1, s: {} });
	ok(other.party.state.h === shared.h, "an older copy doesn't replace a newer one");
	other.party.apply({ k: "mouse", n: 999, h: "c9" });
	ok(other.party.state.h === shared.h, "and a copy of another mode is ignored");
	const stripped = { k: "potato", n: shared.n + 1, h: "c1", f: 9999 };       // (the database drops empty and null fields)
	other.party.apply(stripped);
	ok(other.party.state.s && typeof other.party.state.c === "number" && other.party.state.g === 0, "empty fields the database dropped are filled back in");
	// The host leaves: another game takes over from the shared state and goes on from there.
	other.authority = true;
	for(const c of other.cars) c.data.x = c.data.x + 500 * other.cars.indexOf(c);
	other.cars[1].data.x = other.cars[2].data.x + 1; other.cars[1].data.y = 0; other.cars[2].data.y = 0;
	other.party.state.h = "c1"; other.party.state.ph = null; other.party.state.g = 0; other.party.state.f = 99999;
	other.party.rules(4000);
	ok(other.party.state.h === "c2" && other.party.state.n > stripped.n, "a new host carries on from the shared state (passes on, and its counter goes up)");
}

// ---------- the wheel of chaos ----------
console.log("wheel of chaos");
{
	ok(chaosFor("race1", 1) === null && chaosFor("race1", 0) === null && chaosFor("race1", NaN) === null, "lap 1 is always normal");
	ok(chaosFor("race1", 2) === chaosFor("race1", 2) && chaosFor("race1", 7) === chaosFor("race1", 7), "the same race and lap always give the same rule");
	let repeats = 0, same = 0, seen = new Set();
	for(let s = 0; s < 300; s++){
		for(let lap = 2; lap <= 30; lap++){
			const a = chaosFor("seed" + s, lap), b = chaosFor("seed" + s, lap + 1);
			seen.add(a.id);
			if(a === b) repeats++;
			if(chaosFor("seed" + s, lap) !== a) same++;
		}
	}
	ok(repeats === 0 && same === 0, "across 300 races a lap never gets the rule the lap before had");
	ok(seen.size === CHAOS.length, "every rule comes up (" + [...seen].join(", ") + ")");
	ok(chaosFor("a", 3) !== chaosFor("b", 3) || chaosFor("a", 4) !== chaosFor("b", 4) || chaosFor("a", 5) !== chaosFor("b", 5), "different races give different sequences");
	const count = {};
	for(let s = 0; s < 3000; s++){ const c = chaosFor("d" + s, 2); count[c.id] = (count[c.id] || 0) + 1; }
	ok(Object.values(count).every(n => n > 3000 / CHAOS.length * 0.7 && n < 3000 / CHAOS.length * 1.3), "the rules come up about equally often");
	ok(CHAOS.every(r => r.id && r.name && r.text) && CHAOS.filter(r => r.sky).every(r => r.sky.tod && r.sky.weather), "every rule has a name and a line of text, and the sky ones a time and weather");
	// Steering.
	const mirror = CHAOS.find(r => r.mirror), wobble = CHAOS.find(r => r.wobble);
	ok(chaosSteer(null, 0.3, 1) === 0.3 && chaosSteer(CHAOS.find(r => r.sky), 0.3, 1) === 0.3, "no rule, or a sky rule, leaves your steering alone");
	ok(chaosSteer(mirror, 0.3, 1) === -0.3 && chaosSteer(mirror, 0, 1) === 0 && chaosSteer(mirror, -0.5, 9) === 0.5, "mirror steering flips left and right");
	let worst = 0, mean = 0;
	for(let i = 0; i < 2000; i++){ const d = chaosSteer(wobble, 0, i * 0.037); worst = Math.max(worst, Math.abs(d)); mean += d; }
	ok(worst <= wobble.wobble + 1e-9 && worst > wobble.wobble * 0.6 && Math.abs(mean / 2000) < 0.03, "wobbly hands shake your steering by at most " + wobble.wobble + " either way, evenly (worst " + worst.toFixed(3) + ")");
	ok(Math.abs(chaosSteer(wobble, Math.PI / 6, 3)) < Math.PI / 6 + wobble.wobble + 1e-9, "and add to what you steer, never replace it");
}

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nparty-test: OK");
