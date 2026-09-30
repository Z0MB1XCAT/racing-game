// The renderer's dials, and the thing that turns them to hold 60 fps: how sharp the picture is (the
// renderer's pixel ratio), whether the sun casts shadows, and (once it's there) the glow. js/adaptive.js
// decides when to step; this applies the step, remembers where a computer settled, and draws the FPS
// counter (Settings > FPS counter), which also says what graphics card the browser found.
import { Adaptive } from "./adaptive.js";
import { LADDERS } from "./ladders.js";
import { Post } from "./post.js";
import * as store from "./storage.js";

export { LADDERS };

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
		// The graphics chip's own time per frame, where the browser can say (the GPU timer): it tells the
		// frame rate apart from what the chip is doing, so the controller can tell "the chip is the limit" from
		// "the processor is". null where it can't be read.
		const gl = renderer.getContext();
		this._gl = gl;
		this._timer = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;
		this._pending = [];
		this._open = null;
		this.gpuMs = null;                          // (smoothed)
		this.jsMs = 0;                              // the time the game's own code took in a frame (smoothed)
		this._t0 = 0;
		this.post = null;                           // the glow and finishing pass (js/post.js), made when a scene is attached
		this.postFailed = false;                    // (if it couldn't be made, the game carries on without it)
		this.scene = null; this.camera = null;
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
		this.adaptive = new Adaptive(this.ladder, { start });
		this._savedStep = start;
		this._apply();
		this.adaptive.stall(performance.now(), 3000);
		this.setCounter(!!counter);
	}
	// The scene and camera to draw with render(). The glow and finishing pass is only for Pretty (it draws the
	// scene off-screen first, which a slow graphics chip can do without), and only while the step has it.
	attach(scene, camera){ this.scene = scene; this.camera = camera; }
	_apply(){
		const s = this.current = this.ladder[this.adaptive.step];
		const pr = this.basePR * s.scale;
		if(Math.abs(pr - this.renderer.getPixelRatio()) > 0.004){ this.renderer.setPixelRatio(pr); this.resize(); }
		this.onChange(s);
	}
	// The graphics chip's time, round everything drawn in a frame: begin() where drawing starts, end() after the last of it.
	_gpuBegin(){
		if(!this._timer || this._open || this._pending.length > 3) return;
		const q = this._gl.createQuery();
		this._gl.beginQuery(this._timer.TIME_ELAPSED_EXT, q);
		this._open = q;
	}
	_gpuEnd(){
		if(!this._open) return;
		this._gl.endQuery(this._timer.TIME_ELAPSED_EXT);
		this._pending.push(this._open);
		this._open = null;
	}
	_gpuPoll(){
		const gl = this._gl;
		while(this._pending.length){
			const q = this._pending[0];
			if(!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
			const disjoint = gl.getParameter(this._timer.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
			gl.deleteQuery(q); this._pending.shift();
			if(!disjoint && ns > 0){ const ms = ns / 1e6; this.gpuMs = this.gpuMs === null ? ms : this.gpuMs * 0.8 + ms * 0.2; }
		}
	}
	// Call once the whole frame is drawn (the main view, the mirror and what's over it).
	endFrame(){
		this._gpuEnd();
		this.jsMs = this.jsMs * 0.9 + (performance.now() - this._t0) * 0.1;
		if(this._timer) this._gpuPoll();
	}
	get postOn(){ return this.quality === "high" && this.current.post && !!this.scene && !this.postFailed; }
	// After the window or the pixel ratio changes.
	resize(){ if(this.post) this.post.resize(); }
	// Draw the frame. look: the world's { night, lights, rain, warm } for the glow and grade.
	render(look){
		this._gpuBegin();
		if(this.postOn){
			if(!this.post && !this.postFailed){ try{ this.post = new Post(this.renderer, this.scene, this.camera); }catch(e){ console.warn("[gfx] the glow pass couldn't start, drawing without it:", e); this.postFailed = true; } }
			if(this.post){ this.post.render(look); return; }
		}
		this.renderer.render(this.scene, this.camera);
	}
	// A track or anything heavy is being built: the frames round it say nothing about the game's speed.
	stall(ms = 2500){ this.adaptive.stall(performance.now(), ms); }
	// A different scene (a new track): what was learned about the last one doesn't apply.
	newTrack(){ this.adaptive.scene(performance.now()); }
	// Still too slow at the cheapest step for a good while: the computer can't manage this quality at all.
	get struggling(){ return this.adaptive.step === this.ladder.length - 1 && this.adaptive.floorSlow >= 20; }

	// Once per animation frame, first thing (now: the frame's timestamp).
	tick(now){
		const ms = this._last ? now - this._last : 16.7;
		this._last = now;
		this._t0 = performance.now();
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
			if(this.adaptive.frame(ms, now, this.gpuMs)) this._apply();
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
			b.innerHTML = '<b class="fps-big"></b><span class="fps-ms"></span><div class="fps-row fps-dials"></div><div class="fps-row fps-load"></div><div class="fps-row fps-time"></div><div class="fps-row fps-gpu"></div>';
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
		b.querySelector(".fps-dials").textContent = "sharpness " + pct + "%  shadows " + (s.shadows ? "on" : "off") + (s.density < 1 ? "  trees " + Math.round(s.density * 100) + "%" : "") + (s.mirror > 1 ? "  mirror 1/" + s.mirror : "") + (this.quality === "high" ? "  glow " + (this.postOn ? "on" : "off") : "") + (this.adaptiveOn ? "" : "  (fixed)");
		b.querySelector(".fps-load").textContent = this.info.calls + " draws  " + (this.info.tris > 1e5 ? Math.round(this.info.tris / 1000) + "k" : this.info.tris) + " triangles  step " + this.adaptive.step + "/" + (this.ladder.length - 1);
		// Where the time goes: the graphics chip (if the browser can time it) and the game's own code.
		b.querySelector(".fps-time").textContent = (this.gpuMs !== null ? "gpu " + this.gpuMs.toFixed(1) + " ms" : "gpu ?") + "   code " + this.jsMs.toFixed(1) + " ms" + (this.adaptive.cpuBound ? "   (the processor is the limit)" : "");
		b.querySelector(".fps-gpu").textContent = this.gpu;
	}
}
