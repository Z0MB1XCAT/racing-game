// The renderer's dials, and the thing that turns them to hold 60 fps: how sharp the picture is (the
// renderer's pixel ratio), whether the sun casts shadows, and (once it's there) the glow. js/adaptive.js
// decides when to step; this applies the step, remembers where a computer settled, and draws the FPS
// counter (Settings > FPS counter), which also says what graphics card the browser found.
import { Adaptive } from "./adaptive.js";
import * as store from "./storage.js";

// Step 0 is the best looking; each step after it is cheaper. scale is the share of the full pixel ratio
// (so 0.75 draws 56% of the pixels and the browser stretches them to fit). The cheap things go first:
// a little sharpness, then the glow, then more sharpness, then the shadows, and last of all, a lot more sharpness.
export const LADDERS = {
	high: [
		{ scale: 1.00, post: true, shadows: true },
		{ scale: 0.88, post: true, shadows: true },
		{ scale: 0.88, post: false, shadows: true },
		{ scale: 0.75, post: false, shadows: true },
		{ scale: 0.75, post: false, shadows: false },
		{ scale: 0.62, post: false, shadows: false },
		{ scale: 0.50, post: false, shadows: false }
	],
	// (Fast has no shadows and no glow to begin with: only the sharpness moves.)
	low: [1, 0.85, 0.72, 0.6, 0.5].map(scale => ({ scale, post: false, shadows: false }))
};

export class Gfx {
	constructor(renderer, { onChange = () => {} } = {}){
		this.renderer = renderer;
		this.onChange = onChange;
		this.quality = "high";
		this.adaptiveOn = true;
		this.ladder = LADDERS.high;
		this.adaptive = new Adaptive(this.ladder.length);
		this.basePR = 1;
		this.current = this.ladder[0];
		this._last = 0;
		this._stats = { frames: 0, since: 0, worst: 0, fps: 0, ms: 0, worstShown: 0 };
		this._savedStep = -1;
		this.gpu = this._findGpu();
		this.hasGlow = false;                       // (set by whatever draws the glow, so the counter only mentions it if there is one)
		renderer.info.autoReset = false;            // (counted over the whole frame: the main view, the mirror and what's over it)
		this.info = { calls: 0, tris: 0 };
		this._box = null;
	}
	_findGpu(){
		try{
			const gl = this.renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
			const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
			return name.replace(/^ANGLE \(/, "").replace(/\)$/, "").replace(/\s*\(0x[0-9a-f]+\)/ig, "");
		}catch(e){ return "unknown graphics"; }
	}

	// quality: "low" (Fast) or "high" (Pretty); adaptive: hold 60 fps by stepping; counter: show the FPS box.
	configure({ quality, adaptive, counter }){
		const q = quality === "low" ? "low" : "high";
		const dpr = window.devicePixelRatio || 1;
		this.quality = q;
		this.adaptiveOn = adaptive !== false;
		this.ladder = LADDERS[q];
		this.basePR = q === "high" ? Math.min(2, dpr) : 1;
		// Start where this computer settled last time (same quality, same screen), else at the best step.
		const saved = store.load("gfxStep", null);
		const start = this.adaptiveOn && saved && saved.q === q && saved.dpr === dpr && saved.step < this.ladder.length ? saved.step : 0;
		this.adaptive = new Adaptive(this.ladder.length, { start });
		this._savedStep = start;
		this._apply();
		this.adaptive.stall(performance.now(), 3000);
		this.setCounter(!!counter);
	}
	_apply(){
		const s = this.current = this.ladder[this.adaptive.step];
		const pr = this.basePR * s.scale;
		if(Math.abs(pr - this.renderer.getPixelRatio()) > 0.004) this.renderer.setPixelRatio(pr);
		this.onChange(s);
	}
	// A track or anything heavy is being built: the frames round it say nothing about the game's speed.
	stall(ms = 2500){ this.adaptive.stall(performance.now(), ms); }
	// A different scene (a new track): what was learned about the last one doesn't apply.
	scene(){ this.adaptive.scene(performance.now()); }
	// Still too slow at the cheapest step for a good while: the computer can't manage this quality at all.
	get struggling(){ return this.adaptive.step === this.ladder.length - 1 && this.adaptive.floorSlow >= 20; }

	// Once per animation frame, first thing (now: the frame's timestamp).
	tick(now){
		const ms = this._last ? now - this._last : 16.7;
		this._last = now;
		const st = this._stats;
		st.frames++; st.worst = Math.max(st.worst, ms < 250 ? ms : 0);
		if(now - st.since >= 500){
			if(st.since) { st.fps = st.frames * 1000 / (now - st.since); st.ms = (now - st.since) / st.frames; st.worstShown = st.worst; }
			st.frames = 0; st.since = now; st.worst = 0;
			if(this._box) this._draw();
		}
		const ri = this.renderer.info.render;
		this.info.calls = ri.calls; this.info.tris = ri.triangles;
		this.renderer.info.reset();
		if(this.adaptiveOn){
			if(this.adaptive.frame(ms, now)) this._apply();
			// Remember where it settled, once it has stayed there a while.
			if(this.adaptive.step !== this._savedStep && now - this.adaptive.lastChange > 20000){
				this._savedStep = this.adaptive.step;
				store.save("gfxStep", { q: this.quality, dpr: window.devicePixelRatio || 1, step: this._savedStep });
			}
		}
	}

	setCounter(on){
		if(on && !this._box){
			const b = this._box = document.createElement("div");
			b.className = "fps-box";
			b.setAttribute("aria-hidden", "true");
			b.innerHTML = '<b class="fps-big"></b><span class="fps-ms"></span><div class="fps-row fps-dials"></div><div class="fps-row fps-load"></div><div class="fps-row fps-gpu"></div>';
			document.body.appendChild(b);
			this._draw();
		}else if(!on && this._box){ this._box.remove(); this._box = null; }
	}
	_draw(){
		const b = this._box, st = this._stats, s = this.current;
		const fps = Math.round(st.fps);
		b.classList.toggle("slow", fps > 0 && fps < 55);
		b.querySelector(".fps-big").textContent = fps ? fps + " fps" : "...";
		b.querySelector(".fps-ms").textContent = st.ms ? st.ms.toFixed(1) + " ms  (worst " + Math.round(st.worstShown) + ")" : "";
		const pct = Math.round(s.scale * 100);
		b.querySelector(".fps-dials").textContent = "sharpness " + pct + "%  shadows " + (s.shadows ? "on" : "off") + (this.hasGlow ? "  glow " + (s.post ? "on" : "off") : "") + (this.adaptiveOn ? "" : "  (fixed)");
		b.querySelector(".fps-load").textContent = this.info.calls + " draws  " + (this.info.tris > 1e5 ? Math.round(this.info.tris / 1000) + "k" : this.info.tris) + " triangles  step " + this.adaptive.step + "/" + (this.ladder.length - 1);
		b.querySelector(".fps-gpu").textContent = this.gpu;
	}
}
