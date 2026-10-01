// Drops of water on the camera lens in the rain: they land, some run down, and they dry. A small 2D canvas between the
// 3D picture and the HUD, drawn at half size (the drops are soft anyway), and only while it's raining. Looks only.
//   const lens = new Lens(canvasElement); lens.update(dt, { rain, speed, active })
export class Lens {
	constructor(canvas){
		this.cv = canvas; this.g = canvas.getContext("2d");
		this.drops = []; this.acc = 0; this.on = false; this.w = 0; this.h = 0;
		this.resize = this.resize.bind(this);
		addEventListener("resize", this.resize);
	}
	resize(){
		const k = 0.5;
		this.w = Math.max(160, Math.round(innerWidth * k)); this.h = Math.max(90, Math.round(innerHeight * k));
		this.cv.width = this.w; this.cv.height = this.h;
	}
	// rain 0..1; speed 0..1 (how fast the car is going: the faster, the more the water streams back); active: draw at all.
	update(dt, { rain, speed, active }){
		const want = active && rain > 0.14;
		if(!want){
			if(this.on){ this.on = false; this.drops.length = 0; this.g.clearRect(0, 0, this.w, this.h); this.cv.hidden = true; }
			return;
		}
		if(!this.on){ this.on = true; this.cv.hidden = false; this.resize(); }
		const { g, w, h } = this, drops = this.drops;
		// New drops land: more of them the harder it rains.
		this.acc += dt * 26 * Math.pow(rain, 1.5);
		while(this.acc >= 1 && drops.length < 70){
			this.acc -= 1;
			const big = Math.random() < 0.18;
			drops.push({ x: Math.random() * w, y: Math.random() * h * 0.9, r: big ? 4.5 + Math.random() * 3.5 : 1.6 + Math.random() * 2.4, age: 0, life: 2.5 + Math.random() * 4.5, run: Math.random() < 0.28 ? 0.7 + Math.random() * 1.6 : 1e9, vy: 0, trail: [] });
		}
		this.acc = Math.min(this.acc, 1);
		g.clearRect(0, 0, w, h);
		const rush = speed * speed;
		for(let i = drops.length - 1; i >= 0; i--){
			const d = drops[i];
			d.age += dt;
			if(d.age > d.life){ drops.splice(i, 1); continue; }
			if(d.age > d.run){
				// Running down (and back, when the car is fast).
				d.vy += (14 + d.r * 5 + rush * 60 - d.vy) * Math.min(1, dt * 2);
				const dy = d.vy * dt;
				if(d.trail.length < 40) d.trail.push([d.x, d.y]);
				d.y += dy; d.x += (rush * 18 * dt) * (0.4 + d.r * 0.08);
				d.r = Math.max(1.2, d.r - dt * 0.35);
				if(d.y > h + 10){ drops.splice(i, 1); continue; }
			}
			const a = Math.min(1, d.age / 0.25) * Math.min(1, (d.life - d.age) / 0.8);
			// The path it ran down.
			if(d.trail.length > 1){
				g.strokeStyle = `rgba(215,228,242,${0.1 * a})`; g.lineWidth = Math.max(1, d.r * 0.55);
				g.beginPath(); g.moveTo(d.trail[0][0], d.trail[0][1]);
				for(let k = 1; k < d.trail.length; k++) g.lineTo(d.trail[k][0], d.trail[k][1]);
				g.lineTo(d.x, d.y); g.stroke();
			}
			// The drop: a clear lens with a dark rim and a bright glint, like a bead of water.
			const gr = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.1, d.x, d.y, d.r);
			gr.addColorStop(0, `rgba(235,244,255,${0.32 * a})`); gr.addColorStop(0.7, `rgba(150,175,205,${0.14 * a})`); gr.addColorStop(1, `rgba(20,30,48,${0.4 * a})`);
			g.fillStyle = gr;
			g.beginPath(); g.ellipse(d.x, d.y, d.r * 0.92, d.r * (d.age > d.run ? 1.2 : 1), 0, 0, Math.PI * 2); g.fill();
			g.fillStyle = `rgba(255,255,255,${0.7 * a})`;
			g.beginPath(); g.arc(d.x - d.r * 0.3, d.y - d.r * 0.38, Math.max(0.5, d.r * 0.2), 0, Math.PI * 2); g.fill();
		}
	}
}
