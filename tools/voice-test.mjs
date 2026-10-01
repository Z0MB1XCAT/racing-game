// Checks the race engineer and the commentators (js/radio.js, js/commentary.js): a made-up race is played through them
// and what they would say is printed, and every clip they reach for must exist. With --browser (needs node serve.mjs
// running) it also decodes every clip in the voice packs in a real browser.
//   node tools/voice-test.mjs [--browser]
import { Engineer } from "../js/radio.js";
import { Commentary } from "../js/commentary.js";
import { LINES, VOICES, clipIds, BOT_NAMES } from "../js/voicelines.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };

// ---- a made-up race: 6 cars on a 2000-unit lap, 3 laps ----
function makeRace(mode = "race"){
	let clock = -3000;
	const names = ["Dexter", ...BOT_NAMES.slice(0, 5)];
	const cars = names.map((name, i) => ({
		id: "c" + i, name, isBot: i > 0, me: i === 0, look: { number: 20 + i }, data: { lap: 0, slot: i }, frac: 0, finish: null, elim: null, gone: false, lapTimes: [], best: null,
		speed: 21 - i * 0.15
	}));
	return {
		mode, laps: 3, lapLen: 2000, phase: "countdown", draft: true, events: [], bestLapAll: null,
		cars, byId: new Map(cars.map(c => [c.id, c])), me: cars[0],
		get raceTime(){ return clock; },
		set raceTime(v){ clock = v; },
		prog(c){ return c.data.lap + c.frac; },
		gapSeconds(a, b){ return (this.prog(a) - this.prog(b)) * this.lapLen / 21; },
		standings(){
			const list = cars.filter(c => !c.gone).map(car => ({ car, prog: this.prog(car) }));
			list.sort((a, b) => b.prog - a.prog);
			return list;
		},
		addEvent(type, data){ this.events.push({ type, t: clock, ...data }); }
	};
}
const hear = [];
let R = null;
const say = item => hear.push({ at: Math.round(R.raceTime), who: item.who, kind: item.kind, text: item.text, parts: item.parts, priority: item.priority });

function play(mode, seconds, script){
	R = makeRace(mode);
	hear.length = 0;
	let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const eng = new Engineer({ say, rand, level: "full" }), cast = new Commentary({ say, rand, level: "on" });
	eng.start(R); cast.start(R, { id: "monza" });
	let wentGo = false;
	for(let ms = -3000; ms < seconds * 1000; ms += 100){
		R.raceTime = ms;
		if(ms >= 0 && !wentGo){ wentGo = true; R.phase = "racing"; eng.event("go"); cast.event("go"); }
		if(ms >= 0){
			for(const c of R.cars){
				c.frac += c.speed * 0.1 / R.lapLen;
				if(c.frac >= 1){
					c.frac -= 1; c.data.lap++;
					if(c.data.lap > 1 && c.data.lap <= R.laps + 1){
						const lapMs = 95000; c.lapTimes.push(lapMs); c.best = c.best === null ? lapMs : Math.min(c.best, lapMs);
						const ev = { car: c, ms: lapMs, best: true };
						eng.event("lap", ev); cast.event("lap", ev);
						if(c.data.lap === R.laps) eng.event("finalLap", {});
					}
				}
			}
		}
		if(script) script(ms, R, eng, cast);
		const look = { rain: ms > 40000 ? 0.5 : 0, night: 0 };
		eng.update(0.1, look);
		cast.update(0.1, look);
	}
	return hear.slice();
}
const tag = l => l.kind === "radio" ? "RADIO" : l.who === "col" ? "COL  " : "LEAD ";

