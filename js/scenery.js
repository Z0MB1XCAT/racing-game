// Everything around a circuit that isn't the road: the pit building, grandstands full
// of fans, billboards, a bridge, city blocks and trees.
//
// Every piece is checked against the whole road, not just the stretch it was placed
// beside, so nothing pokes onto the track at hairpins or where the circuit doubles back.
// Anything big enough to block a TV camera is recorded as an occluder, so the replay
// director can pick shots that can actually see the cars.

const THREE = globalThis.THREE;

export function canvasTexture(w, h, draw){
	const c = document.createElement("canvas");
	c.width = w; c.height = h;
	draw(c.getContext("2d"), w, h);
	return new THREE.CanvasTexture(c);
}

// ---------- Geometry: boxes, gable roofs and flat quads merged into one mesh ----------
// Material slots: 0 walls with windows, 1 plain colour, 2 billboards.
const WIN = 0, PLAIN = 1, ADS = 2;
class Builder {
	constructor(){ this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [[], [], []]; this.c = new THREE.Color(); }
	// One flat polygon (3 or 4 points, counter-clockwise seen from the front).
	poly(pts, color, slot = PLAIN, uvs){
		const base = this.pos.length / 3;
		const [a, b, c] = pts;
		const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
		this.c.set(color);
		pts.forEach((p, k) => {
			this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(this.c.r, this.c.g, this.c.b);
			this.uv.push(uvs ? uvs[k * 2] : 0, uvs ? uvs[k * 2 + 1] : 0);
		});
		this.idx[slot].push(base, base + 1, base + 2);
		if(pts.length === 4) this.idx[slot].push(base, base + 2, base + 3);
	}
	// Box standing on y (bottom) at world (x, z), turned by ry. w runs along local x, d along local z.
	// win: [cellWidth, cellHeight] puts windows on the sides. top: roof colour. skip: faces to leave off.
	box(o){
		const { x, z, w, d, h, color } = o, y0 = o.y || 0, y1 = y0 + h, cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const hw = w / 2, hd = d / 2;
		const side = (ax, az, bx, bz, len, name) => {
			if(o.skip && o.skip.includes(name)) return;
			const pts = [P(ax, y0, az), P(bx, y0, bz), P(bx, y1, bz), P(ax, y1, az)];
			if(o.win){
				const [cw, ch] = o.win, u = len / cw;
				this.poly(pts, color, WIN, [0, y0 / ch, u, y0 / ch, u, y1 / ch, 0, y1 / ch]);
			}else this.poly(pts, color);
		};
		side(-hw, hd, hw, hd, w, "front");     // +z
		side(hw, -hd, -hw, -hd, w, "back");    // -z
		side(hw, hd, hw, -hd, d, "right");     // +x
		side(-hw, -hd, -hw, hd, d, "left");    // -x
		if(!(o.skip && o.skip.includes("top"))) this.poly([P(-hw, y1, -hd), P(-hw, y1, hd), P(hw, y1, hd), P(hw, y1, -hd)], o.top ?? color);
		if(o.bottom) this.poly([P(-hw, y0, -hd), P(hw, y0, -hd), P(hw, y0, hd), P(-hw, y0, hd)], color);
	}
	// Gable roof on a w x d base at height y, ridge along local x.
	roof(o){
		const { x, z, w, d, h, color } = o, y0 = o.y, y1 = y0 + h, cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const hw = w / 2, hd = d / 2;
		this.poly([P(-hw, y0, hd), P(hw, y0, hd), P(hw, y1, 0), P(-hw, y1, 0)], color);
		this.poly([P(hw, y0, -hd), P(-hw, y0, -hd), P(-hw, y1, 0), P(hw, y1, 0)], color);
		this.poly([P(hw, y0, hd), P(hw, y0, -hd), P(hw, y1, 0)], o.gable ?? color);
		this.poly([P(-hw, y0, -hd), P(-hw, y0, hd), P(-hw, y1, 0)], o.gable ?? color);
	}
	// Upright billboard facing local +z, showing board `n` of the ads atlas.
	board(o, n){
		const { x, z, w, h } = o, y0 = o.y, cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const col = n % AD_COLS, row = Math.floor(n / AD_COLS) % AD_ROWS;
		const u0 = col / AD_COLS, u1 = (col + 1) / AD_COLS, v1 = 1 - row / AD_ROWS, v0 = 1 - (row + 1) / AD_ROWS;
		this.poly([P(-w / 2, y0, 0.01), P(w / 2, y0, 0.01), P(w / 2, y0 + h, 0.01), P(-w / 2, y0 + h, 0.01)], 0xffffff, ADS, [u0, v0, u1, v0, u1, v1, u0, v1]);
	}
	get empty(){ return !this.pos.length; }
	build(){
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		const all = [];
		this.idx.forEach((list, slot) => { if(list.length){ g.addGroup(all.length, list.length, slot); all.push(...list); } });
		g.setIndex(all);
		return g;
	}
}

