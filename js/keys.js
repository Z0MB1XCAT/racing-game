// The keys the game uses, and changing them (Settings > Controls). Everything here is plain data: which physical key does what.
// Remapping only changes which key means "steer left": the steering itself, and so the handling, is untouched.
//
// A key map is { action: [first key, second key?] } with keys as KeyboardEvent.code ("KeyA", "ArrowLeft"), so it doesn't
// matter what layout the keyboard has. It's saved in your profile, which an account carries to any computer.

export const ACTIONS = [
	{ id: "left", label: "Steer left", keys: ["ArrowLeft", "KeyA"], must: true },
	{ id: "right", label: "Steer right", keys: ["ArrowRight", "KeyD"], must: true },
	{ id: "back", label: "Look behind (hold)", keys: ["KeyB"] },
	{ id: "horn", label: "Horn (hold)", keys: ["KeyH"] },
	{ id: "rescue", label: "Reset car", keys: ["KeyR"] },
	{ id: "camera", label: "Camera", keys: ["KeyC"] },
	{ id: "pause", label: "Pause", keys: ["KeyP"], must: true },     // (Esc always pauses too)
	{ id: "mute", label: "Mute", keys: ["KeyM"] },
	{ id: "ghost", label: "Show or hide my ghost", keys: ["KeyG"] },
	{ id: "chat", label: "Chat", keys: ["KeyT"] }                     // (Enter always opens it too)
];
export const SLOTS = 2;
const BY_ID = new Map(ACTIONS.map(a => [a.id, a]));

// Keys that always do their own job, so they can't be given another (Esc pauses and closes things, Enter chats, Tab moves focus).
export const RESERVED = new Set(["Escape", "Enter", "NumpadEnter", "Tab", "Backspace", "Delete", "ContextMenu", "CapsLock", "NumLock", "ScrollLock", "Pause", "PrintScreen"]);
// What can be used: letters, digits, arrows, the numpad, space, punctuation, Shift and the navigation keys. Not Ctrl, Alt or the
// Windows key (they go with browser shortcuts), and not function keys (F5, F11 and the like belong to the browser).
const USABLE = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal)|Space|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Backquote|Minus|Equal|ShiftLeft|ShiftRight|Home|End|PageUp|PageDown|Insert)$/;
export const usable = code => typeof code === "string" && code.length <= 16 && USABLE.test(code) && !RESERVED.has(code);

export function defaultKeys(){
	return Object.fromEntries(ACTIONS.map(a => [a.id, a.keys.slice()]));
}

// Anything saved or typed in, made safe: only real actions, only usable keys, at most two each, no key doing two jobs (the first
// action in the list keeps it), and steering and pause always have a key. Always returns a complete map.
export function cleanKeys(raw){
	const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
	const used = new Set(), out = {};
	for(const a of ACTIONS){
		const want = Object.prototype.hasOwnProperty.call(src, a.id) && Array.isArray(src[a.id]) ? src[a.id] : null;
		const keys = [];
		for(const k of want || []) if(usable(k) && !used.has(k) && !keys.includes(k) && keys.length < SLOTS){ keys.push(k); used.add(k); }
		if(!keys.length){                     // (never set, or nothing usable was saved: its own default, if that key is free)
			for(const k of a.keys) if(!used.has(k) && keys.length < SLOTS){ keys.push(k); used.add(k); }
		}
		out[a.id] = keys;
	}
	// The ones you can't do without: if every default was taken, take one back from whoever has it.
	for(const a of ACTIONS) if(a.must && !out[a.id].length){
		const k = a.keys[0];
		for(const o of ACTIONS) out[o.id] = out[o.id].filter(x => x !== k);
		out[a.id] = [k];
	}
	return out;
}

export const isDefault = map => JSON.stringify(cleanKeys(map)) === JSON.stringify(defaultKeys());

// key code -> action, for the keydown handler.
export function lookup(map){
	const m = new Map();
	for(const a of ACTIONS) for(const k of (map[a.id] || [])) m.set(k, a.id);
	return m;
}

// Give an action a key in one of its two places. { keys } is the new map, or { error } says in plain words why not (the map is
// unchanged). A key another action has is swapped with the one you're replacing, so nothing is left without a key it needs.
export function bindKey(map, id, slot, code){
	const a = BY_ID.get(id);
	if(!a || !(slot >= 0 && slot < SLOTS)) return { error: "That isn't something you can change." };
	if(!usable(code)){
		return { error: RESERVED.has(code) ? "That key always does its own job (Esc pauses, Enter opens chat). Pick another." : "That key can't be used. Pick a letter, number, arrow or the space bar." };
	}
	const keys = cleanKeys(map), mine = keys[id], before = mine[slot];
	if(before === code) return { keys };
	const owner = ACTIONS.find(o => o.id !== id && keys[o.id].includes(code));
	if(owner){
		const at = keys[owner.id].indexOf(code);
		if(before) keys[owner.id][at] = before;                    // (swap: they get the key you're giving up)
		else if(keys[owner.id].length > 1) keys[owner.id].splice(at, 1);       // (they keep their other key)
		else return { error: `${code.replace(/^Key|^Digit/, "")} is already how you ${owner.label.toLowerCase()}. Change that first, or pick another key.` };
	}
	if(slot > mine.length) slot = mine.length;                     // (a second key can only follow a first)
	mine[slot] = code;
	return { keys: cleanKeys(keys), swapped: owner ? owner.id : null };
}

// Take away an action's second key. (The first can only be changed, never removed.)
export function clearKey(map, id, slot){
	const keys = cleanKeys(map);
	if(!BY_ID.has(id) || slot < 1 || !keys[id][slot]) return { keys };
	keys[id].splice(slot, 1);
	return { keys };
}

// A key as it's printed on the keyboard.
export function keyLabel(code){
	if(typeof code !== "string") return "";
	const fixed = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`", Minus: "-", Equal: "=", ShiftLeft: "Shift", ShiftRight: "Shift", PageUp: "Page up", PageDown: "Page down", NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadDecimal: "Num ." };
	if(Object.prototype.hasOwnProperty.call(fixed, code)) return fixed[code];
	const m = /^(?:Key|Digit)(.)$/.exec(code) || /^Numpad(\d)$/.exec(code);
	if(m) return /^Numpad/.test(code) ? "Num " + m[1] : m[1];
	return code;
}

// The line of key hints along the bottom of the race screen, as HTML (the labels are from the list above, never typed text).
export function hudHint(map){
	const k = cleanKeys(map), kbd = c => `<kbd>${keyLabel(c)}</kbd>`, one = (id, n) => k[id][n] ? kbd(k[id][n]) : "";
	const steer = [one("left", 0), one("right", 0)].join(" ") + (k.left[1] || k.right[1] ? " or " + [one("left", 1), one("right", 1)].filter(Boolean).join(" ") : "");
	const part = (id, text) => k[id].length ? `${kbd(k[id][0])} ${text}` : "";
	return [steer + " steer", part("rescue", "reset car"), part("back", "look back"), part("horn", "horn"), part("camera", "camera"), "<kbd>Esc</kbd> pause"].filter(Boolean).join(" &middot; ");
}
