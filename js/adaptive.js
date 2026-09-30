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
//  - A stalled frame (a tab switch, a track being built, a dialog) says nothing about the game's
//    speed: it's left out, and measuring starts again a moment later. But three long frames in a row
//    aren't a stall, they're a computer that's far too slow, and count.
const WAIT = 30, WAIT_MAX = 600;     // seconds of plain 60 fps before a try upwards; it doubles after each failed try

export class Adaptive {
	constructor(steps, { start = 0, fps = 60 } = {}){
		this.n = steps;
		this.step = Math.max(0, Math.min(steps - 1, start));
		this.budget = 1000 / fps;
		this.mean = 0;                       // the last half-second's average frame time, ms
		this.stalls = 0;                     // stalled frames left out
		this.floorSlow = 0;                  // seconds spent at the cheapest step and still too slow
		this.lastChange = 0;
		this._win = { sum: 0, count: 0, start: -1 };
		this._hold = 0;                      // ignore measurements until this time
		this._long = 0;                      // long frames in a row
		this._bad = 0;                       // slow half-seconds in a row
		this._steady = 0;                    // seconds not slow in a row
		this._ample = 0;                     // seconds well under budget in a row
		this._lastUp = -1e9;                 // when the current step was tried (a move up); it's on trial for a while
		this._wait = WAIT;                   // steady seconds needed before a try upwards
		this._block = new Array(steps).fill(0);   // no move up into step i before _block[i] (a try that failed)
	}
	// Ignore frames for a while (a world being built, a dialog, anything that's known to stall).
	stall(now, ms = 2500){ this._hold = Math.max(this._hold, now + ms); this._reset(now); }
	// A different scene (another track): what was learned about the last one doesn't apply.
	scene(now){ this._block.fill(0); this._wait = WAIT; this._lastUp = -1e9; this.stall(now, 3000); }
	_reset(now){ this._win.sum = 0; this._win.count = 0; this._win.start = now; this._bad = 0; }

	// ms: how long the frame just drawn took; now: a clock in ms. Returns null, or { from, to } when the step changes.
	frame(ms, now){
		this._long = ms > 250 ? this._long + 1 : 0;
		const crawling = this._long >= 3;
		if(!crawling){
			if(now < this._hold){ this._reset(now); return null; }
			if(ms > 250){ this.stalls++; this.stall(now, 1500); return null; }
		}
		const w = this._win;
		if(w.start < 0) w.start = now;
		w.sum += ms; w.count++;
		if(now - w.start < 500 || w.count < (crawling ? 2 : 4)) return null;
		const mean = this.mean = w.sum / w.count, len = (now - w.start) / 1000;
		const bad = this._bad;
		this._reset(now);
		this._bad = bad;

		const slow = mean > this.budget * 1.10;          // under about 54 fps
		const far = mean > this.budget * 1.6;            // under about 37 fps
		const hopeless = mean > this.budget * 2.4;       // under about 25 fps: worth skipping a step
		const ample = mean < this.budget * 0.70;         // well under budget: a fast screen with time to spare
		const from = this.step;
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
				this.step = Math.min(this.n - 1, from + (hopeless && !trial ? 2 : 1));
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
		if(this.step > 0 && now - this.lastChange >= 6000 && now >= this._block[this.step - 1] && (this._ample >= 4 || this._steady >= this._wait)){
			this.step--;
			this._lastUp = now;
			return this._changed(from, now);
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
