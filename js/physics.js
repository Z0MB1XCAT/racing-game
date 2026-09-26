// Car handling from the original game (jchabin/cars, script.js render loop).
//
// The maths below is the original, statement for statement, in the same order.
// Only the containers changed: cars live in an array instead of the `players`
// object, and each car keeps its physics position in `car.pos` instead of on its
// mesh. Two guards were added that never fire in normal driving:
//   - the caller caps `warp` so a frozen tab can't teleport cars through walls;
//   - the push-out `while` loops give up after PUSH_LIMIT steps instead of hanging
//     (only reachable if a car is stuck with exactly zero speed).
// Lap counting accepts any number of checkpoint lines, in order. With the two
// lines the original tracks have, it behaves exactly like the original.
//
// tools/physics-equivalence.mjs runs this against the original code and checks
// the results match exactly.
//
// One optional addition: `contact = "soft"` swaps the car-to-car collision for a
// gentler one (see softContact). Left out, everything is the original.

const THREE = globalThis.THREE;

export const SPEED = 0.004;
export const COLLISION = 1.1;
export const BOUNCE = 0.7;
export const BOUNCE_CORRECT = 0.01;
export const WALL_SIZE = 1.2;
export const MAP_SCALE = 5;
export const MAX_STEER = Math.PI / 6;
export const CAR_Y = 0.6;
export const MAX_WARP = 3;
const PUSH_LIMIT = 200000;

// Starting grid from the original game, relative to the origin, facing +z.
export const GRID = [
	{x: 0, y: 0}, {x: 2, y: 0}, {x: -2, y: 0},
	{x: 0, y: -3}, {x: -2, y: -3}, {x: 2, y: -3},
	{x: 0, y: -6}, {x: 2, y: -6}, {x: -2, y: -6},
	{x: 0, y: -9}, {x: 2, y: -9}, {x: -2, y: -9},
	{x: 0, y: -12}, {x: -2, y: -12}, {x: 2, y: -12},
	{x: 0, y: -15}, {x: 2, y: -15}, {x: -2, y: -15}
];

export function newCarData(slot, lineCount){
	const g = GRID[slot % GRID.length];
	return {
		x: g.x, y: g.y, xv: 0, yv: 0, dir: 0, steer: 0,
		// "Ready to count a lap" – the original started everyone on checkpoint 1 of 2.
		checkpoint: Math.max(1, lineCount - 1),
		lap: 0
	};
}

