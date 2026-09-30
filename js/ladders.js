// The quality ladders (see js/gfx.js and js/adaptive.js): plain data, so the tests can use them without a browser.
// Step 0 is the best looking; each step after it is cheaper. scale is the share of the full pixel ratio
// (so 0.75 draws 56% of the pixels and the browser stretches them to fit). The cheap things go first:
// a little sharpness, then the glow, then more sharpness, then the shadows, and last of all, a lot more sharpness.
// mirror: how often the rear-view mirror is drawn, every Nth frame. It's a whole second drawing of the scene (on
// Monaco, nearly half of everything the graphics chip is asked to draw), so it gets slower before the picture does.
// density: the share of the trees drawn (the forests are most of what's drawn on Spa, Monza and Suzuka).
export const LADDERS = {
	high: [
		{ scale: 1.00, post: true, shadows: true, mirror: 1, density: 1 },
		{ scale: 0.88, post: true, shadows: true, mirror: 1, density: 1 },
		{ scale: 0.88, post: false, shadows: true, mirror: 2, density: 1 },
		{ scale: 0.75, post: false, shadows: true, mirror: 2, density: 0.85 },
		{ scale: 0.75, post: false, shadows: false, mirror: 3, density: 0.7 },
		{ scale: 0.62, post: false, shadows: false, mirror: 4, density: 0.55 },
		{ scale: 0.50, post: false, shadows: false, mirror: 6, density: 0.4 }
	],
	// (Fast has no shadows and no glow to begin with: only the sharpness, the mirror and the trees move. Its
	// mirror was already drawn every other frame.)
	low: [[1, 2, 1], [0.85, 2, 1], [0.72, 3, 0.8], [0.6, 4, 0.6], [0.5, 6, 0.45]].map(([scale, mirror, density]) => ({ scale, post: false, shadows: false, mirror, density }))
};
