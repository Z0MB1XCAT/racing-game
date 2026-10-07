// Changing the keys (js/keys.js). No browser: the defaults are exactly the keys the game always had, and nothing that is saved, typed or pasted
// can leave you without a way to steer.
//   node tools/keys-test.mjs
import { ACTIONS, SLOTS, RESERVED, usable, defaultKeys, cleanKeys, isDefault, lookup, bindKey, clearKey, keyLabel, hudHint } from "../js/keys.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const def = defaultKeys();

console.log("the defaults");
// What main.js had written in before keys could change.
const original = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", KeyB: "back", KeyH: "horn", KeyR: "rescue", KeyC: "camera", KeyP: "pause", KeyM: "mute", KeyG: "ghost", KeyT: "chat" };
const look = lookup(def);
ok(look.size === Object.keys(original).length && Object.entries(original).every(([k, a]) => look.get(k) === a), "the default keys are exactly the ones the game always used (" + look.size + " keys)");
ok(isDefault(def) && isDefault(undefined) && isDefault(null) && isDefault({}), "nothing saved, or an empty map, is the defaults");
ok(ACTIONS.every(a => a.keys.length >= 1 && a.keys.length <= SLOTS && a.keys.every(usable)), "every default key can be used, with one or two for each action");
ok(new Set(ACTIONS.map(a => a.id)).size === ACTIONS.length && new Set(ACTIONS.flatMap(a => a.keys)).size === ACTIONS.flatMap(a => a.keys).length, "no two actions share a default key");
ok(!ACTIONS.flatMap(a => a.keys).some(k => RESERVED.has(k)), "no default is a reserved key (Esc and Enter always do their own job)");
ok(look.get("Escape") === undefined && look.get("Enter") === undefined, "Esc and Enter aren't in the map");

console.log("what can be bound");
const good = ["KeyA", "KeyZ", "Digit0", "Digit9", "ArrowUp", "ArrowDown", "Numpad4", "NumpadAdd", "Space", "Comma", "Period", "Slash", "Semicolon", "Quote", "BracketLeft", "Backslash", "Backquote", "Minus", "Equal", "ShiftLeft", "ShiftRight", "Home", "PageDown", "Insert"];
const bad = ["Escape", "Enter", "NumpadEnter", "Tab", "Backspace", "Delete", "F5", "F11", "F12", "ControlLeft", "AltLeft", "MetaLeft", "CapsLock", "", "key", "KeyAA", "Key1", "Digit10", "__proto__", "constructor", "<script>", null, undefined, 5, {}, [], "KeyA ", "keya", "x".repeat(40)];
ok(good.every(usable), "letters, digits, arrows, the numpad, space, punctuation, Shift and the navigation keys can be used (" + good.length + " checked)");
ok(bad.every(k => !usable(k)), "Esc, Enter, Tab, Backspace, function keys, Ctrl, Alt, the Windows key, junk and prototype names can't (" + bad.length + " tries)");

