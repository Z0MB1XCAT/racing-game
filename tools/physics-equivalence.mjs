// Runs the ORIGINAL game's physics loop (pulled straight out of original/script.js)
// next to js/physics.js on the Classic track with the same random inputs, and checks
// that every car ends up in exactly the same place with exactly the same velocity.
//
//   node tools/physics-equivalence.mjs
//
// Needs the upstream repo cloned into ./original and three.js r128 at $THREE_PATH
// (or ./tools/three.min.cjs).
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const threePath = process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
if(!existsSync(threePath)){
	console.error("three.js not found at " + threePath + " (set THREE_PATH)");
	process.exit(2);
}
globalThis.THREE = require(threePath);
const THREE = globalThis.THREE;
const phys = await import("../js/physics.js");
const { CLASSIC_CODE } = await import("../js/tracks.js");

const src = readFileSync(new URL("../original/script.js", import.meta.url), "utf8");
const startMarker = "if(!gameSortaStarted){";
const a = src.indexOf(startMarker) + startMarker.length;
const oobMarker = "if(play.model.position.distanceTo(new THREE.Vector3()) > OOB_DIST){";
const b = src.indexOf("}", src.indexOf("}", src.indexOf(oobMarker)) + 1) + 1;
let loop = src.slice(a, b);
// The original shows a winner banner from inside the loop; that's UI, not physics.
{
	const w = loop.indexOf("if(play.data.lap > LAPS");
	let i = loop.indexOf("{", w), depth = 0;
	for(; i < loop.length; i++){
		if(loop[i] == "{") depth++;
		if(loop[i] == "}" && --depth == 0) break;
	}
	loop = loop.slice(0, w) + loop.slice(i + 1);
}
if(!loop.includes("for(var p in players)") || loop.includes("countdown")) throw new Error("couldn't extract the original loop");

const originalStep = new Function("players", "map", "startc", "warp", "THREE",
	"var SPEED = 0.004, COLLISION = 1.1, BOUNCE = 0.7, BOUNCE_CORRECT = 0.01, WALL_SIZE = 1.2, OOB_DIST = 200, LAPS = 3;\n" + loop);

// Build the Classic track both ways: the original loadMap() way and ours.
const parts = CLASSIC_CODE.trim().split("|");
const mapscale = 5;
function origWalls(text, y, withEnds){
	const out = [];
	for(const seg of text.trim().split(" ")){
		if(seg == "") continue;
		const point1 = new THREE.Vector2(parseInt(seg.split("/")[0].split(",")[0]), parseInt(seg.split("/")[0].split(",")[1]));
		const point2 = new THREE.Vector2(parseInt(seg.split("/")[1].split(",")[0]), parseInt(seg.split("/")[1].split(",")[1]));
		const angle = Math.atan2((point1.y - point2.y), (point1.x - point2.x));
		const wall = { position: new THREE.Vector3(-(point1.x + point2.x) / 2 * mapscale, y, (point1.y + point2.y) / 2 * mapscale) };
		wall.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
		wall.width = point1.distanceTo(point2) * mapscale;
		if(withEnds){
			wall.p1 = point1.multiply(new THREE.Vector2(-mapscale, mapscale));
			wall.p2 = point2.multiply(new THREE.Vector2(-mapscale, mapscale));
		}
		out.push(wall);
	}
	return out;
}
const map = { children: origWalls(parts[0], 0.75, true) };
const startc = { children: origWalls(parts[1], 0, false) };

const seg = s => s.trim().split(" ").filter(Boolean).map(t => t.split("/").flatMap(p => p.split(",").map(Number)));
const walls = seg(parts[0]).map(([x1, y1, x2, y2]) => phys.wallFromTrackUnits(x1, y1, x2, y2));
const lines = seg(parts[1]).map(([x1, y1, x2, y2]) => phys.lineFromTrackUnits(x1, y1, x2, y2));

// Deterministic random inputs.
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const N = 8, FRAMES = 20000;
const players = {}, cars = [];
for(let i = 0; i < N; i++){
	const g = phys.GRID[i];
	const base = { x: g.x, y: g.y, xv: 0, yv: 0, dir: 0, steer: 0, checkpoint: 1, lap: 0 };
	players["p" + i] = {
		data: { ...base },
		model: { position: new THREE.Vector3(g.x, 0.6, g.y), rotation: { y: 0 }, children: [{ rotation: {} }, { rotation: {} }] }
	};
	cars.push({ data: { ...base }, pos: new THREE.Vector3(g.x, 0.6, g.y) });
}

let maxDiff = 0, laps = 0, hits = 0;
for(let f = 0; f < FRAMES; f++){
	const warp = 0.5 + rnd() * 2;
	for(let i = 0; i < N; i++){
		const r = rnd();
		const steer = r < 0.3 ? Math.PI / 6 : r < 0.6 ? -Math.PI / 6 : r < 0.8 ? 0 : (rnd() - 0.5) * 2;
		players["p" + i].data.steer = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, steer));
		cars[i].data.steer = players["p" + i].data.steer;
	}
	originalStep(players, map, startc, warp, THREE);
	phys.stepCars(cars, walls, lines, 200, warp, () => hits++);
	for(let i = 0; i < N; i++){
		const o = players["p" + i].data, m = cars[i].data;
		for(const k of ["x", "y", "xv", "yv", "dir", "lap", "checkpoint"]){
			const diff = Math.abs(o[k] - m[k]);
			if(!(diff === 0)){
				console.error(`MISMATCH frame ${f} car ${i} ${k}: original=${o[k]} ours=${m[k]}`);
				process.exit(1);
			}
			maxDiff = Math.max(maxDiff, diff);
		}
	}
}
for(const c of cars) laps += c.data.lap;
console.log(`physics-equivalence: OK - ${N} cars x ${FRAMES} frames on Classic, bit-identical (collisions: ${hits}, laps counted: ${laps})`);
