// Rebuilds vendor/three-r128/postprocessing.js: the glow (bloom) and pass-chaining parts of three.js r128's
// examples, in one file, loaded by a plain <script> after three.min.js (see vendor/README.md).
//   node tools/vendor-post.mjs
import { writeFileSync } from "node:fs";

const BASE = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/";
// In dependency order (the composer defines THREE.Pass, which the others extend).
const FILES = ["shaders/CopyShader.js", "shaders/LuminosityHighPassShader.js", "postprocessing/EffectComposer.js", "postprocessing/MaskPass.js",
	"postprocessing/RenderPass.js", "postprocessing/ShaderPass.js", "postprocessing/UnrealBloomPass.js"];

let out = `// three.js r128 examples (MIT, © three.js authors), joined in one file by tools/vendor-post.mjs. Don't edit by hand.
// Sources: ${FILES.map(f => BASE + f).join("\n//   ")}
`;
for(const f of FILES){
	const r = await fetch(BASE + f);
	if(!r.ok) throw new Error(f + ": " + r.status);
	out += "\n// ---- " + f + " ----\n" + await r.text();
}
writeFileSync(new URL("../vendor/three-r128/postprocessing.js", import.meta.url), out);
console.log("vendor/three-r128/postprocessing.js", (out.length / 1024).toFixed(1) + " KB");