console.log("changing a key");
let r = bindKey(def, "left", 0, "KeyJ");
ok(!r.error && eq(r.keys.left, ["KeyJ", "KeyA"]) && eq(r.keys.right, def.right), "steer left's first key becomes J and nothing else moves");
r = bindKey(def, "horn", 0, "KeyV");
ok(eq(r.keys.horn, ["KeyV"]) && lookup(r.keys).get("KeyH") === undefined && lookup(r.keys).get("KeyV") === "horn", "the old key stops doing it");
r = bindKey(def, "left", 1, "KeyH");
ok(r.swapped === "horn" && eq(r.keys.left, ["ArrowLeft", "KeyH"]) && r.keys.horn.length === 1, "a key another action has is taken from it, which keeps its other key or is refused (H was the horn's only key here)" + (r.error ? ": " + r.error : ""));
r = bindKey(def, "left", 1, "KeyD");
ok(r.swapped === "right" && eq(r.keys.left, ["ArrowLeft", "KeyD"]) && eq(r.keys.right, ["ArrowRight", "KeyA"]), "putting D (steer right's) on steer left's second place swaps it with A, so each keeps two keys");
r = bindKey(bindKey(def, "left", 1, "KeyN").keys, "right", 1, "KeyN");
ok(r.swapped === "left" && eq(r.keys.left, ["ArrowLeft", "KeyD"]) && eq(r.keys.right, ["ArrowRight", "KeyN"]), "and a key that is the other action's second key goes across, with the one being replaced going back");
r = bindKey(def, "left", 0, "KeyD");
ok(eq(r.keys.left, ["KeyD", "KeyA"]) && eq(r.keys.right, ["ArrowRight", "ArrowLeft"]), "replacing a key with one another action has swaps them, so neither is left without");
r = bindKey(def, "horn", 0, "KeyM");
ok(eq(r.keys.horn, ["KeyM"]) && eq(r.keys.mute, ["KeyH"]), "swapping two single keys (horn and mute) works the same way");
r = bindKey(def, "back", 1, "KeyM");
ok(!!r.error && /mute/i.test(r.error) && eq(cleanKeys(def), def), "a second key can't be taken from an action that has only that one: it says which action to change first, and nothing changes");
r = bindKey(def, "left", 0, "Escape");
ok(!!r.error && /Esc/.test(r.error) && !r.keys, "Esc is refused, with a reason");
r = bindKey(def, "left", 0, "F5");
ok(!!r.error && /can't be used/.test(r.error), "a key that can't be used is refused, with a reason");
ok(bindKey(def, "nope", 0, "KeyJ").error && bindKey(def, "__proto__", 0, "KeyJ").error && bindKey(def, "left", 5, "KeyJ").error && bindKey(def, "left", -1, "KeyJ").error && bindKey(def, "left", NaN, "KeyJ").error, "made-up actions, prototype names and impossible places are refused");
r = bindKey(def, "left", 0, "ArrowLeft");
ok(eq(r.keys, def), "choosing the key it already has changes nothing");
r = bindKey(def, "back", 1, "KeyN");
ok(eq(r.keys.back, ["KeyB", "KeyN"]), "an action with one key can be given a second");
r = bindKey(def, "back", 0, "KeyN"); r = bindKey(r.keys, "back", 1, "KeyN");
ok(eq(r.keys.back, ["KeyN"]), "the same key twice on one action doesn't stick");
r = bindKey(def, "mute", 1, "KeyN");
r = clearKey(r.keys, "mute", 1);
ok(eq(r.keys.mute, ["KeyM"]) && eq(clearKey(def, "mute", 0).keys.mute, ["KeyM"]) && eq(clearKey(def, "left", 1).keys.left, ["ArrowLeft"]), "a second key can be taken away; the first can't, so no action is left bare");
let steady = def, trail = [];
for(const [id, slot, code] of [["left", 0, "KeyJ"], ["right", 0, "KeyL"], ["left", 1, "KeyL"], ["horn", 0, "KeyJ"], ["pause", 0, "KeyA"], ["camera", 1, "ArrowLeft"], ["ghost", 0, "KeyD"], ["rescue", 1, "Space"], ["left", 0, "Space"]]){
	const x = bindKey(steady, id, slot, code);
	if(x.keys) steady = x.keys;
	const lk = lookup(steady), names = new Set(lk.values());
	trail.push(ACTIONS.every(a => steady[a.id].length >= 1 && steady[a.id].length <= SLOTS) && [...lk.keys()].every(usable) && ACTIONS.filter(a => a.must).every(a => names.has(a.id)) && lk.size === ACTIONS.reduce((n, a) => n + steady[a.id].length, 0));
}
ok(trail.every(Boolean), "after a run of changes, swaps and refusals every action still has one or two keys, every key is usable, none is on two actions");

console.log("saved or pasted data");
const clean = cleanKeys({ left: ["KeyJ"], right: ["KeyL", "KeyL", "KeyK", "KeyZ"], horn: [], bogus: ["KeyQ"], __proto__: { left: ["KeyX"] }, pause: "KeyP", mute: ["Escape", "F5"], camera: [5, null, "KeyV"], chat: ["KeyJ"] });
ok(eq(clean.left, ["KeyJ"]) && eq(clean.right, ["KeyL", "KeyK"]) && !("bogus" in clean), "extra keys beyond two, repeats and made-up actions are dropped");
ok(eq(clean.horn, ["KeyH"]) && eq(clean.pause, ["KeyP"]) && eq(clean.mute, ["KeyM"]), "an action with nothing usable saved gets its own default back (empty list, a string, junk keys)");
ok(eq(clean.camera, ["KeyV"]) && eq(clean.chat, ["KeyT"]), "a key two actions both asked for goes to the first (J is steer left's, so chat gets T back)");
const junkMaps = [undefined, null, 0, 1, "KeyA", true, [], [["left"]], () => 1, { left: "ArrowLeft" }, { left: null }, JSON.parse('{"__proto__":{"left":["KeyX"]},"constructor":["KeyA"]}'), { left: ["KeyA"], right: ["KeyA"], pause: ["KeyA"] }, Object.create(null)];
ok(junkMaps.every(m => { const c = cleanKeys(m); return ACTIONS.every(a => Array.isArray(c[a.id]) && c[a.id].length >= (a.must ? 1 : 0) && c[a.id].length <= SLOTS) && eq(cleanKeys(c), c); }), "rubbish of every kind (" + junkMaps.length + " tries) gives a complete, valid map, and cleaning it again changes nothing");
const clash = cleanKeys({ left: ["KeyA"], right: ["KeyA"], pause: ["KeyA"] });
ok(ACTIONS.filter(a => a.must).every(a => clash[a.id].length >= 1) && eq(clash.left, ["KeyA"]), "if steering and pause were all set to one key, each still ends up with a key (the first keeps it)");
const starve = cleanKeys({ left: ["KeyD", "KeyJ"], right: ["Space"], rescue: ["ArrowRight"], horn: ["KeyD"] });
ok(starve.right.length >= 1 && ACTIONS.filter(a => a.must).every(a => starve[a.id].length >= 1), "if another action has a steering action's default, steering is given a key anyway");

console.log("how they're shown");
ok(keyLabel("KeyA") === "A" && keyLabel("Digit5") === "5" && keyLabel("ArrowLeft") === "←" && keyLabel("Space") === "Space" && keyLabel("Numpad7") === "Num 7" && keyLabel("NumpadAdd") === "Num +" && keyLabel("Comma") === "," && keyLabel("ShiftLeft") === "Shift", "keys are named as they're printed (A, 5, ←, Space, Num 7, ',', Shift)");
ok(["", null, undefined, 5, {}, "__proto__", "constructor", "toString"].every(k => typeof keyLabel(k) === "string"), "odd values still give text");
const hint = hudHint(def);
ok(/<kbd>←<\/kbd> <kbd>→<\/kbd> or <kbd>A<\/kbd> <kbd>D<\/kbd> steer/.test(hint) && /<kbd>R<\/kbd> reset car/.test(hint) && /<kbd>B<\/kbd> look back/.test(hint) && /<kbd>H<\/kbd> horn/.test(hint) && /<kbd>C<\/kbd> camera/.test(hint) && /<kbd>Esc<\/kbd> pause$/.test(hint), "the hint along the bottom of the race says what it always said, with the default keys");
const mine = bindKey(bindKey(def, "left", 0, "KeyJ").keys, "right", 0, "KeyL").keys;
ok(/<kbd>J<\/kbd> <kbd>L<\/kbd> or <kbd>A<\/kbd> <kbd>D<\/kbd> steer/.test(hudHint(mine)), "and follows the keys you chose");
ok(!/[<>"&]/.test(hudHint(mine).replace(/<\/?kbd>/g, "").replace(/&middot;/g, "")), "it contains nothing but those key labels and tags");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nkeys-test: OK");
