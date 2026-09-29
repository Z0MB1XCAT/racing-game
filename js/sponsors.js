// Trackside sponsors. They're made up: sound-alikes of the brands you see round a real Grand
// Prix (no real names or logos), each in colours that feel like the real thing, plus a few of
// our own. Every board is drawn into one texture atlas (a grid of 512 x 64 cells).
//
// Each: [name, background, text colour, mark, accent]. Marks are small drawings to the left of
// the name (see MARKS below).
export const SPONSORS = [
	["GRAND PRIX", "#e23b3b", "#ffffff"],
	["ROLAX", "#0b5d3b", "#d8b25a", "crown"],
	["PIRATELLI", "#111111", "#ffd200", "longP"],
	["DXL", "#ffcc00", "#d40511", "speed"],
	["PETRAMCO", "#ffffff", "#1c4b82", "hex", "#00a3e0"],
	["ZWS", "#232f3e", "#ffffff", "swoosh", "#ff9900"],
	["CRYPTIC.COM", "#0b1a38", "#ffffff", "ring", "#8fa3c9"],
	["SAILFORCE", "#00a1e0", "#ffffff", "cloud"],
	["LEMONOVO", "#e2231a", "#ffffff"],
	["QATAIR", "#5c0632", "#ffffff", "diamond", "#b9b2b5"],
	["EMIRAIR", "#ffffff", "#d71921", "wing"],
	["MCS CRUISES", "#0a1f44", "#d4b16a", "waves"],
	["TAG HOUR", "#111111", "#ffffff", "badge"],
	["LIQUI HOLY", "#004b93", "#ffffff", "halo", "#e30613"],
	["PARAMOUNTAIN+", "#0064ff", "#ffffff", "peak"],
	["ORACUL", "#ffffff", "#c74634", "pill"],
	["SHALL", "#ffd500", "#dd1d21", "fan"],
	["PETRONUTS", "#00a19c", "#ffffff", "drop"],
	["RED BULLDOG", "#0b1f3a", "#e2001a", "sun", "#ffcc00"],
	["HONDO", "#ffffff", "#cc0000", "wingH"],
	["DUNLOOP", "#ffd100", "#111111", "loop"],
	["MOTOOL", "#d6001c", "#ffffff"],
	["BYEBIT", "#17181e", "#f7a600"],
	["AMERICAN EXPRESSO", "#016fd0", "#ffffff", "box"],
	["VIZZA", "#1a1f71", "#ffffff", "swoosh", "#f7b600"],
	["RICHARD MILD", "#ffffff", "#1b1b1b", "pill"],
	["PROXIMOOSE", "#5b2c83", "#ffffff", "ring", "#ffffff"],
	["UNIDEBIT", "#e2001a", "#ffffff", "diamond", "#ffffff"],
	["LAVAZZO", "#10194f", "#ffffff", "cup"],
	["SAUDAIR", "#006c35", "#ffffff", "wing"],
	["STZ", "#4f008c", "#ffffff", "ring", "#ff375e"],
	["NEON", "#050505", "#e8d8a8", "sun", "#e8d8a8"],
	["BVS RACING", "#1f4fbf", "#ffffff", "speed"],
	["MONTE-CARLO", "#c8102e", "#ffffff"],
	["#MONACOGP", "#16233f", "#f4f6fa"]
];
export const AD_COLS = 4, AD_ROWS = 16;
const at = name => SPONSORS.findIndex(s => s[0] === name);
export const AD_GRAND_PRIX = at("GRAND PRIX"), AD_MONTE_CARLO = at("MONTE-CARLO"), AD_MONACO_GP = at("#MONACOGP"), AD_ROLAX = at("ROLAX");

// The boards round each track: the regulars everywhere, and the local ones (listed twice so
// they turn up more often).
const EVERYWHERE = ["ROLAX", "PIRATELLI", "DXL", "PETRAMCO", "ZWS", "CRYPTIC.COM", "SAILFORCE", "LEMONOVO", "QATAIR", "MCS CRUISES",
	"LIQUI HOLY", "PARAMOUNTAIN+", "ORACUL", "SHALL", "AMERICAN EXPRESSO", "VIZZA", "BVS RACING"];
