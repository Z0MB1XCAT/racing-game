// How far every spot round a track is from the nearest road (the track's centreline, and the
// closed-off roads of the venue's other layouts), on a grid, worked out once. Much quicker than
// searching for the road from each spot when there are hundreds of thousands of them (the trees
// of a forest, the ground under a whole town).

// A grid over the track's area plus pad all round, cells `cell` apart. dist(x, z): distance to the
// nearest road centreline (to within about a cell), or Infinity off the grid.
export function roadField(track, pad = 700, cell = 4){
	const key = pad + "/" + cell;
	if(track._roadField && track._roadField.key === key) return track._roadField;
	const c = track.center, b = track.bounds;
	const x0 = b.minX - pad, z0 = b.minZ - pad;
	const W = Math.ceil((b.maxX - b.minX + pad * 2) / cell) + 1, D = Math.ceil((b.maxZ - b.minZ + pad * 2) / cell) + 1;
	const d = new Float32Array(W * D).fill(1e9);
	// Exact distances from each road point to the grid points round it...
	const seed = (x, z) => {
		const gi = Math.round((x - x0) / cell), gj = Math.round((z - z0) / cell);
		for(let j = gj - 1; j <= gj + 1; j++) for(let i = gi - 1; i <= gi + 1; i++){
			if(i < 0 || j < 0 || i >= W || j >= D) continue;
			const k = j * W + i, v = Math.hypot(x0 + i * cell - x, z0 + j * cell - z);
			if(v < d[k]) d[k] = v;
		}
	};
	for(let i = 0; i < c.n; i++) seed(c.x[i], c.z[i]);
	if(track.remnantSpace) for(const p of track.remnantSpace.pts) seed(p.x, p.z);
	// ...then spread across the grid (a chamfer transform: two sweeps, straight and diagonal steps).
	const s1 = cell, s2 = cell * Math.SQRT2;
	for(let j = 0; j < D; j++) for(let i = 0; i < W; i++){
		const k = j * W + i;
		let v = d[k];
		if(i > 0) v = Math.min(v, d[k - 1] + s1);
		if(j > 0){ v = Math.min(v, d[k - W] + s1); if(i > 0) v = Math.min(v, d[k - W - 1] + s2); if(i < W - 1) v = Math.min(v, d[k - W + 1] + s2); }
		d[k] = v;
	}
	for(let j = D - 1; j >= 0; j--) for(let i = W - 1; i >= 0; i--){
		const k = j * W + i;
		let v = d[k];
		if(i < W - 1) v = Math.min(v, d[k + 1] + s1);
		if(j < D - 1){ v = Math.min(v, d[k + W] + s1); if(i < W - 1) v = Math.min(v, d[k + W + 1] + s2); if(i > 0) v = Math.min(v, d[k + W - 1] + s2); }
		d[k] = v;
	}
	const field = {
		key, x0, z0, W, D, cell,
		dist(x, z){
			const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
			if(i < 0 || j < 0 || i >= W || j >= D) return Infinity;
			return d[j * W + i];
		}
	};
	track._roadField = field;
	return field;
}
