// All sounds are synthesised with Web Audio, so there are no files to load.
// Browsers only allow sound after the player clicks or presses a key; unlock() handles that.
//
// Mix: master volume → [music, effects, engines] → gentle compressor → speakers.
import { createMusic } from "./music.js";

let ctx = null, master = null, buses = null, noise = null, music = null;
let volume = 0.7, levels = { music: 0.5, sfx: 0.8, engine: 0.8 }, wantSong = null;

export function unlock(){
	if(ctx){ if(ctx.state === "suspended") ctx.resume(); return; }
	const AC = window.AudioContext || window.webkitAudioContext;
	if(!AC) return;
	ctx = new AC();
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
	master = ctx.createGain();
	master.gain.value = volume;
	master.connect(comp); comp.connect(ctx.destination);
	buses = {};
	for(const k of ["music", "sfx", "engine"]){ buses[k] = ctx.createGain(); buses[k].gain.value = levels[k]; buses[k].connect(master); }
	noise = noiseBuffer(2);
	music = createMusic(ctx, buses.music, noise);
	if(wantSong) music.play(wantSong);
}

export function setVolume(v){
	volume = v;
	if(master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}
// kind: "music" | "sfx" | "engine", v: 0..1
export function setLevel(kind, v){
	levels[kind] = v;
	if(buses) buses[kind].gain.setTargetAtTime(v, ctx.currentTime, 0.05);
	if(kind === "engine" && v <= 0) stopEngine();
}

// ---------- Music ----------
// "menu", "race" or null. Safe to call before unlock(): it starts once sound is allowed.
export function playMusic(name){
	wantSong = name;
	if(music) music.play(name);
}
export function musicIntensity(v){ if(music) music.intensity(v); }
export function duckMusic(on){ if(music) music.duck(on); }

function noiseBuffer(seconds){
	const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
	const d = b.getChannelData(0);
	for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	return b;
}
function noiseSrc(loop = false){
	const s = ctx.createBufferSource();
	s.buffer = noise; s.loop = loop;
	if(!loop) s.loopStart = 0;
	return s;
}
function shaperCurve(k){
	const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
	for(let i = 0; i < n; i++){ const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
	return c;
}

// ---------- Engines ----------
// Each body gets its own engine. rpm comes from speed through a gearbox, so you hear
// the revs climb, the upshift, and the drop, like a real car.
//   cyl: cylinders (sets firing frequency), idle/max: rpm, gears: top speed of each gear
//   as a fraction of the car's top speed, harm: harmonic mix, sub: V8 burble (half-order),
//   grit: distortion, cut: [low, high] filter, turbo: whistle, crackle: pops on upshift.
const VMAX = 0.4;
export const ENGINES = {
	// Buzzy little four-pot, close to the sound the game has always had.
	classic: { cyl: 4, idle: 1300, max: 7400, gears: [0.24, 0.4, 0.58, 0.78, 1.02], harm: [1, 0.75, 0.5, 0.42, 0.25, 0.18, 0.1, 0.06], sub: 0.12, grit: 3, cut: [700, 3400], noise: 0.05, detune: 9, vol: 0.85 },
	// 1.6 V6 turbo hybrid: high, sharp wail, eight quick gears, turbo whistle.
	formula: { cyl: 6, idle: 4200, max: 12600, gears: [0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.87, 1.02], harm: [1, 0.9, 0.75, 0.6, 0.55, 0.42, 0.36, 0.3, 0.24, 0.2, 0.15, 0.12, 0.09], sub: 0.04, grit: 4, cut: [1500, 8200], noise: 0.035, detune: 5, turbo: 0.022, vol: 0.62 },
	// Front-engined V8: throaty burble, six gears, crackles on the upshift.
	gt: { cyl: 8, idle: 1400, max: 8200, gears: [0.22, 0.37, 0.52, 0.67, 0.83, 1.02], harm: [1, 0.55, 0.42, 0.3, 0.22, 0.14, 0.09, 0.05], sub: 0.55, grit: 6, cut: [650, 4200], noise: 0.07, detune: 12, crackle: 1, vol: 0.8 },
	// Big pushrod V8: deep, loud and rough, four long gears.
	stock: { cyl: 8, idle: 1700, max: 9300, gears: [0.34, 0.57, 0.8, 1.03], harm: [1, 0.72, 0.6, 0.45, 0.36, 0.26, 0.2, 0.12, 0.08], sub: 0.8, grit: 9, cut: [480, 3300], noise: 0.09, detune: 16, crackle: 0.45, vol: 0.85 }
};
const MAX_VOICES = 4;
let voices = new Map(), enginesOn = false, road = null;

function makeVoice(body){
	const p = ENGINES[body] || ENGINES.classic;
	const t = ctx.currentTime;
	const real = new Float32Array(p.harm.length + 1), imag = new Float32Array(p.harm.length + 1);
	p.harm.forEach((h, i) => { imag[i + 1] = h; });
	const wave = ctx.createPeriodicWave(real, imag);
	const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
	o1.setPeriodicWave(wave); o2.setPeriodicWave(wave); o2.detune.value = p.detune;
	sub.type = "triangle";
	const mix = ctx.createGain(); mix.gain.value = 0.5;
	const subG = ctx.createGain(); subG.gain.value = p.sub * 0.8;
	o1.connect(mix); o2.connect(mix); sub.connect(subG); subG.connect(mix);
	// Uneven firing: wobble the level at half the firing rate (strong on V8s).
	const am = ctx.createGain(); am.gain.value = 1;
	const lopeG = ctx.createGain(); lopeG.gain.value = p.sub * 0.35;
	sub.connect(lopeG); lopeG.connect(am.gain);
	mix.connect(am);
	// Intake/exhaust roar.
	const ns = noiseSrc(true);
	const nbp = ctx.createBiquadFilter(); nbp.type = "bandpass"; nbp.Q.value = 0.8;
	const nG = ctx.createGain(); nG.gain.value = p.noise;
	ns.connect(nbp); nbp.connect(nG); nG.connect(am);
	const shaper = ctx.createWaveShaper(); shaper.curve = shaperCurve(p.grit); shaper.oversample = "2x";
	const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.2; lp.frequency.value = p.cut[0];
	const cut = ctx.createGain(); cut.gain.value = 1;      // ignition cut on gear changes
	const out = ctx.createGain(); out.gain.value = 0;      // level and distance
	const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
	am.connect(shaper); shaper.connect(lp); lp.connect(cut); cut.connect(out);
	if(pan){ out.connect(pan); pan.connect(buses.engine); } else out.connect(buses.engine);
	const oscs = [o1, o2, sub, ns];
	let turbo = null;
	if(p.turbo){
		const w = ctx.createOscillator(); w.type = "sine";
		const wg = ctx.createGain(); wg.gain.value = 0;
		w.connect(wg); wg.connect(out);
		oscs.push(w); turbo = { osc: w, gain: wg };
	}
	oscs.forEach(o => o.start(t));
	return { body, p, o1, o2, sub, nbp, lp, cut, out, pan, turbo, oscs, gear: 0, rpm: p.idle, lastSpeed: 0, seen: 0 };
}
function killVoice(v){
	const t = ctx.currentTime;
	v.out.gain.cancelScheduledValues(t);
	v.out.gain.setTargetAtTime(0, t, 0.08);
	setTimeout(() => { try { v.oscs.forEach(o => o.stop()); v.out.disconnect(); } catch {} }, 500);
}

function shiftCut(v, up){
	const t = ctx.currentTime, g = v.cut.gain;
	g.cancelScheduledValues(t);
	g.setValueAtTime(g.value, t);
	g.linearRampToValueAtTime(up ? 0.25 : 0.6, t + 0.02);
	g.linearRampToValueAtTime(1, t + (up ? 0.09 : 0.06));
	if(up && v.p.crackle && Math.random() < v.p.crackle) crackle(v, 3 + Math.floor(Math.random() * 4));
}
// Unburnt fuel popping in the exhaust.
function crackle(v, n){
	const t0 = ctx.currentTime + 0.03;
	for(let i = 0; i < n; i++){
		const t = t0 + Math.random() * 0.28;
		const s = noiseSrc();
		const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 700 + Math.random() * 1600; f.Q.value = 1.5;
		const g = ctx.createGain();
		const a = (0.12 + Math.random() * 0.2) * v.p.vol;
		g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.03);
		s.connect(f); f.connect(g); g.connect(v.pan || v.out);
		s.start(t, Math.random() * 1.5, 0.08);
	}
}

// Tyres and wind only follow the car you're watching.
function makeRoad(){
	const src = noiseSrc(true);
	const b1 = ctx.createBiquadFilter(); b1.type = "bandpass"; b1.frequency.value = 1150; b1.Q.value = 7;
	const b2 = ctx.createBiquadFilter(); b2.type = "bandpass"; b2.frequency.value = 2250; b2.Q.value = 6;
	const sq = ctx.createGain(); sq.gain.value = 0;
	src.connect(b1); src.connect(b2); b1.connect(sq); b2.connect(sq); sq.connect(buses.engine);
	const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
	const wind = ctx.createGain(); wind.gain.value = 0;
	src.connect(lp); lp.connect(wind); wind.connect(buses.engine);
	src.start();
	return { src, b1, b2, sq, lp, wind };
}

export function startEngine(){
	if(!ctx || levels.engine <= 0) return;
	enginesOn = true;
	if(!road) road = makeRoad();
}
export function stopEngine(){
	enginesOn = false;
	if(!ctx) return;
	for(const v of voices.values()) killVoice(v);
	voices.clear();
	if(road){
		const r = road, t = ctx.currentTime;
		r.sq.gain.setTargetAtTime(0, t, 0.06); r.wind.gain.setTargetAtTime(0, t, 0.06);
		setTimeout(() => { try { r.src.stop(); } catch {} }, 400);
		road = null;
	}
}

// cars: [{ id, body, speed, gain 0..1, pan -1..1, pitch (doppler, ~1), rev? 0..1 (revving on the grid) }]
// The first entry is the loudest; up to MAX_VOICES are heard.
// focus: { speed, slip 0..1, draft 0..1 } for tyre squeal and wind.
export function updateEngines(cars, focus, dt){
	if(!ctx || !enginesOn) return;
	const t = ctx.currentTime, frame = (updateEngines.n = (updateEngines.n || 0) + 1);
	for(const c of cars.slice(0, MAX_VOICES)){
		let v = voices.get(c.id);
		if(v && v.body !== c.body){ killVoice(v); voices.delete(c.id); v = null; }
		if(!v){
			if(voices.size >= MAX_VOICES){
				// Drop the voice that has gone unused longest.
				let old = null;
				for(const [id, x] of voices) if(!old || x.seen < old[1].seen) old = [id, x];
				killVoice(old[1]); voices.delete(old[0]);
			}
			v = makeVoice(c.body);
			voices.set(c.id, v);
		}
		v.seen = frame;
		const p = v.p, s = Math.min(1.05, c.speed / VMAX);
		let target;
		if(c.rev != null) target = p.idle + (p.max * 0.85 - p.idle) * c.rev;
		else {
			let g = v.gear;
			while(g < p.gears.length - 1 && s > p.gears[g] * 0.97) g++;
			while(g > 0 && s < p.gears[g - 1] * 0.7) g--;
			if(g !== v.gear){ shiftCut(v, g > v.gear); v.rpm = Math.max(p.idle, p.max * s / p.gears[g]); }
			v.gear = g;
			target = Math.max(p.idle, p.max * Math.min(1, s / p.gears[g]));
			// A big sudden slow-down (a crash) makes V8s pop.
			if(p.crackle && v.lastSpeed - c.speed > 0.05 && Math.random() < p.crackle) crackle(v, 4);
		}
		v.lastSpeed = c.speed;
		v.rpm += (target - v.rpm) * Math.min(1, dt * 14);
		const k = (v.rpm - p.idle) / (p.max - p.idle);
		const fire = v.rpm / 60 * p.cyl / 2 * (c.pitch || 1);
		v.o1.frequency.setTargetAtTime(fire, t, 0.02);
		v.o2.frequency.setTargetAtTime(fire, t, 0.02);
		v.sub.frequency.setTargetAtTime(fire / 2, t, 0.02);
		v.nbp.frequency.setTargetAtTime(fire * 3, t, 0.03);
		v.lp.frequency.setTargetAtTime(p.cut[0] + (p.cut[1] - p.cut[0]) * Math.pow(k, 0.8), t, 0.03);
		v.out.gain.setTargetAtTime(0.13 * p.vol * (0.55 + 0.45 * k) * c.gain, t, 0.04);
		if(v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, c.pan || 0)), t, 0.05);
		if(v.turbo){
			v.turbo.osc.frequency.setTargetAtTime(2400 + 3600 * k, t, 0.08);
			v.turbo.gain.gain.setTargetAtTime(p.turbo * k * k, t, 0.1);
		}
	}
	// Voices for cars that left the list fade out.
	for(const [id, v] of voices) if(v.seen !== frame){
		v.out.gain.setTargetAtTime(0, t, 0.1);
		if(frame - v.seen > 240){ killVoice(v); voices.delete(id); }
	}
	if(road && focus){
		const { speed, slip, draft } = focus;
		const squeal = slip > 0.3 && speed > 0.1 ? Math.min(0.1, (slip - 0.28) * 0.22) : 0;
		road.sq.gain.setTargetAtTime(squeal, t, 0.04);
		const wob = Math.sin(t * 23) * 60 + Math.sin(t * 7.3) * 90;
		road.b1.frequency.setTargetAtTime(1050 + slip * 300 + wob, t, 0.03);
		road.b2.frequency.setTargetAtTime(2150 + slip * 500 - wob, t, 0.03);
		road.wind.gain.setTargetAtTime(0.012 + Math.min(1, speed / VMAX) * 0.03 + (draft > 0.08 ? draft * 0.08 : 0), t, 0.12);
		road.lp.frequency.setTargetAtTime(380 + speed / VMAX * 700 + draft * 400, t, 0.12);
	}
}

