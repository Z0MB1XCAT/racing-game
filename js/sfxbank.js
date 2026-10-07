// Recorded sound effects (assets/audio/sfx.pak, from Kenney's free CC0 packs: see tools/build-sfx.mjs), played by group
// name ("hit.metalHeavy", "ui.click"): each group has a few takes and one is picked at random, a little different
// every time. It's all optional. Until the pack has loaded, or if it can't be, play() says no and the caller makes
// its own sound instead (js/audio.js has a synthesised version of every effect).
// Fetch the pack's bytes early (while you sit in the menus) so the first sound after your first click doesn't wait on the network.
// Decoding still has to wait for that click, which is when the sound starts. Never throws.
export function prefetch(){
	const base = new URL("../assets/audio/", import.meta.url).href;
	return Promise.all(["sfx.json", "sfx.pak"].map(f => fetch(base + f).then(r => (r.ok ? r.arrayBuffer() : null)))).then(() => true, () => false);
}

export function createBank(ctx, dest){
	const base = new URL("../assets/audio/", import.meta.url).href;
	const clips = new Map();
	let groups = null, ready = false, loading = null;

	// Fetch the pack and decode every clip (there are about seventy, all very short).
	function warm(){
		if(loading) return loading;
		loading = (async () => {
			try{
				const [idx, buf] = await Promise.all([
					fetch(base + "sfx.json").then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))),
					fetch(base + "sfx.pak").then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
				]);
				await Promise.all(Object.entries(idx.clips).map(async ([id, c]) => {
					try{ clips.set(id, await ctx.decodeAudioData(buf.slice(c[0], c[0] + c[1]))); }catch(e){ /* (one bad clip: leave it out) */ }
				}));
				groups = idx.groups; ready = clips.size > 0;
			}catch(e){ console.warn("[sfx] recorded effects unavailable, using the synthesised ones", e); }
		})();
		return loading;
	}
	let last = new Map();
	// Plays a take from the group. vol 0..1, rate = pitch (1 = as recorded), pan -1..1, when = seconds from now,
	// into = another node to play into (default: the effects bus). Returns false if it can't (not loaded).
	function play(group, { vol = 1, rate = 1, pan = 0, when = 0, into } = {}){
		if(!ready || !groups || !groups[group] || ctx.state === "closed") return false;
		const ids = groups[group];
		let i = Math.floor(Math.random() * ids.length);
		if(ids.length > 1 && last.get(group) === i) i = (i + 1) % ids.length;     // (never the same take twice running)
		last.set(group, i);
		const buf = clips.get(ids[i]);
		if(!buf) return false;
		const s = ctx.createBufferSource(), g = ctx.createGain();
		s.buffer = buf; s.playbackRate.value = rate;
		g.gain.value = vol;
		s.connect(g);
		if(pan && ctx.createStereoPanner){ const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(into || dest); }
		else g.connect(into || dest);
		s.start(ctx.currentTime + when);
		return true;
	}
	return { warm, play, get ready(){ return ready; }, groups: () => groups };
}
