// Background music, written for this game and played by a small synth sequencer.
// No files: every note is scheduled a moment ahead with Web Audio.
//   "menu": laid-back loop for the menus, garage and lobby.
//   "race", "race2", "night": driving tracks for races. They build as the race goes on: a pulse at the start, then hats
//   and a pad, an arpeggio, a lead melody, and everything at once on the final lap, when the key lifts as well.
//   state({ progress, battle }) and intensity(1) (the final lap) say how far into the race it is; the layers follow.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORD = { m: [0, 3, 7], M: [0, 4, 7], sus: [0, 5, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };

export function createMusic(ctx, dest, noise){
	let song = null, current = null;
	let lvl = 0.15, target = 0.15, progress = 0, battle = false, final = false;
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

	// A lead voice: two detuned saws through a filter that opens with each note.
	function lead(bus, t, m, d, v){
		const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		o.type = "sawtooth"; o2.type = "square"; o.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 7;
		f.type = "lowpass"; f.Q.value = 2.5;
		f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(3600, t + 0.05); f.frequency.exponentialRampToValueAtTime(1200, t + d);
		g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.setValueAtTime(v, t + d * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
		o.connect(f); o2.connect(f); f.connect(g); g.connect(bus.out); g.connect(bus.delay);
		o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
	}
	// A tune that comes back: the same two passes through the chords share a seed, so the melody repeats, then changes.
	const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
	const PENT = { m: [0, 3, 5, 7, 10], M: [0, 2, 4, 7, 9] };
	function melody(root, q, bar, pass){
		const r = rng(bar * 977 + (pass >> 1) * 131 + root * 7 + 3), pent = PENT[q.startsWith("M") ? "M" : "m"];
		const out = new Array(16).fill(null);
		let idx = 3 + Math.floor(r() * 3);
		for(let n = 0; n < 16; n += 2){
			if(n === 0 || r() < 0.62){
				idx = Math.max(0, Math.min(9, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)]));
				out[n] = 60 + root + pent[idx % 5] + 12 * Math.floor(idx / 5);
			}
		}
		return out;
	}
	// A driving track built in layers. `lvl` (0..1) says how far in the race is: each layer comes in at its own level.
	function raceSong(cfg){
		return {
			bpm: cfg.bpm, gain: cfg.gain, echo: cfg.echoBeats,
			bars: cfg.bars,
			step(bus, i, t, s){
				const bar = Math.floor(i / 16) % cfg.bars.length, n = i % 16, pass = Math.floor(i / (16 * cfg.bars.length));
				const [r0, q] = cfg.bars[bar], root = (r0 + (final ? cfg.lift : 0)) % 12;
				lvl += (target - lvl) * 0.02;                    // (about a bar to settle on a new level)
				const L = lvl, bright = 900 + 1500 * L;
				// Drums: a kick from the start, a clap and hats as it builds, open hats and fills at the top.
				if(n % 4 === 0) kick(bus, t, 0.58 + 0.06 * L);
				if(L > 0.3 && (n === 4 || n === 12)) clap(bus, t, 0.12 + 0.06 * L);
				if(n % 4 === 2) hat(bus, t, 0.05 + 0.03 * L, L > 0.8 && n === 14);
				if(L > 0.5 && n % 2 === 1) hat(bus, t, 0.02 + 0.02 * L, false);
				if(L > 0.9 && (n === 7 || n === 15)) hat(bus, t, 0.05, true);
				// A chord under everything, brighter as the race goes on.
				if(n === 0) pad(bus, t, chordNotes(root, q, 60), s * 16, 0.02 + 0.008 * L, bright);
				// The bass.
				if(cfg.bass === "roll") bass(bus, t, 36 + root + (n % 2 ? 12 : 0), s * 0.9, n % 4 === 0 ? 0.13 : 0.09, n % 2 ? 0.8 : 0.5);
				else if(cfg.bass === "offbeat"){ if(n % 4 === 0) bass(bus, t, 36 + root, s * 1.8, 0.14, 0.4); else if(n % 4 === 2) bass(bus, t, 48 + root, s * 1.3, 0.1, 0.9); }
				else if(n === 0 || (n === 8 && L > 0.4) || (n === 14 && L > 0.7)) bass(bus, t, 36 + root, s * (n === 0 ? 7 : 5), n === 0 ? 0.15 : 0.1, 0.5);
				// A pattern running up and down the chord.
				if(L > 0.28 && cfg.arp[n] !== null){
					const tones = chordNotes(root, q, 72);
					pluck(bus, t, cfg.arp[n] === 3 ? tones[0] + 12 : tones[cfg.arp[n] % tones.length], s * 1.6, 0.028 + 0.02 * L, "square", 1800 + 1800 * L);
				}
				// The tune.
				if(L > 0.55){
					const m = melody(root, q, bar, pass)[n];
					if(m !== null) lead(bus, t, m, s * (cfg.leadLen || 1.7), 0.03 + 0.02 * L);
				}
				// A sweep up into each turn of the chords, from the middle of the race.
				if(bar === cfg.bars.length - 1 && n === 8 && L > 0.4) hiss(bus, t, 0.05 + 0.03 * L, "highpass", 2500, 0.3, s * 8);
				// And on the final lap a crash on every fourth bar.
				if(final && bar % 4 === 0 && n === 0) hiss(bus, t, 0.09, "highpass", 4500, 0.4, s * 6);
			}
		};
	}

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
		race: raceSong({
			bpm: 138, gain: 1.6, lift: 2, bass: "roll", arp: [0, 2, 1, 2, 0, 2, 1, 3, 0, 2, 1, 2, 0, 1, 2, 3],
			// E minor: Em C G D | Em C Am B
			bars: [[4, "m"], [0, "M"], [7, "M"], [2, "M"], [4, "m"], [0, "M"], [9, "m"], [11, "M"]]
		}),
		race2: raceSong({
			bpm: 128, gain: 1.5, lift: 2, bass: "offbeat", arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2],
			// A minor, the bright way round: Am F C G, twice
			bars: [[9, "m"], [5, "M"], [0, "M"], [7, "M"], [9, "m"], [5, "M"], [0, "M"], [7, "M"]]
		}),
		night: raceSong({
			bpm: 112, gain: 1.45, lift: 3, bass: "long", arp: [0, null, 2, null, 1, null, 3, null, 0, null, 2, null, 3, null, 1, null], leadLen: 5, echoBeats: 3,
			// D minor, spacious: Dm7 Bbmaj7 F C
			bars: [[2, "m7"], [10, "M7"], [5, "M"], [0, "M"]]
		})
	};

	function start(name){
		const def = SONGS[name];
		const sixteenth = 60 / def.bpm / 4;
		const bus = makeBus(sixteenth * (def.echo || 3));
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

	// Where the race is: how far through it (0..1) and whether the player is in a close fight. The layers follow.
	const retarget = () => { target = Math.max(0, Math.min(1, 0.14 + 0.5 * progress + (battle ? 0.2 : 0) + (final ? 0.45 : 0))); };
	return {
		play(name){
			if(name === current) return;
			current = name;
			stop(song);
			song = name && SONGS[name] ? start(name) : null;
			progress = 0; battle = false; final = false; lvl = target = 0.15;
		},
		// 1 on the final lap: everything plays and the key lifts.
		intensity(v){ final = v >= 1; retarget(); },
		state(st){ if(st){ progress = Math.max(0, Math.min(1, st.progress || 0)); battle = !!st.battle; retarget(); } },
		duck(on){ duckGain.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.15); },
		// Stop at once (the audio is being rebuilt).
		dispose(){ if(song) clearInterval(song.timer); song = null; current = null; }
	};
}