const LOCAL = {
	monaco: ["TAG HOUR", "RICHARD MILD", "ROLAX", "MCS CRUISES", "MONTE-CARLO"],
	spa: ["PROXIMOOSE", "DXL", "PIRATELLI", "MOTOOL"],
	monza: ["UNIDEBIT", "LAVAZZO", "PIRATELLI", "QATAIR"],
	suzuka: ["HONDO", "DUNLOOP", "LEMONOVO", "MOTOOL"],
	jeddah: ["PETRAMCO", "SAUDAIR", "STZ", "NEON", "EMIRAIR"],
	daytona: ["RED BULLDOG", "BYEBIT", "SHALL", "MOTOOL"]
};
export function sponsorsFor(theme){
	const names = [...EVERYWHERE, ...(LOCAL[theme] || ["RED BULLDOG", "BYEBIT", "EMIRAIR", "PETRONUTS"]), ...(LOCAL[theme] || [])];
	return names.map(at).filter(i => i >= 0);
}

// The board across the bridge over the track (Suzuka's is the famous tyre-maker's arch).
const BRIDGE = { suzuka: "DUNLOOP", spa: "ROLAX", monza: "PIRATELLI", jeddah: "PETRAMCO", monaco: "TAG HOUR", daytona: "RED BULLDOG" };
export function bridgeSponsor(theme){ return at(BRIDGE[theme] || "GRAND PRIX"); }

