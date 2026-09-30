// Holds the frame rate by stepping down a ladder of costs (js/gfx.js has the ladder: sharpness, then
// glow and shadows) when a computer can't keep up, and back up when it can. Pure logic, no graphics:
// feed it how long each frame took, and it says when to change step. tools/adaptive-test.mjs plays
// it against simulated computers.
//
// Step 0 is the best looking and the most expensive; the last step is the cheapest.
//  - Too slow (over budget for two half-seconds in a row, or far over for one): down a step, or two
//    if it's hopelessly slow.
//  - Going up is harder, because a screen locked to 60 Hz never shows a frame faster than 16.7 ms, so
//    there's no way to see spare time. Plain 60 fps for a long while earns a try of the step above;
//    if that try comes back slow within a few seconds it's undone, and the next try waits twice as
//    long. A screen running faster than 60 Hz that still has time to spare (frames well under budget)
//    goes up quicker.
//  - If the browser can time the graphics chip itself (gpuMs), that's used as well: a chip with lots of
//    room that's still dropping frames is held back by the processor, so making the picture less sharp
//    wouldn't help and isn't done (only the steps that save the processor work, like shadows, are); and
//    a chip with room for the next step up (estimated from its sharpness) goes up at once, no try needed.
//  - A stalled frame (a tab switch, a track being built, a dialog) says nothing about the game's
//    speed: it's left out, and measuring starts again a moment later. But three long frames in a row
//    aren't a stall, they're a computer that's far too slow, and count.
const WAIT = 30, WAIT_MAX = 600;     // seconds of plain 60 fps before a try upwards; it doubles after each failed try

export class Adaptive {
	// steps: how many steps there are, or the steps themselves ({ scale, shadows, post }, best first), which
	// lets it tell what a step costs the graphics chip and what it saves the processor.
	constructor(steps, { start = 0, fps = 60 } = {}){
		this.steps = Array.isArray(steps) ? steps : null;
		this.n = this.steps ? this.steps.length : steps;
		this.step = Math.max(0, Math.min(this.n - 1, start));
		this.budget = 1000 / fps;
		this.mean = 0;                       // the last half-second's average frame time, ms
		this.gpu = null;                     // and the graphics chip's share of it, where it can be timed
		this.cpuBound = false;               // slow while the graphics chip has room: the processor is the limit
		this.stalls = 0;                     // stalled frames left out
		this.floorSlow = 0;                  // seconds spent at the cheapest step and still too slow
		this.lastChange = 0;
		this._win = { sum: 0, count: 0, start: -1, gpu: 0, gpuN: 0 };
		this._hold = 0;                      // ignore measurements until this time
		this._long = 0;                      // long frames in a row
		this._bad = 0;                       // slow half-seconds in a row
		this._steady = 0;                    // seconds not slow in a row
		this._ample = 0;                     // seconds well under budget in a row
		this._lastUp = -1e9;                 // when the current step was tried (a move up); it's on trial for a while
		this._wait = WAIT;                   // steady seconds needed before a try upwards
		this._block = new Array(this.n).fill(0);   // no move up into step i before _block[i] (a try that failed)
	}
	// Ignore frames for a while (a world being built, a dialog, anything that's known to stall).
	stall(now, ms = 2500){ this._hold = Math.max(this._hold, now + ms); this._reset(now); }
	// A different scene (another track): what was learned about the last one doesn't apply.
	scene(now){ this._block.fill(0); this._wait = WAIT; this._lastUp = -1e9; this.stall(now, 3000); }
	_reset(now){ const w = this._win; w.sum = 0; w.count = 0; w.gpu = 0; w.gpuN = 0; w.start = now; this._bad = 0; }

