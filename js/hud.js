// The in-race overlay: timing tower, lap/time panel, speed, minimap, start lights and banners.
// Text is only rewritten when it changes, so the page isn't doing layout work every frame.
const $ = id => document.getElementById(id);

export function fmtTime(ms, withMinutes = true){
	if(ms == null || !isFinite(ms)) return "--.---";
	const neg = ms < 0; ms = Math.abs(ms);
	const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
	const body = withMinutes && m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
	return (neg ? "-" : "") + body;
}

function setText(el, text){
	if(el && el._t !== text){ el._t = text; el.textContent = text; }
}

export class Hud {
	constructor(){
		this.root = $("hud");
		this.tower = $("tower");
		this.rows = [];
		this.el = {
			lap: $("hudLap"), laps: $("hudLaps"), lapLabel: $("hudLapLabel"), time: $("hudTime"), cur: $("hudCur"), best: $("hudBest"),
			last: $("hudLast"), speed: $("hudSpeed"), pos: $("hudPos"), posOf: $("hudPosOf"), gauge: $("hudGauge"),
			lights: $("lights"), banner: $("banner"), sub: $("bannerSub"), spect: $("spectating"), toast: $("hudToast")
		};
		this.mini = $("minimap");
		this.miniCtx = this.mini.getContext("2d");
		this.bannerTimer = null;
	}

	show(on){ this.root.hidden = !on; }

	setup(track, tracker, laps, mode){
		this.track = track;
		this.mode = mode;
		setText(this.el.laps, mode === "trial" ? "" : mode === "elim" ? "" : "/" + laps);
		setText(this.el.lapLabel, mode === "quali" ? "Quali" : "Lap");
		this.el.lights.hidden = true;
		this.el.banner.hidden = true;
		this.el.spect.hidden = true;
		this.buildMinimap(track, tracker);
		this.setLights(-1);
	}

	buildMinimap(track, tracker){
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const size = this.mini.clientWidth || 180;
		this.mini.width = this.mini.height = Math.round(size * dpr);
		const pts = [];
		for(const [x1, z1, x2, z2] of track.wallSegs) pts.push(track.toMap(x1, z1), track.toMap(x2, z2));
		const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
		const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
		const pad = 10 * dpr, W = this.mini.width;
		const k = (W - pad * 2) / Math.max(maxX - minX, maxY - minY, 1);
		const ox = pad + ((W - pad * 2) - (maxX - minX) * k) / 2, oy = pad + ((W - pad * 2) - (maxY - minY) * k) / 2;
		this.project = (x, z) => { const [mx, my] = track.toMap(x, z); return [ox + (mx - minX) * k, oy + (maxY - my) * k]; };
		this.dpr = dpr;

		const base = document.createElement("canvas");
		base.width = base.height = W;
		const g = base.getContext("2d");
		g.lineCap = g.lineJoin = "round";
		const path = tracker.path;
		if(path){
			g.strokeStyle = "rgba(233,237,242,0.9)";
			g.lineWidth = Math.max(3 * dpr, (track.center ? track.center.hw * 1.2 : 4) * k);
			g.beginPath();
			for(let i = 0; i <= path.n; i += 2){
				const q = i % path.n;
				const [px, py] = this.project(path.x[q], path.z[q]);
				i ? g.lineTo(px, py) : g.moveTo(px, py);
			}
			g.closePath();
			g.stroke();
		}
		if(!track.center){
			g.strokeStyle = "rgba(244,131,66,0.9)";
			g.lineWidth = 1.5 * dpr;
			g.beginPath();
			for(const [x1, z1, x2, z2] of track.wallSegs){
				const [a, b] = this.project(x1, z1), [c, d] = this.project(x2, z2);
				g.moveTo(a, b); g.lineTo(c, d);
			}
			g.stroke();
		}
		const l = track.lines[0];
		const [a, b] = this.project(l.a.x, l.a.y), [c, d] = this.project(l.b.x, l.b.y);
		g.strokeStyle = "#2580db";
		g.lineWidth = 3 * dpr;
		g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
		this.miniBase = base;
	}

	drawMinimap(cars, focus){
		const g = this.miniCtx, W = this.mini.width, dpr = this.dpr;
		g.clearRect(0, 0, W, W);
		g.drawImage(this.miniBase, 0, 0);
		for(const c of cars){
			if(c.gone || c.elim !== null) continue;
			const [x, y] = this.project(c.pos.x, c.pos.z);
			const isFocus = c === focus;
			g.beginPath();
			g.arc(x, y, (isFocus ? 5.5 : 4) * dpr, 0, Math.PI * 2);
			g.fillStyle = `hsl(${c.hue}, 100%, 55%)`;
			g.fill();
			g.lineWidth = (isFocus ? 2.5 : 1.2) * dpr;
			g.strokeStyle = isFocus ? "#ffffff" : "rgba(10,12,18,0.85)";
			g.stroke();
		}
	}