// A wall from an original-format track code (grid units), built exactly like loadMap().
export function wallFromTrackUnits(x1, y1, x2, y2){
	const point1 = new THREE.Vector2(x1, y1);
	const point2 = new THREE.Vector2(x2, y2);
	const angle = Math.atan2((point1.y - point2.y), (point1.x - point2.x));
	const wall = {
		position: new THREE.Vector3(-(point1.x + point2.x) / 2 * MAP_SCALE, 0.75, (point1.y + point2.y) / 2 * MAP_SCALE),
		angle: angle,
		plane: new THREE.Plane(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
		width: point1.distanceTo(point2) * MAP_SCALE
	};
	wall.p1 = point1.multiply(new THREE.Vector2(-MAP_SCALE, MAP_SCALE));
	wall.p2 = point2.multiply(new THREE.Vector2(-MAP_SCALE, MAP_SCALE));
	return wall;
}

// A wall in world units (x, z). Same shape of object as above.
export function wallFromWorld(x1, z1, x2, z2){
	const angle = Math.atan2(z1 - z2, x2 - x1);
	return {
		position: new THREE.Vector3((x1 + x2) / 2, 0.75, (z1 + z2) / 2),
		angle: angle,
		plane: new THREE.Plane(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
		width: Math.hypot(x2 - x1, z2 - z1),
		p1: new THREE.Vector2(x1, z1),
		p2: new THREE.Vector2(x2, z2)
	};
}

export function lineFromTrackUnits(x1, y1, x2, y2){
	const point1 = new THREE.Vector2(x1, y1);
	const point2 = new THREE.Vector2(x2, y2);
	const angle = Math.atan2((point1.y - point2.y), (point1.x - point2.x));
	return {
		position: new THREE.Vector3(-(point1.x + point2.x) / 2 * MAP_SCALE, 0, (point1.y + point2.y) / 2 * MAP_SCALE),
		angle: angle,
		plane: new THREE.Plane(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
		width: point1.distanceTo(point2) * MAP_SCALE,
		a: new THREE.Vector2(-x1 * MAP_SCALE, y1 * MAP_SCALE),
		b: new THREE.Vector2(-x2 * MAP_SCALE, y2 * MAP_SCALE)
	};
}

export function lineFromWorld(x1, z1, x2, z2){
	const angle = Math.atan2(z1 - z2, x2 - x1);
	return {
		position: new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2),
		angle: angle,
		plane: new THREE.Plane(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
		width: Math.hypot(x2 - x1, z2 - z1),
		a: new THREE.Vector2(x1, z1),
		b: new THREE.Vector2(x2, z2)
	};
}

// Keyboard steering, as the original did it for the local player.
export function keyboardSteer(left, right){
	let steer = 0;
	if(left)
		steer = Math.PI / 6;
	if(right)
		steer = -Math.PI / 6;
	if(!(left ^ right))
		steer = 0;
	return steer;
}

export function clampSteer(steer){
	return Math.max(-Math.PI / 6, Math.min(Math.PI / 6, steer));
}

// One physics tick for every car. `cars` are {data, pos}; `walls` and `lines`
// come from the track; `oob` is the out-of-bounds radius.
// `hit(type, car, strength, other)` is called on collisions, only for sound and effects.
export function stepCars(cars, walls, lines, oob, warp, hit, contact){
	const soft = contact === "soft";
	for(let n = 0; n < cars.length; n++){
		const play = cars[n];
		const d = play.data;

		d.dir += d.steer / 10 * warp;

		d.xv += Math.sin(d.dir) * SPEED * warp;
		d.yv += Math.cos(d.dir) * SPEED * warp;

		d.xv *= Math.pow(0.99, warp);
		d.yv *= Math.pow(0.99, warp);

		d.x += d.xv * warp;
		d.y += d.yv * warp;

		play.pos.x = d.x + d.xv;
		play.pos.z = d.y + d.yv;

		for(let w = 0; w < walls.length; w++){
			const wall = walls[w];
			const posi = new THREE.Vector2(d.x, d.y);
			if(Math.abs(wall.plane.distanceToPoint(play.pos.clone().sub(wall.position))) < WALL_SIZE){
				if(wall.position.clone().distanceTo(play.pos) < wall.width / 2){
					const before = Math.hypot(d.xv, d.yv);
					const vel = new THREE.Vector3(d.xv, 0, d.yv);
					vel.reflect(wall.plane.normal);
					d.xv = vel.x + BOUNCE_CORRECT * wall.plane.normal.x * Math.sign(wall.plane.normal.dot(play.pos.clone().sub(wall.position)));
					d.yv = vel.z + BOUNCE_CORRECT * wall.plane.normal.z * Math.sign(wall.plane.normal.dot(play.pos.clone().sub(wall.position)));
					let guard = 0;
					const limit = soft ? slideSteps(d) : PUSH_LIMIT;
					while(Math.abs(wall.plane.distanceToPoint(new THREE.Vector3(d.x, 0, d.y).sub(wall.position))) < WALL_SIZE && guard++ < limit){
						d.x += d.xv;
						d.y += d.yv;
					}
					if(soft && guard > limit) clearOfPlane(d, wall);
					d.xv *= BOUNCE;
					d.yv *= BOUNCE;
					if(hit) hit("wall", play, before * Math.abs(wall.plane.normal.x * Math.sin(d.dir) + wall.plane.normal.z * Math.cos(d.dir)) + before * 0.25);
				}
			}
			if(posi.distanceTo(wall.p1) < WALL_SIZE + 0.1){
				const before = Math.hypot(d.xv, d.yv);
				let norm = posi.clone().sub(wall.p1);
				norm = new THREE.Vector3(norm.x, 0, norm.y);
				norm.normalize();
				const vel = new THREE.Vector3(d.xv, 0, d.yv);
				vel.reflect(norm);
				d.xv = vel.x + norm.x * BOUNCE_CORRECT * 1;
				d.yv = vel.z + norm.z * BOUNCE_CORRECT * 1;
				let guard = 0;
				const limit = soft ? slideSteps(d) : PUSH_LIMIT;
				while((new THREE.Vector2(d.x, d.y)).distanceTo(wall.p1) < WALL_SIZE + 0.1 && guard++ < limit){
					d.x += d.xv;
					d.y += d.yv;
				}
				if(soft && guard > limit) clearOfPoint(d, wall.p1);
				d.xv *= BOUNCE;
				d.yv *= BOUNCE;
				if(hit) hit("wall", play, before * 0.6);
			}
			if(posi.distanceTo(wall.p2) < WALL_SIZE + 0.1){
				const before = Math.hypot(d.xv, d.yv);
				let norm = posi.clone().sub(wall.p2);
				norm = new THREE.Vector3(norm.x, 0, norm.y);
				norm.normalize();
				const vel = new THREE.Vector3(d.xv, 0, d.yv);
				vel.reflect(norm);
				d.xv = vel.x + norm.x * BOUNCE_CORRECT * 1;
				d.yv = vel.z + norm.z * BOUNCE_CORRECT * 1;
				let guard = 0;
				const limit = soft ? slideSteps(d) : PUSH_LIMIT;
				while((new THREE.Vector2(d.x, d.y)).distanceTo(wall.p2) < WALL_SIZE + 0.1 && guard++ < limit){
					d.x += d.xv;
					d.y += d.yv;
				}
				if(soft && guard > limit) clearOfPoint(d, wall.p2);
				d.xv *= BOUNCE;
				d.yv *= BOUNCE;
				if(hit) hit("wall", play, before * 0.6);
			}
		}

		const last = lines.length - 1;
		for(let i = 0; i < lines.length; i++){
			const cp = lines[i];
			if(Math.abs(cp.plane.distanceToPoint(play.pos.clone().sub(cp.position))) < 1){
				if(cp.position.clone().distanceTo(play.pos) < cp.width / 2 + 1){
					if(i == 0){
						if(d.checkpoint == last){
							d.checkpoint = 0;
							d.lap++;
						}
					}else if(d.checkpoint == i - 1 || (last == 1 && i == 1))
						d.checkpoint = i;
				}
			}
		}

		for(let m = 0; m < cars.length; m++){
			const ply = cars[m];
			if(soft){
				if(play != ply && (d.x - ply.data.x) ** 2 + (d.y - ply.data.y) ** 2 < 9) softContact(play, ply, hit);
				continue;
			}
			if(play != ply && play.pos.distanceTo(ply.pos) < 2){
				const e = ply.data;
				const temp = new THREE.Vector2(d.xv, d.yv);
				const temp2 = new THREE.Vector2(e.xv, e.yv);
				e.xv -= temp.x;
				e.yv -= temp.y;
				d.xv -= temp2.x;
				d.yv -= temp2.y;
				let norm = (new THREE.Vector2(d.x, d.y)).sub(new THREE.Vector2(e.x, e.y));
				norm = new THREE.Vector3(norm.x, 0, norm.y);
				norm.normalize();
				const vel = new THREE.Vector3(d.xv, 0, d.yv);
				const vel2 = new THREE.Vector3(e.xv, 0, e.yv);
				vel.reflect(norm);
				vel2.reflect(norm);
				e.xv += COLLISION * vel2.x;
				e.yv += COLLISION * vel2.z;
				d.xv += COLLISION * vel.x;
				d.yv += COLLISION * vel.z;
				e.xv += temp.x;
				e.yv += temp.y;
				d.xv += temp2.x;
				d.yv += temp2.y;
				let guard = 0;
				while((new THREE.Vector2(d.x, d.y)).distanceTo(new THREE.Vector2(e.x, e.y)) < 2 && guard++ < PUSH_LIMIT){
					d.x += d.xv;
					d.y += d.yv;
				}
				if(hit) hit("car", play, temp.clone().sub(temp2).length(), ply);
			}
		}

		if(play.pos.distanceTo(new THREE.Vector3()) > oob){
			d.x = 0;
			d.y = 0;
		}
	}
}

// Wall glitch guard (soft contact mode only). Out of a wall, the original code slides the car
// along its bounced velocity until it's clear. At a very shallow angle that can carry it a long
// way in one frame (over 150 units, straight onto another part of the track). Normal hits slide
// a few units and are untouched; past MAX_SLIDE the car is put just outside the wall instead.
const MAX_SLIDE = 12;
function slideSteps(d){ return Math.ceil(MAX_SLIDE / Math.max(0.02, Math.hypot(d.xv, d.yv))); }
function clearOfPlane(d, wall){
	const n = wall.plane.normal;
	const dist = wall.plane.distanceToPoint(new THREE.Vector3(d.x, 0, d.y).sub(wall.position));
	const target = (dist < 0 ? -1 : 1) * (WALL_SIZE + 0.02);
	d.x += n.x * (target - dist);
	d.y += n.z * (target - dist);
}
function clearOfPoint(d, p){
	let dx = d.x - p.x, dz = d.y - p.y;
	const l = Math.hypot(dx, dz) || 1;
	d.x = p.x + dx / l * (WALL_SIZE + 0.12);
	d.y = p.y + dz / l * (WALL_SIZE + 0.12);
}

// The original collision treats every car as a circle 2 units across and adds 1.1x the
// whole difference in speed to both cars, sideways part included, so a light rub flings them
// apart, and side by side you "touch" with a gap between you. Soft contact instead:
//   - uses each car's real outline (a box the size of its body, wheels and wings included),
//     so cars only touch when they visibly touch;
//   - pushes only along the direction the boxes overlap, only when they're closing, and loses
//     most of that energy: rubbing is a nudge, a hard hit still knocks you off line.
export const SOFT_RESTITUTION = 0.3;
export const SOFT_FRICTION = 0.08;
// Half width and half length of each body's outline (from the models in cars.js).
export const CAR_SIZE = { classic: [0.7, 1.1], formula: [0.8, 1.15], gt: [0.63, 1.02], stock: [0.61, 1.04] };
function outline(p){
	const d = p.data, fx = Math.sin(d.dir), fz = Math.cos(d.dir);
	return { x: d.x, z: d.y, fx, fz, rx: fz, rz: -fx, hw: p.hw ?? CAR_SIZE.classic[0], hl: p.hl ?? CAR_SIZE.classic[1] };
}
function softContact(play, ply, hit){
	const d = play.data, e = ply.data;
	const A = outline(play), B = outline(ply);
	// Separating axis test on the two boxes. n ends up pointing from B to A along the
	// direction they overlap least, and depth is how far they overlap.
	let depth = Infinity, nx = 0, nz = 0;
	for(const [ax, az] of [[A.fx, A.fz], [A.rx, A.rz], [B.fx, B.fz], [B.rx, B.rz]]){
		const ra = A.hw * Math.abs(A.rx * ax + A.rz * az) + A.hl * Math.abs(A.fx * ax + A.fz * az);
		const rb = B.hw * Math.abs(B.rx * ax + B.rz * az) + B.hl * Math.abs(B.fx * ax + B.fz * az);
		const dist = (A.x - B.x) * ax + (A.z - B.z) * az;
		const over = ra + rb - Math.abs(dist);
		if(over <= 0) return;                  // a gap on this axis: not touching
		if(over < depth){ depth = over; const sg = dist < 0 ? -1 : 1; nx = ax * sg; nz = az * sg; }
	}
	const rx = d.xv - e.xv, rz = d.yv - e.yv;
	const closing = rx * nx + rz * nz;
	if(closing < 0){
		const j = -(1 + SOFT_RESTITUTION) * closing / 2;
		const tx = (rx - closing * nx) * SOFT_FRICTION / 2, tz = (rz - closing * nz) * SOFT_FRICTION / 2;
		d.xv += j * nx - tx; d.yv += j * nz - tz;
		e.xv -= j * nx - tx; e.yv -= j * nz - tz;
		if(hit && closing < -0.004) hit("car", play, -closing * 1.6, ply);
	}
	// Share the overlap between both cars.
	const push = depth / 2;
	d.x += nx * push; d.y += nz * push;
	e.x -= nx * push; e.y -= nz * push;
}

