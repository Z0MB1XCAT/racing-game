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
	"knobby", "tito", "titan", "title", "kitsune", "cocky", "coco", "hitch", "pussycat",
	// Everyday words that chat is full of.
	"content", "contain", "contract", "context", "contrary", "contrib", "contour", "continent", "scrap", "analy", "analog", "canal", "banal",
	"despic", "conspic", "raccoon", "cocoon", "tycoon", "egypt", "among", "pakistan", "whoever", "parse", "grape", "drape", "trape", "montenegro", "cumul"];

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

// ----- Chat -----
// Accounts: rude words are starred out. Guests (no account) get a lot more protection:
// anything rude is refused outright, and so is anything that looks like contact details,
// so nobody can swap numbers, usernames or addresses with a stranger.
const LINK = /(https?:|www\.|\b[a-z0-9-]+\s*(\.|dot)\s*(com|net|org|io|gg|uk|co|me|ly|tv|xyz|app|link|site|info|biz)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+/;
const DIGITS = n => new RegExp("(\\d[\\s.\\-()]*){" + n + ",}");
const PHONE = DIGITS(7);
const CONTACT = ["snap", "snapchat", "sc", "insta", "instagram", "ig", "tiktok", "discord", "whatsapp", "telegram", "kik", "facebook", "fb", "twitter", "youtube", "roblox", "xbox", "psn", "gamertag", "email", "gmail", "hotmail", "phone", "mobile", "address", "postcode", "addme", "dm", "dms", "meetup", "selfie", "pic", "pics"];
const CONTACT_PHRASES = ["add me", "my number", "your number", "ur number", "where do you live", "where u live", "where you live", "how old", "your age", "ur age", "what age", "what school", "which school", "what year are you", "whats your name", "what's your name", "real name", "surname", "meet up", "meet me", "send me"];
// Lap times (1:23.456, 83.456) are fine: they're the whole point of the game.
const LAP_TIME = /\b\d{1,2}:\d{2}(\.\d{1,3})?\b|\b\d{1,3}\.\d{1,3}\b/g;

// Words, with l33t and s p a c i n g undone: runs of single letters are joined up.
function words(text){
	const raw = text.split(/\s+/).filter(Boolean);
	const out = [];
	for(let i = 0; i < raw.length; i++){
		if(raw[i].length === 1 && raw[i + 1] && raw[i + 1].length === 1){
			let j = i, w = "";
			while(j < raw.length && raw[j].length === 1) w += raw[j++];
			out.push({ text: w, from: i, to: j });
			i = j - 1;
		}else out.push({ text: raw[i], from: i, to: i + 1 });
	}
	return { raw, out };
}

// Returns { ok, text } or { ok: false, why }. strict = a guest sending, or a guest reading.
export function filterChat(input, strict){
	let text = String(input || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
	const max = strict ? 60 : 120;
	if(!text) return { ok: false, why: "" };
	if(text.length > max) text = text.slice(0, max).trim();
	if(LINK.test(text)) return { ok: false, why: "Links aren't allowed in chat." };
	if(EMAIL.test(text) || (strict && text.includes("@"))) return { ok: false, why: "Email addresses and @names aren't allowed in chat." };
	const noTimes = text.replace(LAP_TIME, " ");
	if(PHONE.test(noTimes) || (strict && DIGITS(5).test(noTimes))) return { ok: false, why: "Long numbers aren't allowed in chat." };
	const { raw, out } = words(text);
	const bad = out.filter(w => isRude(w.text));
	if(strict){
		const flat = " " + raw.join(" ").toLowerCase().replace(/[^a-z' ]/g, "") + " ";
		const plain = out.map(w => w.text.toLowerCase().replace(/[^a-z]/g, ""));
		if(bad.length) return { ok: false, why: "That message has words that aren't allowed." };
		if(plain.some(w => CONTACT.includes(w)) || CONTACT_PHRASES.some(p => flat.includes(" " + p))) return { ok: false, why: "For safety, guests can't swap contact details or personal info. Keep it to the racing." };
		if(text.length > 8 && text.replace(/[^A-Z]/g, "").length > text.replace(/[^a-zA-Z]/g, "").length * 0.7) text = text.toLowerCase();
		return { ok: true, text };
	}
	if(bad.length > 2) return { ok: false, why: "That message has words that aren't allowed." };
	for(const w of bad) for(let i = w.from; i < w.to; i++) raw[i] = "*".repeat(Math.max(3, raw[i].length));
	return { ok: true, text: raw.join(" ") };
}

// Ready-made messages anyone can send, guests included.
export const QUICK_CHAT = ["GG", "Good race!", "Nice pass!", "Sorry!", "Rematch?", "Ready!", "Close one!", "Let's go!"];
