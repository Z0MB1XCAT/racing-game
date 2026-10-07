// Changes the game's public address everywhere search engines and link previews read it (index.html's canonical link, Open Graph and
// search-result data; sitemap.xml; robots.txt), for when the game gets its own domain. Prints what else has to change by hand.
//   node tools/set-site-url.mjs https://www.my-racing-game.com/
import { readFileSync, writeFileSync } from "node:fs";

const next = process.argv[2];
if(!next || !/^https:\/\/[a-z0-9.-]+(:\d+)?\/([A-Za-z0-9._~\/-]*\/)?$/i.test(next)){
	console.log("Give the new address: it starts with https:// and ends with a slash, like https://www.my-racing-game.com/");
	process.exit(1);
}
const html = readFileSync("index.html", "utf8");
const old = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
if(!old){ console.log("index.html has no canonical link to start from."); process.exit(1); }
if(old === next){ console.log("It's already " + next); process.exit(0); }
let n = 0;
for(const f of ["index.html", "sitemap.xml", "robots.txt"]){
	const text = readFileSync(f, "utf8"), count = text.split(old).length - 1;
	if(count){ writeFileSync(f, text.split(old).join(next)); n += count; console.log(f.padEnd(14), count + " place" + (count === 1 ? "" : "s") + " changed"); }
}
console.log(`\n${old}\n  -> ${next}   (${n} places)\n`);
console.log("Still to do by hand (README.md, \"Getting found\"):");
console.log("  1. GitHub: repo Settings > Pages > Custom domain, and tick Enforce HTTPS (GitHub adds a CNAME file: commit it).");
console.log("  2. Firebase console > Authentication > Settings > Authorized domains: add the new domain, or accounts stop working on it.");
console.log("  3. Google Search Console: add the new address as a new property, verify it, submit sitemap.xml again.");
console.log("  4. node tools/seo-test.mjs, then bump the version and push.");