console.log("a race: lights out, a pass, a crash, contact, rain, the finish");
{
	const lines = play("race", 75, (ms, r, eng, cast) => {
		const A = r.cars[1], me = r.cars[0], B = r.cars[2];
		if(ms === 12000){ r.addEvent("pass", { a: me.id, b: B.id, pos: 3, text: "x" }); me.frac += 0.004; }
		if(ms === 20000){ r.addEvent("crash", { a: A.id, pos: 2, text: "x" }); cast.event("hit", { car: A, strength: 0.4, type: "wall" }); eng.event("hit", { car: me, other: B, strength: 0.3, type: "car" }); }
		if(ms === 26000) r.addEvent("contact", { a: B.id, b: r.cars[3].id, pos: 4, text: "x" });
		if(ms === 33000) r.addEvent("fastest", { a: r.cars[4].id, text: "x" });
		if(ms === 52000){ me.finish = ms; eng.event("finish", { car: me, position: 1 }); r.addEvent("finish", { a: me.id, text: "x" }); }
	});
	for(const l of lines) console.log(`    ${String(l.at).padStart(6)} ms  ${tag(l)} ${l.text}`);
	ok(lines.some(l => l.kind === "radio"), "the engineer said something");
	ok(lines.some(l => l.kind === "cast" && l.who === "lead"), "the lead commentator said something");
	ok(lines.some(l => /lights out|racing|away we go/i.test(l.text)), "lights out was called");
	ok(lines.some(l => /wall|barrier/i.test(l.text)), "the crash was called");
	ok(lines.some(l => l.kind === "radio" && /contact/i.test(l.text)), "the player's contact was reported on the radio");
	ok(lines.some(l => /rain/i.test(l.text)), "the rain was mentioned");
	ok(lines.every(l => l.parts.every(p => typeof p !== "string" || LINES[p])), "every clip they reach for exists");
	ok(lines.every(l => l.text && !/undefined|NaN|\[object/.test(l.text)), "no broken subtitles");
	ok(lines.every((l, i) => i === 0 || l.text !== lines[i - 1].text), "no sentence is repeated back to back");
	ok(lines.length >= 6 && lines.length <= 60, "a sensible amount of talk (" + lines.length + " lines in 75 s)");
}
console.log("a short key-moments radio");
{
	R = makeRace("race"); hear.length = 0;
	const eng = new Engineer({ say, level: "important", rand: Math.random }); eng.start(R); R.phase = "racing";
	R.raceTime = 20000; eng.update(0.3, null); eng.event("hit", { car: R.me, other: null, strength: 0.4, type: "wall" });
	R.raceTime = 40000; eng.event("lap", { car: R.me, ms: 95000, best: true });
	ok(hear.length === 1 && /wall|barrier/i.test(hear[0].text), "only the incident gets through: " + JSON.stringify(hear.map(h => h.text)));
}
console.log("a car we have no name clip for");
{
	R = makeRace("race"); hear.length = 0; R.cars[1].name = "xX_Racer_Xx"; R.cars[1].isBot = false;
	const cast = new Commentary({ say, rand: () => 0.1, level: "on" }); cast.start(R, { id: "spa" }); R.phase = "racing"; R.raceTime = 20000;
	cast.event("go", {}); R.raceTime = 30000;
	R.addEvent("pass", { a: R.cars[1].id, b: R.cars[0].id, pos: 2, text: "x" });
	cast.update(0.3, null);
	const line = hear.find(h => /xX_Racer_Xx/.test(h.text));
	ok(line && /#21/.test(line.text) && line.parts.includes("lead.number"), "said as a number, subtitled with the name: " + (line && line.text));
}
console.log("the lines");
{
	for(const v of Object.keys(VOICES)){
		const ids = clipIds(v);
		ok(ids.length > 20, `${VOICES[v].name}: ${ids.length} clips`);
	}
	ok(Object.values(LINES).every(l => l.t && l.t.length < 160), "every line is short enough to be a clip");
}

if(process.argv.includes("--browser")){
	const puppeteer = (await import("puppeteer")).default;
	console.log("the clips in a browser");
	const b = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
	const p = await b.newPage();
	const errors = [];
	p.on("pageerror", e => errors.push(e.message));
	p.on("console", m => { if((m.type() === "warn" || m.type() === "error") && !/tailwind|apple-mobile/.test(m.text())) errors.push("console: " + m.text()); });
	await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	const res = await p.evaluate(async () => {
		const { clipIds, VOICES } = await import("/js/voicelines.js");
		const out = { voices: {} };
		const ctx = new AudioContext();
		for(const v of Object.keys(VOICES)){
			const index = (await (await fetch(`/assets/voice/${v}.json`)).json()).clips, buf = await (await fetch(`/assets/voice/${v}.pak`)).arrayBuffer();
			const o = { missing: [], broken: [], quiet: [], long: [], n: 0, secs: 0 };
			for(const id of clipIds(v)){
				const c = index[id];
				if(!c){ o.missing.push(id); continue; }
				try{
					const a = await ctx.decodeAudioData(buf.slice(c[0], c[0] + c[1]));
					o.n++; o.secs += a.duration;
					const d = a.getChannelData(0); let peak = 0, sum = 0;
					for(let i = 0; i < d.length; i++){ const x = Math.abs(d[i]); if(x > peak) peak = x; sum += d[i] * d[i]; }
					const rms = Math.sqrt(sum / d.length);
					if(peak < 0.1 || rms < 0.02) o.quiet.push(id);
					if(a.duration > 9) o.long.push(id);
				}catch(e){ o.broken.push(id); }
			}
			out.voices[v] = o;
		}
		return out;
	});
	for(const [v, o] of Object.entries(res.voices)){
		ok(o.missing.length === 0 && o.broken.length === 0, `${v}: ${o.n} clips decode, ${o.secs.toFixed(0)} s of speech` + (o.missing.length ? `, missing ${o.missing.slice(0, 5)}` : "") + (o.broken.length ? `, broken ${o.broken.slice(0, 5)}` : ""));
		ok(o.quiet.length === 0 && o.long.length === 0, `${v}: no silent or overlong clip` + (o.quiet.length ? ` (quiet: ${o.quiet.slice(0, 5)})` : ""));
	}
	ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors[0] : ""));
	await b.close();
}
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\nvoices ok");
