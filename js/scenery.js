// Everything around a circuit that isn't the road: the pit building, grandstands full
// of fans, billboards, a bridge, city blocks and trees.
//
// Every piece is checked against the whole road, not just the stretch it was placed
// beside, so nothing pokes onto the track at hairpins or where the circuit doubles back.
// Anything big enough to block a TV camera is recorded as an occluder, so the replay
// director can pick shots that can actually see the cars.

import { TUNNEL_WALL } from "./terrain.js";
import { inPoly } from "./placegeo.js";
import { buildLandscape } from "./landscape.js";
import { buildTrackside } from "./trackside.js";
import { AD_COLS, AD_ROWS, AD_MONTE_CARLO, AD_MONACO_GP, drawSponsors, sponsorsFor, bridgeSponsor } from "./sponsors.js";
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
	constructor(){
		this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [[], [], []]; this.c = new THREE.Color();
		// Walls with windows are a little darker at the foot and lighter towards the top, as if the ground and the
		// street shaded them (baked into the vertex colours: free when drawing). 1 = none; box({ ao }) sets one wall.
		this.aoWalls = 0.76;
	}
	// One flat polygon (3 or 4 points, counter-clockwise seen from the front). shade: a brightness (0..1) for each point.
	poly(pts, color, slot = PLAIN, uvs, shade){
		const base = this.pos.length / 3;
		const [a, b, c] = pts;
		const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
		this.c.set(color);
		pts.forEach((p, k) => {
			const sh = shade ? shade[k] : 1;
			this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(this.c.r * sh, this.c.g * sh, this.c.b * sh);
			this.uv.push(uvs ? uvs[k * 2] : 0, uvs ? uvs[k * 2 + 1] : 0);
		});
		this.idx[slot].push(base, base + 1, base + 2);
		if(pts.length === 4) this.idx[slot].push(base, base + 2, base + 3);
	}
	// Box standing on y (bottom) at world (x, z), turned by ry. w runs along local x, d along local z.
	// win: [cellWidth, cellHeight] puts windows on the sides. top: roof colour. skip: faces to leave off.
	// On hilly circuits this.ground(x, z) gives the ground height. Heights (y) are above the
	// ground there, and anything standing on the ground reaches a little below it so a slope
	// never leaves a gap underneath.
	box(o){
		const g = this.ground ? this.ground(o.x, o.z) : 0, sink = this.ground && !o.y ? 3 : 0;
		const { x, z, w, d, color } = o, y0 = (o.y || 0) + g - sink, h = o.h + sink, y1 = y0 + h, cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const hw = w / 2, hd = d / 2;
		const side = (ax, az, bx, bz, len, name) => {
			if(o.skip && o.skip.includes(name)) return;
			const pts = [P(ax, y0, az), P(bx, y0, bz), P(bx, y1, bz), P(ax, y1, az)];
			if(o.win){
				const [cw, ch] = o.win, u = len / cw, k = o.ao ?? this.aoWalls;
				this.poly(pts, color, WIN, [0, y0 / ch, u, y0 / ch, u, y1 / ch, 0, y1 / ch], [k, k, 1, 1]);
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
		const { x, z, w, d, h, color } = o, y0 = o.y + (this.ground ? this.ground(o.x, o.z) : 0), y1 = y0 + h, cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const hw = w / 2, hd = d / 2;
		this.poly([P(-hw, y0, hd), P(hw, y0, hd), P(hw, y1, 0), P(-hw, y1, 0)], color);
		this.poly([P(hw, y0, -hd), P(-hw, y0, -hd), P(-hw, y1, 0), P(hw, y1, 0)], color);
		this.poly([P(hw, y0, hd), P(hw, y0, -hd), P(hw, y1, 0)], o.gable ?? color);
		this.poly([P(-hw, y0, -hd), P(-hw, y0, hd), P(-hw, y1, 0)], o.gable ?? color);
	}
	// Upright billboard facing local +z, showing board `n` of the ads atlas.
	board(o, n){
		const { x, z, w, h } = o, y0 = o.y + (this.ground ? this.ground(o.x, o.z) : 0), cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
		const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, z - lx * sn + lz * cs];
		const col = n % AD_COLS, row = Math.floor(n / AD_COLS) % AD_ROWS;
		const u0 = col / AD_COLS, u1 = (col + 1) / AD_COLS, v1 = 1 - row / AD_ROWS, v0 = 1 - (row + 1) / AD_ROWS;
		this.poly([P(-w / 2, y0, 0.01), P(w / 2, y0, 0.01), P(w / 2, y0 + h, 0.01), P(-w / 2, y0 + h, 0.01)], 0xffffff, ADS, [u0, v0, u1, v0, u1, v1, u0, v1]);
	}
	// A building from its outline (world x, z points), from y0 up h, windows on the walls.
	prism(pts, y0, h, color, win, top){
		let A = 0;
		for(let i = 0, j = pts.length - 1; i < pts.length; j = i++) A += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
		const p = A > 0 ? pts.slice().reverse() : pts, y1 = y0 + h;
		let u = 0;
		for(let i = 0; i < p.length; i++){
			const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const q = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
			if(win){ const [cw, ch] = win, k = this.aoWalls; this.poly(q, color, WIN, [u / cw, 0, (u + len) / cw, 0, (u + len) / cw, h / ch, u / cw, h / ch], [k, k, 1, 1]); }
			else this.poly(q, color);
			u += len;
		}
		this.flat(p, y1, top ?? color);
	}
	// A flat area (world x, z outline) at height y, facing up.
	flat(pts, y, color){
		const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
		for(const [a, b, c] of tris){
			const A = pts[a], Bp = pts[b], Cp = pts[c];
			// Upward normal: (b - a) x (c - a) must point +y.
			const ny = (Cp[0] - A[0]) * (Bp[1] - A[1]) - (Bp[0] - A[0]) * (Cp[1] - A[1]);
			const tri = [[A[0], y, A[1]], [Bp[0], y, Bp[1]], [Cp[0], y, Cp[1]]];
			this.poly(ny >= 0 ? tri : [tri[0], tri[2], tri[1]], color);
		}
	}
	get empty(){ return !this.pos.length; }
	build(){
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		// (One big index array; a real town can have millions of entries, too many to spread.)
		const total = this.idx.reduce((a, l) => a + l.length, 0), all = new (this.pos.length / 3 > 65535 ? Uint32Array : Uint16Array)(total);
		let at = 0;
		this.idx.forEach((list, slot) => { if(list.length){ g.addGroup(at, list.length, slot); all.set(list, at); at += list.length; } });
		g.setIndex(new THREE.BufferAttribute(all, 1));
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
		// (The rest of the venue's circuit counts as road too: see remnants.js.)
		if(track.remnantSpace) track.remnantSpace.near(x, z, hw + reach, p => { const d = Math.hypot(p.x - x, p.z - z); if(d < best) best = d; });
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
// The sponsor boards (made-up sound-alikes of real Grand Prix sponsors: js/sponsors.js).
function adsTexture(){
	return canvasTexture(2048, 1024, (g, W, H) => drawSponsors(g, W, H));
}
// Repeating 8 x 8 block of windows. The emissive map lights some of them up after dark.
function windowTextures(night, glass){
	const cells = 8, px = 32;
	const lit = [];
	const map = canvasTexture(cells * px, cells * px, g => {
		for(let i = 0; i < cells; i++) for(let j = 0; j < cells; j++){
			g.fillStyle = "#ffffff"; g.fillRect(i * px, j * px, px, px);
			const on = Math.random() < 0.45;
			lit.push(on);
			g.fillStyle = night ? (on ? "#ffe2a0" : "#1c2230") : glass;
			g.fillRect(i * px + 7, j * px + 6, px - 14, px - 11);
			if(!night){ g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(i * px + 7, j * px + 6, 4, px - 11); }
		}
	});
	const emissive = canvasTexture(cells * px, cells * px, g => {
		g.fillStyle = "#000"; g.fillRect(0, 0, cells * px, cells * px);
		let k = 0;
		for(let i = 0; i < cells; i++) for(let j = 0; j < cells; j++) if(lit[k++]){ g.fillStyle = "#ffcf7a"; g.fillRect(i * px + 7, j * px + 6, px - 14, px - 11); }
	});
	for(const t of [map, emissive]){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / cells, 1 / cells); }
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
	const G = ctx.groundAt || (() => 0);
	const B = new Builder();
	if(ctx.groundAt) B.ground = G;
	// Nothing inside a tunnel (between the barriers and its walls).
	const tn = track.features && track.features.tunnel;
	if(tn && c.h){
		const len = (tn[1] - tn[0] + n) % n;
		for(let k = -2; k <= len + 2; k += 2){
			const q = (tn[0] + k + n) % n;
			for(const side of [1, -1]) sp.take(c.x[q] + c.tz[q] * side * (hw + 1.2), c.z[q] - c.tx[q] * side * (hw + 1.2), 2.2, "tunnel");
		}
	}
	// Keep everything out of the harbour: mark its water as taken, and moor yachts along the quay.
	const hb = ctx.harbour;
	if(hb){
		const { minX, maxX, minZ, maxZ } = hb.box;
		for(let x = minX; x <= maxX; x += 6) for(let z = minZ; z <= maxZ; z += 6) if(hb.inside(x, z)) sp.take(x, z, 4.5, "harbour");
		// Moored stern-on to the quay in a row, with a second row of bigger ones further out.
		const yachts = [];
		const clear = (x, z, r) => yachts.every(y => Math.hypot(y.x - x, y.z - z) > y.len * 0.3 + r);
		for(let k = 2; k < hb.quay.length - 2; k++){
			const p = hb.quay[k], s = p.s, nx = c.tz[s] * hb.side, nz = -c.tx[s] * hb.side, ry = Math.atan2(nx, nz);
			for(const [row, len] of [[1.5, 5 + (k * 7) % 4], [22, 9 + (k * 3) % 7]]){
				const x = p.x + nx * (row + len / 2), z = p.z + nz * (row + len / 2);
				if(!hb.inside(x + nx * len / 2, z + nz * len / 2) || !hb.inside(x - nx * len / 2, z - nz * len / 2) || !clear(x, z, len * 0.3 + 0.8) || rand() < 0.35) continue;
				yachts.push({ x, z, ry, len });
			}
		}
		const seaY = G(1e6, 1e6) + 0.03;
		for(const y of yachts){
			const w = y.len * 0.32;
			B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) - 0.2, w, d: y.len, h: 1.2, ry: y.ry, color: 0xf6f7f9, bottom: true });
			B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) + 1, w: w * 0.7, d: y.len * 0.5, h: 0.9, ry: y.ry, color: 0xe3e8ee, top: 0x2c3440 });
			if(y.len > 11) B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) + 1.9, w: w * 0.5, d: y.len * 0.3, h: 0.7, ry: y.ry, color: 0xf6f7f9 });
		}
	}
	// Occluder heights are above the ground where they stand.
	const occ0 = occ;
	const place = o => { const g = G(o.x, o.z); o.y0 += g; o.y1 += g; occ0.add(o); };
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
	// On an oval the pits are in the infield, as at the real speedways.
	let turning = 0;
	for(let i = 0; i < n; i++) turning += c.curv[i];
	const pitSide = track.def && track.def.kind === "oval" ? (turning > 0 ? 1 : -1) : roomOn(-1) >= roomOn(1) ? -1 : 1;

	// --- Pit building: garages with team stripes, glass hospitality floor above, pit lane in front.
	const TEAM = [0xff8000, 0xdc0000, 0x1e41ff, 0x00d2be, 0x006f62, 0x0090ff, 0x005aff, 0x6692ff, 0xb6babd, 0x52e252, 0x2a2e38];
	let garages = 0;
	const garageFrames = [];      // where each garage stands (for the flags and tents that go with them: trackside.js)
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
		place({ x: cx, z: cz, ry: f.ry, hw: 3.6, hd: 4.5, y0: 0, y1: 8.4 });
		sp.take(cx, cz, 5.5, "pits");
		garages++;
		garageFrames.push(f);
	}
	// Race control tower at the end of the pit building.
	if(garages > 4){
		const f = sp.at(s1 - 2, pitSide, hw + 12);
		if(sp.boxClear(f.x, f.z, f.ry, 7, 7, 1) && sp.free(f.x, f.z, 4.5, "pits")){
			B.box({ x: f.x, z: f.z, w: 5.5, d: 5.5, h: 13, ry: f.ry, color: 0xe9edf2, win: [1.8, 3.2], top: 0x2a2e38 });
			B.box({ x: f.x, z: f.z, y: 13, w: 7, d: 7, h: 3, ry: f.ry, color: 0x2a2e38, win: [1.4, 3] });
			place({ x: f.x, z: f.z, ry: f.ry, hw: 3.5, hd: 3.5, y0: 0, y1: 16 });
			sp.take(f.x, f.z, 5, "pits");
		}
	}

	// --- Grandstands: stepped seating facing the track, a roof, and fans in the seats.
	const ROWS = 7, ROW_D = 1.3, ROW_H = 0.72, SEG = 8;
	// opts.rows: how many rows of seats. opts.level: build the seating up from the ground level at
	// its front (for a stand on a slope, like the embankment behind a banked oval).
	function stand(from, to, s, group, opts = {}){
		const rows = opts.rows || ROWS;
		let made = 0;
		for(let i = from; i <= to; i += SEG){
			const f = sp.at(i, s, hw + 3.2);
			const depth = rows * ROW_D + 0.6;
			const [cx, cz] = f.local(0, -depth / 2);
			if(!sp.boxClear(cx, cz, f.ry, SEG, depth, 1.2) || !sp.free(cx, cz, SEG * 0.7, group)) continue;
			// Heights below are above the ground where each piece stands, or (level) above the front.
			const g0 = opts.level ? G(f.x, f.z) : null;
			const up = (x, z, y) => g0 == null ? y : g0 + y - G(x, z);
			for(let r = 0; r < rows; r++){
				const [rx, rz] = f.local(0, -(r + 0.5) * ROW_D);
				const top = 0.5 + (r + 1) * ROW_H;
				B.box({ x: rx, z: rz, w: SEG + 0.02, d: ROW_D, h: up(rx, rz, top), ry: f.ry, color: r % 2 ? 0x9aa1ab : 0x8d939e, top: standColor, skip: ["back"] });
				for(let k = 0; k < 11; k++){
					if(rand() > fill) continue;
					const [qx, qz] = f.local(-SEG / 2 + 0.4 + k * (SEG - 0.8) / 10 + (rand() - 0.5) * 0.15, -(r + 0.5) * ROW_D - 0.1);
					people.push({ x: qx, y: up(qx, qz, top) + G(qx, qz), z: qz, ry: f.ry + (rand() - 0.5) * 0.5 });
				}
			}
			const backZ = -rows * ROW_D - 0.2, topY = 0.5 + rows * ROW_H;
			const [bx, bz] = f.local(0, backZ);
			B.box({ x: bx, z: bz, w: SEG + 0.02, d: 0.4, h: up(bx, bz, topY + 3.4), ry: f.ry, color: 0xb9c0c9 });
			const [rx, rz] = f.local(0, -depth / 2 - 0.2);
			B.box({ x: rx, z: rz, y: up(rx, rz, topY + 3.2), w: SEG + 0.3, d: depth + 0.8, h: 0.35, ry: f.ry, color: 0xe9edf2, top: 0xf4f6fa, bottom: true });
			// Front wall with the stand colour.
			const [wx, wz] = f.local(0, 0.1);
			B.box({ x: wx, z: wz, w: SEG + 0.02, d: 0.2, h: up(wx, wz, 1.1), ry: f.ry, color: standColor });
			place({ x: cx, z: cz, ry: f.ry, hw: SEG / 2, hd: depth / 2, y0: 0, y1: topY + 3.6 + (g0 == null ? 0 : g0 - G(cx, cz)) });
			sp.take(cx, cz, SEG * 0.7, group);
			made++;
		}
		return made;
	}
	// Real grandstands from the map (js/places.js, e.g. Daytona's frontstretch): stepped seating with
	// fans along exactly the stretch of track the real stand's outline covers, as tall as the real one.
	let realStands = 0;
	if(ctx.geo){
		const geo = ctx.geo;
		for(const b of geo.P.buildings){
			if(b.k !== "stand") continue;
			const pts = geo.ring(b.p);
			for(const side of [1, -1]){
				const cov = new Uint8Array(n);
				let count = 0, any = -1;
				// (The game's road is wider than the real one, so look across a band beside it.)
				for(let i = 0; i < n; i++) for(let off = hw + 1; off <= hw + 30; off += 3){
					const f = sp.at(i, side, off);
					if(inPoly(pts, f.x, f.z)){ cov[i] = 1; count++; any = i; break; }
				}
				if(count < 40) continue;
				// The covered stretch can run across the start line: walk out both ways from inside it.
				let from = any, to = any;
				while(cov[sp.wrap(from - 1)] && any - from < n) from--;
				while(cov[sp.wrap(to + 1)] && to - from < n) to++;
				const rows = Math.max(ROWS, Math.min(24, Math.round(b.h * geo.S / ROW_H)));
				realStands += stand(from, to, side, "realstand", { rows, level: true });
			}
		}
		if(realStands) geo.standsBuilt = true;
	}
	const mainStand = realStands ? realStands : stand(Math.max(s0 + 6, -40), Math.min(s1 - 6, 56), -pitSide, "main");
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
					people.push({ x: qx, y: G(qx, qz), z: qz, ry: f.ry + (rand() - 0.5) * 0.8 });
				}
				sp.take(f.x, f.z, 2.4, "bank" + k.i);
				placed++;
			}
			if(placed > 3) banks++;
		}
	}

	// --- Life along the track from the models in assets/: marshal posts, flags, cones and paddock tents (none if they aren't loaded).
	const trackside = buildTrackside({ track, sp, hw, G, group, rand, pitSide, garages: garageFrames, quality: ctx.quality, place });

	// --- Billboards along the straights, just behind the barriers.
	const ads = sponsorsFor(track.def && track.def.theme), boards = [];
	for(let i = 0; i < n; i += 9){
		if(Math.abs(i) < 14 || n - i < 14) continue;
		if(sp.bend(i, 6) > 1 / 220) continue;
		const s = (i / 9) % 2 ? 1 : -1;
		const f = sp.at(i, s, hw + 0.9);
		const [bx, bz] = f.local(0, -0.1);
		if(!sp.boxClear(bx, bz, f.ry, 8.4, 0.6, 0.6) || !sp.free(bx, bz, 4.2, "ads")) continue;
		// (Standing up above the barrier, so it can be read from the track.)
		const lift = Math.max(0.35, (c.h ? c.h[sp.wrap(i)] - G(bx, bz) : 0) + (theme.wallH || 1.2) - 0.1);
		B.board({ x: bx, z: bz, y: lift, w: 8, h: 1.2, ry: f.ry }, ads[Math.floor(rand() * ads.length)]);
		boards.push({ x: bx, z: bz, ry: f.ry });
		const [kx, kz] = f.local(0, -0.18);
		B.box({ x: kx, z: kz, w: 8, d: 0.12, h: lift + 1.25, ry: f.ry, color: 0x2a2e38 });
		sp.take(bx, bz, 4.2, "ads");
	}

	// --- A bridge over a straight, away from the start.
	let bridge = null;
	const from = Math.floor(n * (0.25 + rand() * 0.2));
	// Not in, or in the view of, a tunnel (the Monaco tunnel mouth under the hotel).
	const tunnelNear = i => {
		const t = track.features && track.features.tunnel;
		if(!t) return false;
		const past = (i - (t[0] - 130) + n) % n, len = (t[1] - t[0] + n) % n;
		return past <= len + 130 + 40;
	};
	for(let tries = 0; tries < n * 0.5 && !bridge; tries += 5){
		const i = (from + tries) % n;
		if(Math.min(i, n - i) < 80 || sp.bend(i, 10) > 1 / 160 || tunnelNear(i)) continue;
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
			const ph = (c.h ? c.h[i] - G(p.x, p.z) : 0) + 6.2;
			B.box({ x: p.x, z: p.z, w: 1.6, d: 1.6, h: ph, ry: p.ry, color: 0xb9c0c9 });
			place({ x: p.x, z: p.z, ry: p.ry, hw: 0.8, hd: 0.8, y0: 0, y1: ph });
			sp.take(p.x, p.z, 1.5, "bridge");
		}
		const mid = sp.at(i, 1, 0), span = (hw + 3.4) * 2;
		// (Over the road: heights from the road there, which may be up a hill from the ground at the pillars.)
		const deckY = (c.h ? c.h[i] - G(mid.x, mid.z) : 0) + 6.2;
		// Deck runs across the track: local z of the frame on the left side points across it.
		B.box({ x: mid.x, z: mid.z, y: deckY, w: 2.6, d: span, h: 0.7, ry: mid.ry, color: 0x2a2e38, bottom: true });
		for(const side of [-1, 1]){
			const [bx, bz] = mid.local(side * 1.36, 0), [fx, fz] = mid.local(side * 1.42, 0);
			const face = mid.ry + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
			// (Heights are above the ground where each piece stands: level with the deck, over the road.)
			B.board({ x: fx, z: fz, y: deckY + 0.7 + G(mid.x, mid.z) - G(fx, fz), w: span * 0.8, h: 1.3, ry: face }, bridgeSponsor(track.def && track.def.theme));
			B.box({ x: bx, z: bz, y: deckY + 0.7 + G(mid.x, mid.z) - G(bx, bz), w: 0.1, d: span, h: 1.3, ry: mid.ry, color: 0xe9edf2 });
		}
		place({ x: mid.x, z: mid.z, ry: mid.ry, hw: 1.3, hd: span / 2, y0: deckY, y1: deckY + 2.1 });
	}

	// --- Monaco: the tunnel runs under the Fairmont hotel. The hotel stands over the mouth and
	// the first half of the tunnel, reaching back inland on a podium, with the red Monte-Carlo
	// banner over the entrance, a white curved stair tower beside it and a fence along the sea
	// on the way in; lower seafront buildings cover the rest of the tunnel.
	const tun = track.features && track.features.tunnel, TW = TUNNEL_WALL;
	if(tun && c.h){
		const [a, b] = tun, to = b >= a ? b : b + n, len = to - a, sm = i => ((i % n) + n) % n;
		const H = i => c.h[sm(i)];
		// Which side is the sea (the ground drops away there)?
		const probe = s => G(c.x[sm(a - 20)] + c.tz[sm(a - 20)] * s * 30, c.z[sm(a - 20)] - c.tx[sm(a - 20)] * s * 30);
		const sea = probe(1) < probe(-1) - 0.5 ? 1 : probe(-1) < probe(1) - 0.5 ? -1 : 0, land = sea ? -sea : 1;
		// How far inland the buildings can reach at sample i without covering another road.
		const reach = (i, want) => {
			for(let ext = want; ext > 0; ext -= 2){
				let ok = true;
				for(let o = hw + TW + 0.7; o <= hw + TW + 0.7 + ext && ok; o += 2) for(const dz of [-4, 0, 4]){
					const j = sm(i + dz), px = c.x[j] + c.tz[j] * land * o, pz = c.z[j] - c.tx[j] * land * o;
					c.hash.near(px, pz, hw + 3, k => { if(Math.min(Math.abs(k - j), n - Math.abs(k - j)) > 40 && Math.hypot(c.x[k] - px, c.z[k] - pz) < hw + 3) ok = false; });
				}
				if(ok) return ext;
			}
			return 0;
		};
		const block = (i, floors, d, color, want, id) => {
			const s = sm(i), ry = Math.atan2(c.tx[s], c.tz[s]), ext = reach(s, want);
			const W = (hw + TW + 0.7) * 2 + ext, off = land * ext / 2;
			const x = c.x[s] + c.tz[s] * off, z = c.z[s] - c.tx[s] * off;
			const base = H(s) + 7.4, top = base + floors * 3;
			B.box({ x, z, y: base - G(x, z), w: W, d, h: floors * 3, ry, color, win: [2.4, 3], top: 0xcfc4b2 });
			place({ x, z, ry, hw: W / 2, hd: d / 2, y0: base - 7.4 - G(x, z), y1: top - G(x, z) });
			sp.take(x, z, Math.max(W, d) / 2, id);
			// The podium under the inland part, down to the ground.
			if(ext > 1){
				const px = c.x[s] + c.tz[s] * land * (hw + TW + 0.7 + ext / 2), pz = c.z[s] - c.tx[s] * land * (hw + TW + 0.7 + ext / 2);
				B.box({ x: px, z: pz, w: ext, d, h: Math.max(1, base - G(px, pz)), ry, color: 0xb9ab94, win: [3.2, 3.6] });
			}
			// Balconies along the sea side.
			if(floors > 3) for(let f = 1; f < floors; f++){
				const bx = c.x[s] - c.tz[s] * land * (hw + 1.75), bz = c.z[s] + c.tx[s] * land * (hw + 1.75);
				B.box({ x: bx, z: bz, y: base + f * 3 - 0.1 - G(bx, bz), w: 0.7, d, h: 0.22, ry, color: 0xf4f6fa });
			}
		};
		// Banners on the barriers inside the tunnel, laid on each barrier segment's own face.
		for(const [x1, z1, x2, z2, , i1, i2] of track.wallSegs){
			if(i1 === undefined) continue;
			const inT = q => ((q - a + n) % n) >= 1 && ((q - a + n) % n) <= len - 1;
			if(!inT(i1) && !inT(i2) && !(((i2 - i1 + n) % n) > len)) continue;
			const L = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / L, uz = (z2 - z1) / L;
			for(let d = 3.5; d < L - 3; d += 7){
				const t = d / L, q = sm(Math.round(i1 + ((i2 - i1 + n) % n) * t));
				if(!inT(q)) continue;
				let px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
				// Face the road: the side of the barrier the centreline is on.
				let nx = -uz, nz = ux;
				if((c.x[q] - px) * nx + (c.z[q] - pz) * nz < 0){ nx = -nx; nz = -nz; }
				px += nx * 0.17; pz += nz * 0.17;
				B.board({ x: px, z: pz, y: H(q) + 0.12 - G(px, pz), w: Math.min(6.6, L - 0.4), h: 0.95, ry: Math.atan2(nx, nz) }, AD_MONACO_GP);
			}
		}
		const hotelTo = a + Math.round(len * 0.55);
		for(let i = a + 4; i <= hotelTo; i += 7) block(i, i < a + 30 ? 6 : 7, 8, 0xe9dcc4, 14, "hotel");
		for(let i = hotelTo + 7; i <= to - 4; i += 7) block(i, 2, 8, 0xd8cdb8, 8, "seafront");
		// Front of the hotel over the mouth, and the banner.
		const s0 = sm(a), ry0 = Math.atan2(c.tx[s0], c.tz[s0]), face = Math.atan2(-c.tx[s0], -c.tz[s0]);
		const mx = c.x[s0] - c.tx[s0] * 0.6, mz = c.z[s0] - c.tz[s0] * 0.6;
		B.box({ x: mx, z: mz, y: H(s0) + 5.8 - G(mx, mz), w: (hw + TW + 0.7) * 2, d: 1.2, h: 1.7, ry: ry0, color: 0x6b675f });
		const fx = c.x[s0] - c.tx[s0] * 1.25, fz = c.z[s0] - c.tz[s0] * 1.25;
		B.board({ x: fx, z: fz, y: H(s0) + 5.85 - G(fx, fz), w: hw * 2 + 0.8, h: 1.5, ry: face }, AD_MONTE_CARLO);
		// The white curved stair tower on the land side, rising towards the hotel.
		for(let k = 0; k < 7; k++){
			const s = sm(a - 14 + k * 2), o = hw + 3.2 + k * 0.25;
			const x = c.x[s] + c.tz[s] * land * o, z = c.z[s] - c.tx[s] * land * o;
			if(sp.edge(x, z, 3) < 1.2) continue;
			const top = H(s) + 3 + (k / 6) ** 1.6 * 14;
			B.box({ x, z, w: 3.4, d: 2.3, h: Math.max(1, top - G(x, z)), ry: Math.atan2(c.tx[s], c.tz[s]), color: 0xf3f2ee });
			sp.take(x, z, 2, "hotel");
		}
		// Fence along the sea on the way in: posts and two rails on top of the barrier.
		if(sea) for(let i = a - 90; i < a; i += 3){
			const s = sm(i), o = hw + 0.35, ry = Math.atan2(c.tx[s], c.tz[s]);
			const x = c.x[s] + c.tz[s] * sea * o, z = c.z[s] - c.tx[s] * sea * o, y = H(s) + 1.2 - G(x, z);
			B.box({ x, z, y, w: 0.12, d: 0.12, h: 3, ry, color: 0x8d949c });
			for(const r of [1.4, 2.9]) B.box({ x, z, y: y + r, w: 0.08, d: 3.05, h: 0.08, ry, color: 0x8d949c });
		}
	}

	// --- City blocks (Monaco, Jeddah) from the scenery spots near the road.
	const spots = [...(track.scenery || []), ...(ctx.extraSpots || [])].sort((a, b) => a.off - b.off);
	const used = new Set();
	const bdef = theme.buildings;
	const extraTrees = [];
	// The real landscape (forests, fields, towns: Monaco, Spa, Monza, Suzuka) or the real city (Jeddah, Daytona).
	const treeOcc = { add: o => { const g = G(o.x, o.z); o.y0 += g; o.y1 += g; occ.add(o); } };
	let land = null;
	if(ctx.geo && ctx.geo.P.land) land = buildLandscape(ctx.geo, { track, theme, B, G, sp, place, c, n, rand, group, keep, shadows, isWater: ctx.isWater, low, buildTrees, treeOccluders: treeOcc, people, fill });
	else if(ctx.geo) buildRealCity(ctx.geo, { track, theme, B, G, sp, place, c, hw, n, rand, group, keep, shadows, extraTrees, isWater: ctx.isWater, low, updaters });
	else if(bdef){
		for(const s of spots){
			if(s.off > 46 || s.r > bdef.density) continue;
			const tall = bdef.night ? 22 + s.r2 * 70 : bdef.tall ? bdef.tall[0] + s.r2 * bdef.tall[1] : 9 + s.r2 * 18;
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
			place({ x: s.x, z: s.z, ry, hw: w / 2, hd: d / 2, y0: 0, y1: h + 3 });
			sp.take(s.x, s.z, r * 0.92, id);
			used.add(s);
		}
	}

	// Merge everything built so far into one mesh.
	if(!B.empty){
		const glass = bdef && bdef.night ? "#1c2230" : "#6f8aa6";
		const win = windowTextures(bdef && bdef.night, glass);
		const nightTheme = !!(bdef && bdef.night);
		keep(win.map); if(win.emissive) keep(win.emissive);
		const adsTex = keep(adsTexture());
		adsTex.anisotropy = 4;
		const mats = [
			keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: win.map, emissive: nightTheme ? 0xffffff : 0x000000, emissiveMap: win.emissive })),
			keep(new THREE.MeshLambertMaterial({ vertexColors: true })),
			keep(new THREE.MeshLambertMaterial({ map: adsTex, emissive: theme.night ? 0x555555 : 0x000000, emissiveMap: adsTex, side: THREE.DoubleSide }))
		];
		// After dark: lit windows and billboards (0..1).
		api.setNight = n => {
			mats[0].emissive.setScalar(nightTheme ? Math.max(0.35, n) : Math.max(0, (n - 0.2) / 0.8));
			mats[2].emissive.setScalar(0.35 * n);
			if(land && land.setNight) land.setNight(n);
		};
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
		const crowd = [mk(body, SHIRTS), mk(head, SKIN)];
		for(const m of crowd) m.userData.noMirror = true;      // (too small to matter in the rear-view mirror)
		group.add(...crowd);
	}

	// --- Trees, only where their branches stay well clear of the road and of everything else.
	// (Where the map has the real forests and trees, they're all there is: see landscape.js.)
	const kind = theme.trees;
	if(kind && kind !== "none" && kind !== "classic" && !land){
		const tl = [];
		const lowQ = low ? 0.5 : 1;
		for(const s of spots){
			if(used.has(s) || s.r2 >= (theme.treeDensity ?? 0) * 0.8 * lowQ) continue;
			const scale = 0.75 + s.r * 0.8;
			const crownR = (kind === "palm" ? 3.2 : kind === "round" || kind === "sakura" ? 3.4 : 3.4) * scale;
			if(sp.edge(s.x, s.z, crownR + 3) < crownR + 1.8) continue;
			if(!sp.free(s.x, s.z, crownR * 0.6, "trees")) continue;
			sp.take(s.x, s.z, crownR * 0.6, "trees");
			tl.push({ x: s.x, y: G(s.x, s.z), z: s.z, s: scale, ry: s.r2 * 6, r: crownR, k: s.r });
		}
		tl.push(...extraTrees);
		buildTrees(kind, tl, theme, { group, keep, shadows, rand, occ: treeOcc });
	}

	api.info = { trackside, straight: [s0, s1], garages, mainStand, cornerStands: chosen.length, fans: people.length, bridge: !!bridge, buildings: used.size + (land ? land.buildings : 0), ...(land ? { trees: land.trees, clumps: land.clumps } : {}) };
	api.wheels = land ? land.wheels : [];
	api.boards = boards;   // (where the billboards are: for tools/spot-shots.mjs)
	api.corners = chosen;
	api.pitSide = pitSide;
	api.clearOfRoad = (x, z, m) => sp.edge(x, z, m + 1) >= m;
	return api;
}

