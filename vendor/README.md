# Vendored libraries

Files here are copied in on purpose (the game has no build step, and a school network may block
some CDNs), and never edited by hand.

## three-r128/GLTFLoader.js

The glTF / GLB model loader that goes with three.js **r128**, the version the game loads from cdnjs
(`index.html`). Loaded by a plain `<script>` right after `three.min.js`; it adds `THREE.GLTFLoader`.

- Source: https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js (npm `three@0.128.0`)
- Licence: MIT, © three.js authors (https://github.com/mrdoob/three.js/blob/r128/LICENSE)
- Not included on purpose: the Draco and KTX2 decoders. Models and textures must be plain
  (uncompressed) glTF/GLB with PNG/JPEG/WebP textures (see `assets/README.md`).

## three-r128/postprocessing.js

The glow (bloom) and pass-chaining parts of three.js r128's examples (EffectComposer, RenderPass, ShaderPass,
MaskPass, UnrealBloomPass, CopyShader, LuminosityHighPassShader), joined in one file by
`node tools/vendor-post.mjs` from the npm `three@0.128.0` package. MIT, Â© three.js authors. Loaded after
`three.min.js`; used by `js/post.js`.

If the game ever moves to another three.js version, replace these files with the matching ones.