// Little marks drawn in a box (x, y, s: its left, top and size), in colour `c` (and `a`).
const MARKS = {
	crown(g, x, y, s, c){
		g.fillStyle = c; g.beginPath();
		g.moveTo(x + s * 0.1, y + s * 0.8); g.lineTo(x + s * 0.05, y + s * 0.3); g.lineTo(x + s * 0.3, y + s * 0.55); g.lineTo(x + s * 0.5, y + s * 0.15);
		g.lineTo(x + s * 0.7, y + s * 0.55); g.lineTo(x + s * 0.95, y + s * 0.3); g.lineTo(x + s * 0.9, y + s * 0.8); g.closePath(); g.fill();
		for(const f of [0.05, 0.5, 0.95]){ g.beginPath(); g.arc(x + s * f, y + s * (f === 0.5 ? 0.13 : 0.28), s * 0.07, 0, Math.PI * 2); g.fill(); }
	},
	speed(g, x, y, s, c){ g.fillStyle = c; for(let k = 0; k < 3; k++) g.fillRect(x + k * s * 0.12, y + s * (0.25 + k * 0.2), s * (0.9 - k * 0.12), s * 0.11); },
	hex(g, x, y, s, c, a){
		const cx = x + s / 2, cy = y + s / 2, r = s * 0.45;
		const hexPath = rr => { g.beginPath(); for(let k = 0; k < 6; k++){ const t = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); } g.closePath(); };
		g.fillStyle = a; hexPath(r); g.fill();
		g.fillStyle = "#84bd00"; g.beginPath(); g.moveTo(cx, cy); for(let k = 0; k <= 2; k++){ const t = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } g.closePath(); g.fill();
		g.fillStyle = "#fff"; hexPath(r * 0.35); g.fill();
	},
	swoosh(g, x, y, s, c, a){ g.strokeStyle = a; g.lineWidth = s * 0.12; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y + s * 0.55); g.quadraticCurveTo(x + s * 0.5, y + s * 0.95, x + s, y + s * 0.5); g.stroke(); },
	ring(g, x, y, s, c, a){ g.strokeStyle = a; g.lineWidth = s * 0.14; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.33, 0, Math.PI * 2); g.stroke(); },
	cloud(g, x, y, s, c){ g.fillStyle = c; for(const [dx, dy, r] of [[0.3, 0.6, 0.22], [0.52, 0.45, 0.28], [0.75, 0.6, 0.2], [0.5, 0.68, 0.2]]){ g.beginPath(); g.arc(x + s * dx, y + s * dy, s * r, 0, Math.PI * 2); g.fill(); } },
	diamond(g, x, y, s, c, a){ g.fillStyle = a; g.beginPath(); g.moveTo(x + s / 2, y + s * 0.08); g.lineTo(x + s * 0.92, y + s / 2); g.lineTo(x + s / 2, y + s * 0.92); g.lineTo(x + s * 0.08, y + s / 2); g.closePath(); g.fill(); },
	wing(g, x, y, s, c){ g.fillStyle = c; g.beginPath(); g.moveTo(x, y + s * 0.7); g.quadraticCurveTo(x + s * 0.5, y + s * 0.1, x + s, y + s * 0.2); g.quadraticCurveTo(x + s * 0.55, y + s * 0.45, x + s * 0.2, y + s * 0.85); g.closePath(); g.fill(); },
	waves(g, x, y, s, c){ g.strokeStyle = c; g.lineWidth = s * 0.09; for(let k = 0; k < 3; k++){ g.beginPath(); for(let t = 0; t <= 1.001; t += 0.1) g.lineTo(x + t * s, y + s * (0.3 + k * 0.22) + Math.sin(t * Math.PI * 2) * s * 0.07); g.stroke(); } },
	badge(g, x, y, s){
		g.fillStyle = "#0a8a3e"; g.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
		g.fillStyle = "#e30613"; g.fillRect(x + s * 0.1, y + s * 0.62, s * 0.8, s * 0.28);
		g.fillStyle = "#fff"; g.font = `900 ${Math.round(s * 0.42)}px "Barlow Condensed", Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
		g.fillText("TH", x + s / 2, y + s * 0.4);
	},
	halo(g, x, y, s, c, a){ g.strokeStyle = "#ffd200"; g.lineWidth = s * 0.1; g.beginPath(); g.ellipse(x + s / 2, y + s * 0.3, s * 0.4, s * 0.14, 0, 0, Math.PI * 2); g.stroke(); },
	peak(g, x, y, s, c){
		g.fillStyle = c; g.beginPath(); g.moveTo(x + s * 0.05, y + s * 0.9); g.lineTo(x + s * 0.5, y + s * 0.25); g.lineTo(x + s * 0.95, y + s * 0.9); g.closePath(); g.fill();
		for(let k = 0; k < 5; k++){ const t = Math.PI * (1.1 + k * 0.2); g.beginPath(); g.arc(x + s / 2 + Math.cos(t) * s * 0.48, y + s * 0.62 + Math.sin(t) * s * 0.48, s * 0.05, 0, Math.PI * 2); g.fill(); }
	},
	pill(g, x, y, s, c){ g.strokeStyle = c; g.lineWidth = s * 0.1; g.beginPath(); g.ellipse(x + s / 2, y + s / 2, s * 0.45, s * 0.25, 0, 0, Math.PI * 2); g.stroke(); },
	fan(g, x, y, s){
		g.fillStyle = "#dd1d21"; g.beginPath(); g.moveTo(x + s / 2, y + s * 0.95); g.arc(x + s / 2, y + s * 0.95, s * 0.8, Math.PI * 1.2, Math.PI * 1.8); g.closePath(); g.fill();
		g.strokeStyle = "#ffd500"; g.lineWidth = s * 0.05;
		for(let k = 1; k < 6; k++){ const t = Math.PI * (1.2 + k * 0.1); g.beginPath(); g.moveTo(x + s / 2, y + s * 0.95); g.lineTo(x + s / 2 + Math.cos(t) * s * 0.8, y + s * 0.95 + Math.sin(t) * s * 0.8); g.stroke(); }
	},
	drop(g, x, y, s, c){ g.fillStyle = c; g.beginPath(); g.moveTo(x + s / 2, y + s * 0.05); g.quadraticCurveTo(x + s * 0.95, y + s * 0.7, x + s / 2, y + s * 0.95); g.quadraticCurveTo(x + s * 0.05, y + s * 0.7, x + s / 2, y + s * 0.05); g.fill(); },
	sun(g, x, y, s, c, a){ g.fillStyle = a; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.36, 0, Math.PI * 2); g.fill(); },
	wingH(g, x, y, s, c){ g.fillStyle = c; g.fillRect(x + s * 0.2, y + s * 0.15, s * 0.14, s * 0.7); g.fillRect(x + s * 0.66, y + s * 0.15, s * 0.14, s * 0.7); g.fillRect(x + s * 0.2, y + s * 0.44, s * 0.6, s * 0.12); },
	loop(g, x, y, s, c){ g.strokeStyle = c; g.lineWidth = s * 0.13; g.beginPath(); g.arc(x + s * 0.35, y + s / 2, s * 0.25, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x + s * 0.68, y + s / 2, s * 0.25, 0, Math.PI * 2); g.stroke(); },
	box(g, x, y, s, c){ g.strokeStyle = c; g.lineWidth = s * 0.07; g.strokeRect(x + s * 0.08, y + s * 0.12, s * 0.84, s * 0.76); },
	cup(g, x, y, s, c){ g.fillStyle = c; g.fillRect(x + s * 0.2, y + s * 0.35, s * 0.5, s * 0.45); g.strokeStyle = c; g.lineWidth = s * 0.08; g.beginPath(); g.arc(x + s * 0.72, y + s * 0.55, s * 0.12, -Math.PI / 2, Math.PI / 2); g.stroke(); },
	longP(){}
};

// The atlas: one cell per sponsor, row by row.
export function drawSponsors(g, W, H){
	const bw = W / AD_COLS, bh = H / AD_ROWS;
	const font = (px, w = 900) => `italic ${w} ${px}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
	SPONSORS.forEach(([text, bg, fg, mark, accent], k) => {
		const x = (k % AD_COLS) * bw, y = Math.floor(k / AD_COLS) * bh;
		g.save();
		g.beginPath(); g.rect(x, y, bw, bh); g.clip();
		if(mark === "halo"){
			// Two colours, split on a slant.
			g.fillStyle = bg; g.fillRect(x, y, bw, bh);
			g.fillStyle = accent; g.beginPath(); g.moveTo(x + bw * 0.55, y); g.lineTo(x + bw, y); g.lineTo(x + bw, y + bh); g.lineTo(x + bw * 0.45, y + bh); g.closePath(); g.fill();
		}else{ g.fillStyle = bg; g.fillRect(x, y, bw, bh); }
		// A little shading along the bottom edge, like a printed board.
		g.fillStyle = "#000"; g.globalAlpha = 0.12; g.fillRect(x, y + bh - 6, bw, 6); g.globalAlpha = 1;
		const size = Math.round(bh * 0.66);
		g.font = font(size);
		g.textBaseline = "middle"; g.textAlign = "left";
		let tw = g.measureText(text).width;
		const markW = mark && mark !== "longP" ? bh * 0.8 : 0, gap = markW ? bh * 0.22 : 0;
		const maxW = bw - 28 - markW - gap;
		const sx = Math.min(1, maxW / tw);
		tw *= sx;
		const x0 = x + (bw - (markW + gap + tw)) / 2;
		if(markW){ g.save(); MARKS[mark](g, x0, y + (bh - markW) / 2 - 1, markW, fg, accent); g.restore(); }
		g.fillStyle = fg;
		g.save();
		g.translate(x0 + markW + gap, y + bh / 2 + 2);
		g.scale(sx, 1);
		if(mark === "longP"){
			// The first letter stretched tall, the rest after it.
			g.save(); g.scale(1, 1.25); g.fillText(text[0], 0, 0); g.restore();
			const w0 = g.measureText(text[0]).width;
			g.fillText(text.slice(1), w0 + 2, 0);
			g.fillRect(w0 * 0.2, size * 0.42, g.measureText(text).width, size * 0.07);
		}else g.fillText(text, 0, 0);
		g.restore();
		g.restore();
	});
}