// ---------- Effects ----------
function out(){ return buses.sfx; }
function tone(freq, dur, type = "sine", vol = 0.2, when = 0, slide = 0, dest){
	if(!ctx) return;
	const t = ctx.currentTime + when;
	const o = ctx.createOscillator(), g = ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, t);
	if(slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g); g.connect(dest || out());
	o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, vol, type, freq, q = 1, when = 0, dest){
	if(!ctx) return;
	const t = ctx.currentTime + when;
	const s = noiseSrc();
	const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
	const g = ctx.createGain();
	g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	s.connect(f); f.connect(g); g.connect(dest || out());
	s.start(t, Math.random() * 1.5, dur + 0.05);
}
// A bell: a few inharmonic partials that ring out.
function bell(freq, vol, when = 0, len = 1.2){
	[[1, 1], [2.76, 0.45], [5.4, 0.25], [8.9, 0.1]].forEach(([m, a]) => tone(freq * m, len / m ** 0.3, "sine", vol * a, when));
}
// A brassy note for fanfares.
function brass(freq, dur, vol, when = 0){
	if(!ctx) return;
	const t = ctx.currentTime + when;
	const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
	o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 8;
	f.type = "lowpass"; f.Q.value = 2;
	f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(freq * 5, t + 0.06); f.frequency.exponentialRampToValueAtTime(freq * 2.2, t + dur);
	g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
	g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(f); o2.connect(f); f.connect(g); g.connect(out());
	o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
// Grandstand cheering: filtered noise that swells, with whistles over the top.
function crowd(len = 2.6, vol = 0.14){
	if(!ctx) return;
	const t = ctx.currentTime;
	const s = noiseSrc(true);
	const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 0.6;
	const f2 = ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = 3200;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + 0.35);
	for(let x = 0.4; x < len - 0.6; x += 0.12) g.gain.setTargetAtTime(vol * (0.7 + Math.random() * 0.45), t + x, 0.05);
	g.gain.setTargetAtTime(0.0001, t + len - 0.6, 0.25);
	s.connect(f); f.connect(f2); f2.connect(g); g.connect(out());
	s.start(t); s.stop(t + len + 0.5);
	for(let i = 0; i < 3; i++){
		const w = 0.3 + Math.random() * (len - 1.2), fr = 1900 + Math.random() * 900;
		tone(fr, 0.25, "sine", vol * 0.22, w, 1.25);
		tone(fr * 1.2, 0.35, "sine", vol * 0.18, w + 0.28, 0.8);
	}
}

