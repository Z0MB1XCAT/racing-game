// Track list.
//
// Circuit tracks are a closed loop of points (x = east, y = north), listed in race
// direction and starting on the start/finish line. js/trackgen.js smooths them,
// scales the loop to `length` world units, and turns the start straight to face
// +z so the original starting grid works unchanged.
//
// Shapes follow the real layouts closely enough to know each corner, but corners
// are opened up where the original handling needs room (you can't brake).

// The original game's only track, unchanged (from jchabin/cars index.html).
export const CLASSIC_CODE = "1,5/0,7 0,7/-1,8 -1,8/-3,9 -3,9/-7,9 -7,9/-9,8 -9,8/-10,7 -10,7/-11,5 -6,7/-4,7 -4,7/-2,6 -2,6/-1,4 -6,7/-8,6 -8,6/-9,4 -1,4/-1,0 1,0/1,5 -11,5/-11,0 -11,0/-10,-1 -10,-1/-8,-1 -8,-1/-7,0 -7,0/-7,2 -9,3/-8,4 -8,4/-6,4 -6,4/-5,3 -5,3/-5,1 -9,1/-9,4 -5,3/-4,4 -4,4/-2,4 -2,4/-1,3 -7,0/-6,-1 -6,-1/-4,-1 -4,-1/-3,0 -3,0/-3,2 -1,0/-1,-2 -1,-2/0,-4 0,-4/2,-5 2,-5/4,-5 4,-5/6,-4 6,-4/7,-2 -3,0/-3,-3 -3,-3/-2,-5 -2,-5/-1,-6 -1,-6/1,-7 1,-7/5,-7 5,-7/7,-6 7,-6/8,-5 8,-5/9,-3 9,-3/9,2 9,2/8,4 8,4/6,5 6,5/4,5 4,5/2,4 2,4/1,2 7,-2/7,2 7,2/6,3 6,3/4,3 4,3/3,2 4,-3/2,-3 2,-3/1,-2 1,-2/1,0 4,-3/5,-2 5,-2/5,1 3,2/3,-1 |-1,3/1,3 6,-4/7,-6 |-7,5 -5,6 -4,5 2,6 1,8 3,9 4,6 3,7 -3,10 -4,12 -10,11 -12,8 -14,8 -12,6 -7,10 -12,2 -15,3 -13,-1 -10,-4 -8,-2 -6,-4 -4,-3 -11,-2 -8,-3 -4,-5 -3,-6 -5,-2 0,-8 -2,-8 -4,-8 -5,-6 -3,-10 2,-9 4,-8 5,-10 6,-8 10,-7 8,-7 9,-11 9,-5 15,-4 11,-2 11,-1 10,3 16,2 12,1 8,6 7,9 6,6 -8,-7 -13,-7 -13,-4 -15,-4 -17,0 |1,3,6/22 0,3,8/55 -2,3,9/77 -8,3,9/115 -10,3,8/148 -11,3,6/166 -8,3,4/-86 -7,3,4/-83 -6,3,4/-90 -10,3,-1/-83 -9,3,-1/-88 -8,3,-1/-90 -6,3,-1/-89 -5,3,-1/-89 -4,3,-1/-89 -4,3,4/-90 -3,3,4/-90 -2,3,4/265 -3,3,-4/194 -2,3,-6/218 0,3,-7/262 6,3,-7/-69 8,3,-6/-42 9,3,-4/-16 9,3,4/40 8,3,5/70 2,3,5/135 3,3,6/122|";

// Figure-8 built from two 270-degree loops joined by diagonal straights that cross in the middle.
function figureEight(c){
	const r = c / Math.SQRT2, pts = [];
	const leg = (x1, y1, x2, y2, n) => { for(let i = 0; i < n; i++) pts.push([x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]); };
	const arc = (cx, a0, a1, n) => { for(let i = 0; i < n; i++){ const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), r * Math.sin(a)]); } };
	const h = c / 2;
	// Start on the leg heading up-right, a little before the crossing.
	leg(-h * 0.55, -h * 0.55, h, h, 5);
	arc(c, Math.PI * 0.75, -Math.PI * 0.75, 9);   // right loop, clockwise
	leg(h, -h, -h, h, 7);
	arc(-c, Math.PI * 0.25, Math.PI * 1.75, 9);    // left loop, anticlockwise
	leg(-h, -h, -h * 0.55, -h * 0.55, 2);
	return pts;
}

