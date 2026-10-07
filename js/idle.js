// Background jobs that run while you sit in the menus: fetching a circuit's surroundings, the models, the sound pack. They run one at a time,
// the most wanted first, each only when the browser has nothing better to do and the game says it's a good moment (never in a race). Anything
// you're about to need can jump the queue (now). A job that fails is skipped; it never stalls the rest.
//
//   const idle = new IdleQueue({ canRun: () => !racing });
//   idle.add("places:spa", () => loadPlaces("spa"), 2);       // (lower numbers first)
//   idle.now("places:spa");                                    // (wanted this moment: start it straight away)

const browserIdle = fn => typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 250);

export class IdleQueue {
	// schedule(fn): call fn when the browser is idle. canRun(): is it a good moment? gap: ms between one job and the next.
	// retry: ms before asking canRun again after a "no". wait(ms, fn): a timer (a test can replace it).
	constructor({ schedule = browserIdle, canRun = () => true, gap = 250, retry = 600, wait = (ms, fn) => setTimeout(fn, ms) } = {}){
		this.schedule = schedule; this.canRun = canRun; this.gap = gap; this.retry = retry; this.wait = wait;
		this.jobs = new Map();
		this.order = 0;
		this.busy = false;                // a scheduled job is running (jobs started with now() don't count)
		this.waiting = false;             // a wake-up is already booked
		this.drained = [];
	}
	add(key, run, priority = 5){
		const have = this.jobs.get(key);
		if(have) return have.promise;
		const job = { key, run, priority, seq: this.order++, state: "queued" };
		job.promise = new Promise(resolve => { job.resolve = resolve; });
		this.jobs.set(key, job);
		this.pump();
		return job.promise;
	}
	// Start a job straight away (it's wanted this moment), whatever else is going on. Gives the same promise as add().
	now(key){
		const job = this.jobs.get(key);
		if(!job) return Promise.resolve(null);
		if(job.state === "queued") this.start(job, false);
		return job.promise;
	}
	has(key){ return this.jobs.has(key); }
	state(key){ const j = this.jobs.get(key); return j ? j.state : null; }
	get queued(){ return [...this.jobs.values()].filter(j => j.state === "queued").length; }
	// A promise for when nothing is queued or running.
	whenDrained(){
		return this.queued === 0 && ![...this.jobs.values()].some(j => j.state === "running") ? Promise.resolve() : new Promise(r => this.drained.push(r));
	}

	start(job, scheduled){
		job.state = "running";
		if(scheduled) this.busy = true;
		let out;
		try{ out = Promise.resolve(job.run()); }catch(e){ out = Promise.reject(e); }
		out.then(v => v, () => null).then(v => {
			job.state = "done";
			job.resolve(v === undefined ? null : v);
			if(scheduled) this.busy = false;
			this.settle();
			if(this.queued) this.later(this.gap);
		});
	}
	settle(){
		if(this.queued || [...this.jobs.values()].some(j => j.state === "running")) return;
		for(const r of this.drained.splice(0)) r();
	}
	// Ask to be woken in ms, once (not once per job).
	later(ms){
		if(this.waiting) return;
		this.waiting = true;
		this.wait(ms, () => { this.waiting = false; this.pump(); });
	}
	pump(){
		if(this.busy || this.waiting || this.pending) return;
		if(!this.queued) return;
		this.pending = true;
		this.schedule(() => {
			this.pending = false;
			if(this.busy) return;
			if(!this.canRun()){ this.later(this.retry); return; }
			let next = null;
			for(const j of this.jobs.values()) if(j.state === "queued" && (!next || j.priority < next.priority || (j.priority === next.priority && j.seq < next.seq))) next = j;
			if(next) this.start(next, true);
		});
	}
}