// Low-poly trees with a little colour variety.
// ---------- The real city around a circuit (js/places.js, from OpenStreetMap) ----------
// Buildings from their real outlines and heights, lit windows and rooftop lights after dark,
// the streets with their lamps, parks and palms, the beach, piers with moored yachts, the
// landmark mosques, and footbridges over the track. Anything that would touch the road, or
// something already placed, is left out.
function buildRealCity(geo, { track, theme, B, G, sp, place, c, hw, n, rand, group, keep, shadows, extraTrees, isWater, low, updaters }){
	const { P, S } = geo, W = geo.ring;
	const glow = new Builder();                       // things that shine at night (plain colours)
	glow.ground = G;
	const clearOf = (pts, m) => pts.every(([x, z]) => sp.edge(x, z, m + 1) >= m);
	const centre = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
	// Road running through an outline (a big building the road passes, or crosses)?
	const roadInside = pts => {
		const [cx, cz] = centre(pts), r = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
		let hit = false;
		c.hash.near(cx, cz, r + 1, j => { if(!hit && inPoly(pts, c.x[j], c.z[j])) hit = true; });
		return hit;
	};
	const PALE = [0xe4ddd0, 0xd8cfbf, 0xefe9de, 0xcdc3b1, 0xdcd6cc, 0xc9c1b4], GLASS = [0x7d93a8, 0x5f7a92, 0x8aa2b3, 0x4f6b82];
	const CROWN = [0x38d9ff, 0xff4fd8, 0xffd23a, 0x5cff9a, 0xffffff];

	// Buildings.
	let bi = 0;
	for(const b of P.buildings){
		const pts = W(b.p);
		if(pts.length < 3 || !clearOf(pts, 2.5) || roadInside(pts)) continue;
		const [cx, cz] = centre(pts);
		const rad = Math.max(...pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
		const id = "real" + bi++;
		if(!sp.free(cx, cz, rad * 0.7, id)) continue;
		const h = b.h * S, g = G(cx, cz), y0 = g - 2;
		const tower = b.k === "tower", stand = b.k === "stand";
		if(stand && geo.standsBuilt) continue;          // (built as real seating along the track instead)
		const col = stand ? (theme.standColor ?? 0x0e7c86) : tower ? GLASS[bi % GLASS.length] : PALE[bi % PALE.length];
		B.prism(pts, y0, h + 2, col, stand ? null : [tower ? 1.3 : 1.6, tower ? 1.05 : 1.1], tower ? 0x2a3440 : 0xb8b0a2);
		place({ x: cx, z: cz, ry: 0, hw: rad * 0.8, hd: rad * 0.8, y0: -2, y1: h });
		sp.take(cx, cz, rad * 0.8, id);
		// Rooftop light strips on the taller buildings (Jeddah's skyline is lit up at night).
		if(h > 9){
			const cc = CROWN[bi % CROWN.length];
			for(let i = 0; i < pts.length; i++){
				const a = pts[i], d = pts[(i + 1) % pts.length], len = Math.hypot(d[0] - a[0], d[1] - a[1]);
				if(len < 0.3) continue;
				glow.box({ x: (a[0] + d[0]) / 2, z: (a[1] + d[1]) / 2, y: g + h - 0.35 - g, w: len, d: 0.12, h: 0.25, ry: Math.atan2(-(d[1] - a[1]), d[0] - a[0]), color: cc, skip: ["top"] });
				// Towers: vertical light lines up the corners too.
				if(tower) glow.box({ x: a[0], z: a[1], y: g - g, w: 0.18, d: 0.18, h, color: cc });
			}
		}
	}

	// The rest of the city: where the map has no buildings (the villa districts, mostly), fill the
	// land well back from the track with low blocks, lit up after dark.
	if(theme.cityFill){
		const b = track.bounds, step = low ? 15 : 11;
		for(let x = b.minX - 220; x <= b.maxX + 220; x += step) for(let z = b.minZ - 220; z <= b.maxZ + 220; z += step){
			const px = x + (rand() - 0.5) * step * 0.5, pz = z + (rand() - 0.5) * step * 0.5;
			if(rand() < 0.3 || sp.edge(px, pz, 52) < 50 || (isWater && isWater(px, pz))) continue;
			const wv = 4.5 + rand() * 5, dv = 4.5 + rand() * 5, r = Math.hypot(wv, dv) / 2;
			if(!sp.free(px, pz, r, "fill")) continue;
			const h = (7 + rand() * 12 + (rand() < 0.08 ? 20 + rand() * 30 : 0)) * S;
			B.box({ x: px, z: pz, w: wv, d: dv, h, ry: 0.05 * (rand() - 0.5), color: PALE[Math.floor(rand() * PALE.length)], win: [1.6, 1.1], top: 0xb8b0a2 });
			sp.take(px, pz, r, "fill");
		}
	}

	// Streets: asphalt with pavements, and lamp posts along them.
	const lamps = [];
	for(const r of P.roads){
		const pts = W(r.p), wv = r.w * S;
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			if(len < 0.2) continue;
			const mx = (ax + bx) / 2, mz = (az + bz) / 2;
			// Leave out anything near the circuit (its own roads are part of the track), or in the water.
			if(sp.edge(mx, mz, wv + 6) < wv / 2 + 4 || sp.edge(ax, az, wv + 6) < wv / 2 + 3 || sp.edge(bx, bz, wv + 6) < wv / 2 + 3) continue;
			if(isWater && (isWater(mx, mz))) continue;
			const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz * wv / 2, nz = ux * wv / 2;
			const y = G(mx, mz) + 0.05;
			B.flat([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], y, 0x2a2c31);
			for(let d = 4; d < len; d += 11){
				for(const sd of [1, -1]){
					const x = ax + ux * d + nx * sd * 1.15, z = az + uz * d + nz * sd * 1.15;
					if(sp.edge(x, z, 4) > 2.5) lamps.push({ x, z, y: G(x, z) });
				}
			}
		}
	}
	if(lamps.length){
		const unit = new THREE.BoxBufferGeometry(1, 1, 1);
		const pole = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0x5b6068 }), lamps.length);
		const head = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0xffc46b }), lamps.length);
		const m = new THREE.Matrix4();
		lamps.forEach((l, i) => {
			m.makeScale(0.12, 3.2, 0.12); m.setPosition(l.x, l.y + 1.6, l.z); pole.setMatrixAt(i, m);
			m.makeScale(0.5, 0.18, 0.5); m.setPosition(l.x, l.y + 3.25, l.z); head.setMatrixAt(i, m);
		});
		pole.frustumCulled = head.frustumCulled = false;
		keep(unit); keep(pole.material); keep(head.material);
		group.add(pole, head);
	}

	// Parks and lawns, with palms; the beach.
	for(const pk of P.parks){
		const pts = W(pk);
		if(pts.length < 3 || roadInside(pts)) continue;
		const [cx, cz] = centre(pts);
		const y = G(cx, cz) + 0.04;
		if(!clearOf(pts, 0.8)) continue;
		B.flat(pts, y, 0x2f6b34);
		const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
		const step = low ? 9 : 6;
		for(let x = Math.min(...xs); x <= Math.max(...xs); x += step) for(let z = Math.min(...zs); z <= Math.max(...zs); z += step){
			const px = x + (rand() - 0.5) * step * 0.8, pz = z + (rand() - 0.5) * step * 0.8;
			if(!inPoly(pts, px, pz) || sp.edge(px, pz, 6) < 4.5 || !sp.free(px, pz, 1.4, "trees")) continue;
			sp.take(px, pz, 1.4, "trees");
			const sc = 0.7 + rand() * 0.5;
			extraTrees.push({ x: px, y: G(px, pz), z: pz, s: sc, ry: rand() * 6, r: 3.2 * sc, k: rand() });
		}
	}
	for(const sd of P.sand){ const pts = W(sd); if(pts.length >= 3 && clearOf(pts, 0.5) && !roadInside(pts)) B.flat(pts, G(...centre(pts)) + 0.03, 0xd8c79f); }

	// Piers into the marina, with yachts moored alongside.
	const seaY = G(1e7, 1e7) + 0.02;
	const yachts = [];
	for(const pr of P.piers){
		const pts = W(pr.p);
		if(pts.length < 2) continue;
		if(pr.a){ if(clearOf(pts, 1)) B.prism(pts, seaY - 1, 1.6, 0xcfc8ba, null, 0xbdb5a5); continue; }
		for(let i = 0; i < pts.length - 1; i++){
			const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
			if(len < 0.3) continue;
			const ux = (bx - ax) / len, uz = (bz - az) / len, wv = 3 * S / 2;
			B.prism([[ax - uz * wv, az + ux * wv], [bx - uz * wv, bz + ux * wv], [bx + uz * wv, bz - ux * wv], [ax + uz * wv, az - ux * wv]], seaY - 1, 1.6, 0xcfc8ba, null, 0xbdb5a5);
			for(let d = 2; d < len - 1; d += 2.6) for(const sd of [1, -1]){
				const L = 3.5 + rand() * 4, off = wv + 0.4 + L / 2;
				const x = ax + ux * d - uz * sd * off, z = az + uz * d + ux * sd * off;
				if(rand() < 0.3 || !isWater || !isWater(x, z) || sp.edge(x, z, 6) < 4) continue;
				yachts.push({ x, z, L, ry: Math.atan2(-uz * sd, ux * sd) + Math.PI / 2 });
			}
		}
	}
	for(const y of yachts){
		const w = y.L * 0.3;
		B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) - 0.15, w, d: y.L, h: 0.7, ry: y.ry, color: 0xf6f7f9, bottom: true });
		B.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) + 0.55, w: w * 0.7, d: y.L * 0.45, h: 0.55, ry: y.ry, color: 0xe3e8ee, top: 0x2c3440 });
		glow.box({ x: y.x, z: y.z, y: seaY - G(y.x, y.z) + 0.75, w: w * 0.72, d: y.L * 0.3, h: 0.12, ry: y.ry, color: 0xfff1c9 });
	}

	// The landmark mosques: white, with a dome and a minaret lit green.
	for(const mq of P.mosques){
		const big = /rahma/i.test(mq.n), [x, z] = geo.toWorld(...mq.at);
		const sz = (big ? 28 : 20) * S, hh = (big ? 12 : 9) * S;
		if(sp.edge(x, z, sz + 4) < sz / 2 + 2) continue;
		const g = isWater && isWater(x, z) ? seaY : G(x, z);
		B.box({ x, z, y: g - G(x, z) - (big ? 1 : 0), w: sz, d: sz, h: hh + (big ? 1 : 0), color: 0xf4f1ea });
		const dome = new THREE.Mesh(keep(new THREE.SphereBufferGeometry(sz * 0.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), keep(new THREE.MeshLambertMaterial({ color: 0xf8f6f0, emissive: 0x2a2a2a })));
		dome.position.set(x, g + hh, z); group.add(dome);
		const mh = (big ? 40 : 30) * S, mxp = x + sz * 0.42, mzp = z + sz * 0.42;
		B.box({ x: mxp, z: mzp, y: g - G(mxp, mzp), w: 1.1, d: 1.1, h: mh, color: 0xf4f1ea });
		glow.box({ x: mxp, z: mzp, y: g - G(mxp, mzp) + mh * 0.72, w: 1.25, d: 1.25, h: 0.35, color: 0x3cff8a });
		glow.box({ x: mxp, z: mzp, y: g - G(mxp, mzp) + mh, w: 0.5, d: 0.5, h: 1.6, color: 0x3cff8a });
		sp.take(x, z, sz * 0.75, "mosque");
		place({ x, z, ry: 0, hw: sz / 2, hd: sz / 2, y0: 0, y1: hh + sz * 0.32 });
	}

	// Footbridges over the track (theme.footbridges), on straights, lit along their sides.
	const want = theme.footbridges || 0;
	for(let k = 0; k < want; k++){
		for(let tries = 0; tries < 60; tries++){
			const i = Math.floor(((k + 0.5) / want + tries * 0.004) * n) % n;
			if(Math.min(i, n - i) < 60 || sp.bend(i, 8) > 1 / 120) continue;
			const L = sp.at(i, 1, hw + 3), Rr = sp.at(i, -1, hw + 3);
			if(!sp.boxClear(L.x, L.z, L.ry, 2.2, 2.2, 0.8) || !sp.boxClear(Rr.x, Rr.z, Rr.ry, 2.2, 2.2, 0.8)) continue;
			let ok = true;
			for(let o = -hw - 3; o <= hw + 3 && ok; o += 1.5){
				const p = sp.at(i, 1, o);
				c.hash.near(p.x, p.z, 3, j => { if(Math.min(Math.abs(j - i), n - Math.abs(j - i)) > 20 && Math.hypot(c.x[j] - p.x, c.z[j] - p.z) < 3) ok = false; });
			}
			if(!ok || !sp.free(L.x, L.z, 2, "footbridge") || !sp.free(Rr.x, Rr.z, 2, "footbridge")) continue;
			const hgt = (c.h ? c.h[i] : 0) + 6.6, mid = sp.at(i, 1, 0), span = (hw + 4.5) * 2;
			for(const p of [L, Rr]){
				B.box({ x: p.x, z: p.z, w: 2.4, d: 2.4, h: hgt - G(p.x, p.z) + 0.4, ry: p.ry, color: 0xe9ecf1 });
				sp.take(p.x, p.z, 1.8, "footbridge");
				place({ x: p.x, z: p.z, ry: p.ry, hw: 1.2, hd: 1.2, y0: 0, y1: hgt + 1 });
			}
			B.box({ x: mid.x, z: mid.z, y: hgt - G(mid.x, mid.z), w: 2.6, d: span, h: 0.6, ry: mid.ry, color: 0xf2f4f7, bottom: true });
			for(const side of [-1, 1]){
				const [bx, bz] = mid.local(side * 1.25, 0);
				B.box({ x: bx, z: bz, y: hgt + 0.6 - G(bx, bz), w: 0.12, d: span, h: 1.2, ry: mid.ry, color: 0xdfe4ea });
				glow.box({ x: bx, z: bz, y: hgt - 0.05 - G(bx, bz), w: 0.14, d: span, h: 0.14, ry: mid.ry, color: k % 2 ? 0x38d9ff : 0xff4fd8 });
			}
			place({ x: mid.x, z: mid.z, ry: mid.ry, hw: 1.3, hd: span / 2, y0: hgt - 0.2, y1: hgt + 1.9 });
			break;
		}
	}

	if(!glow.empty){
		const g = new THREE.Mesh(keep(glow.build()), [keep(new THREE.MeshBasicMaterial({ vertexColors: true })), keep(new THREE.MeshBasicMaterial({ vertexColors: true })), keep(new THREE.MeshBasicMaterial({ vertexColors: true }))]);
		g.frustumCulled = false;
		group.add(g);
	}
}

