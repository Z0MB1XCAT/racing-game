// The idle queue (js/idle.js): background fetches one at a time, most wanted first, only when the game says it's a good moment, with
// anything you're about to need jumping the queue. No browser: the browser's idle time is a short timer.
//   node tools/idle-test.mjs
import { IdleQueue } from "../js/idle.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const make = (opts = {}) => new IdleQueue(Object.assign({ schedule: fn => setTimeout(fn, 1), gap: 5, retry: 8 }, opts));
// a job that takes a while and notes when it ran and how many ran together
const tracker = () => {
	const t = { log: [], running: 0, peak: 0 };
	t.job = (name, ms = 15, fail = false) => async () => {
		t.running++; t.peak = Math.max(t.peak, t.running); t.log.push([name, "start", performance.now()]);
		await sleep(ms);
		t.running--; t.log.push([name, "end", performance.now()]);
		if(fail) throw new Error("boom " + name);
		return name + "!";
	};
	t.order = () => t.log.filter(l => l[1] === "start").map(l => l[0]);
	return t;
};

console.log("the queue");
{
	const q = make(), t = tracker();
	const results = await Promise.all([q.add("c", t.job("c"), 5), q.add("a", t.job("a"), 1), q.add("d", t.job("d"), 9), q.add("b", t.job("b"), 1)]);
	ok(JSON.stringify(t.order()) === '["a","b","c","d"]', "the most wanted first (lower number), and in the order they were added when equal: " + t.order().join(" "));
	ok(t.peak === 1, "only one runs at a time (never more than " + t.peak + " together)");
	ok(JSON.stringify(results) === '["c!","a!","d!","b!"]', "each add() gives that job's own result when it's done");
	const gaps = []; const starts = t.log.filter(l => l[1] === "start"), ends = t.log.filter(l => l[1] === "end");
	for(let i = 1; i < starts.length; i++) gaps.push(starts[i][2] - ends[i - 1][2]);
	ok(gaps.every(g => g >= 4), "a short gap between jobs, so the page gets a breath (" + gaps.map(g => g.toFixed(0) + " ms").join(", ") + ")");
}
{
	const q = make(), t = tracker();
	const a = q.add("x", t.job("x"), 1), b = q.add("x", t.job("x-again"), 1);
	await a;
	ok(a === b && t.order().join() === "x", "adding the same key twice is one job (one run, one promise)");
}
{
	const q = make(), t = tracker();
	q.add("slow", t.job("slow", 40), 1);
	const urgent = q.add("urgent", t.job("urgent", 5), 9);
	await sleep(5);
	const r = await q.now("urgent");
	ok(r === "urgent!" && q.state("slow") === "running" && t.peak === 2, "now() starts a job straight away, ahead of the queue and even while another is running (it finished first)");
	ok(q.now("urgent") === urgent && t.order().filter(n => n === "urgent").length === 1, "asking again doesn't run it twice, and gives the same promise");
	ok(await q.now("nothing-like-this") === null && await q.now("__proto__") === null, "now() for something that was never added is just nothing");
	await q.whenDrained();
	ok(q.state("slow") === "done" && q.state("urgent") === "done" && q.queued === 0, "everything finishes, and whenDrained() says so");
}
{
	const q = make(), t = tracker();
	const r = await Promise.all([q.add("bad", t.job("bad", 5, true), 1), q.add("sync-bad", () => { throw new Error("sync"); }, 2), q.add("after", t.job("after"), 3)]);
	ok(r[0] === null && r[1] === null && r[2] === "after!", "a job that fails (even one that throws at once) gives null and the rest carry on");
	const none = await q.add("empty", () => undefined, 4);
	ok(none === null, "a job that returns nothing gives null, not undefined");
}

console.log("when it's allowed");
{
	let go = false;
	const q = make({ canRun: () => go }), t = tracker();
	const p = q.add("held", t.job("held"), 1);
	await sleep(60);
	ok(t.order().length === 0 && q.state("held") === "queued", "nothing starts while the game says no (it asked again " + "and again, and stayed put)");
	go = true;
	await p;
	ok(t.order().join() === "held", "and it starts once the game says yes");
}
{
	let racing = false;
	const q = make({ canRun: () => !racing }), t = tracker();
	q.add("one", t.job("one", 20), 1); q.add("two", t.job("two", 20), 2); q.add("three", t.job("three", 20), 3);
	await sleep(8);
	racing = true;                                    // (a race starts: what's running finishes, nothing new starts)
	await sleep(120);
	const during = t.order().length;
	racing = false;
	await q.whenDrained();
	ok(during < 3 && t.order().length === 3 && t.peak === 1, "when a race starts the queue stops after the job in hand (" + during + " of 3 had started) and carries on afterwards");
}
{
	const q = make(), t = tracker();
	q.add("first", t.job("first", 10), 5);
	await sleep(3);
	q.add("late", t.job("late", 5), 1);
	await q.whenDrained();
	ok(t.order().join() === "first,late", "a job added while another runs waits its turn (and doesn't start beside it)");
	ok((await q.whenDrained()) === undefined, "whenDrained() on an empty queue answers at once");
}
{
	// With the browser's real idle callback missing, the queue still runs on a timer.
	const q = new IdleQueue({ gap: 5 }), t = tracker();
	const saved = globalThis.requestIdleCallback; delete globalThis.requestIdleCallback;
	const r = await Promise.race([q.add("fallback", t.job("fallback", 5), 1), sleep(2000).then(() => "timeout")]);
	if(saved) globalThis.requestIdleCallback = saved;
	ok(r === "fallback!", "with no requestIdleCallback (older browsers) it runs on a timer instead");
}

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nidle-test: OK");
