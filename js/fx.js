// Skid marks, sparks and tyre smoke. Visual only.
const THREE = globalThis.THREE;

export class Effects {
	constructor(scene, quality){
		this.scene = scene;
		this.low = quality === "low";

		// Skid marks: a ring buffer of quads on the road.
		this.maxSkids = this.low ? 600 : 2000;
		const sg = new THREE.BufferGeometry();
		this.skidPos = new Float32Array(this.maxSkids * 4 * 3);
		const idx = [];
		for(let i = 0; i < this.maxSkids; i++){ const a = i * 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
		sg.setAttribute("position", new THREE.BufferAttribute(this.skidPos, 3));
		sg.setIndex(idx);
		this.skidMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
		this.skidMesh.frustumCulled = false;
		this.skidMesh.renderOrder = 1;
		this.skidHead = 0;
		scene.add(this.skidMesh);

		// Sparks.
		this.maxSparks = 240;
		const pg = new THREE.BufferGeometry();
		this.sparkPos = new Float32Array(this.maxSparks * 3);
		this.sparkVel = new Float32Array(this.maxSparks * 3);
		this.sparkLife = new Float32Array(this.maxSparks);
		pg.setAttribute("position", new THREE.BufferAttribute(this.sparkPos, 3));
		// Round, glowing sparks (plain points draw as squares).
		const dot = document.createElement("canvas"); dot.width = dot.height = 32;
		const dc = dot.getContext("2d"), rg = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
		rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.35, "rgba(255,220,150,0.9)"); rg.addColorStop(1, "rgba(255,160,60,0)");
		dc.fillStyle = rg; dc.fillRect(0, 0, 32, 32);
		this.sparkTex = new THREE.CanvasTexture(dot);
		this.sparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffc46b, map: this.sparkTex, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		this.sparks.frustumCulled = false;
		this.sparkHead = 0;
		scene.add(this.sparks);

		// Tyre smoke puffs.
		const c = document.createElement("canvas");
		c.width = c.height = 64;
		const g = c.getContext("2d");
		const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
		r.addColorStop(0, "rgba(235,235,240,0.75)"); r.addColorStop(1, "rgba(235,235,240,0)");
		g.fillStyle = r; g.fillRect(0, 0, 64, 64);
		this.smokeTex = new THREE.CanvasTexture(c);
		this.puffs = [];
		const n = this.low ? 0 : 80;
		for(let i = 0; i < n; i++){
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
			s.visible = false;
			scene.add(s);
			this.puffs.push({ s, life: 0 });
		}
		this.puffHead = 0;
	}

	// Called every frame per car: lays rubber and smoke when it's sliding.
	trail(car, dt){
		const d = car.data;
		const speed = Math.hypot(d.xv, d.yv);
		if(speed < 0.08){ car.lastSkid = null; return; }
		const slip = Math.abs(Math.sin(Math.atan2(d.xv, d.yv) - d.dir));
		const sliding = slip > 0.32;
		const sx = Math.sin(d.dir), cz = Math.cos(d.dir);
		const rear = [[0.5, -0.7], [-0.5, -0.7]].map(([ox, oz]) => [d.x + ox * cz + oz * sx, d.y - ox * sx + oz * cz]);
		if(sliding && car.lastSkid){
			for(let w = 0; w < 2; w++){
				const [ax, az] = car.lastSkid[w], [bx, bz] = rear[w];
				const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
				if(l < 0.05 || l > 3) continue;
				const nx = -dz / l * 0.14, nz = dx / l * 0.14;
				const o = this.skidHead * 12, p = this.skidPos;
				p[o] = ax + nx; p[o + 1] = 0.06; p[o + 2] = az + nz;
				p[o + 3] = ax - nx; p[o + 4] = 0.06; p[o + 5] = az - nz;
				p[o + 6] = bx + nx; p[o + 7] = 0.06; p[o + 8] = bz + nz;
				p[o + 9] = bx - nx; p[o + 10] = 0.06; p[o + 11] = bz - nz;
				this.skidHead = (this.skidHead + 1) % this.maxSkids;
				this.skidMesh.geometry.attributes.position.needsUpdate = true;
			}
			if(this.puffs.length && Math.random() < dt * 14 * slip){
				const pf = this.puffs[this.puffHead];
				this.puffHead = (this.puffHead + 1) % this.puffs.length;
				pf.life = 1;
				pf.s.visible = true;
				const sc = car.model && car.model.userData.smoke;
				if(sc === "rainbow") pf.s.material.color.setHSL(Math.random(), 1, 0.65);
				else pf.s.material.color.set(sc || "#ebebf0");
				pf.s.position.set(rear[0][0] * 0.5 + rear[1][0] * 0.5, 0.5, rear[0][1] * 0.5 + rear[1][1] * 0.5);
				pf.s.scale.setScalar(1.2);
			}
		}
		car.lastSkid = rear;
	}

