// Shared bot race used by track-sim and track-preview.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.THREE ??= require(process.env.THREE_PATH || new URL("./three.min.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const THREE = globalThis.THREE;
const { seededRandom } = await import("../js/trackgen.js");
const phys = await import("../js/physics.js");
const { raceProgress } = await import("../js/progress.js");
const { Bot } = await import("../js/bots.js");
const { applySlipstream } = await import("../js/slipstream.js");
const { isOffTrack, noteGoodSpot, rescue, OFF_TRACK_GRACE } = await import("../js/rescue.js");

export function race(track, tracker, skills, laps, opts = {}){
	const rand = seededRandom("sim" + (opts.seed || 0));
	const cars = skills.map((skill, k) => ({
		data: phys.newCarData(k, track.lines.length),
		pos: new THREE.Vector3(phys.GRID[k].x, phys.CAR_Y, phys.GRID[k].y),
		bot: new Bot(skill, rand, Object.assign({}, track.def && track.def.botTune, opts.overrides)),
		hits: 0, lapStart: null, laps: [], finished: null, best: 0, bestT: 0, stuck: 0, oob: 0
	}));
	const dt = 1 / 60, warp = opts.warp || 1;
	let t = 0;
	const lapLen = track.center ? track.center.len : (tracker.field ? tracker.field.max : 400);
	const maxT = laps * lapLen / 24 * 4 + 60;
	const trail = [], hitsAt = [];
	let leader = null, leadChanges = 0;
	while(t < maxT && cars.some(c => c.finished === null)){
		for(const c of cars){
			tracker.update(c);
			c.data.steer = phys.clampSteer(c.bot.steer(c, tracker, cars, dt * warp));
		}
		const before = cars.map(c => c.data.lap);
		if(opts.draft) applySlipstream(cars, warp);
		phys.stepCars(cars, track.walls, track.lines, track.oob, warp, (type, car, s) => { if(type === "wall" && s > 0.05){ car.hits++; if(car === cars[0]) hitsAt.push([car.data.x, car.data.y]); } });
		t += dt * warp;
		if(Math.round(t * 60) % 6 === 0) trail.push([cars[0].data.x, cars[0].data.y]);
		if(cars.length > 1 && t > 3){ const L = cars.reduce((a, b) => raceProgress(b) > raceProgress(a) ? b : a); if(L !== leader){ if(leader) leadChanges++; leader = L; } }
		for(const c of cars){
			tracker.update(c);
			noteGoodSpot(track, tracker, c, t);
			if(isOffTrack(track, tracker, c)){
				c.offSince ??= t;
				if(t - c.offSince > OFF_TRACK_GRACE){ c.escapes = (c.escapes || 0) + 1; rescue(track, tracker, c, cars); }
			}else c.offSince = null;
			if(!opts.noStuckRescue && t - (c.bestT || 0) > 4 && t > 5){ c.unsticks = (c.unsticks || 0) + 1; rescue(track, tracker, c, cars); c.bestT = t; }
		}
		cars.forEach((c, k) => {
			if(Math.hypot(c.data.x, c.data.y) < 0.001 && t > 1) c.oob++;
			if(c.data.lap > before[k]){
				if(c.lapStart !== null) c.laps.push(t - c.lapStart);
				c.lapStart = t;
				if(c.data.lap > laps && c.finished === null) c.finished = t;
			}
			const p = raceProgress(c);
			if(p > c.best + 0.002){ c.best = p; c.bestT = t; }
			if(t - c.bestT > c.stuck) c.stuck = t - c.bestT;
		});
	}
	return { cars, t, trail, hitsAt, leadChanges };
}

