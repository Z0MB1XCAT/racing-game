// Name filter for a school game. Catches common swearing and slurs, including
// l33t-speak and s p a c e d spellings. Anything caught shows as "Driver 1234".
// It will never be perfect; the admin page (bvs-11018) can rename anyone it misses.

// Word stems, matched after normalising. Kept short so variations are caught.
const BLOCK = [
	"fuck", "fuk", "fck", "fvck", "fvk", "phuck", "phuk", "shit", "sh1t", "cunt", "bitch", "biatch", "bastard", "wank", "twat", "prick", "dick", "cock",
	"pussy", "slut", "whore", "hoe", "arse", "asshole", "arsehole", "bollock", "bellend", "knob", "tosser", "minge", "fanny",
	"piss", "crap", "damn", "porn", "sex", "nude", "boob", "tits", "penis", "vagina", "anal", "cum", "jizz", "dildo", "rape",
	"nigg", "nigga", "negro", "chink", "paki", "spic", "wetback", "kike", "gook", "coon", "gyp", "tranny", "fag", "faggot",
	"retard", "spaz", "mong", "nazi", "hitler", "kkk", "isis", "terrorist", "suicide", "kys", "killyourself",
	// Welsh
	"cachu", "twll", "cont", "coc", "diawl"
];
// Innocent words that contain a blocked stem (checked before blocking).
const ALLOW = ["scunthorpe", "cockpit", "cocktail", "peacock", "hancock", "dickens", "shitake", "shiitake", "classic", "grass", "pass", "bass", "assist", "assassin",
	"therapist", "document", "circumstance", "arsenal", "sussex", "essex", "middlesex", "hoek", "hoey", "shoe", "phoenix", "cumbria", "cucumber", "accumulate",
	"crapaud", "spice", "spicy", "damnit", "mongoose", "mongolia", "coca", "coconut", "cocoa", "contact", "continue", "contest", "control", "contrast", "twllan",
	"knobby", "tito", "titan", "title", "kitsune", "cocky", "coco", "hitch", "pussycat"];

const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "2": "z", "€": "e", "£": "l" };

function normalise(s){
	return String(s).toLowerCase()
		.normalize("NFKD").replace(/[̀-ͯ]/g, "")
		.replace(/[0-9!|@$+€£]/g, c => LEET[c] || c)
		.replace(/[^a-z]/g, "")
		.replace(/(.)\1{2,}/g, "$1$1");     // "fuuuuck" -> "fuuck"
}

export function isRude(name){
	const n = normalise(name);
	if(!n) return false;
	let text = n;
	for(const ok of ALLOW) text = text.split(ok).join("_");
	const squashed = text.replace(/(.)\1+/g, "$1");  // "fuuck" -> "fuck"
	return BLOCK.some(w => text.includes(w) || squashed.includes(w));
}

// A stable stand-in so the same player keeps the same fallback name.
export function fallbackName(id){
	let h = 0;
	for(const c of String(id || "x")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return "Driver " + String(1000 + h % 9000);
}

// Use everywhere another player's name is shown.
export function cleanName(name, id){
	const n = String(name || "").trim().slice(0, 20);
	if(!n || isRude(n)) return fallbackName(id);
	return n;
}
