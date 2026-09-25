// Getting cars back onto the track. The handling is untouched: a rescued car is
// simply placed back on the racing line, pointing the right way, at a standstill
// (standing still is the time penalty).
import { fieldValue, fieldAhead } from "./navfield.js";

export const OFF_TRACK_GRACE = 1.0;   // seconds outside the walls before an automatic rescue

// True when the car has ended up outside the walls.
export function isOffTrack(track, tracker, car){
	const d = car.data;
	if(track.center){
		const c = track.center, i = car.ci ?? 0;
		const lateral = Math.abs((d.x - c.x[i]) * c.tz[i] - (d.y - c.z[i]) * c.tx[i]);
		const along = Math.abs((d.x - c.x[i]) * c.tx[i] + (d.y - c.z[i]) * c.tz[i]);
		return lateral > c.hw + 1.5 || along > c.hw * 2;
	}
	return tracker.field ? fieldValue(tracker.field, d.x, d.y) < 0 : false;
}

// Remember where the car last was on track so a rescue has somewhere to go.
export function noteGoodSpot(track, tracker, car, now){
	if(car.lastGoodAt && now - car.lastGoodAt < 0.4) return;
	if(isOffTrack(track, tracker, car)) return;
	car.lastGoodAt = now;
	car.lastGood = { x: car.data.x, y: car.data.y, ci: car.ci };
}

export function rescue(track, tracker, car, others = []){
	const d = car.data;
	if(track.center){
		const c = track.center;
		let i = (car.ci ?? 0);
		// Step back a little, and further if another car is sitting on the spot.
		for(let tries = 0; tries < 12; tries++){
			const j = (i - 6 - tries * 4 + c.n) % c.n;
			const x = c.x[j], z = c.z[j];
			if(others.every(o => o === car || Math.hypot(o.data.x - x, o.data.y - z) > 3)){ i = j; break; }
		}
		d.x = c.x[i]; d.y = c.z[i];
		d.dir = Math.atan2(c.tx[i], c.tz[i]);
		car.ci = i;
	}else{
		const g = car.lastGood || { x: 0, y: 0 };
		d.x = g.x; d.y = g.y;
		const ahead = tracker.field && fieldAhead(tracker.field, g.x, g.y, 6);
		d.dir = ahead ? Math.atan2(ahead.x - g.x, ahead.z - g.y) : 0;
	}
	d.xv = 0; d.yv = 0; d.steer = 0;
	if(car.pos){ car.pos.x = d.x; car.pos.z = d.y; }
	car.offSince = null;
	car.rescues = (car.rescues || 0) + 1;
}