// ---------- Things that block the view (for the TV director) ----------
export class Occluders {
	constructor(){ this.cell = 16; this.cells = new Map(); this.count = 0; }
	// Oriented box: centre x/z, turn ry, half-sizes hw (local x) and hd (local z), heights y0..y1.
	add(o){
		o.cs = Math.cos(o.ry || 0); o.sn = Math.sin(o.ry || 0);
		const r = Math.hypot(o.hw, o.hd), C = this.cell;
		for(let cx = Math.floor((o.x - r) / C); cx <= Math.floor((o.x + r) / C); cx++)
			for(let cz = Math.floor((o.z - r) / C); cz <= Math.floor((o.z + r) / C); cz++){
				const k = cx + "," + cz;
				if(!this.cells.has(k)) this.cells.set(k, []);
				this.cells.get(k).push(o);
			}
		this.count++;
	}
	hit(x, y, z){
		const list = this.cells.get(Math.floor(x / this.cell) + "," + Math.floor(z / this.cell));
		if(!list) return false;
		for(const o of list){
			if(y < o.y0 || y > o.y1) continue;
			const dx = x - o.x, dz = z - o.z;
			const lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs;
			if(Math.abs(lx) < o.hw && Math.abs(lz) < o.hd) return true;
		}
		return false;
	}
	// Is the straight line from a to b clear? The last couple of units (the car itself) don't count.
	clear(ax, ay, az, bx, by, bz){
		const len = Math.hypot(bx - ax, by - ay, bz - az);
		const steps = Math.ceil(len / 1.2);
		for(let k = 1; k < steps; k++){
			const t = k / steps;
			if(len * (1 - t) < 2.5) break;
			if(this.hit(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return false;
		}
		return true;
	}
}

// ---------- Room around the road ----------
function makeSpace(track){
	const c = track.center, hw = c.hw, n = c.n;
	// Distance from (x, z) to the nearest road edge, looked for up to `reach` away.
	function edge(x, z, reach){
		let best = hw + reach;
		c.hash.near(x, z, hw + reach, j => { const d = Math.hypot(c.x[j] - x, c.z[j] - z); if(d < best) best = d; });
		return best - hw;
	}
	const C = 12, taken = new Map();
	const cellsOf = (x, z, r, fn) => {
		for(let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
			for(let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) fn(cx + "," + cz);
	};
	return {
		c, hw, n,
		wrap: i => ((i % n) + n) % n,
		edge,
		// A turned box with at least `m` of grass between it and any road.
		boxClear(x, z, ry, bw, bd, m){
			const cs = Math.cos(ry), sn = Math.sin(ry);
			const nu = Math.max(1, Math.ceil(bw / 2.5)), nv = Math.max(1, Math.ceil(bd / 2.5));
			for(let a = 0; a <= nu; a++) for(let b = 0; b <= nv; b++){
				const lx = (a / nu - 0.5) * bw, lz = (b / nv - 0.5) * bd;
				if(edge(x + lx * cs + lz * sn, z - lx * sn + lz * cs, m + 1) < m) return false;
			}
			return true;
		},
		// Is a circle free of everything already placed (except pieces of the same group)?
		free(x, z, r, group){
			let ok = true;
			cellsOf(x, z, r, k => {
				if(!ok) return;
				for(const t of taken.get(k) || []) if(t.g !== group && Math.hypot(t.x - x, t.z - z) < t.r + r){ ok = false; return; }
			});
			return ok;
		},
		take(x, z, r, group){
			const t = { x, z, r, g: group };
			cellsOf(x, z, r, k => { if(!taken.has(k)) taken.set(k, []); taken.get(k).push(t); });
		},
		// Position and heading beside sample i on side s (+1 left, -1 right), `off` from the centreline.
		// Local +z faces the track, local +x runs along it.
		at(i, s, off){
			i = ((i % n) + n) % n;
			const ox = c.tz[i] * s, oz = -c.tx[i] * s;
			const ry = Math.atan2(-ox, -oz), cs = Math.cos(ry), sn = Math.sin(ry);
			const bx = c.x[i] + ox * off, bz = c.z[i] + oz * off;
			return { i, x: bx, z: bz, ry, cs, sn, local: (lx, lz) => [bx + lx * cs + lz * sn, bz - lx * sn + lz * cs] };
		},
		// Average |curvature| over i-w..i+w.
		bend(i, w){ let s = 0; for(let k = -w; k <= w; k++) s += Math.abs(c.curv[((i + k) % n + n) % n]); return s / (2 * w + 1); }
	};
}

// ---------- Textures ----------
const AD_COLS = 2, AD_ROWS = 8;
const ADS_TEXT = [
	["GRAND PRIX", "#e23b3b", "#fff"], ["BVS RACING", "#1f4fbf", "#fff"], ["FULL THROTTLE", "#111418", "#f4c542"], ["APEX ENERGY", "#3ddc84", "#08140c"],
	["TURBO COLA", "#c8102e", "#fff"], ["NITRO TYRES", "#f4c542", "#111"], ["SLIPSTREAM", "#2580db", "#fff"], ["PIT LANE PIZZA", "#f48342", "#1b0e04"],
	["POLE POSITION", "#fff", "#111"], ["BOX BOX", "#a95cff", "#fff"], ["CHEQUERED", "#111", "#fff"], ["KERB APPEAL", "#e23b3b", "#fff"],
	["LAP ONE FUEL", "#0e7c86", "#fff"], ["PODIUM", "#f4f6fa", "#c8102e"], ["GRID GARAGE", "#2a2f3d", "#7ad7ff"], ["DRIFT KING", "#ff5ea8", "#fff"]
];
function adsTexture(){
	return canvasTexture(1024, 512, (g, W, H) => {
		const bw = W / AD_COLS, bh = H / AD_ROWS;
		ADS_TEXT.forEach(([text, bg, fg], k) => {
			const x = (k % AD_COLS) * bw, y = Math.floor(k / AD_COLS) * bh;
			g.fillStyle = bg; g.fillRect(x, y, bw, bh);
			g.fillStyle = fg; g.globalAlpha = 0.18; g.fillRect(x, y + bh - 8, bw, 8); g.globalAlpha = 1;
			g.font = `italic 900 ${Math.round(bh * 0.62)}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
			g.textAlign = "center"; g.textBaseline = "middle";
			g.fillText(text, x + bw / 2, y + bh / 2 + 2, bw - 24);
		});
	});
}
// Repeating 8 x 8 block of windows. Night: some windows lit (in the emissive map).
function windowTextures(night, glass){
	const cells = 8, px = 32;
	const lit = [];
	const map = canvasTexture(cells * px, cells * px, g => {
		for(let i = 0; i < cells; i++) for(let j = 0; j < cells; j++){
			g.fillStyle = "#ffffff"; g.fillRect(i * px, j * px, px, px);
			const on = night && Math.random() < 0.45;
			lit.push(on);
			g.fillStyle = night ? (on ? "#ffe2a0" : "#1c2230") : glass;
			g.fillRect(i * px + 7, j * px + 6, px - 14, px - 11);
			if(!night){ g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(i * px + 7, j * px + 6, 4, px - 11); }
		}
	});
	let emissive = null;
	if(night) emissive = canvasTexture(cells * px, cells * px, g => {
		g.fillStyle = "#000"; g.fillRect(0, 0, cells * px, cells * px);
		let k = 0;
		for(let i = 0; i < cells; i++) for(let j = 0; j < cells; j++) if(lit[k++]){ g.fillStyle = "#ffcf7a"; g.fillRect(i * px + 7, j * px + 6, px - 14, px - 11); }
	});
	for(const t of [map, emissive]) if(t){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / cells, 1 / cells); }
	return { map, emissive };
}

// ---------- Fans ----------
// Two instanced meshes (bodies in shirt colours, heads in skin tones). A little vertex
// shader makes some of them jump, more when the crowd is excited.
const SHIRTS = [0xc94a44, 0xe9ecf1, 0xe0b84a, 0x3f78c4, 0xdd8a52, 0x5bb07a, 0x2b2f38, 0x44506a, 0x9aa3b2, 0x7a3b52, 0xc8102e, 0x2d5aa8, 0x3a3f4c, 0xe9ecf1];
const SKIN = [0xf1c7a5, 0xe0a97e, 0xc68642, 0x8d5524, 0xffdbb4, 0xa56b46];
function crowdMaterial(uniforms, color){
	const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
	m.onBeforeCompile = sh => {
		sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uExcite = uniforms.uExcite;
		sh.vertexShader = "uniform float uTime;\nuniform float uExcite;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
			#ifdef USE_INSTANCING
				float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 2.11;
				float keen = step(1.0 - uExcite, fract(ph * 0.618));
				transformed.y += max(0.0, sin(uTime * 9.0 + ph * 3.0)) * 0.32 * keen;
				transformed.x += sin(uTime * 2.3 + ph) * 0.04;
			#endif`);
	};
	return m;
}

// ---------- Build ----------
// ctx: { group, keep(disposable), shadows, quality, rand }
export function buildScenery(track, theme, ctx){
	const { group, keep, shadows, rand } = ctx;
	const occ = new Occluders();
	const updaters = [];
	const crowdU = { uTime: { value: 0 }, uExcite: { value: 0.25 } };
	let excite = 0.25;
	const api = { occluders: occ, updaters, cheer(v){ excite = Math.max(excite, v); } };
	updaters.push(dt => {
		crowdU.uTime.value += dt;
		excite += (0.25 - excite) * Math.min(1, dt * 0.35);
		crowdU.uExcite.value = excite;
	});
	if(!track.center) return api;

	const sp = makeSpace(track);
	const { c, hw, n } = sp;
	const low = ctx.quality === "low";
	const B = new Builder();
	const people = [];   // { x, y, z, ry }
	const fill = low ? 0.4 : 0.85;
	const standColor = theme.standColor ?? 0x2f63c9;

	// --- The start straight: how far it runs each way before the first real corner.
	let s0 = 0, s1 = 0;
	while(s0 > -70 && sp.bend(s0 - 1, 3) < 1 / 90) s0--;
	while(s1 < 80 && sp.bend(s1 + 1, 3) < 1 / 90) s1++;
	// Short or curved start: still try a stretch around the line; pieces that don't fit are skipped.
	s0 = Math.min(s0, -35); s1 = Math.max(s1, 45);

	// Which side has more room for the pits? The other side gets the main grandstand.
	const roomOn = s => { let k = 0; for(let i = s0; i <= s1; i += 7){ const f = sp.at(i, s, hw + 11.5); if(sp.boxClear(f.x, f.z, f.ry, 7, 10, 1)) k++; } return k; };
	const pitSide = roomOn(-1) >= roomOn(1) ? -1 : 1;

	// --- Pit building: garages with team stripes, glass hospitality floor above, pit lane in front.
	const TEAM = [0xff8000, 0xdc0000, 0x1e41ff, 0x00d2be, 0x006f62, 0x0090ff, 0x005aff, 0x6692ff, 0xb6babd, 0x52e252, 0x2a2e38];
	let garages = 0;
	for(let i = s0 + 4; i <= s1 - 4; i += 7){
		const f = sp.at(i, pitSide, hw + 7);
		const [cx, cz] = f.local(0, -4.5);
		if(!sp.boxClear(cx, cz, f.ry, 7.2, 9.6, 1.2)) continue;
		const team = TEAM[garages % TEAM.length];
		B.box({ x: cx, z: cz, w: 7.05, d: 9, h: 5, ry: f.ry, color: 0xe9edf2, top: 0xb9c0c9 });
		const [dx, dz] = f.local(0, 0.02);
		B.box({ x: dx, z: dz, w: 5.2, d: 0.08, h: 3.7, ry: f.ry, color: 0x23262e });
		const [sx, sz] = f.local(0, 0.05);
		B.box({ x: sx, z: sz, y: 4.05, w: 6.4, d: 0.12, h: 0.55, ry: f.ry, color: team });
		// Hospitality floor, set back, with a glass front.
		const [ux, uz] = f.local(0, -6);
		B.box({ x: ux, z: uz, y: 5, w: 7.05, d: 6, h: 3.4, ry: f.ry, color: 0xd9dee5, top: 0x8d939e, win: [2.2, 3.4], skip: ["left", "right"] });
		// Pit lane: tarmac and a white line.
		const [px, pz] = f.local(0, 3.3);
		B.box({ x: px, z: pz, y: 0, w: 7.05, d: 6.4, h: 0.03, ry: f.ry, color: theme.road ?? 0x41444b });
		const [lx, lz] = f.local(0, 0.6);
		B.box({ x: lx, z: lz, y: 0.03, w: 7.05, d: 0.18, h: 0.01, ry: f.ry, color: 0xe9edf2 });
		occ.add({ x: cx, z: cz, ry: f.ry, hw: 3.6, hd: 4.5, y0: 0, y1: 8.4 });
		sp.take(cx, cz, 5.5, "pits");
		garages++;
	}
	// Race control tower at the end of the pit building.
	if(garages > 4){
		const f = sp.at(s1 - 2, pitSide, hw + 12);
		if(sp.boxClear(f.x, f.z, f.ry, 7, 7, 1) && sp.free(f.x, f.z, 4.5, "pits")){
			B.box({ x: f.x, z: f.z, w: 5.5, d: 5.5, h: 13, ry: f.ry, color: 0xe9edf2, win: [1.8, 3.2], top: 0x2a2e38 });
			B.box({ x: f.x, z: f.z, y: 13, w: 7, d: 7, h: 3, ry: f.ry, color: 0x2a2e38, win: [1.4, 3] });
			occ.add({ x: f.x, z: f.z, ry: f.ry, hw: 3.5, hd: 3.5, y0: 0, y1: 16 });
			sp.take(f.x, f.z, 5, "pits");
		}
	}

	// --- Grandstands: stepped seating facing the track, a roof, and fans in the seats.
	const ROWS = 7, ROW_D = 1.3, ROW_H = 0.72, SEG = 8;
	function stand(from, to, s, group){
		let made = 0;
		for(let i = from; i <= to; i += SEG){
			const f = sp.at(i, s, hw + 3.2);
			const depth = ROWS * ROW_D + 0.6;
			const [cx, cz] = f.local(0, -depth / 2);
			if(!sp.boxClear(cx, cz, f.ry, SEG, depth, 1.2) || !sp.free(cx, cz, SEG * 0.7, group)) continue;
			for(let r = 0; r < ROWS; r++){
				const [rx, rz] = f.local(0, -(r + 0.5) * ROW_D);
				const top = 0.5 + (r + 1) * ROW_H;
				B.box({ x: rx, z: rz, w: SEG + 0.02, d: ROW_D, h: top, ry: f.ry, color: r % 2 ? 0x9aa1ab : 0x8d939e, top: standColor, skip: ["back"] });
				for(let k = 0; k < 11; k++){
					if(rand() > fill) continue;
					const [qx, qz] = f.local(-SEG / 2 + 0.4 + k * (SEG - 0.8) / 10 + (rand() - 0.5) * 0.15, -(r + 0.5) * ROW_D - 0.1);
					people.push({ x: qx, y: top, z: qz, ry: f.ry + (rand() - 0.5) * 0.5 });
				}
			}
			const backZ = -ROWS * ROW_D - 0.2, topY = 0.5 + ROWS * ROW_H;
			const [bx, bz] = f.local(0, backZ);
			B.box({ x: bx, z: bz, w: SEG + 0.02, d: 0.4, h: topY + 3.4, ry: f.ry, color: 0xb9c0c9 });
			const [rx, rz] = f.local(0, -depth / 2 - 0.2);
			B.box({ x: rx, z: rz, y: topY + 3.2, w: SEG + 0.3, d: depth + 0.8, h: 0.35, ry: f.ry, color: 0xe9edf2, top: 0xf4f6fa, bottom: true });
			// Front wall with the stand colour.
			const [wx, wz] = f.local(0, 0.1);
			B.box({ x: wx, z: wz, w: SEG + 0.02, d: 0.2, h: 1.1, ry: f.ry, color: standColor });
			occ.add({ x: cx, z: cz, ry: f.ry, hw: SEG / 2, hd: depth / 2, y0: 0, y1: topY + 3.6 });
			sp.take(cx, cz, SEG * 0.7, group);
			made++;
		}
		return made;
	}
	const mainStand = stand(Math.max(s0 + 6, -40), Math.min(s1 - 6, 56), -pitSide, "main");
	// Corner stands on the outside of the tightest corners.
	const corners = [];
	for(let i = 0; i < n; i += 3){
		const b = Math.abs(c.curv[i]);
		if(b < 1 / 60) continue;
		if(sp.bend(i, 2) < sp.bend(i - 3, 2) || sp.bend(i, 2) < sp.bend(i + 3, 2)) continue;
		corners.push({ i, b });
	}
	corners.sort((a, b) => b.b - a.b);
	const chosen = [];
	const farFrom = (i, list, d) => list.every(j => Math.min(Math.abs(i - j), n - Math.abs(i - j)) > d);
	for(const k of corners){
		if(chosen.length >= (theme.grandstand ?? 2)) break;
		if(!farFrom(k.i, [0], 90) || !farFrom(k.i, chosen, 140)) continue;
		const outside = c.curv[k.i] > 0 ? -1 : 1;
		if(stand(k.i - 20, k.i + 20, outside, "corner" + k.i) >= 2) chosen.push(k.i);
	}
	// Fans standing on the grass behind a fence at other corners.
	if(theme.fans !== false){
		let banks = 0;
		for(const k of corners){
			if(banks >= 4) break;
			if(!farFrom(k.i, chosen, 60) || !farFrom(k.i, [0], 60)) continue;
			const outside = c.curv[k.i] > 0 ? -1 : 1;
			let placed = 0;
			for(let i = k.i - 18; i <= k.i + 18; i += 3){
				const f = sp.at(i, outside, hw + 4.5);
				if(!sp.boxClear(f.x, f.z, f.ry, 3.2, 4.5, 1.5) || !sp.free(f.x, f.z, 2.4, "bank" + k.i)) continue;
				const [fx, fz] = f.local(0, 2.2);
				B.box({ x: fx, z: fz, w: 3.05, d: 0.06, h: 1.1, ry: f.ry, color: 0xf48342 });
				for(let q = 0; q < 6; q++){
					if(rand() > fill) continue;
					const [qx, qz] = f.local((rand() - 0.5) * 2.8, 1.5 - rand() * 3.5);
					people.push({ x: qx, y: 0, z: qz, ry: f.ry + (rand() - 0.5) * 0.8 });
				}
				sp.take(f.x, f.z, 2.4, "bank" + k.i);
				placed++;
			}
			if(placed > 3) banks++;
		}
	}

	// --- Billboards along the straights, just behind the barriers.
	for(let i = 0; i < n; i += 9){
		if(Math.abs(i) < 14 || n - i < 14) continue;
		if(sp.bend(i, 6) > 1 / 220) continue;
		const s = (i / 9) % 2 ? 1 : -1;
		const f = sp.at(i, s, hw + 0.9);
		const [bx, bz] = f.local(0, -0.1);
		if(!sp.boxClear(bx, bz, f.ry, 8.4, 0.6, 0.6) || !sp.free(bx, bz, 4.2, "ads")) continue;
		B.board({ x: bx, z: bz, y: 0.35, w: 8, h: 1.2, ry: f.ry }, Math.floor(rand() * ADS_TEXT.length));
		const [kx, kz] = f.local(0, -0.18);
		B.box({ x: kx, z: kz, w: 8, d: 0.12, h: 1.6, ry: f.ry, color: 0x2a2e38 });
		sp.take(bx, bz, 4.2, "ads");
	}

	// --- A bridge over a straight, away from the start.
	let bridge = null;
	const from = Math.floor(n * (0.25 + rand() * 0.2));
	for(let tries = 0; tries < n * 0.5 && !bridge; tries += 5){
		const i = (from + tries) % n;
		if(Math.min(i, n - i) < 80 || sp.bend(i, 10) > 1 / 160) continue;
		const L = sp.at(i, 1, hw + 2.4), R = sp.at(i, -1, hw + 2.4);
		if(!sp.boxClear(L.x, L.z, L.ry, 2.4, 2.4, 1) || !sp.boxClear(R.x, R.z, R.ry, 2.4, 2.4, 1)) continue;
		// No other road under the deck either.
		let ok = true;
		for(let o = -hw - 2; o <= hw + 2 && ok; o += 1.5){
			const p = sp.at(i, 1, o);
			c.hash.near(p.x, p.z, 3, j => { if(Math.min(Math.abs(j - i), n - Math.abs(j - i)) > 20 && Math.hypot(c.x[j] - p.x, c.z[j] - p.z) < 3) ok = false; });
		}
		if(ok && sp.free(L.x, L.z, 2, "bridge") && sp.free(R.x, R.z, 2, "bridge")) bridge = { i, L, R };
	}
	if(bridge){
		const { i, L, R } = bridge;
		for(const p of [L, R]){
			B.box({ x: p.x, z: p.z, w: 1.6, d: 1.6, h: 6.2, ry: p.ry, color: 0xb9c0c9 });
			occ.add({ x: p.x, z: p.z, ry: p.ry, hw: 0.8, hd: 0.8, y0: 0, y1: 6.2 });
			sp.take(p.x, p.z, 1.5, "bridge");
		}
		const mid = sp.at(i, 1, 0), span = (hw + 3.4) * 2;
		// Deck runs across the track: local z of the frame on the left side points across it.
		B.box({ x: mid.x, z: mid.z, y: 6.2, w: 2.6, d: span, h: 0.7, ry: mid.ry, color: 0x2a2e38, bottom: true });
		for(const side of [-1, 1]){
			const [bx, bz] = mid.local(side * 1.36, 0), [fx, fz] = mid.local(side * 1.42, 0);
			const face = mid.ry + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
			B.board({ x: fx, z: fz, y: 6.9, w: span * 0.8, h: 1.3, ry: face }, 0);
			B.box({ x: bx, z: bz, y: 6.9, w: 0.1, d: span, h: 1.3, ry: mid.ry, color: 0xe9edf2 });
		}
		occ.add({ x: mid.x, z: mid.z, ry: mid.ry, hw: 1.3, hd: span / 2, y0: 6.2, y1: 8.3 });
	}

	// --- City blocks (Monaco, Jeddah) from the scenery spots near the road.
	const spots = (track.scenery || []).slice().sort((a, b) => a.off - b.off);
	const used = new Set();
	const bdef = theme.buildings;
	if(bdef){
		for(const s of spots){
			if(s.off > 46 || s.r > bdef.density) continue;
			const tall = bdef.night ? 22 + s.r2 * 70 : 9 + s.r2 * 18;
			const w = 9 + s.r * 9, d = 8 + s.r2 * 7;
			const ry = s.face;                     // front towards the road
			const m = bdef.night ? 4 : 3;
			if(!sp.boxClear(s.x, s.z, ry, w, d, m)) continue;
			const r = Math.hypot(w, d) / 2;
			const id = "bld" + used.size;
			if(!sp.free(s.x, s.z, r * 0.92, id)) continue;
			const color = bdef.palette[Math.floor(s.r2 * 97) % bdef.palette.length];
			const floor = bdef.night ? 3.2 : 3;
			const h = Math.round(tall / floor) * floor;
			if(bdef.night){
				// Glass towers, some with a slimmer top section.
				const step = s.r > 0.55 ? h * 0.65 : h;
				B.box({ x: s.x, z: s.z, w, d, h: step, ry, color, win: [2.2, floor], top: 0x1a1d25 });
				if(step < h) B.box({ x: s.x, z: s.z, y: step, w: w * 0.7, d: d * 0.7, h: h - step, ry, color, win: [2.2, floor], top: 0x1a1d25 });
				if(s.r2 > 0.6) B.box({ x: s.x, z: s.z, y: h, w: 0.3, d: 0.3, h: 8, ry, color: 0xff3b3b });
			}else{
				// Pastel apartments: shops at street level, balconies, terracotta or flat roofs.
				B.box({ x: s.x, z: s.z, w, d, h, ry, color, win: [2.4, floor], top: 0xc9b9a3 });
				const [gx, gz] = [s.x, s.z];
				B.box({ x: gx, z: gz, w: w + 0.2, d: d + 0.2, h: 2.6, ry, color: 0x6b5a4a, skip: ["top"] });
				const cs = Math.cos(ry), sn = Math.sin(ry);
				for(let y = floor + 0.2; y < h - 1; y += floor){
					if(s.r > 0.5) B.box({ x: s.x + (d / 2 + 0.35) * sn, z: s.z + (d / 2 + 0.35) * cs, y, w: w * 0.8, d: 0.7, h: 0.18, ry, color: 0xf4f6fa });
				}
				if(s.r2 < 0.55) B.roof({ x: s.x, z: s.z, y: h, w: w + 0.6, d: d + 0.6, h: 2.6, ry, color: 0xc0623a, gable: color });
				else B.box({ x: s.x, z: s.z, y: h, w: w * 0.3, d: d * 0.3, h: 1.4, ry, color: 0xb9c0c9 });
			}
			occ.add({ x: s.x, z: s.z, ry, hw: w / 2, hd: d / 2, y0: 0, y1: h + 3 });
			sp.take(s.x, s.z, r * 0.92, id);
			used.add(s);
		}
	}

	// Merge everything built so far into one mesh.
	if(!B.empty){
		const glass = bdef && bdef.night ? "#1c2230" : "#6f8aa6";
		const win = windowTextures(bdef && bdef.night, glass);
		keep(win.map); if(win.emissive) keep(win.emissive);
		const ads = keep(adsTexture());
		ads.anisotropy = 4;
		const mats = [
			keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: win.map, emissive: win.emissive ? 0xffffff : 0x000000, emissiveMap: win.emissive || null })),
			keep(new THREE.MeshLambertMaterial({ vertexColors: true })),
			keep(new THREE.MeshLambertMaterial({ map: ads, emissive: theme.night ? 0x555555 : 0x000000, emissiveMap: theme.night ? ads : null, side: THREE.DoubleSide }))
		];
		const mesh = new THREE.Mesh(keep(B.build()), mats);
		mesh.castShadow = mesh.receiveShadow = shadows;
		group.add(mesh);
	}

	// --- Fans.
	if(people.length){
		const body = keep(new THREE.BoxBufferGeometry(0.36, 0.72, 0.26)); body.translate(0, 0.36, 0);
		const head = keep(new THREE.BoxBufferGeometry(0.24, 0.24, 0.24)); head.translate(0, 0.86, 0);
		const mk = (geo, palette) => {
			const mesh = new THREE.InstancedMesh(geo, keep(crowdMaterial(crowdU)), people.length);
			const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
			people.forEach((f, k) => {
				e.set(0, f.ry, 0); q.setFromEuler(e); p.set(f.x, f.y, f.z);
				m.compose(p, q, one); mesh.setMatrixAt(k, m);
				col.set(palette[Math.floor(Math.abs(Math.sin(k * 12.9898 + (palette === SKIN ? 3.1 : 0)) * 43758.5)) % palette.length]);
				mesh.setColorAt(k, col);
			});
			mesh.frustumCulled = false;
			return mesh;
		};
		group.add(mk(body, SHIRTS), mk(head, SKIN));
	}

	// --- Trees, only where their branches stay well clear of the road and of everything else.
	const kind = theme.trees;
	if(kind && kind !== "none" && kind !== "classic"){
		const tl = [];
		const lowQ = low ? 0.5 : 1;
		for(const s of spots){
			if(used.has(s) || s.r2 >= (theme.treeDensity ?? 0) * 0.8 * lowQ) continue;
			const scale = 0.75 + s.r * 0.8;
			const crownR = (kind === "palm" ? 3.2 : kind === "round" || kind === "sakura" ? 3.4 : 3.4) * scale;
			if(sp.edge(s.x, s.z, crownR + 3) < crownR + 1.8) continue;
			if(!sp.free(s.x, s.z, crownR * 0.6, "trees")) continue;
			sp.take(s.x, s.z, crownR * 0.6, "trees");
			tl.push({ x: s.x, z: s.z, s: scale, ry: s.r2 * 6, r: crownR, k: s.r });
		}
		buildTrees(kind, tl, theme, { group, keep, shadows, rand, occ });
	}

	api.info = { straight: [s0, s1], garages, mainStand, cornerStands: chosen.length, fans: people.length, bridge: !!bridge, buildings: used.size };
	api.corners = chosen;
	api.pitSide = pitSide;
	api.clearOfRoad = (x, z, m) => sp.edge(x, z, m + 1) >= m;
	return api;
}

// Low-poly trees with a little colour variety.
function buildTrees(kind, list, theme, { group, keep, shadows, rand, occ }){
	if(!list.length) return;
	const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
	const crownMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
	const vary = (hex, amt) => { const col = new THREE.Color(hex); const hsl = {}; col.getHSL(hsl); col.setHSL(hsl.h + (rand() - 0.5) * 0.04, hsl.s, Math.max(0, Math.min(1, hsl.l + (rand() - 0.5) * amt))); return col.getHex(); };
	const inst = (geo, mat, items) => {
		const mesh = new THREE.InstancedMesh(geo, mat, items.length);
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
		items.forEach((t, k) => {
			e.set(t.rx || 0, t.ry || 0, t.rz || 0); q.setFromEuler(e); p.set(t.x, t.y || 0, t.z); s.set(t.s, t.sy ?? t.s, t.s);
			m.compose(p, q, s); mesh.setMatrixAt(k, m);
			if(t.color !== undefined){ col.set(t.color); mesh.setColorAt(k, col); }
		});
		mesh.castShadow = mesh.receiveShadow = shadows;
		mesh.frustumCulled = false;   // r128 culls instances by the first one's bounds
		group.add(mesh);
	};
	let trunkH;
	if(kind === "palm"){
		trunkH = 9;
		// A slightly leaning trunk and a crown of drooping fronds.
		const trunk = keep(new THREE.CylinderBufferGeometry(0.22, 0.42, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
		const b = new Builder();
		for(let k = 0; k < 8; k++){
			const a = k / 8 * Math.PI * 2 + (k % 2) * 0.2;
			const cs = Math.cos(a), sn = Math.sin(a), len = 4.2, droop = -1.6;
			const P = (r, y, w) => [r * cs - w * sn, trunkH + y, r * sn + w * cs];
			b.poly([P(0, 0.2, -0.25), P(len, droop, -0.55), P(len, droop, 0.55), P(0, 0.2, 0.25)], 0xffffff);
			b.poly([P(0, 0.2, 0.25), P(len, droop, 0.55), P(len, droop, -0.55), P(0, 0.2, -0.25)], 0xffffff);
			b.poly([P(len, droop, -0.55), P(len + 1.2, droop - 1.1, 0), P(len, droop, 0.55)], 0xffffff);
			b.poly([P(len, droop, 0.55), P(len + 1.2, droop - 1.1, 0), P(len, droop, -0.55)], 0xffffff);
		}
		const crown = keep(b.build());
		const lean = list.map(t => Object.assign({}, t, { rx: (t.k - 0.5) * 0.12, rz: (t.k - 0.3) * 0.1 }));
		inst(trunk, trunkMat, lean);
		inst(crown, crownMat, lean.map(t => Object.assign({}, t, { color: vary(theme.night ? 0x1e4a2c : 0x2f7d3a, 0.12) })));
	}else if(kind === "round" || kind === "sakura"){
		trunkH = 3;
		const trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.5, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
		const crown = keep(new THREE.IcosahedronBufferGeometry(3.2, 0)); crown.translate(0, trunkH + 2.3, 0);
		const top = keep(new THREE.IcosahedronBufferGeometry(2.2, 0)); top.translate(0.6, trunkH + 4.4, -0.4);
		const base = t => kind === "sakura" ? (t.k < 0.65 ? 0xf6a9c6 : t.k < 0.82 ? 0xfbd3e2 : 0x4d8f3c) : (t.k < 0.5 ? 0x3d7f2c : 0x4f9435);
		inst(trunk, trunkMat, list);
		inst(crown, crownMat, list.map(t => Object.assign({}, t, { color: vary(base(t), 0.1) })));
		inst(top, crownMat, list.map(t => Object.assign({}, t, { color: vary(base(t), 0.14) })));
	}else{
		trunkH = 2.5;
		const trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.45, trunkH, 6)); trunk.translate(0, trunkH / 2, 0);
		const lower = keep(new THREE.ConeBufferGeometry(3.4, 6.5, 7)); lower.translate(0, trunkH + 3, 0);
		const upper = keep(new THREE.ConeBufferGeometry(2.5, 5.5, 7)); upper.translate(0, trunkH + 6.8, 0);
		const green = kind === "snowpine" ? 0x2f5a44 : 0x24532e;
		inst(trunk, trunkMat, list);
		inst(lower, crownMat, list.map(t => Object.assign({}, t, { sy: t.s * (0.9 + t.k * 0.4), color: vary(green, 0.08) })));
		inst(upper, crownMat, list.map(t => Object.assign({}, t, { sy: t.s * (0.9 + t.k * 0.4), color: vary(green, 0.1) })));
		if(kind === "snowpine"){
			const cap = keep(new THREE.ConeBufferGeometry(1.6, 3, 7)); cap.translate(0, trunkH + 8.3, 0);
			inst(cap, keep(new THREE.MeshLambertMaterial({ color: 0xf4f8fb })), list.map(t => Object.assign({}, t, { sy: t.s * (0.9 + t.k * 0.4) })));
		}
	}
	// Crowns block the view; trunks are thin enough to see past.
	for(const t of list){
		const top = kind === "palm" ? (trunkH + 0.5) * t.s : kind === "round" || kind === "sakura" ? (trunkH + 6.4) * t.s : (trunkH + 9.5) * t.s * (0.9 + t.k * 0.4);
		const bottom = kind === "palm" ? (trunkH - 2) * t.s : trunkH * t.s * 0.7;
		occ.add({ x: t.x, z: t.z, ry: 0, hw: t.r * 0.72, hd: t.r * 0.72, y0: bottom, y1: top });
	}
}
