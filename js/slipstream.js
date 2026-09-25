// Slipstream (drafting). This is an addition on top of the original handling, not a
// change to it: physics.js is untouched, and with slipstream switched off the game
// drives exactly like the original.
//
// A car tucked in behind another gets a small extra push along its heading, the
// same way the engine push works in the original (SPEED * warp). Flat out, a full
// tow raises top speed by about 7%. A car pushing right behind the leader gives the
// leader a little help too, so two cars nose-to-tail beat one on its own (that's
// what makes ovals like Daytona work).
import { SPEED } from "./physics.js";

export const DRAFT_LENGTH = 24;       // how far back the tow reaches (a car is 2 long)
export const DRAFT_PUSH = 0.075;      // extra push at a full tow, as a share of SPEED
const MIN_SPEED = 0.15;               // no tow in slow corners or when crawling
const PUSH_RANGE = 6;                 // the car behind helps the leader when this close

// Works out each car's tow (0..1) and applies it. Call once per frame before stepCars.
export function applySlipstream(cars, warp){
	for(const a of cars){
		const d = a.data;
		const speed = Math.hypot(d.xv, d.yv);
		let tow = 0, pushed = 0;
		if(speed > MIN_SPEED){
			const ux = d.xv / speed, uz = d.yv / speed;
			for(const b of cars){
				if(b === a) continue;
				const e = b.data;
				const bs = Math.hypot(e.xv, e.yv);
				if(bs < MIN_SPEED) continue;
				// Only cars heading the same way count.
				if((e.xv * ux + e.yv * uz) / bs < 0.85) continue;
				const dx = e.x - d.x, dz = e.y - d.y;
				const along = dx * ux + dz * uz;
				const lateral = Math.abs(dx * uz - dz * ux);
				const width = 1.1 + Math.abs(along) * 0.045;   // the wake spreads out behind a car
				if(lateral > width) continue;
				if(along > 2.2 && along < DRAFT_LENGTH){
					const s = Math.pow(1 - along / DRAFT_LENGTH, 0.8) * (1 - 0.5 * lateral / width);
					if(s > tow) tow = s;
				}else if(along < -2.2 && along > -PUSH_RANGE){
					pushed = Math.max(pushed, 0.35 * (1 - (-along - 2.2) / (PUSH_RANGE - 2.2)));
				}
			}
		}
		const target = Math.min(1, tow + pushed);
		// Ease in and out over a few frames so the tow doesn't flicker.
		a.draft = (a.draft || 0) + (target - (a.draft || 0)) * Math.min(1, 0.08 * warp);
		if(a.draft > 0.005){
			const push = SPEED * DRAFT_PUSH * a.draft * warp;
			d.xv += Math.sin(d.dir) * push;
			d.yv += Math.cos(d.dir) * push;
		}
	}
}