	// What stepping from step a to step b does to the graphics chip's time, roughly (its pixels, shadows, glow).
	_gpuRatio(a, b){
		if(!this.steps) return 1;
		const cost = s => s.scale * s.scale * (s.shadows ? 1.1 : 1) * (s.post ? 1.2 : 1);
		return cost(this.steps[b]) / cost(this.steps[a]);
	}
	// The next step down that would help: any, unless the processor is the limit, then one that saves it work.
	_nextDown(from, by){
		let to = Math.min(this.n - 1, from + by);
		if(this.cpuBound && this.steps){
			const a = this.steps[from];
			to = -1;
			for(let j = from + 1; j < this.n; j++) if(this.steps[j].shadows !== a.shadows || this.steps[j].post !== a.post){ to = j; break; }
			if(to < 0) return from;       // nothing left that would save the processor anything
		}
		return to;
	}

	// ms: how long the frame just drawn took; now: a clock in ms; gpuMs: how long the graphics chip took, if the
	// browser can say (else null). Returns null, or { from, to } when the step changes.
	frame(ms, now, gpuMs = null){
		this._long = ms > 250 ? this._long + 1 : 0;
		const crawling = this._long >= 3;
		if(!crawling){
			if(now < this._hold){ this._reset(now); return null; }
			if(ms > 250){ this.stalls++; this.stall(now, 1500); return null; }
		}
		const w = this._win;
		if(w.start < 0) w.start = now;
		w.sum += ms; w.count++;
		if(gpuMs !== null && gpuMs >= 0){ w.gpu += gpuMs; w.gpuN++; }
		if(now - w.start < 500 || w.count < (crawling ? 2 : 4)) return null;
		const mean = this.mean = w.sum / w.count, len = (now - w.start) / 1000;
		const gpu = this.gpu = w.gpuN >= 2 ? w.gpu / w.gpuN : null;
		const bad = this._bad;
		this._reset(now);
		this._bad = bad;

		const slow = mean > this.budget * 1.10;          // under about 54 fps
		const far = mean > this.budget * 1.6;            // under about 37 fps
		const hopeless = mean > this.budget * 2.4;       // under about 25 fps: worth skipping a step
		const ample = mean < this.budget * 0.70;         // well under budget: a fast screen with time to spare
		const from = this.step;
		this.cpuBound = slow && gpu !== null && gpu < this.budget * 0.6;
		if(slow){
			this._steady = this._ample = 0;
			this._bad++;
			if(from === this.n - 1){ this.floorSlow += len; return null; }
			if(this._bad >= 2 || far){
				// A try upwards that came back slow is undone (just that step), and the next try waits longer.
				const trial = now - this._lastUp < 8000;
				if(trial){
					this._wait = Math.min(WAIT_MAX, this._wait * 2);
					this._block[from] = now + this._wait * 1000;
				}
				this._lastUp = -1e9;
				const to = trial ? Math.min(this.n - 1, from + 1) : this._nextDown(from, hopeless ? 2 : 1);
				if(to === from){ this.floorSlow += len; return null; }       // (the processor is the limit and nothing helps it)
				this.step = to;
				return this._changed(from, now);
			}
			return null;
		}
		this._bad = 0;
		this.floorSlow = 0;
		this._steady += len;
		this._ample = ample ? this._ample + len : 0;
		// A try that has held for long enough is kept, and the wait goes back to normal.
		if(this._lastUp > 0 && now - this._lastUp >= 10000){ this._lastUp = -1e9; this._wait = WAIT; }
		if(this.step > 0 && now - this.lastChange >= 6000 && now >= this._block[this.step - 1]){
			// With the graphics chip timed: room for the next step up (by its cost) is enough, after a few seconds,
			// and there are no blind tries (it knows). Without: a long stretch of plain 60 fps earns a try.
			const timed = gpu !== null;
			const room = timed && mean <= this.budget * 1.05 && gpu * this._gpuRatio(this.step, this.step - 1) < this.budget * 0.8;
			if((room && this._steady >= 4) || (!timed && (this._ample >= 4 || this._steady >= this._wait))){
				this.step--;
				this._lastUp = now;                      // (on trial for a few seconds either way: if it comes back slow it's undone)
				return this._changed(from, now);
			}
		}
		return null;
	}
	_changed(from, now){
		this.lastChange = now;
		this._steady = this._ample = this._bad = 0;
		this._hold = now + 1200;       // (the new step takes a moment to settle: resized buffers, shaders compiling)
		this._reset(now);
		return { from, to: this.step };
	}
}