// strength ~0..0.6; near 0..1 (distance); kind "wall" or "car"
export function thud(strength, near = 1, kind = "wall"){
	if(!ctx || strength < 0.03) return;
	const vol = Math.min(0.55, strength * 1.5) * near;
	if(vol < 0.02) return;
	tone(kind === "car" ? 95 : 65, 0.2, "sine", vol * 0.9, 0, 0.5);
	burst(0.18, vol * 0.7, "lowpass", kind === "car" ? 1500 : 1000, 0.7);
	if(kind === "car"){
		// Body panels: short metallic ring.
		const b = 380 + Math.random() * 120;
		[[1, 0.3], [2.63, 0.2], [4.1, 0.12], [6.7, 0.07]].forEach(([m, a]) => tone(b * m, 0.12 + 0.1 / m, "triangle", vol * a));
	}else{
		// Scraping along the barrier.
		burst(0.35 + vol * 0.4, vol * 0.3, "bandpass", 2600, 1.4, 0.02);
		burst(0.12, vol * 0.5, "bandpass", 420, 2);
	}
}

export const sfx = {
	// Start lights: one short beep per light.
	light(){ tone(880, 0.13, "sine", 0.16); tone(880, 0.13, "square", 0.025); },
	go(){ tone(1760, 0.45, "sine", 0.16); tone(1760, 0.3, "square", 0.03); crowd(1.8, 0.06); },
	// Crossing the line: timing chime.
	lap(){ tone(988, 0.14, "triangle", 0.14); tone(1319, 0.26, "triangle", 0.14, 0.09); },
	// Purple lap.
	best(){ [1047, 1319, 1568, 2093].forEach((f, i) => { tone(f, 0.22, "triangle", 0.12, i * 0.07); tone(f * 2, 0.3, "sine", 0.03, i * 0.07 + 0.02); }); },
	// White flag bell.
	finalLap(){ bell(880, 0.12); bell(880, 0.12, 0.42); },
	// Chequered flag. pos 1 gets the full fanfare.
	finish(pos = 0){
		if(pos === 1){
			[[523, 0], [659, 0.14], [784, 0.28], [1047, 0.46]].forEach(([f, w]) => brass(f, w === 0.46 ? 0.9 : 0.2, 0.09, w));
			brass(784, 0.9, 0.05, 0.46); brass(659, 0.9, 0.05, 0.46);
			crowd(3.2, 0.16);
		}else if(pos && pos <= 3){
			[[587, 0], [740, 0.14], [880, 0.3]].forEach(([f, w]) => brass(f, w ? 0.7 : 0.2, 0.08, w));
			crowd(2.4, 0.11);
		}else{
			[659, 784, 988].forEach((f, i) => tone(f, 0.3, "triangle", 0.13, i * 0.1));
			crowd(1.8, 0.06);
		}
	},
	out(){ [392, 330, 262].forEach((f, i) => brass(f, i === 2 ? 0.6 : 0.2, 0.07, i * 0.22)); },
	click(){ tone(2100, 0.025, "sine", 0.05); burst(0.015, 0.04, "highpass", 5000); },
	wrong(){ tone(185, 0.16, "square", 0.05); tone(185, 0.16, "square", 0.05, 0.2); },
	// Something unlocked in the garage / levelled up.
	unlock(){ [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, "triangle", 0.1, i * 0.06)); bell(2093, 0.05, 0.25, 0.8); }
};
