// Where each car is around the lap: race order, the wrong-way warning and bots all use this.
import { nearestOnPath } from "./trackgen.js";
import { buildNavField, tracePath } from "./navfield.js";

export function makeTracker(track){
	const last = track.lines.length - 1;
	// Circuits have a centreline; editor tracks get a racing line traced through a distance map.
	const field = track.center ? null : buildNavField(track);
	const path = track.center || tracePath(field, track.lines[0]);
	return {
		track, field, path,
		update(car){
			if(!path){ car.frac = 0; car.tanX = 0; car.tanZ = 1; return; }
			car.ci = nearestOnPath(path, car.data.x, car.data.y, car.ci ?? 0);
			car.frac = fix(car, car.ci / path.n);
			car.tanX = path.tx[car.ci];
			car.tanZ = path.tz[car.ci];
		}
	};

	// Keep the fraction in step with the lap counter right at the line.
	function fix(car, frac){
		if(car.data.checkpoint === 0 && frac > 0.5) return 0;
		if(car.data.checkpoint === last && frac < 0.25 && car.data.lap > 0) return 0.9999;
		return frac;
	}
}

export function raceProgress(car){
	return car.data.lap + (car.frac || 0);
}
