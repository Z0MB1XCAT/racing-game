// Engine sound model, run on the audio thread (AudioWorklet).
//
// Rather than playing tones, this models what makes an engine's sound:
//   - each cylinder goes through intake, compression, power and exhaust strokes;
//   - when an exhaust valve opens, a puff of hot gas goes into the exhaust
//     (no two firings are exactly alike, which is what stops it sounding synthetic);
//   - the puffs travel through the headers and the pipe, which resonate, and a
//     muffler, then out of the tailpipe;
//   - the intake hisses and roars, and each combustion knocks the engine block;
//   - on a lifted throttle the exhaust can pop.
// Loosely based on Baldan, Lachambre, Delle Monache & Boussard (2015),
// "Physically informed car engine sound synthesis for virtual and augmented environments".
//
// Parameters: rpm, throttle (0..1). Options (processorOptions): see ENGINES in audio.js.

class Delay {
	constructor(len){ this.buf = new Float32Array(Math.max(2, len | 0) + 1); this.len = this.buf.length; this.i = 0; }
	// Read the value from `d` samples ago, then write x.
	tap(d){ let j = this.i - d; if(j < 0) j += this.len; return this.buf[j]; }
	push(x){ this.buf[this.i] = x; this.i = (this.i + 1) % this.len; }
}
// Two-pole resonator (engine block modes).
class Reso {
	constructor(freq, q){
		const w = 2 * Math.PI * freq / sampleRate, r = Math.exp(-w / (2 * q));
		this.a1 = 2 * r * Math.cos(w); this.a2 = -r * r; this.g = 1 - r; this.y1 = 0; this.y2 = 0;
	}
	step(x){ const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

class EngineProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors(){
		return [
			{ name: "rpm", defaultValue: 1000, minValue: 0, maxValue: 20000, automationRate: "k-rate" },
			{ name: "throttle", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" }
		];
	}
	constructor(options){
		super();
		const o = this.o = options.processorOptions;
		const ms = x => Math.round(x * sampleRate / 1000);
		this.cyl = o.cyl;
		this.offsets = o.offsets;
		this.amps = o.amps;
		this.phase = Math.random();
		this.rpm = 1000; this.thr = 1;
		// Per-cylinder exhaust pulse state.
		this.pT = new Float32Array(o.cyl).fill(-1);
		this.pLen = new Float32Array(o.cyl);
		this.pAmp = new Float32Array(o.cyl);
		this.pPop = new Float32Array(o.cyl);
		this.last = new Float32Array(o.cyl);
		for(let k = 0; k < o.cyl; k++) this.last[k] = this.local(k);
		// Exhaust: headers (feedback comb) → pipe (delay with a reflecting open end) → muffler chambers.
		this.hdrLen = ms(o.header); this.hdr = new Delay(this.hdrLen);
		this.pipeLen = ms(o.pipe); this.pipe = new Delay(this.pipeLen * 2);
		this.muf = o.muffler.map(m => ({ d: new Delay(ms(m)), n: ms(m) }));
		this.intLen = ms(o.intake); this.int = new Delay(this.intLen);
		this.block = o.block ? [new Reso(o.blockModes[0], 9), new Reso(o.blockModes[1], 12)] : null;
		this.blockHit = 0;
		// Tailpipe: radiation (high-pass) then a gentle low-pass for distance/body.
		this.x1 = 0; this.lp = 0; this.lp2 = 0; this.lpA = 1 - Math.exp(-2 * Math.PI * o.cutoff / sampleRate);
		this.inLp = 0; this.inA = 1 - Math.exp(-2 * Math.PI * (o.intakeTone || 900) / sampleRate);
		this.dc = 0; this.dcY = 0;
		this.turbo = 0; this.tPh = 0;
		this.noiseLp = 0;
	}
	local(k){ let p = this.phase + this.offsets[k]; return p - Math.floor(p); }
	process(inputs, outputs, params){
		const out = outputs[0][0];
		if(!out) return true;
		const o = this.o, n = out.length;
		const rpm0 = this.rpm, rpm1 = params.rpm[0], thr0 = this.thr, thr1 = params.throttle[0];
		const span = Math.max(1, o.max - o.idle);
		for(let s = 0; s < n; s++){
			const f = s / n;
			const rpm = rpm0 + (rpm1 - rpm0) * f, thr = thr0 + (thr1 - thr0) * f;
			const load = 0.25 + 0.75 * thr;
			const rf = Math.max(0, Math.min(1, (rpm - o.idle) / span));
			// One four-stroke cycle is two turns of the crank.
			const cycleSamples = sampleRate * 120 / Math.max(300, rpm);
			this.phase += 1 / cycleSamples;
			if(this.phase >= 1) this.phase -= 1;

			let exhaust = 0, intake = 0;
			const white = Math.random() * 2 - 1;
			this.noiseLp += (white - this.noiseLp) * 0.12;
			for(let k = 0; k < this.cyl; k++){
				const p = this.local(k), prev = this.last[k];
				this.last[k] = p;
				// Ignition at the start of the power stroke knocks the block.
				if(prev < 0.5 && p >= 0.5) this.blockHit += load * this.amps[k] * (0.8 + 0.4 * Math.random());
				// Exhaust valve opens: start a pulse.
				if(prev < 0.72 && p >= 0.72){
					const jitter = 1 + o.jitter * (Math.random() * 2 - 1);
					this.pT[k] = 0;
					this.pLen[k] = cycleSamples * 0.28;
					this.pAmp[k] = this.amps[k] * jitter * load;
					// Lifted throttle at high revs: unburnt fuel sometimes pops.
					this.pPop[k] = thr < 0.3 && rf > 0.35 && Math.random() < o.pops * 0.22 ? 2.5 + Math.random() * 2 : 0;
				}
				if(this.pT[k] >= 0){
					const u = this.pT[k] / this.pLen[k];
					if(u >= 1) this.pT[k] = -1;
					else {
						// Fast rise, then the pressure bleeds away.
						const env = u < 0.06 ? u / 0.06 : Math.exp(-(u - 0.06) * 5.5);
						exhaust += this.pAmp[k] * env * (1 + o.noise * this.noiseLp * 1.6);
						if(this.pPop[k]) exhaust += this.pPop[k] * Math.exp(-u * 9) * white;
						this.pT[k]++;
					}
				}
				// Intake stroke: air rushing past the valve.
				if(p < 0.25) intake += Math.sin(p * 4 * Math.PI) * (0.4 + 0.6 * thr);
			}
			// Headers: short resonant pipes from each cylinder.
			const h = exhaust + o.headerFb * this.hdr.tap(this.hdrLen);
			this.hdr.push(h);
			// Pipe: the wave travels down, part of it reflects back (inverted) from the open end.
			const pipeOut = this.pipe.tap(this.pipeLen);
			const pipeIn = h - o.pipeRefl * this.pipe.tap(this.pipeLen * 2);
			this.pipe.push(pipeIn);
			// Muffler: a few chambers, mixed with the straight-through path.
			let m = 0;
			for(const c of this.muf){ const y = pipeOut + o.mufflerFb * c.d.tap(c.n); c.d.push(y); m += y; }
			const exh = pipeOut * (1 - o.mufflerMix) + (this.muf.length ? m / this.muf.length : 0) * o.mufflerMix;
			// Tailpipe radiation and body.
			const rad = exh - this.x1 * 0.35; this.x1 = exh;
			this.lp += (rad - this.lp) * this.lpA;
			this.lp2 += (this.lp - this.lp2) * this.lpA;
			let y = this.lp2 * o.exhaustVol;
			// Intake roar through the airbox.
			this.inLp += (intake * (0.6 + 0.4 * white) - this.inLp) * this.inA;
			const iv = this.inLp + 0.5 * this.int.tap(this.intLen);
			this.int.push(iv * 0.6);
			y += iv * o.intakeVol * (0.4 + 0.6 * rf);
			// Engine block.
			if(this.block){
				const b = this.blockHit * (Math.random() * 2 - 1); this.blockHit *= 0.9;
				y += (this.block[0].step(b) + this.block[1].step(b)) * o.block;
			}
			// Turbo whistle.
			if(o.turbo){
				this.turbo += ((thr * rf) - this.turbo) * 0.00005;
				this.tPh += (2600 + 4200 * this.turbo) / sampleRate;
				if(this.tPh > 1) this.tPh -= 1;
				y += Math.sin(this.tPh * 2 * Math.PI) * this.turbo * this.turbo * o.turbo;
			}
			// Remove DC, soft-clip.
			this.dcY = y - this.dc + 0.995 * this.dcY; this.dc = y;
			const z = this.dcY * o.level;
			out[s] = z / (1 + Math.abs(z));
		}
		this.rpm = rpm1; this.thr = thr1;
		for(let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
		return true;
	}
}
registerProcessor("engine-model", EngineProcessor);
