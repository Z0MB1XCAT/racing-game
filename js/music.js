// Background music, written for this game and played by a small synth sequencer.
// No files: every note is scheduled a moment ahead with Web Audio.
//   "menu": laid-back loop for the menus, garage and lobby.
//   "race": driving four-to-the-floor track for races, busier on the final lap.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORD = { m: [0, 3, 7], M: [0, 4, 7], sus: [0, 5, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };

export function createMusic(ctx, dest, noise){
	let song = null, current = null, heat = 0;
	const duckGain = ctx.createGain(); duckGain.gain.value = 1;
	duckGain.connect(dest);

	// Shared echo for plucks and leads.
	function makeBus(echo){
		const out = ctx.createGain(); out.gain.value = 0;
		const delay = ctx.createDelay(1); const fb = ctx.createGain(); const wet = ctx.createGain(); const lp = ctx.createBiquadFilter();
		lp.type = "lowpass"; lp.frequency.value = 2600;
		delay.delayTime.value = echo; fb.gain.value = 0.32; wet.gain.value = 0.28;
		delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(out);
		// Pads and bass duck under the kick.
		const pump = ctx.createGain(); pump.gain.value = 1; pump.connect(out);
		out.connect(duckGain);
		return { out, delay, pump };
	}

	// ---- Instruments. t is the start time in the audio clock. ----
	function env(g, t, a, peak, d){
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + a);
		g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
	}
	function kick(bus, t, v){
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
		env(g, t, 0.004, v, 0.32);
		o.connect(g); g.connect(bus.out);
		o.start(t); o.stop(t + 0.4);
		const p = bus.pump.gain;
		p.setValueAtTime(0.35, t); p.linearRampToValueAtTime(1, t + 0.22);
	}
	function hiss(bus, t, v, type, freq, q, d, send){
		const s = ctx.createBufferSource(); s.buffer = noise;
		const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
		const g = ctx.createGain();
		env(g, t, 0.002, v, d);
		s.connect(f); f.connect(g); g.connect(bus.out);
		if(send) g.connect(bus.delay);
		s.start(t, Math.random() * 1.5, d + 0.05);
	}
	const hat = (bus, t, v, open) => hiss(bus, t, v, "highpass", 7800, 0.7, open ? 0.22 : 0.035);
	function clap(bus, t, v){
		for(let i = 0; i < 3; i++) hiss(bus, t + i * 0.011, v * (i === 2 ? 1 : 0.6), "bandpass", 1500, 0.9, i === 2 ? 0.16 : 0.012, i === 2);
	}
	function bass(bus, t, m, d, v, bright = 1){
		const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		o.type = "sawtooth"; o2.type = "square"; o.frequency.value = mtof(m); o2.frequency.value = mtof(m - 12);
		f.type = "lowpass"; f.Q.value = 4;
		f.frequency.setValueAtTime(260 + 900 * bright, t); f.frequency.exponentialRampToValueAtTime(180, t + d);
		env(g, t, 0.006, v, d);
		o.connect(f); o2.connect(f); f.connect(g); g.connect(bus.pump);
		o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
	}
	function pluck(bus, t, m, d, v, type = "triangle", cutoff = 3000){
		const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		o.type = type; o.frequency.value = mtof(m);
		f.type = "lowpass"; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(400, t + d);
		env(g, t, 0.004, v, d);
		o.connect(f); f.connect(g); g.connect(bus.out); g.connect(bus.delay);
		o.start(t); o.stop(t + d + 0.05);
	}
	function pad(bus, t, notes, d, v, cutoff = 1100){
		const f = ctx.createBiquadFilter(), g = ctx.createGain();
		f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.7;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.5, d * 0.3));
		g.gain.setValueAtTime(v, t + d * 0.8);
		g.gain.exponentialRampToValueAtTime(0.0001, t + d);
		f.connect(g); g.connect(bus.pump);
		for(const m of notes) for(const cents of [-8, 8]){
			const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = cents;
			o.connect(f); o.start(t); o.stop(t + d + 0.05);
		}
	}
	const chordNotes = (root, q, base) => CHORD[q].map(i => base + ((root + i) % 12));

	// ---- Songs. step(i, t, sixteenth) schedules sixteenth-note i. ----
	const SONGS = {
		menu: {
			bpm: 98,
			// A minor: Am F C G | Dm F G E
			bars: [[9, "m7"], [5, "M7"], [0, "M"], [7, "M"], [2, "m7"], [5, "M7"], [7, "sus"], [4, "M"]],
			step(bus, i, t, s){
				const bar = Math.floor(i / 16) % this.bars.length, n = i % 16, loop = Math.floor(i / (16 * this.bars.length));
				const [root, q] = this.bars[bar];
				const intro = i < 32;
				if(n === 0) pad(bus, t, chordNotes(root, q, 60), s * 16, 0.028, 900);
				if(!intro){
					if(n === 0 || n === 10) kick(bus, t, 0.5);
					if(n === 4 || n === 12) clap(bus, t, 0.12);
					if(n % 2 === 0) hat(bus, t, n % 4 === 2 ? 0.05 : 0.025, n === 14);
					if([0, 3, 6, 8, 11, 14].includes(n)) bass(bus, t, 36 + root, s * (n === 14 ? 2 : 1.6), 0.12, 0.4);
				}
				// Arpeggio in eighths, with a short melodic phrase every other loop.
				if(n % 2 === 0){
					const tones = chordNotes(root, q, 72);
					const idx = [0, 1, 2, 1, 3, 2, 1, 2][n / 2] % tones.length;
					pluck(bus, t, tones[idx], s * 1.8, intro ? 0.03 : 0.045);
				}
				if(loop % 2 === 1 && (n === 0 || n === 6 || n === 12) && bar % 2 === 0)
					pluck(bus, t, chordNotes(root, q, 84)[n === 6 ? 1 : n === 12 ? 2 : 0], s * 5, 0.035, "sine", 5000);
			}
		},
		race: {
			bpm: 138,
			gain: 1.6,
			// E minor: Em C G D | Em C Am B
			bars: [[4, "m"], [0, "M"], [7, "M"], [2, "M"], [4, "m"], [0, "M"], [9, "m"], [11, "M"]],
			step(bus, i, t, s){
				const bar = Math.floor(i / 16) % this.bars.length, n = i % 16;
				const section = Math.floor(i / (16 * this.bars.length)) % 2; // 0: groove, 1: lead
				const [root, q] = this.bars[bar];
				const lead = section === 1 || heat > 0;
				if(n % 4 === 0) kick(bus, t, 0.62);
				if(n === 4 || n === 12) clap(bus, t, 0.16);
				if(n % 4 === 2) hat(bus, t, 0.07, false);
				else if(heat > 0 || section === 1) hat(bus, t, 0.025, false);
				if(n === 0) pad(bus, t, chordNotes(root, q, 60), s * 16, 0.022, lead ? 1600 : 1100);
				// Rolling octave bass on every sixteenth, root then octave.
				bass(bus, t, 36 + root + (n % 2 ? 12 : 0), s * 0.9, n % 4 === 0 ? 0.13 : 0.09, n % 2 ? 0.8 : 0.5);
				if(lead){
					const tones = chordNotes(root, q, 76);
					const pat = [0, 2, 1, 2, 0, 2, 1, 3, 0, 2, 1, 2, 0, 1, 2, 3];
					const m = pat[n] === 3 ? tones[0] + 12 : tones[pat[n]];
					pluck(bus, t, m, s * 1.5, heat > 0 ? 0.045 : 0.035, "square", 2400 + heat * 1500);
				}
				// Crash-ish swell into each eight-bar turnaround.
				if(bar === this.bars.length - 1 && n === 12) hiss(bus, t, 0.05, "highpass", 3000, 0.3, s * 4);
			}
		}
	};

	function start(name){
		const def = SONGS[name];
		const sixteenth = 60 / def.bpm / 4;
		const bus = makeBus(sixteenth * 3);
		const t0 = ctx.currentTime + 0.08;
		bus.out.gain.setValueAtTime(0.0001, t0);
		bus.out.gain.exponentialRampToValueAtTime(def.gain || 1, t0 + 1.2);
		const inst = { name, bus, next: t0, i: 0, timer: null };
		const pump = () => {
			// Keep ~0.2 s scheduled ahead. After the tab was hidden, skip missed notes.
			if(inst.next < ctx.currentTime - 0.1){ const miss = Math.ceil((ctx.currentTime - inst.next) / sixteenth); inst.next += miss * sixteenth; inst.i += miss; }
			while(inst.next < ctx.currentTime + 0.2){ def.step(bus, inst.i, inst.next, sixteenth); inst.next += sixteenth; inst.i++; }
		};
		pump();
		inst.timer = setInterval(pump, 40);
		return inst;
	}
	function stop(inst, fade = 0.8){
		if(!inst) return;
		const t = ctx.currentTime, g = inst.bus.out.gain;
		g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t);
		g.exponentialRampToValueAtTime(0.0001, t + fade);
		setTimeout(() => { clearInterval(inst.timer); inst.bus.out.disconnect(); }, fade * 1000 + 400);
	}

	return {
		play(name){
			if(name === current) return;
			current = name;
			stop(song);
			song = name && SONGS[name] ? start(name) : null;
			if(name !== "race") heat = 0;
		},
		// 0 normal, 1 final lap: the lead plays throughout and opens up.
		intensity(v){ heat = v; },
		duck(on){ duckGain.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.15); }
	};
}
