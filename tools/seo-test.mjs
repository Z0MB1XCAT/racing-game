// Everything that helps the game be found (README.md, "Getting found"): index.html's title, description, canonical address, link-preview and
// search-result data, the sitemap, robots.txt and the picture files they point at, all agreeing with each other. No browser, no network.
//   node tools/seo-test.mjs
import { readFileSync, existsSync, statSync } from "node:fs";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const bytes = f => readFileSync(new URL("../" + f, import.meta.url));
const html = read("index.html");
const head = html.slice(0, html.indexOf("</head>"));
const meta = (attr, name) => { const m = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(head); return m ? m[1] : null; };

// The size of a JPEG or a PNG, read from its header.
function jpegSize(b){
	if(b[0] !== 0xFF || b[1] !== 0xD8) return null;
	for(let i = 2; i < b.length - 9;){
		if(b[i] !== 0xFF){ i++; continue; }
		const marker = b[i + 1];
		if(marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
		i += 2 + b.readUInt16BE(i + 2);
	}
	return null;
}
const pngSize = b => (b.toString("ascii", 1, 4) === "PNG" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null);

console.log("the page");
const title = (/<title>([^<]*)<\/title>/.exec(head) || [])[1] || "", desc = meta("name", "description") || "";
const { GAME_NAME } = await import("../js/config.js");
ok(title.length >= 25 && title.length <= 70 && title.startsWith(GAME_NAME), `a title of a sensible length that starts with the game's name (${title.length} characters: "${title}")`);
ok(desc.length >= 70 && desc.length <= 160, `a description search results can show whole (${desc.length} characters)`);
ok(!/noindex|nofollow/i.test(meta("name", "robots") || ""), "the page doesn't ask to be left out of search");
const canon = (/<link rel="canonical" href="([^"]+)"/.exec(head) || [])[1];
ok(!!canon && /^https:\/\/[^\s/]+\/([^\s?#]*\/)?$/.test(canon), "a canonical address: https, no query, ends with a slash (" + canon + ")");
const BASE = canon || "";
ok(meta("property", "og:url") === BASE && meta("property", "og:type") === "website", "the link preview names the same address");
ok(!!meta("property", "og:title") && !!meta("property", "og:description") && meta("property", "og:site_name") === "Online Racing Game GP", "the link preview has a title, a description and the site's name");
ok(meta("name", "twitter:card") === "summary_large_image" && meta("name", "twitter:title") && meta("name", "twitter:description"), "chat apps that read Twitter-style cards get a large picture card too");
ok(html.includes("<noscript>") && /free racing game/i.test(html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"))), "anything that can't run the game's script is told what it is in plain words");
ok(/<meta name="google-site-verification" content="[\w-]{20,}"/.test(head), "Google's verification tag is in the head (it stays there: removing it un-verifies the site)");

console.log("the pictures");
const og = meta("property", "og:image"), tw = meta("name", "twitter:image");
ok(og === tw && !!og && og.startsWith(BASE + "assets/social/"), "the link preview and Twitter card use the same picture, on the same address (" + og + ")");
const ogFile = og ? og.replace(BASE, "") : "";
ok(existsSync(new URL("../" + ogFile, import.meta.url)), "and the file is there: " + ogFile);
if(existsSync(new URL("../" + ogFile, import.meta.url))){
	const b = bytes(ogFile), sz = jpegSize(b);
	ok(!!sz && sz.w === 1200 && sz.h === 630 && meta("property", "og:image:width") === "1200" && meta("property", "og:image:height") === "630", `it is 1200 x 630 and the page says so (${sz ? sz.w + " x " + sz.h : "not a JPEG"})`);
	ok(b.length < 300 * 1024, `and light enough for a chat app to fetch (${Math.round(b.length / 1024)} KB)`);
}
for(const [file, size] of [["assets/social/icon-192.png", 192], ["assets/social/apple-touch-icon.png", 180]]){
	const there = existsSync(new URL("../" + file, import.meta.url)), sz = there && pngSize(bytes(file));
	ok(there && sz && sz.w === size && sz.h === size && html.includes(file), `${file} is a ${size} x ${size} PNG and the page links to it`);
}

console.log("what search engines read");
const ld = (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head) || [])[1];
let data = null; try{ data = JSON.parse(ld); }catch{}
ok(!!data && data["@type"] === "VideoGame" && data.url === BASE && data.name === meta("property", "og:site_name") && data.isAccessibleForFree === true, "the search-result data (schema.org VideoGame) is valid JSON and agrees with the page");
ok(!!data && data.image === og && data.playMode.includes("MultiPlayer") && data.gamePlatform === "Web browser", "and names the same picture, and says it's a multiplayer game in a web browser");
const sitemap = read("sitemap.xml"), locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
ok(sitemap.startsWith("<?xml") && sitemap.includes("http://www.sitemaps.org/schemas/sitemap/0.9") && locs.length >= 1, "sitemap.xml is a real sitemap with " + locs.length + " address");
ok(locs.every(l => l.startsWith(BASE)) && locs.includes(BASE), "and every address in it is under the canonical one, including the home page");
ok([...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every(m => /^\d{4}-\d{2}-\d{2}$/.test(m[1])), "its dates are in the form search engines want (2026-10-07)");
const robots = read("robots.txt");
ok(/^User-agent: \*/m.test(robots) && !/^Disallow:\s*\/\s*$/m.test(robots), "robots.txt lets search engines in");
ok(robots.includes("Sitemap: " + BASE + "sitemap.xml"), "and points at the sitemap on the same address");
const editor = read("editor/index.html");
ok(/<meta name="robots" content="noindex">/.test(editor), "the track editor (switched off for now) keeps itself out of search");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nseo-test: OK");
