// For tracks without a centreline (Classic and editor tracks): a distance map that
// says how far along the lap each spot is, measured from the start line. Used for
// race positions, the wrong-way warning and bot steering.
const CELL = 1;

function segDist(px, pz, x1, z1, x2, z2){
	const dx = x2 - x1, dz = z2 - z1;
	const l2 = dx * dx + dz * dz || 1e-9;
	let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

// Binary heap keyed by distance.
class Heap {
	constructor(){ this.k = []; this.v = []; }
	push(key, val){
		const k = this.k, v = this.v;
		let i = k.length;
		k.push(key); v.push(val);
		while(i > 0){
			const p = (i - 1) >> 1;
			if(k[p] <= k[i]) break;
			[k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
			i = p;
		}
	}
	pop(){
		const k = this.k, v = this.v;
		const top = v[0], topK = k[0];
		const lk = k.pop(), lv = v.pop();
		if(k.length){
			k[0] = lk; v[0] = lv;
			let i = 0;
			for(;;){
				const l = i * 2 + 1, r = l + 1;
				let m = i;
				if(l < k.length && k[l] < k[m]) m = l;
				if(r < k.length && k[r] < k[m]) m = r;
				if(m === i) break;
				[k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
				i = m;
			}
		}
		this.lastKey = topK;
		return top;
	}
	get size(){ return this.v.length; }
}

export function buildNavField(track){
	const b = track.bounds;
	const pad = 12;
	const x0 = b.minX - pad, z0 = b.minZ - pad;
	const w = Math.ceil((b.maxX - b.minX + pad * 2) / CELL), h = Math.ceil((b.maxZ - b.minZ + pad * 2) / CELL);
	const start = track.lines[0];
	const ax = start.a.x, az = start.a.y, bx = start.b.x, bz = start.b.y;
	// "Forward" is the side of the start line away from the grid at the origin.
	let nx = -(bz - az), nz = bx - ax;
	const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
	const mx = (ax + bx) / 2, mz = (az + bz) / 2;
	if((0 - mx) * nx + (0 - mz) * nz > 0){ nx = -nx; nz = -nz; }

	// Try generous clearance from walls first so bots keep off them; relax if the track is narrow.
	for(const inflate of [3, 2.2, 1.5, 0.8]){
		const blocked = new Uint8Array(w * h), line = new Uint8Array(w * h);
		for(let j = 0; j < h; j++){
			for(let i = 0; i < w; i++){
				const px = x0 + (i + 0.5) * CELL, pz = z0 + (j + 0.5) * CELL;
				for(const [x1, z1, x2, z2] of track.wallSegs){
					if(Math.abs(px - (x1 + x2) / 2) > Math.abs(x2 - x1) / 2 + inflate + 1) continue;
					if(Math.abs(pz - (z1 + z2) / 2) > Math.abs(z2 - z1) / 2 + inflate + 1) continue;
					if(segDist(px, pz, x1, z1, x2, z2) < inflate){ blocked[j * w + i] = 1; break; }
				}
				if(!blocked[j * w + i] && segDist(px, pz, ax, az, bx, bz) < 1.2) line[j * w + i] = 1;
			}
		}
		const dist = new Float32Array(w * h).fill(-1);
		const heap = new Heap();
		for(let j = 0; j < h; j++) for(let i = 0; i < w; i++){
			const k = j * w + i;
			if(blocked[k] || line[k]) continue;
			const px = x0 + (i + 0.5) * CELL, pz = z0 + (j + 0.5) * CELL;
			const side = (px - mx) * nx + (pz - mz) * nz;
			if(side > 0 && side < 2.6 && segDist(px, pz, ax, az, bx, bz) < 2.6){ dist[k] = 0; heap.push(0, k); }
		}
		if(!heap.size) continue;
		const done = new Uint8Array(w * h);
		while(heap.size){
			const k = heap.pop(), d = heap.lastKey;
			if(done[k]) continue;
			done[k] = 1;
			const i = k % w, j = (k / w) | 0;
			for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
				if(!di && !dj) continue;
				const ii = i + di, jj = j + dj;
				if(ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
				const kk = jj * w + ii;
				if(blocked[kk] || line[kk] || done[kk]) continue;
				const nd = d + (di && dj ? Math.SQRT2 : 1) * CELL;
				if(dist[kk] < 0 || nd < dist[kk]){ dist[kk] = nd; heap.push(nd, kk); }
			}
		}
		// The lap has to come back round to the start line from behind it.
		let max = 0, reachesBehind = false;
		for(let k = 0; k < w * h; k++){
			if(dist[k] > max) max = dist[k];
		}
		for(let j = 0; j < h && !reachesBehind; j++) for(let i = 0; i < w; i++){
			const k = j * w + i;
			if(dist[k] < 0) continue;
			const px = x0 + (i + 0.5) * CELL, pz = z0 + (j + 0.5) * CELL;
			const side = (px - mx) * nx + (pz - mz) * nz;
			if(side < 0 && side > -2.6 && segDist(px, pz, ax, az, bx, bz) < 2.6 && dist[k] > max * 0.5){ reachesBehind = true; break; }
		}
		if(!reachesBehind && inflate > 0.8) continue;
		for(let k = 0; k < w * h; k++) if(line[k]) dist[k] = max + 1;
		return { x0, z0, w, h, dist, max, inflate };
	}
	return null;
}

function cellAt(f, x, z){
	const i = Math.floor((x - f.x0) / CELL), j = Math.floor((z - f.z0) / CELL);
	if(i < 0 || j < 0 || i >= f.w || j >= f.h) return -1;
	return j * f.w + i;
}

// Distance along the lap at (x, z), looking a few cells around if that spot is too close to a wall.
export function fieldValue(f, x, z){
	let k = cellAt(f, x, z);
	if(k >= 0 && f.dist[k] >= 0) return f.dist[k];
	for(let r = 1; r <= 4; r++){
		let best = -1;
		for(let dj = -r; dj <= r; dj++) for(let di = -r; di <= r; di++){
			const kk = cellAt(f, x + di * CELL, z + dj * CELL);
			if(kk >= 0 && f.dist[kk] >= 0 && f.dist[kk] > best) best = f.dist[kk];
		}
		if(best >= 0) return best;
	}
	return -1;
}

// Walks `steps` cells forward (uphill in the field) from (x, z) and returns that spot.
export function fieldAhead(f, x, z, steps){
	let k = cellAt(f, x, z);
	if(k < 0 || f.dist[k] < 0){
		let best = -1, bk = -1;
		for(let dj = -4; dj <= 4; dj++) for(let di = -4; di <= 4; di++){
			const kk = cellAt(f, x + di * CELL, z + dj * CELL);
			if(kk >= 0 && f.dist[kk] >= 0 && f.dist[kk] > best){ best = f.dist[kk]; bk = kk; }
		}
		if(bk < 0) return null;
		k = bk;
	}
	for(let s = 0; s < steps; s++){
		const i = k % f.w, j = (k / f.w) | 0;
		const here = f.dist[k];
		let best = -Infinity, bk = -1;
		for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
			if(!di && !dj) continue;
			const ii = i + di, jj = j + dj;
			if(ii < 0 || jj < 0 || ii >= f.w || jj >= f.h) continue;
			const kk = jj * f.w + ii;
			let d = f.dist[kk];
			if(d < 0) continue;
			if(here > f.max * 0.8 && d < f.max * 0.2) d += f.max + 1;
			const gain = (d - here) / (di && dj ? Math.SQRT2 : 1);
			if(gain > best){ best = gain; bk = kk; }
		}
		if(bk < 0) break;
		k = bk;
	}
	return { x: f.x0 + (k % f.w + 0.5) * CELL, z: f.z0 + (((k / f.w) | 0) + 0.5) * CELL };
}

// A racing line for tracks drawn in the editor: walk downhill from just behind the
// start line back to it, reverse, smooth and resample. Same shape as a circuit's
// centreline so the same bot and position code can use it.
export function tracePath(f, line){
	if(!f) return null;
	const ax = line.a.x, az = line.a.y, bx = line.b.x, bz = line.b.y;
	let startK = -1, best = -1;
	for(let k = 0; k < f.w * f.h; k++){
		const d = f.dist[k];
		if(d < 0 || d > f.max) continue;
		const x = f.x0 + (k % f.w + 0.5) * CELL, z = f.z0 + (((k / f.w) | 0) + 0.5) * CELL;
		if(segDist(x, z, ax, az, bx, bz) < 3 && d > best){ best = d; startK = k; }
	}
	if(startK < 0) return null;
	const cells = [startK];
	let k = startK;
	for(let guard = 0; guard < 50000 && f.dist[k] > 0; guard++){
		const i = k % f.w, j = (k / f.w) | 0;
		let bk = -1, bd = f.dist[k];
		for(let dj = -1; dj <= 1; dj++) for(let di = -1; di <= 1; di++){
			if(!di && !dj) continue;
			const ii = i + di, jj = j + dj;
			if(ii < 0 || jj < 0 || ii >= f.w || jj >= f.h) continue;
			const kk = jj * f.w + ii, d = f.dist[kk];
			if(d >= 0 && d <= f.max && d < bd){ bd = d; bk = kk; }
		}
		if(bk < 0) break;
		k = bk;
		cells.push(k);
	}
	let pts = cells.reverse().map(c => [f.x0 + (c % f.w + 0.5) * CELL, f.z0 + (((c / f.w) | 0) + 0.5) * CELL]);
	// Smooth (closed loop) so the line cuts corners like a driver would.
	for(let pass = 0; pass < 12; pass++){
		const n = pts.length;
		pts = pts.map((p, i) => {
			let sx = 0, sz = 0;
			for(let o = -3; o <= 3; o++){ const q = pts[(i + o + n) % n]; sx += q[0]; sz += q[1]; }
			return [sx / 7, sz / 7];
		});
	}
	// Resample at 1 unit.
	let total = 0;
	const seg = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); total += l; return l; });
	const n = Math.max(8, Math.round(total));
	const xs = new Float64Array(n), zs = new Float64Array(n), tx = new Float64Array(n), tz = new Float64Array(n);
	let si = 0, acc = 0;
	for(let q = 0; q < n; q++){
		const want = q * total / n;
		while(acc + seg[si] < want && si < seg.length - 1){ acc += seg[si]; si++; }
		const p = pts[si], r = pts[(si + 1) % pts.length], t = seg[si] ? (want - acc) / seg[si] : 0;
		xs[q] = p[0] + (r[0] - p[0]) * t; zs[q] = p[1] + (r[1] - p[1]) * t;
	}
	for(let q = 0; q < n; q++){
		const a = (q - 1 + n) % n, b = (q + 1) % n;
		const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
		tx[q] = dx / l; tz[q] = dz / l;
	}
	const map = new Map();
	for(let q = 0; q < n; q++){
		const key = Math.floor(xs[q] / 8) + "," + Math.floor(zs[q] / 8);
		if(!map.has(key)) map.set(key, []);
		map.get(key).push(q);
	}
	const hash = {
		near(x, z, r, fn){
			for(let cx = Math.floor((x - r) / 8); cx <= Math.floor((x + r) / 8); cx++)
				for(let cz = Math.floor((z - r) / 8); cz <= Math.floor((z + r) / 8); cz++){
					const l = map.get(cx + "," + cz);
					if(l) for(const i of l) fn(i);
				}
		}
	};
	return { x: xs, z: zs, tx, tz, n, len: n, step: 1, hw: 3.5, hash };
}
