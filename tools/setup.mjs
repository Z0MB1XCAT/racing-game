// One-time setup for the checks and screenshot tools (anything that isn't in git on purpose).
//   npm run setup        (or: node tools/setup.mjs)
// - tools/three.min.cjs: three.js r128 for the node tools (the game itself loads it from a CDN);
// - original/: the upstream game (jchabin/cars) at the commit the physics check compares against;
// - puppeteer (npm install), for screenshots and the browser tests.
// Safe to run again: anything already there is left alone.
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const at = p => new URL(p, root);
const sh = (cmd, cwd = root) => execSync(cmd, { stdio: "inherit", cwd });

// three.js r128 (sha-256 starts 9274bbcec8d96168).
const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
if(existsSync(at("tools/three.min.cjs"))) console.log("three.js: already there");
else {
	console.log("three.js: downloading " + THREE_URL);
	const res = await fetch(THREE_URL);
	if(!res.ok) throw new Error("three.js download failed: " + res.status);
	const buf = Buffer.from(await res.arrayBuffer());
	const sum = createHash("sha256").update(buf).digest("hex");
	if(!sum.startsWith("9274bbcec8d96168")) console.warn("three.js: unexpected checksum " + sum.slice(0, 16) + " (expected 9274bbcec8d96168)");
	writeFileSync(at("tools/three.min.cjs"), buf);
}

// The original game, pinned to the commit this fork's physics check was written against.
const ORIGINAL = "https://github.com/jchabin/cars.git", ORIGINAL_COMMIT = "2ea1fd079630b4fe92eef818b3c8894e4440aa18";
if(existsSync(at("original/script.js"))) console.log("original: already there");
else {
	console.log("original: cloning " + ORIGINAL);
	sh(`git clone ${ORIGINAL} original`);
	sh(`git checkout --quiet ${ORIGINAL_COMMIT}`, at("original/"));
}

// puppeteer (devDependency in package.json). Downloads its own Chrome.
let hasPuppeteer = false;
try { await import("puppeteer"); hasPuppeteer = true; } catch {}
if(hasPuppeteer) console.log("puppeteer: already installed");
else {
	console.log("puppeteer: npm install");
	sh("npm install --no-audit --no-fund");
}

const pkg = JSON.parse(readFileSync(at("package.json"), "utf8"));
console.log("\nReady. Try: npm test   (physics check + bot laps on every track)");
console.log("Screenshots and browser tests: start the server with `" + pkg.scripts.serve + "` first.");
