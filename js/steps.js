// Building a circuit's world takes a second or so, and doing it in one go freezes a menu. So the builders
// (terrain, place geometry, scenery, landscape, world) are generators: in a long loop they `yield` when
// `slice.over()` says the time slice is up, and js/main.js runs them a few milliseconds at a time between
// frames (runSliced). Everything else runs them to the end at once (drain), exactly as they always worked.
export const slice = {
	until: 0,          // when the current slice is up (performance.now() ms); 0 = never, run on to the end
	log: null,         // for finding long stretches without a pause: set to [] and every slice's [where it paused, ms] is added
	over(){ return this.until !== 0 && performance.now() >= this.until; }
};

// Run a generator to its end now; its result is returned.
export function drain(it){
	const saved = slice.until;
	slice.until = 0;
	try{
		for(;;){ const r = it.next(); if(r.done) return r.value; }
	}finally{ slice.until = saved; }
}

// A message to ourselves runs after the browser has had its turn (to draw a frame, handle a click), and
// without the 4 ms delay a setTimeout(0) chain gets.
const chan = typeof MessageChannel === "function" ? new MessageChannel() : null, queue = [];
if(chan) chan.port1.onmessage = () => { const f = queue.shift(); if(f) f(); };
const later = f => { if(chan){ queue.push(f); chan.port2.postMessage(0); } else setTimeout(f, 0); };

// Run a generator `budget` ms at a time, a slice per turn of the event loop. onDone(result) when it ends,
// onError(error) if it throws, onSlice() before each slice. cancel() stops it (its `finally` blocks run).
export function runSliced(it, { budget = 8, onSlice, onDone, onError } = {}){
	let dead = false;
	const step = () => {
		if(dead) return;
		if(onSlice) onSlice();
		const t0 = performance.now();
		slice.until = t0 + budget;
		let r;
		try{ r = it.next(); }
		catch(e){ slice.until = 0; dead = true; if(onError) onError(e); return; }
		slice.until = 0;
		if(slice.log) slice.log.push([r.done ? "(end)" : r.value, Math.round((performance.now() - t0) * 10) / 10]);
		if(r.done){ dead = true; if(onDone) onDone(r.value); }
		else later(step);
	};
	later(step);
	return { cancel(){ if(dead) return; dead = true; try{ it.return(); }catch(e){} }, get done(){ return dead; } };
}
