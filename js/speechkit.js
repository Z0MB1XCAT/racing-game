// Small helpers for building sentences out of clips (js/voicelines.js): a name, a number, a gap, a variation of a line.
// Each returns { parts: [clip ids], text: what the subtitles say } so a spoken line and its caption always agree.
import { LINES, FAMILIES, BOT_NAMES } from "./voicelines.js";

const slug = n => n.toLowerCase().replace(/[^a-z]+/g, "_");
const KNOWN = new Map(BOT_NAMES.map(n => [n, slug(n)]));

// Picks a variation of a line, never the one used last time.
export function makePicker(rand = Math.random){
	const last = new Map();
	return family => {
		const ids = FAMILIES[family];
		if(!ids || !ids.length) return null;
		let i = Math.floor(rand() * ids.length);
		if(ids.length > 1 && last.get(family) === i) i = (i + 1 + Math.floor(rand() * (ids.length - 1))) % ids.length;
		last.set(family, i);
		return ids[i];
	};
}

// A sentence from pieces: each piece is a clip id (its text is added), or { id?, text } to say one thing and show another.
export function build(...pieces){
	const parts = [], words = [];
	for(const p of pieces){
		if(!p) continue;
		if(typeof p === "string"){ parts.push(p); words.push(LINES[p] ? LINES[p].t : ""); }
		else{ if(p.id) parts.push(p.id); else if(p.parts) parts.push(...p.parts); words.push(p.text); }
	}
	return { parts, text: tidyText(words.join(" ")) };
}
function tidyText(s){
	return s.replace(/\s+/g, " ").replace(/\s+([.,!])/g, "$1").trim();
}

// A car as the commentator says it: a name we have a clip for, else "Number 23". The caption has the real name either way.
// final: the form that ends a sentence (a falling voice) rather than one that carries on.
export function carPiece(car, { final = false } = {}){
	const key = KNOWN.get(car.name);
	const label = car.name || "A car";
	if(key) return { id: `lead.${final ? "nmf" : "nm"}.${key}`, text: label + (final ? "." : "") };
	const n = carNumber(car);
	return { parts: ["lead.number", `lead.${final ? "nf" : "n"}.${n}`], text: `${label} (#${n})` + (final ? "." : "") };
}
export function carNumber(car){
	// (A race number of 0 is the garage's "none picked": say the grid slot instead.)
	const picked = car.look && Number.isFinite(+car.look.number) ? +car.look.number : 0;
	const n = picked > 0 ? picked : (car.data && Number.isFinite(car.data.slot) ? car.data.slot + 1 : 0);
	return Math.max(0, Math.min(99, Math.round(n)));
}

// A gap in seconds, said the way a radio does: "point four", "one point two", "twelve seconds". null if it's too big to bother with.
export function gapPiece(sec){
	if(!Number.isFinite(sec) || sec < 0 || sec >= 60) return null;
	const t = Math.max(1, Math.round(sec * 10));        // tenths, at least one
	if(t < 10) return { id: `eng.pt.${t}`, text: "0." + t };
	if(t >= 100){ const s = Math.round(sec); return { parts: [`eng.n.${s}`, "eng.secs"], text: s + " seconds" }; }
	const whole = Math.floor(t / 10), tenth = t % 10;
	if(tenth === 0) return { parts: [`eng.n.${whole}`, "eng.secs"], text: whole + " seconds" };
	return { parts: [`eng.n.${whole}`, `eng.pt.${tenth}`], text: whole + "." + tenth };
}
export const posPiece = n => (n >= 1 && n <= 12 ? { id: `eng.P.${n}`, text: "P" + n } : null);