// A list in a random order (the same every time: rand is seeded), so any first part of it is an even spread.
export function shuffled(list, rand){
	const a = list.slice();
	for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
	return a;
}
function buildTrees(kind, list, theme, { group, keep, shadows, rand, occ }){
	if(!list.length) return;
	// In a random order, so that drawing only the first part of a forest (world.setDensity, when a computer
	// can't keep up) thins it evenly. Every part of a tree (trunk, crown) uses the same order.
	list = shuffled(list, rand);
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
		mesh.userData.lod = items.length;      // (how many there are: world.setDensity draws a share of them)
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
		const trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.5, trunkH, 5, 1, true)); trunk.translate(0, trunkH / 2, 0);   // (open ends: nobody sees them)
		const crown = keep(new THREE.IcosahedronBufferGeometry(3.2, 0)); crown.translate(0, trunkH + 2.3, 0);
		const top = keep(new THREE.IcosahedronBufferGeometry(2.2, 0)); top.translate(0.6, trunkH + 4.4, -0.4);
		const base = t => kind === "sakura" ? (t.k < 0.65 ? 0xf6a9c6 : t.k < 0.82 ? 0xfbd3e2 : 0x4d8f3c) : (t.k < 0.5 ? 0x3d7f2c : 0x4f9435);
		inst(trunk, trunkMat, list);
		inst(crown, crownMat, list.map(t => Object.assign({}, t, { color: vary(base(t), 0.1) })));
		inst(top, crownMat, list.map(t => Object.assign({}, t, { color: vary(base(t), 0.14) })));
	}else{
		trunkH = 2.5;
		const trunk = keep(new THREE.CylinderBufferGeometry(0.35, 0.45, trunkH, 5, 1, true)); trunk.translate(0, trunkH / 2, 0);
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
