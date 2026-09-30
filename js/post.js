// The finishing pass over the picture: a glow round bright lights (windows and floodlights at night, the
// sun, headlights), then one last pass that smooths jagged edges (FXAA), gives the colours a little more
// contrast and warmth, darkens the corners a touch and dithers the smooth skies so they don't band.
//
// It draws the scene into an off-screen picture first, so it costs real time on a slow graphics chip:
// js/gfx.js turns it off (the "post" part of its ladder) before anything else when a computer can't keep
// up, and then the scene is drawn straight to the screen exactly as it always was. Nothing here touches
// what the cars look like by itself: the grade is gentle, and only the bright glow is added to them.
const THREE = globalThis.THREE;

// The last pass: FXAA, then grade, vignette and dither, in one go.
const FinishShader = {
	uniforms: {
		tDiffuse: { value: null },
		uPx: { value: new THREE.Vector2(1 / 1280, 1 / 720) },   // one pixel, in uv
		uContrast: { value: 1.07 },
		uSaturation: { value: 1.06 },
		uVignette: { value: 0.2 },
		uWarm: { value: 0 },        // 0..1: how golden the light is (low sun)
		uNight: { value: 0 },       // 0..1
		uFxaa: { value: 1 }
	},
	vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
	fragmentShader: `
		uniform sampler2D tDiffuse; uniform vec2 uPx;
		uniform float uContrast, uSaturation, uVignette, uWarm, uNight, uFxaa;
		varying vec2 vUv;
		// FXAA: blend along edges (the classic nine-tap version).
		vec3 fxaa(vec2 uv){
			vec3 rgbNW = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * uPx).rgb;
			vec3 rgbNE = texture2D(tDiffuse, uv + vec2( 1.0, -1.0) * uPx).rgb;
			vec3 rgbSW = texture2D(tDiffuse, uv + vec2(-1.0,  1.0) * uPx).rgb;
			vec3 rgbSE = texture2D(tDiffuse, uv + vec2( 1.0,  1.0) * uPx).rgb;
			vec3 rgbM = texture2D(tDiffuse, uv).rgb;
			vec3 luma = vec3(0.299, 0.587, 0.114);
			float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
			float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
			float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
			vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
			float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
			float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
			dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
			vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
			vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv + dir * -0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
			float lB = dot(b, luma);
			return (lB < lMin || lB > lMax) ? a : b;
		}
		void main(){
			vec3 c = uFxaa > 0.5 ? fxaa(vUv) : texture2D(tDiffuse, vUv).rgb;
			float l = dot(c, vec3(0.299, 0.587, 0.114));
			c = mix(vec3(l), c, uSaturation);                               // a little more colour
			c = (c - 0.46) * uContrast + 0.46;                              // a little more contrast
			// Warm highlights when the sun is low, cool shadows, and deeper blue shadows at night.
			c += vec3(0.060, 0.030, -0.030) * uWarm * smoothstep(0.35, 0.95, l);
			c += vec3(-0.006, 0.002, 0.016) * (1.0 - l) * (0.6 + uNight);
			// Corners a touch darker.
			vec2 q = vUv - 0.5;
			c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
			// Dither (one step of 8 bits, in a scatter): smooth gradients don't show bands.
			c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
			gl_FragColor = vec4(c, 1.0);
		}`
};

export class Post {
	constructor(renderer, scene, camera){
		this.renderer = renderer; this.scene = scene; this.camera = camera;
		const c = this.composer = new THREE.EffectComposer(renderer);
		this.renderPass = new THREE.RenderPass(scene, camera);
		const size = renderer.getSize(new THREE.Vector2());
		this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.15, 0.55, 0.9);
		this.finish = new THREE.ShaderPass(FinishShader);
		c.addPass(this.renderPass);
		c.addPass(this.bloom);
		c.addPass(this.finish);
		this._clear = new THREE.Color();
		this.resize();
	}
	// Match the renderer (its pixel ratio and size): after either changes.
	resize(){
		const r = this.renderer, pr = r.getPixelRatio(), s = r.getSize(new THREE.Vector2());
		this.composer.setPixelRatio(pr);
		this.composer.setSize(s.x, s.y);
		this.bloom.setSize(s.x * pr / 2, s.y * pr / 2);        // (the glow is blurred anyway: a quarter of the pixels do)
		this.finish.uniforms.uPx.value.set(1 / (s.x * pr), 1 / (s.y * pr));
	}
	// look: the world's { night, lights, rain, warm } (js/world.js); both are 0..1.
	render(look){
		const n = look ? look.night : 0, lights = look ? look.lights : 0, rain = look ? look.rain : 0, warm = look ? (look.warm || 0) : 0;
		// Glow: a hint by day (the sun, white kerbs), a lot at night where the lights are.
		this.bloom.strength = 0.1 + 0.42 * n + 0.12 * lights * n - 0.05 * rain;
		this.bloom.threshold = 0.92 - 0.2 * n;
		this.bloom.radius = 0.5 + 0.2 * n;
		// By day it would barely show, so the pass is skipped (it's the dearest part): only dusk and night have it.
		this.bloom.enabled = n > 0.12;
		const u = this.finish.uniforms;
		u.uWarm.value = warm;
		u.uNight.value = n;
		// The scene's own background colour (tracks with no sky dome), since the pass clears for itself.
		this.renderPass.clearColor = this.scene.background && this.scene.background.isColor ? this._clear.copy(this.scene.background) : null;
		this.composer.render();
	}
	dispose(){
		this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
		this.bloom.dispose();
	}
}