export const TRACKS = [
	{
		id: "classic", name: "Classic", place: "The original", kind: "classic",
		blurb: "The track everyone learned on. Same walls, same trees.",
		code: CLASSIC_CODE, laps: 3, theme: "classic",
		// Tight corridors: bots look close ahead and steer hard to scrub speed.
		botTune: { look: 6, over: 1.2, gain: 6, hairpin: 0.25, analog: true }
	},
	{
		id: "monaco", name: "Monaco", place: "Monte Carlo", kind: "gp", flag: "MC",
		blurb: "Barriers everywhere, one real straight. Clean laps win here.",
		realLength: "3.337 km", length: 1050, width: 11, laps: 3, theme: "monaco",
		// Traced from the circuit diagram (image pixels, y down), in race direction.
		px: [[130, 360], [160, 290], [200, 225], [225, 207], [260, 218], [340, 232], [430, 250], [520, 265], [600, 268], [650, 262], [678, 235], [685, 180], [695, 145], [730, 120], [780, 92], [812, 66], [826, 90], [826, 140], [836, 178], [856, 190], [880, 172], [884, 120], [893, 92], [918, 88], [946, 104], [952, 134], [925, 175], [855, 238], [770, 292], [670, 322], [560, 330], [500, 326], [485, 308], [455, 308], [430, 303], [390, 295], [320, 282], [275, 278], [235, 295], [215, 325], [210, 385], [200, 450], [180, 492], [165, 515], [162, 560], [170, 605], [190, 640], [150, 668], [112, 650], [95, 610], [98, 560], [106, 470], [118, 400]]
	},
	{
		id: "spa", name: "Spa-Francorchamps", place: "Belgium", kind: "gp", flag: "BE",
		blurb: "Eau Rouge, the Kemmel straight and a long flat-out run home.",
		realLength: "7.004 km", length: 1700, width: 14, laps: 2, theme: "spa",
		// Traced from the circuit diagram (image pixels, y down), in race direction.
		px: [[185, 430], [120, 470], [60, 505], [22, 528], [12, 505], [40, 470], [80, 420], [130, 360], [165, 305], [185, 270], [230, 245], [290, 200], [360, 145], [420, 115], [560, 70], [690, 30], [725, 20], [760, 35], [790, 45], [820, 35], [860, 55], [900, 100], [935, 150], [922, 172], [890, 125], [840, 110], [740, 145], [640, 180], [608, 215], [615, 260], [650, 300], [790, 340], [825, 360], [820, 400], [800, 430], [830, 455], [900, 490], [920, 520], [900, 570], [860, 590], [800, 580], [700, 510], [640, 430], [560, 370], [480, 345], [400, 365], [320, 395], [270, 402], [248, 388], [232, 398], [218, 418]]
	},
	{
		id: "monza", name: "Monza", place: "Italy", kind: "gp", flag: "IT",
		blurb: "The Temple of Speed. Long straights, chicanes and the Parabolica.",
		realLength: "5.793 km", length: 1350, width: 14, laps: 3, theme: "monza",
		// Traced from the circuit diagram (image pixels, y down), in race direction.
		px: [[590, 435], [480, 437], [380, 436], [352, 432], [338, 408], [312, 404], [282, 424], [230, 437], [185, 432], [140, 400], [105, 330], [85, 260], [75, 210], [62, 175], [50, 140], [25, 80], [22, 45], [60, 25], [130, 18], [158, 42], [200, 100], [270, 180], [350, 250], [400, 290], [440, 300], [470, 322], [500, 327], [620, 327], [760, 327], [855, 330], [885, 355], [878, 388], [830, 415], [760, 428], [680, 433]]
	},
	{
		id: "suzuka", name: "Suzuka", place: "Japan", kind: "gp", flag: "JP",
		blurb: "The only figure-of-eight on the calendar. The crossover is flat here.",
		realLength: "5.807 km", length: 1450, width: 13, laps: 2, theme: "suzuka",
		// Traced from the circuit diagram (image pixels, y down), in race direction.
		px: [[250, 665], [170, 678], [90, 688], [40, 685], [15, 650], [30, 615], [80, 607], [120, 608], [150, 590], [190, 570], [230, 575], [260, 540], [300, 520], [330, 525], [350, 550], [390, 570], [420, 570], [455, 545], [472, 500], [470, 440], [450, 390], [445, 350], [458, 318], [482, 282], [520, 292], [560, 308], [640, 332], [682, 358], [706, 382], [722, 398], [740, 388], [734, 358], [708, 322], [692, 285], [688, 245], [702, 200], [742, 168], [800, 145], [900, 138], [935, 112], [925, 58], [880, 42], [760, 98], [640, 176], [575, 255], [548, 322], [545, 420], [545, 495], [540, 525], [515, 552], [480, 590], [430, 630], [350, 650]]
	},
	{
		id: "jeddah", name: "Jeddah", place: "Saudi Arabia", kind: "gp", flag: "SA",
		blurb: "A night race on the seafront. Fast, blind and lined with walls.",
		realLength: "6.174 km", length: 1500, width: 13, laps: 2, theme: "jeddah",
		// Traced from the circuit diagram (image pixels, y down), in race direction.
		px: [[765, 140], [700, 190], [640, 235], [600, 262], [592, 285], [565, 300], [520, 315], [460, 340], [452, 372], [432, 395], [405, 400], [378, 400], [345, 420], [328, 442], [298, 458], [275, 450], [250, 445], [200, 448], [170, 455], [100, 482], [40, 510], [25, 540], [55, 568], [90, 556], [125, 522], [165, 512], [205, 515], [240, 508], [258, 518], [280, 528], [318, 525], [368, 495], [410, 458], [450, 438], [492, 405], [545, 355], [592, 335], [628, 322], [648, 302], [668, 282], [698, 268], [750, 265], [800, 252], [860, 210], [915, 120], [935, 55], [918, 38], [880, 55], [820, 100]]
	},
	{
		id: "daytona", name: "Daytona", place: "Florida, USA", kind: "oval", flag: "US",
		blurb: "2.5-mile tri-oval. Stay in the pack and time your move.",
		realLength: "4.023 km", length: 1000, width: 18, laps: 4, theme: "daytona",
		pts: [
			[0, -0.6], [3, -0.3], [5.5, 0], [7.2, 0.4], [8.2, 1.6], [8.2, 3.2], [7.2, 4.4], [5.5, 4.8],
			[0, 4.8], [-5.5, 4.8], [-7.2, 4.4], [-8.2, 3.2], [-8.2, 1.6], [-7.2, 0.4], [-5.5, 0], [-3, -0.3]
		]
	},
	{
		id: "figure8", name: "Crossroads", place: "Figure-8 speedway", kind: "fantasy",
		blurb: "Two loops, one flat crossing in the middle. Watch your left.",
		length: 620, width: 13, laps: 5, theme: "dusk",
		pts: figureEight(10)
	},
	{
		id: "glacier", name: "Glacier Pass", place: "Somewhere cold", kind: "fantasy",
		blurb: "Switchbacks up the mountain and a long sweeper back down.",
		length: 1250, width: 13, laps: 3, theme: "snow",
		pts: [
			[0, 0], [0, 3], [0.3, 4.6], [1.2, 5.3], [2.6, 5.4], [3.6, 6.0], [3.8, 7.0], [3.2, 7.6], [2.0, 7.6],
			[1.0, 8.0], [0.8, 9.0], [1.4, 9.7], [2.8, 9.8], [4.4, 9.8], [5.6, 9.4], [6.2, 8.4], [6.1, 7.0],
			[6.5, 5.8], [7.4, 5.2], [7.8, 4.2], [7.4, 3.2], [6.4, 2.9], [5.6, 3.4], [5.0, 3.1], [4.8, 2.0],
			[5.2, 0.8], [5.0, -0.4], [4.0, -1.2], [2.6, -1.5], [1.2, -1.4], [0.3, -0.9]
		]
	}
];

export function trackById(id){
	return TRACKS.find(t => t.id === id);
}
