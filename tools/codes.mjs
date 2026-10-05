// Manage prize codes (js/codes.js). A player types a code in the garage and an item unlocks for them. Only each code's
// fingerprint goes in the game's files, so you must keep the plain codes yourself (this prints them when it makes them).
//   node tools/codes.mjs items                          every item a code can unlock ("livery:gold", "title:champion", ...)
//   node tools/codes.mjs add <CODE> <item...> [--label "text"] [--until YYYY-MM-DD]
//   node tools/codes.mjs random <count> <item...> [--label "text"] [--until YYYY-MM-DD]     (makes codes like TIGER-4821 and prints them)
//   node tools/codes.mjs list                           the labels, items and dates (never the codes: they aren't stored)
//   node tools/codes.mjs check <CODE>                   is this code in the list, and what does it give?
//   node tools/codes.mjs remove <hash-start>            take a code out (use the start of its hash from "list")
// Add --file <path> to work on another copy of js/codes.js (for testing). Then commit js/codes.js and push.
import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { hashCode, normalise } from "../js/codes.js";
import { CATEGORIES, itemByKey } from "../js/cosmetics.js";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf("--" + name); if(i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const file = flag("file") || new URL("../js/codes.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const label = flag("label") || "", until = flag("until");
const [cmd, ...rest] = args;
const BEGIN = "// BEGIN CODES", END = "// END CODES";

const read = () => {
	const src = readFileSync(file, "utf8");
	const a = src.indexOf(BEGIN), b = src.indexOf(END);
	if(a < 0 || b < a) throw new Error("can't find the BEGIN CODES and END CODES markers in " + file);
	const body = src.slice(a + BEGIN.length, b);
	const entries = [...body.matchAll(/\{ h: "([0-9a-f]+)", grants: (\[[^\]]*\])(?:, label: "((?:[^"\\]|\\.)*)")?(?:, until: "([0-9-]+)")? \}/g)]
		.map(m => ({ h: m[1], grants: JSON.parse(m[2]), label: m[3] ? JSON.parse('"' + m[3] + '"') : "", until: m[4] || "" }));
	return { src, a, b, entries };
};
const write = (st, entries) => {
	const lines = entries.map(e => `\t{ h: "${e.h}", grants: ${JSON.stringify(e.grants)}${e.label ? ", label: " + JSON.stringify(e.label) : ""}${e.until ? ', until: "' + e.until + '"' : ""} },`);
	writeFileSync(file, st.src.slice(0, st.a + BEGIN.length) + "\n" + lines.map(l => l + "\n").join("") + "\t" + st.src.slice(st.b), "utf8");
};
const checkGrants = list => {
	if(!list.length) throw new Error("name at least one item to give, like livery:gold (node tools/codes.mjs items lists them)");
	for(const g of list) if(!itemByKey(g)) throw new Error(`there's no item "${g}" (node tools/codes.mjs items lists them)`);
};
if(until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error("--until takes a date like 2026-12-31");

const WORDS = ["TIGER", "COMET", "RAVEN", "BLAZE", "NITRO", "DRIFT", "ROCKET", "FALCON", "THUNDER", "PHOENIX", "TURBO", "VIPER", "COBRA", "ORBIT", "LASER", "SPARK", "ZENITH", "RAPTOR", "COBALT", "EMBER"];

if(cmd === "items"){
	for(const c of CATEGORIES) if(c.items) console.log(c.name.padEnd(11) + c.items.map(i => i.key).join("  "));
}else if(cmd === "add" || cmd === "random"){
	const st = read();
	const codes = [];
	let grants;
	if(cmd === "add"){ const [code, ...g] = rest; if(!code) throw new Error("usage: add <CODE> <item...>"); grants = g; codes.push(code); }
	else{
		const count = parseInt(rest[0], 10); grants = rest.slice(1);
		if(!(count >= 1 && count <= 500)) throw new Error("usage: random <count 1-500> <item...>");
		while(codes.length < count) codes.push(`${WORDS[randomInt(WORDS.length)]}-${String(randomInt(10000)).padStart(4, "0")}`);
	}
	checkGrants(grants);
	for(const code of codes){
		if(normalise(code).length < 4) throw new Error(`"${code}" is too short: use at least 4 letters or numbers`);
		const h = await hashCode(code);
		if(st.entries.some(e => e.h === h)){ console.log(`${code}: already in the list, skipped`); continue; }
		st.entries.push({ h, grants, label, until: until || "" });
		console.log(code);
	}
	write(st, st.entries);
	console.log(`\n${codes.length} code${codes.length === 1 ? "" : "s"} added to ${file}, giving ${grants.join(", ")}${until ? ", good until " + until : ""}. Keep the codes above: they aren't stored. Now commit js/codes.js.`);
}else if(cmd === "list"){
	const { entries } = read();
	if(!entries.length) console.log("No codes yet.");
	for(const e of entries) console.log(`${e.h.slice(0, 8)}  ${e.grants.join(", ").padEnd(34)} ${e.until ? "until " + e.until : "no end date"}${e.label ? "  \"" + e.label + "\"" : ""}`);
}else if(cmd === "check"){
	const [code] = rest, { entries } = read();
	const h = await hashCode(code || "");
	const e = entries.find(x => x.h === h);
	console.log(e ? `Yes: gives ${e.grants.join(", ")}${e.until ? ", good until " + e.until : ""}${e.label ? ' ("' + e.label + '")' : ""}` : "No: that code isn't in the list.");
}else if(cmd === "remove"){
	const st = read(), start = (rest[0] || "").toLowerCase();
	const hit = st.entries.filter(e => start.length >= 4 && e.h.startsWith(start));
	if(hit.length !== 1) throw new Error(hit.length ? "that matches more than one code: use more of the hash" : "no code starts with that (use at least 4 characters of the hash from list)");
	write(st, st.entries.filter(e => e !== hit[0]));
	console.log("Removed " + hit[0].h.slice(0, 8) + " (" + hit[0].grants.join(", ") + "). Now commit js/codes.js.");
}else{
	console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));
}
