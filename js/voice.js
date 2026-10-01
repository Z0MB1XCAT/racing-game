// Speech for the race engineer and the commentators: clips from assets/voice/*.pak (see tools/build-voices.mjs and
// js/voicelines.js), stitched into sentences, queued so two never talk at once, and played through either a
// "team radio" (band-limited, a touch of drive, static underneath and a click at each end) or a plain broadcast
// chain. Nothing here knows about the race: js/radio.js and js/commentary.js decide what to say.
//
// If the clips can't be fetched or decoded, say() simply does nothing: the game carries on without voices.
import { LINES } from "./voicelines.js";

const GAP = 0.07;                    // seconds between stitched pieces
const KEEP = 90;                     // decoded clips kept ready

// ctx: the audio context. out: { radio, cast }: gain nodes the two chains play into. noise: a buffer of white noise.
// hooks: { start(item, seconds), end(item) } for ducking the rest of the sound and showing captions.
export function createVoice(ctx, out, noise, hooks = {}){
	const packs = {}, decoded = new Map();
	const base = new URL("../assets/voice/", import.meta.url).href;

	// ---- the packs ----
	function load(voice){
		if(!packs[voice]) packs[voice] = Promise.all([
			fetch(base + voice + ".json").then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))),
			fetch(base + voice + ".pak").then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
		]).then(([index, buf]) => ({ clips: index.clips, buf }), e => { console.warn("[voice] " + voice + " unavailable", e); return null; });
		return packs[voice];
	}
	async function clip(id){
		if(decoded.has(id)){ const b = decoded.get(id); decoded.delete(id); decoded.set(id, b); return b; }   // (most recently used last)
		const line = LINES[id];
		const pack = line ? await load(line.v) : null;
		const c = pack && pack.clips[id];
		if(!c) return null;
		let b = null;
		try{ b = await ctx.decodeAudioData(pack.buf.slice(c[0], c[0] + c[1])); }
		catch(e){ console.warn("[voice] couldn't decode " + id, e); return null; }
		decoded.set(id, b);
		while(decoded.size > KEEP) decoded.delete(decoded.keys().next().value);
		return b;
	}
	// Fetch a voice's clips ahead of when they're wanted.
	function preload(...voices){ return Promise.all(voices.map(load)); }

	// ---- the two chains ----
	const curve = amount => { const n = 512, c = new Float32Array(n), k = Math.tanh(amount); for(let i = 0; i < n; i++){ const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(amount * x) / k; } return c; };
	const biq = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };

	// Team radio: the voice squeezed into a narrow band, a little overdriven, with a hiss under it.
	const radio = (() => {
		const input = ctx.createGain();
		const hp = biq("highpass", 380, 0.8), body = biq("peaking", 1500, 0.9, 5), lp = biq("lowpass", 3100, 0.8);
		const drive = ctx.createWaveShaper(); drive.curve = curve(2.4); drive.oversample = "2x";
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -28; comp.knee.value = 6; comp.ratio.value = 7; comp.attack.value = 0.003; comp.release.value = 0.14;
		const level = ctx.createGain(); level.gain.value = 1.15;
		input.connect(hp); hp.connect(body); body.connect(lp); lp.connect(drive); drive.connect(comp); comp.connect(level); level.connect(out.radio);
		// Static: noise through the same narrow band, only while someone is talking.
		const bedSrc = ctx.createBufferSource(); bedSrc.buffer = noise; bedSrc.loop = true;
		const bedHp = biq("highpass", 600), bedLp = biq("lowpass", 3400), bed = ctx.createGain(); bed.gain.value = 0;
		bedSrc.connect(bedHp); bedHp.connect(bedLp); bedLp.connect(bed); bed.connect(level);
		bedSrc.start();
		return { input, bed, nodes: [input, hp, body, lp, drive, comp, level, bedSrc, bedHp, bedLp, bed] };
	})();
	// The broadcast: a touch of presence and some compression, so the voices sit above the engines.
	const cast = (() => {
		const input = ctx.createGain();
		const hp = biq("highpass", 110), air = biq("peaking", 2800, 0.8, 3), warm = biq("lowshelf", 220, 0.7, 1.5);
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -24; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
		input.connect(hp); hp.connect(warm); warm.connect(air); air.connect(comp); comp.connect(out.cast);
		return { input };
	})();
	// A click or a puff of static through the radio chain (the key going down, the key coming up).
	function squelch(t, dur, vol, tone = 0){
		const s = ctx.createBufferSource(); s.buffer = noise;
		const f = biq("bandpass", 1900 + tone * 500, 0.7), g = ctx.createGain();
		g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		s.connect(f); f.connect(g); g.connect(radio.input);
		s.start(t, Math.random() * 1.5, dur + 0.05);
	}

	// ---- playing one thing ----
	let current = null, token = 0;
	// item: { parts: [clip ids or { pause: seconds }], kind: "radio" | "cast", pan }
	// Resolves with how long it will take (seconds), or 0 if nothing could be played.
	async function play(item){
		const id = ++token;
		const bufs = [];
		for(const p of item.parts){
			if(typeof p === "string"){ const b = await clip(p); if(b) bufs.push(b); }
			else bufs.push(p);
		}
		if(id !== token || !bufs.some(b => b.duration)) return 0;
		const isRadio = item.kind === "radio";
		const t0 = ctx.currentTime + 0.04;
		let t = t0 + (isRadio ? 0.16 : 0);
		const nodes = [], dest = isRadio ? radio.input : cast.input;
		let pan = null;
		if(!isRadio && ctx.createStereoPanner && item.pan){ pan = ctx.createStereoPanner(); pan.pan.value = item.pan; pan.connect(dest); }
		for(const b of bufs){
			if(b.pause){ t += b.pause; continue; }
			const s = ctx.createBufferSource(); s.buffer = b; s.connect(pan || dest);
			s.start(t); nodes.push(s);
			t += b.duration + GAP;
		}
		const end = t - GAP;
		if(isRadio){
			squelch(t0, 0.07, 0.34);                      // key down
			radio.bed.gain.cancelScheduledValues(t0);
			radio.bed.gain.setValueAtTime(0, t0);
			radio.bed.gain.linearRampToValueAtTime(0.018, t0 + 0.05);
			// The static crackles a little: its level wanders while the voice talks.
			for(let k = t0 + 0.2; k < end; k += 0.11 + Math.random() * 0.17) radio.bed.gain.linearRampToValueAtTime(0.011 + Math.random() * 0.016, k);
			radio.bed.gain.linearRampToValueAtTime(0.014, end);
			radio.bed.gain.linearRampToValueAtTime(0, end + 0.1);
			squelch(end + 0.02, 0.05, 0.3, 1);              // key up
			squelch(end + 0.07, 0.16, 0.09);                // and the tail of static
		}
		current = { id, nodes, pan, radio: isRadio, end };
		return end + (isRadio ? 0.2 : 0.05) - ctx.currentTime;
	}
	function stopNow(){
		token++;
		if(!current) return;
		const c = current; current = null;
		for(const s of c.nodes){ try{ s.stop(); }catch(e){} }
		if(c.radio){ const t = ctx.currentTime; radio.bed.gain.cancelScheduledValues(t); radio.bed.gain.setTargetAtTime(0, t, 0.02); squelch(t, 0.05, 0.25, 1); }
	}

	// ---- the queue: one voice at a time, the most important first, nothing stale ----
	// item also has: priority (higher first), expires (ms: dropped if it has waited this long), key (a newer item with the
	// same key replaces a waiting one), interrupt (cut off what's playing if this is much more important), onStart/onEnd.
	const queue = [];
	let busy = false, playing = null, timer = 0;
	function say(item){
		if(!item || !item.parts || !item.parts.length) return;
		const now = performance.now();
		item.born = now; item.dieAt = now + (item.expires ?? 9000); item.priority ??= 5;
		if(item.key){ const i = queue.findIndex(q => q.key === item.key); if(i >= 0) queue.splice(i, 1); }
		queue.push(item);
		queue.sort((a, b) => b.priority - a.priority || a.born - b.born);
		if(playing && item.interrupt && item.priority >= playing.priority + 3){ clearTimeout(timer); stopNow(); finish(); }
		pump();
	}
	function finish(){
		const p = playing; playing = null; busy = false;
		if(p){ if(hooks.end) hooks.end(p); if(p.onEnd) p.onEnd(); }
		pump();
	}
	async function pump(){
		if(busy) return;
		busy = true;
		while(queue.length){
			const now = performance.now();
			for(let i = queue.length - 1; i >= 0; i--) if(queue[i].dieAt < now) queue.splice(i, 1);
			const item = queue.shift();
			if(!item) break;
			if(ctx.state !== "running") continue;
			playing = item;
			const secs = await play(item).catch(e => { console.warn("[voice]", e); return 0; });
			if(playing !== item) return;                  // (cut off while it was loading)
			if(!secs){ playing = null; continue; }
			if(hooks.start) hooks.start(item, secs);
			if(item.onStart) item.onStart(secs);
			timer = setTimeout(finish, Math.max(50, secs * 1000));
			return;
		}
		busy = false;
	}
	// Silence now, and forget what's waiting (a race ended, the game paused).
	function stopAll(){
		queue.length = 0; clearTimeout(timer);
		const had = playing;
		stopNow(); playing = null; busy = false;
		if(had && hooks.end) hooks.end(had);
	}
	return {
		say, stopAll, preload, clip,
		get busy(){ return busy || queue.length > 0; },
		get speaking(){ return playing; },
		dispose(){ stopAll(); for(const n of radio.nodes){ try{ n.disconnect(); if(n.stop) n.stop(); }catch(e){} } }
	};
}
