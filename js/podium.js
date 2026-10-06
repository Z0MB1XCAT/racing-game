// The winner's celebration on the results screen: confetti, fireworks, fizz, flames or rainbow streamers, drawn on a canvas over the 3D
// scene. Everyone sees the winner's own style, whoever they are. It's looks only, it runs for a few seconds and then stops drawing (and
// does nothing at all for someone who has asked their computer for less motion).
//   const show = startPodium(canvas, "fireworks", 200);   ...   show.stop();

export const PODIUM_STYLES = ["confetti", "fireworks", "fizz", "flame", "rainbow"];
const DURATION = 6500;            // ms of show, then a fade
const MAX = 420;                  // particles at once

const RAINBOW = ["#ff3b3b", "#ff9a2e", "#ffe23a", "#4be36a", "#3ac8ff", "#4a6bff", "#b86bff"];
const palette = hue => [`hsl(${hue},100%,60%)`, "#ffffff", "#ffd23a", `hsl(${(hue + 40) % 360},95%,62%)`, `hsl(${(hue + 320) % 360},95%,62%)`];

// One new particle for a style, at time t of the show. rand is Math.random (or a seeded one in tests).
export function spawn(style, w, h, hue, rand, t = 0){
	const pal = palette(hue);
	const pick = a => a[Math.floor(rand() * a.length)];
	if(style === "confetti" || style === "rainbow"){
		const left = rand() < 0.5, x = left ? -10 : w + 10, up = h * (0.55 + rand() * 0.35);
		return { kind: "paper", x, y: h * (0.2 + rand() * 0.3), vx: (left ? 1 : -1) * (200 + rand() * 520), vy: -up * (0.6 + rand()), g: 520, drag: 0.5, size: 6 + rand() * 7, rot: rand() * 6, spin: (rand() - 0.5) * 14,
			color: style === "rainbow" ? `hsl(${Math.floor(rand() * 360)},95%,60%)` : pick(pal), life: 3.6 + rand() * 1.6, age: 0, flip: rand() * 6 };
	}
	if(style === "fizz"){
		const spray = rand() < (t < 1600 ? 0.75 : 0.2);       // a sprayed bottle first, then bubbles drifting up
		return spray
			? { kind: "drop", x: w * (0.5 + (rand() - 0.5) * 0.08), y: h + 6, vx: (rand() - 0.5) * 520, vy: -(h * (1.1 + rand() * 0.7)), g: 760, drag: 0.1, size: 3 + rand() * 4, color: "rgba(225,245,255,.95)", life: 2.4, age: 0 }
			: { kind: "bubble", x: rand() * w, y: h + 14, vx: (rand() - 0.5) * 40, vy: -(70 + rand() * 170), g: 0, drag: 0, size: 5 + rand() * 11, color: "rgba(200,235,255,.5)", life: 5 + rand() * 2, age: 0, wob: rand() * 6 };
	}
	if(style === "flame"){
		// a wall of fire along the bottom: small embers that rise a little way and shrink as they cool
		const hot = rand();
		return { kind: "ember", x: rand() * w, y: h + 8, vx: (rand() - 0.5) * 70, vy: -(70 + rand() * (130 + hot * 260)), g: -30, drag: 0.55, size: 2 + rand() * 5.5 * (1 - hot * 0.4), color: pick(["#ff3a1a", "#ff7a12", "#ffb02e", "#ffe27a"]), life: 0.9 + rand() * 1.3, age: 0 };
	}
	// fireworks: a rocket from the bottom, aimed to slow to a stop (and burst) a good way up the screen, whatever its height
	const rise = h * (0.4 + rand() * 0.4), T = 0.9 + rand() * 0.5;
	return { kind: "rocket", x: w * (0.15 + rand() * 0.7), y: h + 4, vx: (rand() - 0.5) * 60, vy: -2 * rise / T, g: 2 * rise / (T * T), drag: 0, size: 3, color: pick(["#ff5a5a", "#ffd23a", "#5aff8a", "#3ac8ff", "#d86bff", "#ffffff"]), life: T + 0.5, age: 0, fuse: T };
}

// How many new particles to add this frame for a style (per second, scaled by dt), so the show builds, plays and fades.
export function rate(style, t){
	const s = t / 1000;
	if(style === "fireworks") return s < 5.2 ? 2.6 : 0;
	if(style === "fizz") return s < 1.6 ? 150 : s < 5 ? 55 : 0;
	if(style === "flame") return s < 4.8 ? 190 : 0;
	return s < 0.9 ? 360 : s < 3 ? 52 : 0;               // confetti and rainbow: a big burst, then a steady shower
}