	setTower(standings, focusId){
		const n = Math.min(standings.length, 10);
		while(this.rows.length < n){
			const row = document.createElement("li");
			row.className = "tower-row";
			row.innerHTML = '<span class="tw-pos"></span><span class="tw-chip"></span><span class="tw-name"></span><span class="tw-gap"></span>';
			this.tower.appendChild(row);
			this.rows.push({ row, pos: row.children[0], chip: row.children[1], name: row.children[2], gap: row.children[3] });
		}
		this.rows.forEach((r, i) => {
			const s = standings[i];
			r.row.hidden = !s || i >= n;
			if(!s) return;
			setText(r.pos, String(i + 1));
			const hue = `hsl(${s.car.hue}, 100%, 55%)`;
			if(r.chip._h !== hue){ r.chip._h = hue; r.chip.style.background = hue; }
			setText(r.name, s.car.name);
			setText(r.gap, s.car.finish !== null ? (i === 0 ? "WIN" : s.gap) : (s.gap || "Leader"));
			const cls = "tower-row" + (s.car.id === focusId ? " is-me" : "") + (s.car.elim !== null ? " is-out" : "") + (s.car.finish !== null ? " is-done" : "");
			if(r.row._c !== cls){ r.row._c = cls; r.row.className = cls; }
		});
	}

	setRace({ lap, laps, raceMs, curMs, bestMs, lastMs, lastDelta, kmh, pos, of }){
		setText(this.el.lap, this.mode === "trial" ? String(Math.max(1, lap)) : String(Math.min(Math.max(1, lap), laps)));
		setText(this.el.time, fmtTime(Math.max(0, raceMs)));
		setText(this.el.cur, fmtTime(curMs));
		setText(this.el.best, fmtTime(bestMs));
		setText(this.el.last, lastMs == null ? "--.---" : fmtTime(lastMs));
		setText(this.el.speed, String(Math.round(kmh)));
		setText(this.el.pos, this.mode === "trial" ? "TT" : "P" + pos);
		setText(this.el.posOf, this.mode === "trial" ? "" : "/" + of);
		const frac = Math.min(1, kmh / 200);
		if(Math.abs((this._g ?? -1) - frac) > 0.004){
			this._g = frac;
			this.el.gauge.style.strokeDashoffset = String(100 - frac * 100);
		}
		if(this.el.last._d !== lastDelta){
			this.el.last._d = lastDelta;
			this.el.last.dataset.delta = lastDelta == null ? "" : lastDelta <= 0 ? "faster" : "slower";
		}
	}

	// Live delta to the ghost (time trial and the weekly challenge).
	// d: { ms (negative = ahead) or null, has: is there a ghost, label } or null to hide.
	setDelta(d){
		const on = !!d;
		if(this._deltaOn !== on){ this._deltaOn = on; document.body.classList.toggle("delta-on", on); }
		if(!on) return;
		const el = this.el.deltaParts || (this.el.deltaParts = { root: $("delta"), label: $("deltaLabel"), num: $("deltaNum"), ahead: $("deltaAhead"), behind: $("deltaBehind") });
		const ms = d.has ? d.ms : null;
		setText(el.label, d.has ? d.label : "No ghost yet: finish a lap");
		setText(el.num, ms == null ? "--.---" : (ms < 0 ? "\u2212" : "+") + (Math.abs(ms) / 1000).toFixed(3));
		const state = ms == null ? "" : ms < -10 ? "ahead" : ms > 10 ? "behind" : "even";
		if(el.root.dataset.state !== state) el.root.dataset.state = state;
		// Full bar at 2 s; square root so small gaps still show.
		const v = ms == null ? 0 : Math.round(Math.min(1, Math.sqrt(Math.abs(ms) / 2000)) * 200) / 200;
		const a = ms != null && ms < 0 ? v : 0, b = ms != null && ms > 0 ? v : 0;
		if(el.ahead._v !== a){ el.ahead._v = a; el.ahead.style.transform = `scaleX(${a})`; }
		if(el.behind._v !== b){ el.behind._v = b; el.behind.style.transform = `scaleX(${b})`; }
	}

	// Slipstream meter and speed lines, 0..1. Called every frame, so it only touches styles.
	setDraft(v){
		const on = v > 0.08;
		const q = Math.round(v * 40) / 40;
		if(this._draft === q) return;
		this._draft = q;
		const m = this.el.draftMeter || (this.el.draftMeter = $("hudDraft"));
		const fx = this.el.draftFx || (this.el.draftFx = $("draftFx"));
		m.style.setProperty("--draft", String(q));
		if(m._on !== on){ m._on = on; m.classList.toggle("on", on); }
		fx.style.opacity = on ? String(Math.min(1, q * 1.1)) : "0";
	}

	// Five red lights over three seconds, then lights out. n = how many are lit; -1 hides, 6 = out.
	setLights(n){
		const el = this.el.lights;
		if(n < 0){ el.hidden = true; this._lights = n; return; }
		el.hidden = false;
		if(this._lights === n) return;
		this._lights = n;
		[...el.querySelectorAll(".light")].forEach((l, i) => l.classList.toggle("on", n <= 5 && i < n));
		el.classList.toggle("out", n > 5);
	}

	banner(text, sub = "", kind = "", ms = 1800){
		const b = this.el.banner;
		setText(b.firstElementChild, text);
		setText(this.el.sub, sub);
		this.el.sub.hidden = !sub;
		b.dataset.kind = kind;
		b.hidden = false;
		b.classList.remove("pop");
		void b.offsetWidth;
		b.classList.add("pop");
		clearTimeout(this.bannerTimer);
		if(ms) this.bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
	}

	hideBanner(){ this.el.banner.hidden = true; clearTimeout(this.bannerTimer); }

	toast(text, ms = 2200){
		const t = this.el.toast;
		setText(t, text);
		t.hidden = false;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
	}

	spectating(text){
		this.el.spect.hidden = !text;
		if(text) setText(this.el.spect, text);
	}
}
