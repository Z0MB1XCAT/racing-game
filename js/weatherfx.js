// The look of weather that isn't the sky: a wet road that shines in puddles and wheel ruts and reflects the sky, snow
// settling on the ground, and lightning bolts. All looks (the handling never changes), and all of it is built only on
// High quality: Fast keeps the plain darker, wetter road and no bolts.
const THREE = globalThis.THREE;

// ---- A wet road ----
// uv.x runs across the road (0..1), uv.y along it, one road width per unit (js/materials.js, the ribbon in world.js).
// The mask says how much each bit of road shines: the wheel ruts (where the rubber is worn, at 0.3 and 0.7) hold water
// first, then puddles spread over the road as it gets wetter. It's worked out from the position, so it never repeats.
const PUDDLE_GLSL = `
	float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
	float pNoise(vec2 p){
		vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
		return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
	}
	float puddleMask(vec2 uv){
		float n = pNoise(vec2(uv.x * 2.4, uv.y * 0.55)) * 0.65 + pNoise(vec2(uv.x * 6.0 + 3.0, uv.y * 1.7)) * 0.35;
		float ruts = exp(-pow((uv.x - 0.3) / 0.09, 2.0)) + exp(-pow((uv.x - 0.7) / 0.09, 2.0));
		float pool = smoothstep(0.62 - 0.3 * uWet, 0.76 - 0.22 * uWet, n);
		return clamp(0.1 + 0.4 * ruts * uWet + 0.95 * pool, 0.0, 1.0);
	}`;
// Gives a road material (Phong, with its tarmac map) uniforms uWet and uSnow, 0..1, kept in mat.userData: the specular
// strength becomes the puddle mask (so the sky is reflected in the puddles only), and snow whitens the tarmac a little.
export function wetRoad(mat){
	const wet = { value: 0 }, snow = { value: 0 };
	mat.userData.wet = wet; mat.userData.snow = snow;
	mat.onBeforeCompile = shader => {
		shader.uniforms.uWet = wet; shader.uniforms.uSnow = snow;
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nuniform float uWet, uSnow;\n" + PUDDLE_GLSL)
			.replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * 0.55);")
			.replace("#include <specularmap_fragment>", "float specularStrength = puddleMask(vUv) * uWet * (1.0 - uSnow);");
	};
	mat.customProgramCacheKey = () => "wetroad";
	return { wet, snow };
}
// Snow settling on a ground material (Lambert): its colour fades towards white as uSnow (0..1) rises.
export function snowPatch(mat, strength = 0.9){
	const snow = { value: 0 };
	mat.onBeforeCompile = shader => {
		shader.uniforms.uSnow = snow;
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nuniform float uSnow;")
			.replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), uSnow * " + strength.toFixed(2) + ");");
	};
	mat.customProgramCacheKey = () => "snowground" + strength;
	return snow;
}

// ---- The sky as a wet road sees it ----
// A small equirectangular picture of the sky (its colours, the sun's glow, and at night the glow of the lights round
// the circuit) for the road to reflect; paint() draws it again when the sky has changed.
export function makeEnvSky(){
	const cv = document.createElement("canvas");
	cv.width = 128; cv.height = 64;
	const g = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv);
	tex.mapping = THREE.EquirectangularReflectionMapping;
	const c = new THREE.Color(), blobs = Array.from({ length: 16 }, (_, i) => [(i * 0.618034 % 1), 0.5 + ((i * 0.37) % 1 - 0.5) * 0.05, 0.5 + (i % 3) * 0.25]);
	const css = col => "#" + c.copy(col).getHexString();
	return {
		tex,
		// top and bottom: the sky's colours (THREE.Color); sunDir: a unit vector; sunAmt 0..1; lights 0..1 (floodlights on).
		paint(top, bottom, sunDir, sunColor, sunAmt, lights){
			const w = cv.width, h = cv.height;
			const gr = g.createLinearGradient(0, 0, 0, h);
			gr.addColorStop(0, css(top)); gr.addColorStop(0.5, css(bottom));
			c.copy(bottom).multiplyScalar(0.3);
			gr.addColorStop(0.55, css(c)); gr.addColorStop(1, css(c.multiplyScalar(0.5)));
			g.fillStyle = gr; g.fillRect(0, 0, w, h);
			const glow = (u, v, r, col, a) => {
				for(const dx of [-w, 0, w]){
					const x = u * w + dx, y = (1 - v) * h, rg = g.createRadialGradient(x, y, 0, x, y, r);
					rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
					g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
				}
			};
			if(sunAmt > 0.02){
				const u = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5, v = Math.asin(Math.max(-1, Math.min(1, sunDir.y))) / Math.PI + 0.5;
				c.copy(sunColor);
				glow(u, v, w * 0.07, `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`, Math.min(1, sunAmt));
			}
			if(lights > 0.05) for(const [u, v, k] of blobs) glow(u, 0.5 + (v - 0.5) * 2 - 0.02, w * 0.02 * k + 2, "255,214,150", Math.min(0.9, lights * 0.8));
			tex.needsUpdate = true;
		}
	};
}

// ---- Lightning ----
// A bolt from the cloud to the ground far off, three lines a hair apart so it has some thickness, with a couple of
// branches. strike(azimuth, distance) draws a new one; the caller shows it (line.visible / material.opacity) and keeps
// it with the camera (line.position).
export function makeBolt(){
	const SEG = 26, BRANCH = 7, COPIES = 3, per = (SEG + BRANCH * 2) * 2, pos = new Float32Array(COPIES * per * 3);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	const mat = new THREE.LineBasicMaterial({ color: 0xe6edff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
	const line = new THREE.LineSegments(geo, mat);
	line.frustumCulled = false; line.renderOrder = 12; line.visible = false;
	return {
		line,
		strike(az, dist){
			const rnd = () => Math.random() - 0.5, H = 460;
			const pts = [];
			let x = Math.cos(az) * dist, z = Math.sin(az) * dist, y = H;
			const trunk = [[x, y, z]];
			for(let i = 1; i <= SEG; i++){ x += rnd() * 26; z += rnd() * 26; y = H * (1 - i / SEG); trunk.push([x, y, z]); }
			for(let i = 0; i < SEG; i++) pts.push(trunk[i], trunk[i + 1]);
			for(let b = 0; b < 2; b++){
				let k = 6 + Math.floor(Math.random() * 12), [bx, by, bz] = trunk[k];
				const dx = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10);
				for(let i = 0; i < BRANCH; i++){ const nx = bx + dx + rnd() * 14, ny = by - 14 - Math.random() * 12, nz = bz + rnd() * 18; pts.push([bx, by, bz], [nx, ny, nz]); bx = nx; by = ny; bz = nz; }
			}
			let n = 0;
			for(const [ox, oz] of [[0, 0], [1.4, 0.6], [-1.2, -0.8]]) for(const p of pts){ pos[n++] = p[0] + ox; pos[n++] = p[1]; pos[n++] = p[2] + oz; }
			geo.setDrawRange(0, n / 3);
			geo.attributes.position.needsUpdate = true;
		}
	};
}
