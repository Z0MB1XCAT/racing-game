// All sounds are synthesised with Web Audio, so there are no files to load.
// Browsers only allow sound after the player clicks or presses a key; unlock() handles that.
let ctx = null, master = null, engine = null, skid = null, volume = 0.7, engineOn = true;

export function unlock(){
	if(ctx){ if(ctx.state === "suspended") ctx.resume(); return; }
	const AC = window.AudioContext || window.webkitAudioContext;
	if(!AC) return;
	ctx = new AC();
	master = ctx.createGain();
	master.gain.value = volume;
	master.connect(ctx.destination);
}

export function setVolume(v){
	volume = v;
	if(master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export function setEngineEnabled(on){
	engineOn = on;
	if(!on) stopEngine();
}

function noiseBuffer(seconds){
	const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
	const d = b.getChannelData(0);
	for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	return b;
}

export function startEngine(){
	if(!ctx || engine || !engineOn) return;
	const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
	o1.type = "sawtooth"; o2.type = "square";
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass"; filter.frequency.value = 400; filter.Q.value = 3;
	const gain = ctx.createGain();
	gain.gain.value = 0;
	const g2 = ctx.createGain(); g2.gain.value = 0.35;
	o1.connect(filter); o2.connect(g2); g2.connect(filter);
	filter.connect(gain); gain.connect(master);
	o1.start(); o2.start();

	const src = ctx.createBufferSource();
	src.buffer = noiseBuffer(1);
	src.loop = true;
	const bp = ctx.createBiquadFilter();
	bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.5;
	const sg = ctx.createGain(); sg.gain.value = 0;
	src.connect(bp); bp.connect(sg); sg.connect(master);
	// Wind rush while in someone's slipstream.
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass"; lp.frequency.value = 650;
	const wg = ctx.createGain(); wg.gain.value = 0;
	src.connect(lp); lp.connect(wg); wg.connect(master);
	src.start();
	engine = { o1, o2, filter, gain, wind: wg };
	skid = { src, gain: sg };
}

export function stopEngine(){
	if(!engine) return;
	const t = ctx.currentTime;
	engine.gain.gain.setTargetAtTime(0, t, 0.08);
	skid.gain.gain.setTargetAtTime(0, t, 0.08);
	const e = engine, s = skid;
	setTimeout(() => { try { e.o1.stop(); e.o2.stop(); s.src.stop(); } catch {} }, 400);
	engine = skid = null;
}

// speed: 0..~0.4 (physics units per frame); slip: 0..1; draft: 0..1
export function updateEngine(speed, slip, draft = 0){
	if(!engine) return;
	const t = ctx.currentTime, k = Math.min(1, speed / 0.4);
	const f = 55 + k * 150 + Math.sin(t * 7) * 2;
	engine.o1.frequency.setTargetAtTime(f, t, 0.05);
	engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
	engine.filter.frequency.setTargetAtTime(300 + k * 1600, t, 0.05);
	engine.gain.gain.setTargetAtTime(0.07 + k * 0.08, t, 0.05);
	skid.gain.gain.setTargetAtTime(slip > 0.32 && speed > 0.1 ? Math.min(0.12, (slip - 0.3) * 0.25) : 0, t, 0.04);
	engine.wind.gain.setTargetAtTime(draft > 0.08 ? draft * 0.09 : 0, t, 0.12);
}

function tone(freq, dur, type = "sine", vol = 0.2, when = 0, slide = 0){
	if(!ctx) return;
	const t = ctx.currentTime + when;
	const o = ctx.createOscillator(), g = ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, t);
	if(slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g); g.connect(master);
	o.start(t); o.stop(t + dur + 0.05);
}

export function thud(strength, near = 1){
	if(!ctx || strength < 0.03) return;
	const vol = Math.min(0.5, strength * 1.4) * near;
	if(vol < 0.02) return;
	const t = ctx.currentTime;
	const src = ctx.createBufferSource();
	src.buffer = noiseBuffer(0.25);
	const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
	const g = ctx.createGain();
	g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
	src.connect(f); f.connect(g); g.connect(master);
	src.start(t);
	tone(70, 0.18, "sine", vol * 0.8, 0, 0.5);
}

export const sfx = {
	light(){ tone(520, 0.16, "square", 0.08); },
	go(){ tone(1040, 0.5, "square", 0.1); },
	lap(){ tone(660, 0.12, "triangle", 0.15); tone(990, 0.2, "triangle", 0.15, 0.1); },
	best(){ [660, 830, 990, 1320].forEach((f, i) => tone(f, 0.16, "triangle", 0.14, i * 0.08)); },
	finalLap(){ tone(880, 0.12, "square", 0.08); tone(880, 0.12, "square", 0.08, 0.18); },
	finish(){ [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.14, i * 0.12)); },
	out(){ tone(300, 0.4, "sawtooth", 0.08, 0, 0.5); },
	click(){ tone(1400, 0.03, "square", 0.03); },
	wrong(){ tone(220, 0.25, "square", 0.06); }
};
