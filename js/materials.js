// Surface detail for the road and the ground: fine textures that sit under the game's flat colours.
//
// detail("asphalt" | "grass", quality) gives a texture and whether it's a tint. If assets/ has a
// texture of that name (assets/manifest.json, see assets/README.md) that one is used; otherwise one is
// drawn here, the same every time. Drawn ones are near white, so they only darken the base colour a
// little (grain, patches, the rubbered line through the corners) and the look of each track stays
// what its theme says. A photographic texture in the manifest with "tint": false shows its own colours.
import { texture as assetTexture, textureDef } from "./assets.js";
const THREE = globalThis.THREE;

// A small seeded random number generator (mulberry32), so a texture is drawn the same every time.
function rng(seed){
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// A soft round patch of grey (0 black, 255 white) that wraps round the edges, so the texture tiles.
function patch(g, x, y, r, grey, alpha, w, h){
	for(const dx of [0, -w, w]) for(const dy of [0, -h, h]){
		const px = x + dx, py = y + dy;
		if(px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
		const gr = g.createRadialGradient(px, py, 0, px, py, r);
		gr.addColorStop(0, `rgba(${grey},${grey},${grey},${alpha})`);
		gr.addColorStop(1, `rgba(${grey},${grey},${grey},0)`);
		g.fillStyle = gr;
		g.fillRect(px - r, py - r, r * 2, r * 2);
	}
}

function make(w, h, seed, draw, clampAcross){
	const c = document.createElement("canvas");
	c.width = w; c.height = h;
	draw(c.getContext("2d"), w, h, rng(seed));
	const t = new THREE.CanvasTexture(c);
	t.wrapS = clampAcross ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
	t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

// Tarmac. u runs across the road, v along it (world.js ribbon). Two darker bands are the rubbered line
// the cars wear in, either side of the middle.
function asphalt(q){
	const s = q === "low" ? 256 : 512;
	return make(s, s, 11, (g, w, h, rnd) => {
		g.fillStyle = "#f3f3f3"; g.fillRect(0, 0, w, h);
		for(let i = 0; i < w * h / 1600; i++) patch(g, rnd() * w, rnd() * h, 8 + rnd() * 34, rnd() < 0.55 ? 0 : 255, 0.03 + rnd() * 0.05, w, h);
		for(const u of [0.3, 0.7]){
			const x0 = (u - 0.12) * w, gr = g.createLinearGradient(x0, 0, x0 + 0.24 * w, 0);
			gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(0,0,0,0.11)"); gr.addColorStop(1, "rgba(0,0,0,0)");
			g.fillStyle = gr; g.fillRect(x0, 0, 0.24 * w, h);
		}
		const img = g.getImageData(0, 0, w, h), d = img.data;
		for(let i = 0; i < d.length; i += 4){
			const n = (rnd() + rnd() + rnd() - 1.5) * 20;         // the grain of the stone
			d[i] += n; d[i + 1] += n; d[i + 2] += n;
		}
		g.putImageData(img, 0, 0);
	}, true);
}

// Short grass: fine strokes and broad patches. Tiles every 10 world units (the terrain's own uv).
function grass(q){
	const s = q === "low" ? 256 : 512;
	return make(s, s, 23, (g, w, h, rnd) => {
		g.fillStyle = "#f2f2f2"; g.fillRect(0, 0, w, h);
		for(let i = 0; i < w * h / 2600; i++) patch(g, rnd() * w, rnd() * h, 14 + rnd() * 46, rnd() < 0.5 ? 150 : 255, 0.05 + rnd() * 0.07, w, h);
		g.lineWidth = 1;
		for(let i = 0; i < w * h / 7; i++){
			const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 2 + rnd() * 5, v = rnd() < 0.55 ? 205 + rnd() * 25 : 255;
			g.strokeStyle = `rgba(${v},${v},${v},0.32)`;
			g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
		}
	}, false);
}

const KINDS = { asphalt, grass };
const cache = new Map();

// { texture, tint }: what to put on the material's `map`, and whether it multiplies the base colour
// (tint) or replaces it (a photo: set the material's colour to white).
export function detail(kind, quality){
	const fromAsset = assetTexture(kind);
	if(fromAsset) return { texture: fromAsset, tint: (textureDef(kind) || {}).tint !== false, fromAsset: true };
	const key = kind + ":" + (quality === "low" ? "low" : "high");
	if(!cache.has(key)) cache.set(key, { texture: KINDS[kind](quality), tint: true, fromAsset: false });
	return cache.get(key);
}
