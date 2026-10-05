// Prize codes: you (or a teacher) hand out a code, a player types it in (Garage > Prize code, or "Have a prize code?" on the
// title screen), and a garage item unlocks for them, kept for good like any other item.
//
// The codes themselves are not in the game's files: only a fingerprint of each is (a SHA-256 hash), so reading the source doesn't
// give them away. Add, list and check codes with tools/codes.mjs (it edits the list between the two markers below; don't edit
// it by hand). A code is not case-sensitive and ignores spaces and dashes. It works for everyone who knows it, until its
// optional `until` date; for a code per winner, make several (tools/codes.mjs random).
//   grants: items as "category:id", e.g. "livery:gold", "title:champion", "horn:train" (see tools/codes.mjs items)
export const CODES = [
	// BEGIN CODES
	// END CODES
];

// "tiger-4821", "Tiger 4821" and "TIGER4821" are the same code.
export const normalise = text => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The fingerprint kept for a code (the first 24 hex digits of a SHA-256). Needs a secure page (https or localhost), which
// GitHub Pages is.
export async function hashCode(text){
	if(typeof crypto === "undefined" || !crypto.subtle) throw new Error("secure");
	const bytes = new TextEncoder().encode("org-gp-prize:" + normalise(text));
	const buf = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

// What a typed code is: { entry } for a good one, { expired: entry } for one past its date, or null for no such code.
export async function findCode(text, table = CODES, now = Date.now()){
	const n = normalise(text);
	if(n.length < 4) return null;
	const h = await hashCode(n);
	const entry = table.find(e => e.h === h);
	if(!entry) return null;
	if(entry.until && now > Date.parse(entry.until + "T23:59:59")) return { expired: entry };
	return { entry };
}
