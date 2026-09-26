// Fastest believable lap per track. A car can't go faster than top speed
// (0.4 per frame = 24 units a second), so a lap can't beat the racing line's
// length divided by that. We allow 18% under it, which no real lap gets near,
// and refuse anything quicker as a fake.
const TOP_SPEED = 24;       // world units per second
const MARGIN = 0.82;

export function minLapMs(entry){
	const len = entry.track.center ? entry.track.center.len : entry.tracker.path ? entry.tracker.path.len : 250;
	return Math.floor(len / TOP_SPEED * 1000 * MARGIN);
}
