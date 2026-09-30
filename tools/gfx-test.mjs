// Checks the graphics dials in the real game (js/gfx.js, js/adaptive.js): the FPS counter in Settings,
// the game turning its own sharpness down on a computer that can't keep up (headless Chrome draws in
// software, so it stands in for a weak one), leaving it alone when "Hold 60 fps" is off, restoring where a
// computer settled, and Fast having no shadows to give up. Needs node serve.mjs running.
//   node tools/gfx-test.mjs
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: "new" });
// A weak computer: no graphics card, WebGL drawn in software (SwiftShader).
const weak = await puppeteer.launch({ headless: "new", args: ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open({ settings = {}, storage = {}, track = "monaco", go = true, slow = false } = {}){
	const p = await (slow ? weak : browser).newPage();
	const errors = [];
	p.on("pageerror", e => errors.push(e.message));
	p.on("console", m => { if(m.type() === "error" && !/tailwind|apple-mobile|Failed to load resource/.test(m.text())) errors.push(m.text()); });
	await p.evaluateOnNewDocument((s, st) => { try{ localStorage.setItem("org-gp:settings", JSON.stringify(s)); for(const [k, v] of Object.entries(st)) localStorage.setItem("org-gp:" + k, JSON.stringify(v)); }catch(e){} }, { quality: "high", ...settings }, storage);
	p.setDefaultTimeout(180000);
	await p.setViewport(slow ? { width: 640, height: 360 } : { width: 1280, height: 720 });
	// (A computer this slow never goes quiet: don't wait for the network to.)
	await p.goto("http://localhost:3000/", { waitUntil: slow ? "domcontentloaded" : "networkidle0", timeout: 180000 });
	await p.waitForFunction(() => window.__game && window.__game.gfx, { timeout: 180000 });
	if(go){
		await p.click("#btnBots"); await wait(400);
		await p.evaluate(id => document.querySelector(`#setupTracks [data-id="${id}"]`).click(), track);
		await wait(1500);
		await p.evaluate(() => { window.__game.setup.bots = 5; });
		await p.click("#setupGo");
	}
	return { p, errors };
}
const state = p => p.evaluate(() => { const g = window.__game.gfx; return { step: g.adaptive.step, n: g.ladder.length, pr: g.renderer.getPixelRatio(), shadows: g.current.shadows, cast: !!(window.__game.world && window.__game.world.sun.castShadow), fps: g.adaptive.mean ? 1000 / g.adaptive.mean : 0, quality: g.quality, on: g.adaptiveOn }; });

console.log("the FPS counter");
{
	const { p, errors } = await open({ go: false });
	ok(await p.evaluate(() => !document.querySelector(".fps-box")), "off by default: nothing on screen");
	await p.evaluate(() => document.querySelector('[data-open="settings"]').click());
	await wait(200);
	await p.evaluate(() => document.querySelector('#setFps button[data-v="1"]').click());
	await wait(900);
	const box = await p.evaluate(() => { const b = document.querySelector(".fps-box"); return b ? { text: b.textContent, shown: getComputedStyle(b).display !== "none" } : null; });
	ok(box && box.shown, "switching it on in Settings shows it");
	ok(box && /fps/.test(box.text) && /sharpness \d+%/.test(box.text) && /shadows (on|off)/.test(box.text) && /triangles/.test(box.text), "it shows fps, sharpness, shadows and the load: " + (box ? box.text.replace(/\s+/g, " ").slice(0, 150) : ""));
	ok(box && /[A-Za-z]{3}/.test(await p.evaluate(() => document.querySelector(".fps-gpu").textContent)), "and names the graphics card: " + await p.evaluate(() => document.querySelector(".fps-gpu").textContent));
	ok(await p.evaluate(() => JSON.parse(localStorage.getItem("org-gp:settings")).fps === true), "the choice is remembered");
	await p.evaluate(() => document.querySelector('#setFps button[data-v="0"]').click());
	await wait(200);
	ok(await p.evaluate(() => !document.querySelector(".fps-box")), "switching it off removes it");
	ok(errors.length === 0, "no page errors" + (errors[0] ? ": " + errors[0] : ""));
	await p.close();
}

console.log("a computer that can't keep up (no graphics card: drawn in software), Hold 60 fps on");
{
	const { p, errors } = await open({ slow: true, go: false });
	ok((await state(p)).on, "Hold 60 fps is on");
	ok(/swiftshader|software|llvmpipe|angle/i.test(await p.evaluate(() => window.__game.gfx.gpu)), "(and it really is software: " + await p.evaluate(() => window.__game.gfx.gpu) + ")");
	await wait(45000);
	const after = await state(p);
	ok(after.step > 0, "it turned itself down: step " + after.step + " of " + (after.n - 1) + ", sharpness " + Math.round(after.pr * 100) + "%, about " + after.fps.toFixed(0) + " fps");
	ok(after.pr < 1, "the picture is drawn with fewer pixels (pixel ratio " + after.pr.toFixed(2) + ")");
	ok(!after.shadows === !after.cast, "the sun's shadows follow the step (" + (after.shadows ? "on" : "off") + ")");
	ok(errors.length === 0, "no page errors" + (errors[0] ? ": " + errors[0] : ""));
	await p.close();
}

console.log("Hold 60 fps off");
{
	const { p, errors } = await open({ settings: { adaptive: false }, slow: true, go: false });
	await wait(20000);
	const s = await state(p);
	ok(s.step === 0 && s.pr === 1 && !s.on, "it stays at full sharpness however slow it is");
	ok(errors.length === 0, "no page errors" + (errors[0] ? ": " + errors[0] : ""));
	await p.close();
}

console.log("where a computer settled is remembered");
{
	const { p, errors } = await open({ storage: { gfxStep: { q: "high", dpr: 1, step: 3 } }, go: false });
	const s = await state(p);
	ok(s.step === 3 && Math.abs(s.pr - 0.75) < 0.01, "starts on the saved step (step " + s.step + ", pixel ratio " + s.pr + ")");
	await p.close();
	const other = await open({ storage: { gfxStep: { q: "low", dpr: 1, step: 3 } }, go: false });
	ok((await state(other.p)).step === 0, "a step saved for another quality isn't used");
	await other.p.close();
}

console.log("Fast");
{
	const { p, errors } = await open({ settings: { quality: "low" } });
	await wait(1500);
	const s = await state(p);
	ok(s.quality === "low" && s.n === 5 && !s.shadows && !s.cast, "Fast has its own short ladder and no shadows to give up");
	ok(errors.length === 0, "no page errors" + (errors[0] ? ": " + errors[0] : ""));
	await p.close();
}
await browser.close(); await weak.close();
if(problems.length){ console.log("\n" + problems.length + " failed"); process.exit(1); }
console.log("\ngraphics dials ok");