export function startPodium(canvas, style, hue = 200, opts = {}){
	const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	if(!canvas || reduce || !PODIUM_STYLES.includes(style)) return { stop(){}, count: () => 0 };
	const ctx = canvas.getContext("2d"), rand = opts.rand || Math.random;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	canvas.hidden = false;           // (a hidden canvas has no size to measure)
	const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
	canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
	const parts = [];
	let raf = 0, t0 = performance.now(), last = t0, owed = 0, stopped = false;
	function boom(p){
		const n = 64, col = p.color;
		parts.push({ kind: "flash", x: p.x, y: p.y, vx: 0, vy: 0, g: 0, drag: 0, size: 46, color: "#ffffff", life: 0.24, age: 0 });
		for(let i = 0; i < n; i++){
			const a = (i / n) * Math.PI * 2 + rand() * 0.3, sp = 140 + rand() * 300;
			parts.push({ kind: "spark", x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 220, drag: 0.9, size: 2.2 + rand() * 2.2, color: i % 5 === 0 ? "#ffffff" : col, life: 1.3 + rand() * 0.8, age: 0 });
		}
	}
	function frame(now){
		if(stopped) return;
		raf = requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - last) / 1000); last = now;
		const t = now - t0;
		owed += rate(style, t) * dt;
		while(owed >= 1 && parts.length < MAX){ parts.push(spawn(style, w, h, hue, rand, t)); owed--; }
		if(owed > 5) owed = 0;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.globalAlpha = 1;
		const fade = t > DURATION - 800 ? Math.max(0, (DURATION - t) / 800) : 1;
		ctx.globalCompositeOperation = style === "fireworks" || style === "flame" ? "lighter" : "source-over";
		if(style === "flame"){
			// a warm glow behind the embers, up with the fire and gone as it dies down
			const heat = Math.min(1, t / 500) * fade * (t < 4800 ? 1 : Math.max(0, 1 - (t - 4800) / 1200));
			if(heat > 0){
				const gr = ctx.createLinearGradient(0, h, 0, h * 0.5);
				gr.addColorStop(0, `rgba(255,110,20,${0.42 * heat})`); gr.addColorStop(1, "rgba(255,110,20,0)");
				ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(0, h * 0.5, w, h * 0.5);
			}
		}
		if(style === "rainbow"){
			// the rainbow itself: it sweeps up over the screen, hangs there and thins away (the streamers fall in front of it)
			const open = 1 - Math.pow(1 - Math.min(1, t / 1300), 3), live = t < 4200 ? 1 : Math.max(0, 1 - (t - 4200) / 1500);
			const R = Math.min(w * 0.5, h * 0.85), bw = R * 0.032;
			ctx.lineWidth = bw; ctx.globalAlpha = 0.4 * live * fade;
			RAINBOW.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(w / 2, h * 1.02, R - i * bw, Math.PI, Math.PI + Math.PI * open); ctx.stroke(); });
		}
		for(let i = parts.length - 1; i >= 0; i--){
			const p = parts[i];
			p.age += dt;
			if(p.age > p.life || p.y > h + 40 || p.y < -h){ parts.splice(i, 1); continue; }
			const k = Math.exp(-p.drag * dt);
			p.vx *= k; p.vy = p.vy * k + p.g * dt;
			p.x += p.vx * dt; p.y += p.vy * dt;
			if(p.kind === "rocket" && p.age >= p.fuse){ boom(p); parts.splice(i, 1); continue; }
			const a = fade * Math.max(0, Math.min(1, (p.life - p.age) / Math.min(0.7, p.life)));
			ctx.globalAlpha = a;
			ctx.fillStyle = p.color;
			if(p.kind === "paper"){
				p.rot += p.spin * dt; p.flip += dt * 9;
				ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.flip));
				ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
			}else if(p.kind === "bubble"){
				const x = p.x + Math.sin(p.age * 3 + p.wob) * 10;
				ctx.strokeStyle = "rgba(235,248,255,.85)"; ctx.lineWidth = 1.5;
				ctx.beginPath(); ctx.arc(x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
				ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.22, 0, Math.PI * 2); ctx.fill();
			}else if(p.kind === "spark"){
				// a short streak along the way it's moving, so a burst looks like it's flying outward
				ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = "round";
				ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.lineTo(p.x, p.y); ctx.stroke();
			}else{
				const s = p.kind === "ember" ? p.size * (1 - p.age / p.life * 0.6) : p.kind === "flash" ? p.size * (0.5 + p.age / p.life) : p.size;
				ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
				if(p.kind === "rocket"){ ctx.globalAlpha = a * 0.5; ctx.fillRect(p.x - 1, p.y, 2, 16); }
			}
		}
		ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
		if(t > DURATION && (!parts.length || t > DURATION + 1500)) stop();   // (everything has faded by DURATION; this just tidies up)
	}
	function stop(){
		if(stopped) return;
		stopped = true;
		cancelAnimationFrame(raf);
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
		canvas.hidden = true;
	}
	raf = requestAnimationFrame(frame);
	return { stop, count: () => parts.length };
}