	// Spray thrown up behind a car on a wet track (wet 0..1).
	spray(car, dt, wet){
		if(!this.puffs.length) return;
		const d = car.data, speed = Math.hypot(d.xv, d.yv);
		if(speed < 0.12 || Math.random() > dt * 11 * wet * Math.min(1, speed / 0.35)) return;
		const pf = this.puffs[this.puffHead];
		this.puffHead = (this.puffHead + 1) % this.puffs.length;
		pf.life = 0.8;
		pf.s.visible = true;
		pf.s.material.color.set("#cfd6de");
		const sx = Math.sin(d.dir), cz = Math.cos(d.dir);
		pf.s.position.set(d.x - sx * 1.4 + (Math.random() - 0.5) * 0.8, 0.45, d.y - cz * 1.4 + (Math.random() - 0.5) * 0.8);
		pf.s.scale.setScalar(1.3);
	}

	burst(x, z, strength, dirX = 0, dirZ = 0){
		const n = Math.min(24, Math.round(6 + strength * 40));
		for(let i = 0; i < n; i++){
			const k = this.sparkHead;
			this.sparkHead = (this.sparkHead + 1) % this.maxSparks;
			this.sparkPos[k * 3] = x; this.sparkPos[k * 3 + 1] = 0.5 + Math.random() * 0.4; this.sparkPos[k * 3 + 2] = z;
			const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7 * (0.5 + strength * 2);
			this.sparkVel[k * 3] = Math.cos(a) * s + dirX * 20;
			this.sparkVel[k * 3 + 1] = 2 + Math.random() * 5;
			this.sparkVel[k * 3 + 2] = Math.sin(a) * s + dirZ * 20;
			this.sparkLife[k] = 0.25 + Math.random() * 0.3;
		}
	}

	update(dt){
		const p = this.sparkPos, v = this.sparkVel;
		for(let k = 0; k < this.maxSparks; k++){
			if(this.sparkLife[k] <= 0){ p[k * 3 + 1] = -50; continue; }
			this.sparkLife[k] -= dt;
			v[k * 3 + 1] -= 22 * dt;
			p[k * 3] += v[k * 3] * dt; p[k * 3 + 1] += v[k * 3 + 1] * dt; p[k * 3 + 2] += v[k * 3 + 2] * dt;
			if(p[k * 3 + 1] < 0.05){ p[k * 3 + 1] = 0.05; v[k * 3 + 1] *= -0.3; }
		}
		this.sparks.geometry.attributes.position.needsUpdate = true;
		for(const pf of this.puffs){
			if(pf.life <= 0) continue;
			pf.life -= dt * 1.4;
			pf.s.material.opacity = Math.max(0, pf.life) * 0.5;
			pf.s.scale.setScalar(1.2 + (1 - pf.life) * 3.2);
			pf.s.position.y += dt * 0.8;
			if(pf.life <= 0) pf.s.visible = false;
		}
	}

	clear(){
		this.skidPos.fill(0);
		this.skidMesh.geometry.attributes.position.needsUpdate = true;
		this.sparkLife.fill(0);
		for(const pf of this.puffs){ pf.life = 0; pf.s.visible = false; }
	}

	dispose(){
		this.scene.remove(this.skidMesh, this.sparks);
		this.skidMesh.geometry.dispose(); this.skidMesh.material.dispose();
		this.sparks.geometry.dispose(); this.sparks.material.dispose();
		for(const pf of this.puffs){ this.scene.remove(pf.s); pf.s.material.dispose(); }
		this.smokeTex.dispose(); this.sparkTex.dispose();
	}
}
