// Checks the weather timeline (js/atmosphere.js) over thousands of made-up races, no browser needed:
// dynamic weather is calm (the point of it: a five-lap race that rained twice was too much), it never changes
// suddenly, the cloud comes before the rain, the forecast sees changes coming, and every screen would see the same sky.
//   node tools/weather-test.mjs
import { makeAtmosphere, kindOf, CLIMATES, CONDITIONS, WEATHERS } from "../js/atmosphere.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const RACE = 8 * 60 * 1000;          // a five-lap race on a long circuit
const dyn = (seed, theme = "classic") => makeAtmosphere({ tod: "default", weather: "dynamic" }, { climate: CLIMATES[theme] }, seed);
// Stretches of rain (or storm) lasting at least 15 s.
const episodes = (atm, to = RACE) => {
	let n = 0, run = 0;
	for(let t = 0; t <= to; t += 1000){
		const wet = atm.at(t).rain > 0.28;
		run = wet ? run + 1 : 0;
		if(wet && run === 15) n++;
	}
	return n;
};

console.log("dynamic weather is calm");
{
	const N = 3000;
	let any = 0, twice = 0, wetSeconds = 0, changes = 0, wetAtStart = 0;
	for(let s = 0; s < N; s++){
		const a = dyn("race" + s), e = episodes(a);
		if(e >= 1) any++;
		if(e >= 2) twice++;
		let prev = kindOf(a.at(0));
		for(let t = 1000; t <= RACE; t += 1000){
			const k = kindOf(a.at(t));
			if(k !== prev){ changes++; prev = k; }
			if(a.at(t).rain > 0.28) wetSeconds++;
		}
		if(a.at(30000).rain > 0.05) wetAtStart++;
	}
	const pAny = any / N, pTwice = twice / N;
	console.log(`    ${(pAny * 100).toFixed(1)}% of races see rain, ${(pTwice * 100).toFixed(2)}% see it twice, ${(changes / N).toFixed(2)} changes of weather per race, wet for ${(wetSeconds / N / 4.8).toFixed(1)}% of the race`);
	ok(pAny <= 0.25, "rain in at most about one race in four (" + (pAny * 100).toFixed(1) + "%)");
	ok(pTwice <= 0.01, "rain twice in one race is rare (" + (pTwice * 100).toFixed(2) + "%)");
	ok(changes / N <= 3, "a handful of changes in a race at most (" + (changes / N).toFixed(2) + ")");
	ok(wetAtStart === 0, "never raining at the start (" + wetAtStart + " of " + N + ")");
}
console.log("it changes slowly");
{
	let worst = 0, worstCloud = 0, rains = 0, leads = 0;
	for(let s = 0; s < 400; s++){
		const a = dyn("slow" + s, "suzuka");
		let prev = a.at(0);
		for(let t = 1000; t <= 20 * 60 * 1000; t += 1000){
			const x = a.at(t);
			for(const k of ["rain", "fog", "snow", "wind", "storm"]) worst = Math.max(worst, Math.abs(x[k] - prev[k]));
			worstCloud = Math.max(worstCloud, Math.abs(x.cloud - prev.cloud));
			if(prev.rain < 0.2 && x.rain >= 0.2){ rains++; if(x.cloud > 0.55) leads++; }
			prev = x;
		}
	}
	ok(worst < 0.04, "no sudden jumps: rain, mist and wind never move more than " + worst.toFixed(3) + " in a second");
	ok(worstCloud < 0.04, "the cloud cover changes gently too (" + worstCloud.toFixed(3) + " a second)");
	ok(rains > 20 && leads / rains > 0.95, "the sky has clouded over before it rains (" + leads + " of " + rains + " showers)");
}
console.log("the circuits' own weather");
{
	const share = (theme, kind) => {
		let n = 0, tot = 0;
		for(let s = 0; s < 150; s++){ const a = dyn("clim" + s, theme); for(let t = 0; t < 40 * 60000; t += 10000){ tot++; if(kindOf(a.at(t)) === kind) n++; } }
		return n / tot;
	};
	const sp = share("spa", "rain"), mo = share("monaco", "rain"), je = share("jeddah", "rain"), dayS = share("daytona", "storm"), mon = share("monaco", "storm");
	ok(sp > mo * 1.25, "Spa is wetter than Monaco (rain " + (sp * 100).toFixed(1) + "% against " + (mo * 100).toFixed(1) + "%)");
	ok(je === 0, "Jeddah never rains (" + (je * 100).toFixed(1) + "%)");
	ok(dayS > mon * 2, "Daytona has more storms than Monaco (" + (dayS * 100).toFixed(1) + "% against " + (mon * 100).toFixed(1) + "%)");
	const sn = share("snow", "snow");
	ok(sn > 0.2, "Glacier Pass gets its snow (" + (sn * 100).toFixed(0) + "% of the time)");
	ok(share("monza", "fog") > share("monaco", "fog"), "Monza has more mist than Monaco");
	// A shower is never followed straight away by another: count showers in an hour on the wettest circuit.
	let most = 0;
	for(let s = 0; s < 300; s++){
		const a = dyn("gap" + s, "suzuka");
		let showers = 0, wet = false;
		for(let t = 0; t < 60 * 60000; t += 5000){ const w = a.at(t).rain > 0.28; if(w && !wet) showers++; wet = w; }
		most = Math.max(most, showers);
	}
	ok(most <= 12, "at most " + most + " showers in a whole hour on the wettest circuit");
}
console.log("fixed weather");
{
	for(const w of Object.keys(WEATHERS).filter(k => k !== "dynamic")){
		const a = makeAtmosphere({ tod: "default", weather: w }, {}, "x"), x = a.at(0), y = a.at(300000);
		ok(JSON.stringify(x) === JSON.stringify(y) && kindOf(x) === w, w + " stays " + w);
	}
	const bad = makeAtmosphere({ tod: "default", weather: "bogus" }, {}, "x").at(0);
	ok(kindOf(bad) === "clear", "an unknown weather is clear");
	for(const k of Object.keys(CONDITIONS)) ok(Object.values(CONDITIONS[k]).every(v => v >= 0 && v <= 1), k + " is all within 0..1");
}
console.log("the forecast");
{
	let checked = 0, good = 0, early = 0;
	for(let s = 0; s < 200; s++){
		const a = dyn("fc" + s, "spa");
		let t0 = null;
		for(let t = 0; t < 30 * 60000; t += 1000) if(a.at(t).rain > 0.28){ t0 = t; break; }
		if(t0 === null || t0 < 120000) continue;
		checked++;
		const nx = a.next(t0 - 70000, 150000);
		if(nx && nx.kind !== "clear" && nx.in >= 40 && nx.in <= 100) good++;
		const strip = a.forecast(t0 - 70000, 360000, 10000);
		if(strip.slice(0, 8).some(k => k === "rain" || k === "storm")) early++;
	}
	ok(checked > 40 && good / checked > 0.9, "a minute before a shower, the forecast says it's coming (" + good + " of " + checked + ")");
	ok(early / checked > 0.9, "and the strip shows it within the next minute and a bit (" + early + " of " + checked + ")");
	const a = dyn("det1"), b = dyn("det1"), c = dyn("det2");
	let same = true, diff = false;
	for(let t = 0; t < RACE; t += 7000){
		if(JSON.stringify(a.at(t)) !== JSON.stringify(b.at(t))) same = false;
		if(JSON.stringify(a.at(t)) !== JSON.stringify(c.at(t))) diff = true;
	}
	ok(same && diff, "every screen in a room sees the same sky; another race, another sky");
}
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\nweather ok");
