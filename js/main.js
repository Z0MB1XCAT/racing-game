// Game shell: screens, input, camera, and wiring races to the menus and online rooms.
import { TRACKS, trackById } from "./tracks.js";
import { buildTrack } from "./trackgen.js";
import { makeTracker } from "./progress.js";
import { buildWorld } from "./world.js";
import { makeCar, disposeCar, animateCar, BODIES } from "./cars.js";
import { Race, COUNTDOWN } from "./race.js";
import { Hud, fmtTime } from "./hud.js";
import { Effects } from "./fx.js";
import * as audio from "./audio.js";
import * as store from "./storage.js";
import { connect, onlineAvailable, normaliseBvs } from "./net.js";
import { newChamp, scoreRound, champStandings, champGrid } from "./champ.js";
import { weeklyChallenge, timeLeft } from "./weekly.js";
import { Mesh } from "./p2p.js";
import { GAME_NAME, MAX_CARS, EDITOR_ENABLED, ACCOUNTS } from "./config.js";
import * as phys from "./physics.js";

const THREE = globalThis.THREE;
const $ = id => document.getElementById(id);
const BOT_NAMES = ["Pixel Pete", "Nitro Nia", "Captain Kerb", "Slipstream Sam", "Apex Ava", "Chicane Charlie", "Grid Greta", "Lockup Leo", "Drift Dana", "Pitlane Pat", "Turbo Tia"];
const KMH = 60 * 3.6 * 2.25;   // physics units per frame -> km/h (the car is ~4.5 m long)

if(!THREE){
	document.body.innerHTML = '<p style="font:16px system-ui;color:#fff;padding:24px">The 3D engine didn\'t load. Check your internet connection, or your network may be blocking cdnjs.cloudflare.com.</p>';
	throw new Error("three.js missing");
}

// ---------- State ----------
const S = {
	profile: store.getProfile(),
	settings: store.getSettings(),
	screen: "title",
	trackKey: null, track: null, tracker: null, world: null,
	showcase: null,
	race: null, ctx: null, frozen: false,
	paused: false, pauseStart: 0, pausedTotal: 0,
	net: null, room: null, raceId: null, resultsShown: null,
	setup: { mode: "bots", trackId: "monza", reverse: false, laps: 3, bots: 5, level: "medium", gameMode: "race", draft: true, rounds: [] },
	champ: null, champEntrants: null, lastHost: null,
	lobbyLevel: "medium",
	lastDelta: null,
	shake: 0,
	input: { left: false, right: false, tl: false, tr: false, tilt: null }
};
const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

function quality(){
	if(S.settings.quality !== "auto") return S.settings.quality;
	return mobile || (navigator.hardwareConcurrency || 8) <= 4 ? "low" : "high";
}

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
function applyPixelRatio(){ renderer.setPixelRatio(quality() === "high" ? Math.min(2, window.devicePixelRatio || 1) : 1); }
applyPixelRatio();
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("stage").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 0.3, 1000);
scene.add(camera);
let fx = new Effects(scene, quality());
const hud = new Hud();
addEventListener("resize", () => {
	renderer.setSize(innerWidth, innerHeight);
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
});

// ---------- Tracks ----------
const trackCache = new Map();
function customDefs(){
	if(!EDITOR_ENABLED) return [];
	return store.getCustomTracks().map(t => ({ id: t.id, name: t.name, place: "Your track", kind: "custom", code: t.code, laps: 3, theme: "classic" }));
}
function allDefs(){ return [...TRACKS, ...customDefs()]; }
function defFor(id, custom){
	if(custom && custom.code) return { id: "custom-" + hash(custom.code), name: custom.name || "Custom track", place: "Custom track", kind: "custom", code: custom.code, laps: 3, theme: "classic" };
	return allDefs().find(d => d.id === id) || trackById("classic");
}
function hash(s){ let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function trackKey(def, reverse){ return def.id + (reverse && !def.code ? "-rev" : ""); }
function getTrack(def, reverse){
	const key = trackKey(def, reverse);
	if(!trackCache.has(key)){
		const track = buildTrack(def, reverse && !def.code);
		trackCache.set(key, { key, def, track, tracker: makeTracker(track) });
	}
	return trackCache.get(key);
}

function showTrack(def, reverse){
	const entry = getTrack(def, reverse);
	if(S.trackKey === entry.key && S.world) return entry;
	if(S.world){ scene.remove(S.world.group); S.world.dispose(); }
	S.trackKey = entry.key; S.track = entry.track; S.tracker = entry.tracker;
	S.world = buildWorld(entry.track, { quality: quality() });
	scene.add(S.world.group);
	scene.fog = S.world.fog;
	scene.background = S.world.skyColor;
	camera.far = S.world.farPlane;
	camera.updateProjectionMatrix();
	renderer.shadowMap.enabled = quality() === "high";
	fx.clear();
	placeShowcase();
	return entry;
}

// ---------- Menu showcase car ----------
function placeShowcase(){
	if(S.showcase){ scene.remove(S.showcase); disposeCar(S.showcase); }
	S.showcase = makeCar(S.profile.body, S.profile.hue, { number: carNumber() });
	S.showcase.position.set(0, 0, 0);
	S.showcase.visible = !S.race;
	scene.add(S.showcase);
}
function carNumber(){ return (hash(S.profile.name || "x").charCodeAt(0) % 89) + 10; }

// ---------- Screens ----------
function showScreen(name){
	S.screen = name;
	document.querySelectorAll("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== name; });
}
function openModal(id){ $(id).hidden = false; const f = $(id).querySelector("button, input"); if(f) f.focus(); }
function closeModal(id){ $(id).hidden = true; }
document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.open)));
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.closest(".modal").id)));
document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if(e.target === m && m.id !== "pause") m.hidden = true; }));
document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => { audio.sfx.click(); goTitle(); }));

function goTitle(){
	endRace();
	showScreen("title");
	showTrack(defFor(S.setup.trackId), false);
	camMode = "showcase";
	loadWeeklyCard();
}

// Segmented controls and steppers.
function seg(el, value, onPick){
	const buttons = [...el.querySelectorAll("button")];
	const set = v => buttons.forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));
	set(value);
	buttons.forEach(b => b.addEventListener("click", () => { if(el.dataset.locked) return; audio.sfx.click(); set(b.dataset.v); onPick(b.dataset.v); }));
	return set;
}
function stepper(name, get, set, min, max){
	const el = document.querySelector(`[data-stepper="${name}"]`);
	const out = el.querySelector("output");
	const [minus, plus] = el.querySelectorAll("button");
	const render = () => { const v = get(); out.textContent = v; minus.disabled = v <= min() || !!el.dataset.locked; plus.disabled = v >= max() || !!el.dataset.locked; };
	minus.addEventListener("click", () => { audio.sfx.click(); set(Math.max(min(), get() - 1)); render(); });
	plus.addEventListener("click", () => { audio.sfx.click(); set(Math.min(max(), get() + 1)); render(); });
	render();
	return { render, el };
}

// ---------- Profile ----------
function applyHue(){ document.documentElement.style.setProperty("--hue", S.profile.hue); }
function saveProfile(){ store.setProfile(S.profile); syncProfileSoon(); }
$("gameName").textContent = GAME_NAME;
$("btnEditor").hidden = !EDITOR_ENABLED;
$("nameInput").value = S.profile.name;
$("hueInput").value = S.profile.hue;
applyHue();
$("nameInput").addEventListener("input", e => {
	S.profile.name = e.target.value.replace(/[<>]/g, "").slice(0, 18);
	saveProfile(); updateShowcaseTag();
});
$("hueInput").addEventListener("input", e => {
	S.profile.hue = +e.target.value;
	applyHue(); saveProfile(); placeShowcase(); updateShowcaseTag();
});
const bodyPicker = $("bodyPicker");
for(const b of BODIES){
	const btn = document.createElement("button");
	btn.className = "chip-btn";
	btn.setAttribute("role", "radio");
	btn.dataset.v = b.id;
	btn.innerHTML = `${b.name}<small>${b.note}</small>`;
	btn.addEventListener("click", () => { audio.sfx.click(); S.profile.body = b.id; saveProfile(); placeShowcase(); renderBodies(); updateShowcaseTag(); });
	bodyPicker.appendChild(btn);
}
function renderBodies(){ bodyPicker.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === S.profile.body))); }
renderBodies();
function driverName(){ return S.profile.name.trim() || "Nerd with No Name"; }
function updateShowcaseTag(){
	$("showNum").textContent = String(carNumber()).padStart(2, "0");
	$("showName").textContent = driverName();
	$("showBody").textContent = (BODIES.find(b => b.id === S.profile.body) || BODIES[0]).name;
}
updateShowcaseTag();

// ---------- Settings ----------
function saveSettings(){ store.setSettings(S.settings); }
seg($("setQuality"), S.settings.quality, v => { S.settings.quality = v; saveSettings(); applyQuality(); });
seg($("setCamera"), S.settings.camera, v => { S.settings.camera = v; saveSettings(); });
const setEngineSeg = seg($("setEngine"), S.settings.engine ? "1" : "0", v => { S.settings.engine = v === "1"; saveSettings(); audio.setEngineEnabled(S.settings.engine); if(S.settings.engine && S.race && !S.frozen) audio.startEngine(); });
seg($("setShake"), S.settings.shake ? "1" : "0", v => { S.settings.shake = v === "1"; saveSettings(); });
seg($("setTouch"), S.settings.touch, v => { S.settings.touch = v; saveSettings(); updateTouchZones(); });
$("setVolume").value = S.settings.volume;
$("setVolume").addEventListener("input", e => { S.settings.volume = +e.target.value; saveSettings(); audio.setVolume(S.settings.volume); });
audio.setVolume(S.settings.volume);
audio.setEngineEnabled(S.settings.engine);
function applyQuality(){
	applyPixelRatio();
	fx.dispose();
	fx = new Effects(scene, quality());
	const key = S.trackKey;
	if(key && S.world){
		scene.remove(S.world.group); S.world.dispose(); S.world = null; S.trackKey = null;
		const entry = trackCache.get(key);
		showTrack(entry.def, entry.track.reverse);
		if(S.race) S.showcase.visible = false;
	}
}

// ---------- Track picker ----------
function trackSvg(entry){
	const t = entry.track, path = entry.tracker.path;
	const pts = [];
	if(t.center || path){
		const p = t.center || path;
		for(let i = 0; i < p.n; i += 4) pts.push(t.toMap(p.x[i], p.z[i]));
	}
	const segs = !t.center ? t.wallSegs.map(([a, b, c, d]) => [t.toMap(a, b), t.toMap(c, d)]) : null;
	const all = segs ? segs.flat() : pts;
	const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
	const k = Math.min(92 / (maxX - minX || 1), 66 / (maxY - minY || 1));
	const ox = (100 - (maxX - minX) * k) / 2, oy = (75 - (maxY - minY) * k) / 2;
	const P = ([x, y]) => `${(ox + (x - minX) * k).toFixed(1)},${(oy + (maxY - y) * k).toFixed(1)}`;
	const d = segs ? segs.map(([a, b]) => `M${P(a)}L${P(b)}`).join("") : "M" + pts.map(P).join("L") + "Z";
	const [sx, sy] = P(t.toMap(0, 10)).split(",");
	return `<svg viewBox="0 0 100 75" aria-hidden="true"><path d="${d}"/><circle cx="${sx}" cy="${sy}" r="2.6"/></svg>`;
}
const svgCache = new Map();
function renderTrackGrid(container, selectedId, onPick, opts = {}){
	container.innerHTML = "";
	const defs = opts.defs || allDefs();
	for(const def of defs){
		const btn = document.createElement("button");
		btn.className = "track-card";
		const multi = opts.multi;
		const round = multi ? multi.indexOf(def.id) : -1;
		btn.setAttribute("role", multi ? "checkbox" : "radio");
		btn.setAttribute("aria-checked", String(multi ? round >= 0 : def.id === selectedId));
		btn.dataset.id = def.id;
		if(!svgCache.has(def.id)) svgCache.set(def.id, trackSvg(getTrack(def, false)));
		const best = store.getBest(trackKey(def, false));
		const tag = def.flag || (def.kind === "oval" ? "OVAL" : def.kind === "classic" ? "OG" : def.kind === "custom" ? "YOURS" : "FUN");
		btn.innerHTML = `${svgCache.get(def.id)}<span class="tc-flag">${tag}</span><span class="tc-name">${def.name}</span>
			<span class="tc-meta"><span>${def.place || ""}</span><span>${def.realLength || ""}</span></span>
			${opts.compact ? "" : `<span class="tc-record">${best ? `Your best <b>${fmtTime(best)}</b>` : "No lap set yet"}</span>`}
			${round >= 0 ? `<span class="tc-round">${round + 1}</span>` : ""}`;
		btn.addEventListener("click", () => {
			if(container.dataset.locked) return;
			audio.sfx.click();
			if(!multi) container.querySelectorAll(".track-card").forEach(c => c.setAttribute("aria-checked", String(c === btn)));
			onPick(def);
		});
		container.appendChild(btn);
	}
}

// ---------- Solo setup ----------
const setupDirSeg = seg($("setupDir"), "0", v => { S.setup.reverse = v === "1"; refreshSetup(); });
seg($("setupMode"), "race", v => {
	S.setup.gameMode = v;
	if(v === "champ" && !S.setup.rounds.length) S.setup.rounds = [S.setup.trackId];
	renderSetupGrid();
	refreshSetup();
});
seg($("setupDraft"), "1", v => { S.setup.draft = v === "1"; });
seg($("setupLevel"), "medium", v => { S.setup.level = v; });
const lapStep = stepper("laps", () => S.setup.laps, v => { S.setup.laps = v; }, () => 1, () => 20);
const botStep = stepper("bots", () => S.setup.bots, v => { S.setup.bots = v; }, () => S.setup.gameMode === "elim" ? 1 : 0, () => MAX_CARS - 1);

function openSetup(mode){
	S.setup.mode = mode;
	$("setupTitle").textContent = mode === "trial" ? "Time trial" : "Race bots";
	$("setupGo").firstElementChild.textContent = mode === "trial" ? "Start time trial" : "Start race";
	document.querySelectorAll("#setupOptions [data-for]").forEach(el => {
		const f = el.dataset.for.split(" ");
		el.hidden = !(f.includes(mode === "trial" ? "trial" : "bots"));
	});
	renderSetupGrid();
	showScreen("setup");
	camMode = "overview";
	refreshSetup();
}
const champMode = () => S.setup.mode === "bots" && S.setup.gameMode === "champ";
function renderSetupGrid(){
	if(champMode()){
		renderTrackGrid($("setupTracks"), null, def => {
			const r = S.setup.rounds, i = r.indexOf(def.id);
			if(i >= 0) r.splice(i, 1); else if(r.length < 6) r.push(def.id);
			renderSetupGrid();
			refreshSetup();
		}, { multi: S.setup.rounds, defs: TRACKS });
	}else{
		renderTrackGrid($("setupTracks"), S.setup.trackId, def => { S.setup.trackId = def.id; S.setup.laps = def.laps || 3; lapStep.render(); refreshSetup(); });
	}
}
function refreshSetup(){
	if(champMode()){
		const r = S.setup.rounds.map(id => defFor(id));
		$("setupName").textContent = r.length ? r.length + " round" + (r.length === 1 ? "" : "s") : "Pick tracks";
		$("setupPlace").textContent = "Championship";
		$("setupBlurb").textContent = r.length ? r.map(d => d.name).join(" → ") : "";
		$("modeHelp").textContent = "Pick 2 to 6 tracks in the order you want to race them. Points go 25, 18, 15, 12, 10, 8, 6, 4, 2, 1, and the leader starts at the back of the next round's grid.";
		document.querySelector('[data-for="bots laps"]').hidden = false;
		$("setupGo").disabled = r.length < 2;
		$("setupGo").firstElementChild.textContent = "Start championship";
		botStep.render();
		if(r[0]) showTrack(r[0], S.setup.reverse && !r[0].code);
		return;
	}
	$("setupGo").disabled = false;
	$("setupGo").firstElementChild.textContent = S.setup.mode === "trial" ? "Start time trial" : "Start race";
	const def = defFor(S.setup.trackId);
	if(def.code){ S.setup.reverse = false; setupDirSeg("0"); }
	$("setupDir").dataset.locked = def.code ? "1" : "";
	$("setupDir").querySelectorAll("button").forEach(b => { b.disabled = !!def.code && b.dataset.v === "1"; });
	$("setupName").textContent = def.name;
	$("setupPlace").textContent = [def.place, def.realLength].filter(Boolean).join(" · ");
	$("setupBlurb").textContent = def.blurb || "A track you made in the editor.";
	$("modeHelp").textContent = S.setup.gameMode === "elim" ? "Every time the leader finishes a lap, the car in last place is out. Last car running wins." : "First across the line after the last lap wins.";
	document.querySelector('[data-for="bots laps"]').hidden = S.setup.mode === "trial" || S.setup.gameMode === "elim";
	if(S.setup.gameMode === "elim" && S.setup.bots < 1) S.setup.bots = 1;
	botStep.render();
	showTrack(def, S.setup.reverse);
	if(S.setup.mode === "trial") loadBoard(def);
}
async function loadBoard(def){
	const key = trackKey(def, S.setup.reverse);
	const board = $("setupBoard");
	const mine = store.getBest(key);
	const rows = [];
	board.innerHTML = `<li class="empty">${mine ? "Loading records…" : "No laps yet. Set the first one."}</li>`;
	if(onlineAvailable() && !def.code){
		try {
			const net = await connect();
			const top = await net.topLaps(key, 8);
			top.forEach(r => rows.push({ n: r.n, h: r.h, t: r.t, me: r.id === net.uid }));
		} catch {}
	}
	if(!rows.length && mine) rows.push({ n: driverName(), h: S.profile.hue, t: mine, me: true });
	if(trackKey(defFor(S.setup.trackId), S.setup.reverse) !== key) return;
	board.innerHTML = rows.length ? rows.map((r, i) => `<li class="${i ? "" : "first"}"><span>${i + 1}</span><i class="chip" style="background:hsl(${r.h},100%,55%)"></i><span>${escapeHtml(r.n)}${r.me ? " (you)" : ""}</span><span class="t">${fmtTime(r.t)}</span></li>`).join("")
		: `<li class="empty">No laps yet. Set the first one.</li>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

$("btnBots").addEventListener("click", () => { audio.sfx.click(); openSetup("bots"); });
$("btnTrial").addEventListener("click", () => { audio.sfx.click(); openSetup("trial"); });
$("setupGo").addEventListener("click", () => { audio.unlock(); requestTilt(); startSolo(); });

function spreadHues(n, avoid){
	const out = [];
	let h = (avoid + 40) % 360;
	for(let i = 0; i < n; i++){ out.push(Math.round(h) % 360); h += 320 / Math.max(1, n); if(Math.abs(((h % 360) - avoid + 540) % 360 - 180) < 20) h += 30; }
	return out;
}

function startSolo(){
	const st = S.setup;
	const def = defFor(st.trackId);
	const entrants = [{ id: "me", name: driverName(), hue: S.profile.hue, body: S.profile.body, local: true }];
	if(st.mode === "bots"){
		const hues = spreadHues(st.bots, S.profile.hue);
		const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
		for(let i = 0; i < st.bots; i++) entrants.push({ id: "bot" + i, name: names[i % names.length], hue: hues[i], body: BODIES[Math.floor(Math.random() * BODIES.length)].id, bot: st.level, local: true });
		entrants.sort(() => Math.random() - 0.5);
	}
	if(champMode()){
		S.champ = newChamp(st.rounds.map(id => ({ track: id })), st.reverse, st.laps);
		S.champEntrants = entrants;
		startChampRound();
		return;
	}
	const mode = st.mode === "trial" ? "trial" : st.gameMode;
	beginRace({
		source: "solo", def, reverse: st.reverse, mode, laps: mode === "elim" ? 99 : st.laps, entrants, myId: "me", draft: mode !== "trial" && st.draft,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, restart: startSolo
	});
}

function startChampRound(){
	const c = S.champ;
	const def = defFor(c.rounds[c.idx].track);
	const ids = S.champEntrants.map(e => e.id);
	const order = c.idx === 0 ? ids : champGrid(c, ids);
	beginRace({
		source: "solo", def, reverse: c.reverse && !def.code, mode: "race", laps: c.laps,
		entrants: order.map(id => S.champEntrants.find(e => e.id === id)), myId: "me", draft: S.setup.draft,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, champ: true, restart: startChampRound
	});
}

// Weekly challenge: a time trial on this week's track.
function startChallenge(){
	const wk = weeklyChallenge();
	S.setup.mode = "trial";
	beginRace({
		source: "solo", def: wk.def, reverse: wk.reverse, mode: "trial", laps: 1,
		entrants: [{ id: "me", name: driverName(), hue: S.profile.hue, body: S.profile.body, local: true }], myId: "me", draft: false,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, restart: startChallenge
	});
}
function soloNow(){ return performance.now() - S.pausedTotal; }

// ---------- Race ----------
let camMode = "showcase";
const labels = new Map();

function beginRace(opts){
	endRace(true);
	const entry = showTrack(opts.def, opts.reverse);
	S.ctx = opts;
	S.frozen = false;
	S.paused = false;
	S.lastDelta = null;
	S.resultsShown = null;
	const key = entry.key;
	const ghost = opts.mode === "trial" ? store.getGhost(key) : null;
	S.race = new Race({
		scene, track: entry.track, tracker: entry.tracker, laps: opts.laps, mode: opts.mode,
		entrants: opts.entrants, myId: opts.myId, startAt: opts.startAt, authority: opts.authority,
		now: opts.source === "online" ? () => S.net.now() : soloNow,
		net: opts.source === "online" ? S.net : null, ghost, draft: opts.draft !== false,
		onEvent: (t, d) => onRaceEvent(t, d)
	});
	S.race.key = key;
	S.showcase.visible = false;
	fx.clear();
	for(const c of S.race.cars){
		if(c.me) continue;
		const el = document.createElement("div");
		el.className = "label";
		el.style.setProperty("--c", `hsl(${c.hue},100%,55%)`);
		el.innerHTML = `<b></b><span></span>`;
		el.lastElementChild.textContent = c.name;
		$("labels").appendChild(el);
		c.label = el;
	}
	document.querySelectorAll("[data-screen]").forEach(s => { s.hidden = true; });
	S.screen = "race";
	hud.setup(entry.track, entry.tracker, opts.laps, opts.mode);
	hud.show(true);
	hud.spectating(S.race.me ? "" : "Spectating · you'll be in the next race");
	updateTouchZones();
	camMode = "chase";
	snapCamera();
	lightsShown = 0;
	audio.unlock();
	audio.startEngine();
}

function endRace(keepTrack){
	if(S.race){ S.race.dispose(); S.race = null; }
	for(const el of $("labels").querySelectorAll(".label")) el.remove();
	hud.show(false);
	hud.hideBanner();
	$("touch").hidden = true;
	$("pause").hidden = true;
	S.paused = false;
	S.frozen = false;
	audio.stopEngine();
	if(S.showcase) S.showcase.visible = true;
	fx.clear();
}

function focusCar(){
	const r = S.race;
	if(!r) return null;
	if(r.me && r.me.elim === null) return r.me;
	const st = r.standings().find(s => s.car.elim === null && !s.car.gone);
	return st ? st.car : r.cars[0];
}

function onRaceEvent(type, d){
	const r = S.race;
	if(!r) return;
	const focus = focusCar();
	switch(type){
		case "go":
			hud.banner("Go", "", "go", 900);
			audio.sfx.go();
			break;
		case "hit": {
			const c = d.car;
			const dist = focus ? Math.hypot(c.pos.x - focus.pos.x, c.pos.z - focus.pos.z) : 0;
			const near = Math.max(0, 1 - dist / 60);
			if(c === focus || d.other === focus){
				audio.thud(d.strength, 1);
				if(S.settings.shake) S.shake = Math.min(0.5, S.shake + d.strength * 1.2);
			}else if(near > 0) audio.thud(d.strength, near * 0.6);
			if(near > 0 && d.strength > 0.08) fx.burst(c.pos.x, c.pos.z, d.strength, c.data.xv, c.data.yv);
			break;
		}
		case "lap": {
			if(!d.car.me) break;
			// Records and ghosts only come from time trial, where nobody can tow you.
			const key = r.key;
			let isRecord = false, weeklyBest = false;
			if(r.mode === "trial"){
				const prevBest = store.getBest(key);
				isRecord = prevBest == null || d.ms < prevBest;
				if(isRecord){
					store.setBest(key, d.ms);
					if(r.ghostData) store.setGhost(key, r.ghostData);
					submitRecord(key, d.ms);
				}
				const wk = weeklyChallenge();
				if(S.ctx.def.id === wk.def.id && !!S.ctx.reverse === wk.reverse){
					const wkKey = "weekly:" + wk.id, prev = store.getBest(wkKey);
					if(prev == null || d.ms < prev){ store.setBest(wkKey, d.ms); submitWeekly(wk.id, d.ms); if(!isRecord) weeklyBest = true; }
				}
			}
			const sessionPrev = d.car.lapTimes.length > 1 ? Math.min(...d.car.lapTimes.slice(0, -1)) : null;
			S.lastDelta = sessionPrev == null ? null : d.ms - sessionPrev;
			const fastest = r.mode !== "trial" && d.best && d.car.lapTimes.length > 1;
			if(r.mode === "trial" || !(r.mode === "race" && d.car.data.lap > r.laps)){
				const sub = S.lastDelta == null ? fmtTime(d.ms) : `${fmtTime(d.ms)}  ${S.lastDelta <= 0 ? "−" : "+"}${fmtTime(Math.abs(S.lastDelta))}`;
				const title = isRecord ? "Personal best" : weeklyBest ? "Weekly best" : fastest ? "Fastest lap" : "Lap " + d.car.lapTimes.length;
				hud.banner(title, sub, isRecord || weeklyBest || fastest ? "best" : "", 1800);
				isRecord || weeklyBest || fastest ? audio.sfx.best() : audio.sfx.lap();
			}
			break;
		}
		case "finalLap":
			hud.banner("Final lap", "", "final", 1600);
			audio.sfx.finalLap();
			break;
		case "finish":
			if(d.car.me){
				const pos = d.position || (r.standings().findIndex(s => s.car === d.car) + 1);
				hud.banner(pos === 1 ? "Winner" : "Finished P" + pos, fmtTime(d.ms), "finish", 4000);
				audio.sfx.finish();
			}else hud.toast(`${d.car.name} finished`);
			break;
		case "eliminated":
			if(d.car.me){ hud.banner("You're out", "Spectating the leader", "out", 3000); audio.sfx.out(); }
			else hud.toast(`${d.car.name} is out`);
			break;
		case "wrongWay":
			if(d){ hud.banner("Wrong way", "Turn around", "wrong", 0); audio.sfx.wrong(); }
			else hud.hideBanner();
			break;
		case "rescued":
			hud.toast("Back on track");
			break;
		case "end":
			if(S.ctx.source === "solo"){
				if(S.ctx.champ && S.champ) S.champ = scoreRound(S.champ, d);
				setTimeout(() => showResults(d, false), 900);
			}else if(S.net && S.net.isHost){
				const champ = S.ctx.champ && S.room && S.room.champ ? scoreRound(S.room.champ, d) : undefined;
				S.net.finishRace(d, champ);
			}
			break;
	}
}

async function submitWeekly(week, ms){
	if(!onlineAvailable()) return;
	try { await (await connect()).submitWeekly(week, ms, { name: driverName(), hue: S.profile.hue }); } catch {}
}

async function submitRecord(key, ms){
	if(!onlineAvailable() || key.startsWith("custom")) return;
	try {
		const net = await connect();
		await net.submitLap(key, ms, { name: driverName(), hue: S.profile.hue });
	} catch {}
}

// ---------- Results ----------
function showResults(results, online){
	if(!S.race && !online) return;
	S.frozen = true;
	audio.stopEngine();
	hud.show(false);
	$("touch").hidden = true;
	for(const el of $("labels").querySelectorAll(".label")) el.style.display = "none";
	const myId = S.race ? S.race.myId : S.net && S.net.uid;
	const def = S.ctx ? S.ctx.def : null;
	$("resultsTrack").textContent = def ? `${def.name}${S.ctx.reverse ? " reversed" : ""} · ${S.ctx.mode === "elim" ? "Elimination" : S.ctx.laps + (S.ctx.laps === 1 ? " lap" : " laps")}` : "Results";
	const me = results.find(r => r.id === myId);
	$("resultsTitle").textContent = !me ? "Chequered flag"
		: me.pos === 1 && me.status !== "dnf" ? "You won"
		: me.status === "finished" ? `You finished P${me.pos}`
		: me.status === "out" ? `Knocked out · P${me.pos}`
		: `Didn't finish · P${me.pos}`;
	const fastest = Math.min(...results.map(r => r.best ?? Infinity));
	const order = [1, 0, 2];
	$("podium").innerHTML = order.map(i => {
		const r = results[i];
		if(!r) return "<div></div>";
		return `<div class="step p${i + 1}"><span class="who">${escapeHtml(r.name)}</span><span class="when">${r.time != null ? fmtTime(r.time) : r.status === "out" ? "Out" : "DNF"}</span>
			<div class="block" style="--c:hsl(${r.hue},100%,55%)"><span>${i + 1}</span></div></div>`;
	}).join("");
	$("resultsBody").innerHTML = results.map(r => `<tr class="${r.id === myId ? "me" : ""}">
		<td class="pos">${r.pos}</td>
		<td class="name"><i style="background:hsl(${r.hue},100%,55%)"></i>${escapeHtml(r.name)}${r.bot ? ' <span class="tag bot">AI</span>' : ""}</td>
		<td>${r.time != null ? fmtTime(r.time) : r.status === "out" ? "Out" : "DNF"}</td>
		<td class="best ${r.best != null && r.best === fastest ? "fastest" : ""}">${r.best != null ? fmtTime(r.best) : "--"}</td>
		<td>${r.pos === 1 ? "" : r.gap || ""}</td></tr>`).join("");
	const champ = S.ctx && S.ctx.champ ? (online ? S.room && S.room.champ : S.champ) : null;
	$("champPanel").hidden = !champ;
	if(champ){
		const table = champStandings(champ);
		$("champRound").textContent = "Round " + (champ.idx + 1) + " of " + champ.rounds.length + (champ.done ? " · Final standings" : "");
		$("champBody").innerHTML = table.map((r, i) => '<tr class="' + (r.id === myId ? "me " : "") + (i ? "" : "first") + '">' +
			'<td class="pos">' + (i + 1) + '</td><td class="name"><i style="background:hsl(' + r.hue + ',100%,55%)"></i>' + escapeHtml(r.name) + '</td>' +
			'<td class="num ' + (i ? "" : "hl") + '">' + r.pts + '</td><td class="dim">' + (r.gained ? "+" + r.gained : "-") + '</td><td class="dim">' + r.wins + '</td></tr>').join("");
		if(champ.done && table[0]){
			$("resultsTrack").textContent = "Championship · " + champ.rounds.map(x => defFor(x.track).name).join(" → ");
			$("resultsTitle").textContent = table[0].id === myId ? "You're the champion" : table[0].name + " is champion";
		}
	}
	const nextName = champ && !champ.done ? defFor(champ.rounds[champ.idx + 1].track).name : "";
	const acts = $("resultsActions");
	acts.innerHTML = "";
	const addBtn = (label, cls, fn) => { const b = document.createElement("button"); b.className = "go-btn " + cls; b.innerHTML = `<span>${label}</span>`; b.addEventListener("click", () => { audio.sfx.click(); fn(); }); acts.appendChild(b); return b; };
	$("resultsNote").textContent = "";
	if(!online && champ){
		if(!champ.done) addBtn("Next round: " + nextName, "", () => { audio.unlock(); S.champ.idx++; startChampRound(); });
		else addBtn("New championship", "", () => { audio.unlock(); startSolo(); });
		addBtn("Main menu", "ghost", goTitle);
	}else if(online && champ && S.net && S.net.isHost){
		if(!champ.done) addBtn("Next round: " + nextName, "", () => hostNextRound());
		else addBtn("New championship", "", () => hostStart());
		addBtn("Back to lobby", "ghost", () => S.net.backToLobby());
		addBtn("Leave room", "ghost", leaveRoom);
	}else if(!online){
		addBtn("Race again", "", () => { audio.unlock(); (S.ctx && S.ctx.restart || startSolo)(); });
		addBtn("Change track", "ghost", () => { endRace(); openSetup(S.setup.mode); });
		addBtn("Main menu", "ghost", goTitle);
	}else if(S.net && S.net.isHost){
		addBtn("Race again", "", () => hostStart());
		addBtn("Back to lobby", "ghost", () => S.net.backToLobby());
		addBtn("Leave room", "ghost", leaveRoom);
	}else{
		$("resultsNote").textContent = "Waiting for the host to start the next race.";
		addBtn("Leave room", "ghost", leaveRoom);
	}
	showScreen("results");
	camMode = "winner";
	if(online) recordStats();
	S.winnerId = results[0] && results[0].id;
}

// ---------- Pause ----------
function pause(){
	if(!S.race || S.frozen || !$("pause").hidden) return;
	const online = S.ctx.source === "online";
	$("pauseNote").hidden = !online;
	$("restartBtn").hidden = online;
	$("quitBtn").firstElementChild.textContent = online ? "Leave room" : "Quit to menu";
	if(!online){ S.paused = true; S.pauseStart = performance.now(); audio.stopEngine(); }
	openModal("pause");
}
function resume(){
	closeModal("pause");
	if(S.paused){ S.pausedTotal += performance.now() - S.pauseStart; S.paused = false; audio.startEngine(); }
}
$("pauseBtn").addEventListener("click", pause);
$("resumeBtn").addEventListener("click", resume);
$("restartBtn").addEventListener("click", () => { closeModal("pause"); S.paused = false; (S.ctx && S.ctx.restart || startSolo)(); });
$("pauseSettings").addEventListener("click", () => openModal("settings"));
$("quitBtn").addEventListener("click", () => {
	closeModal("pause");
	if(S.ctx && S.ctx.source === "online") leaveRoom();
	else goTitle();
});

// ---------- Input ----------
const typing = () => /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
addEventListener("keydown", e => {
	audio.unlock();
	if(typing()) return;
	const k = e.code || "";   // password autofill sends key events with no code
	if(k === "ArrowLeft" || k === "KeyA") S.input.left = true;
	if(k === "ArrowRight" || k === "KeyD") S.input.right = true;
	if(k.startsWith("Arrow") && S.race) e.preventDefault();
	if(e.repeat) return;
	if((k === "Escape" || k === "KeyP") && S.race && !S.frozen){ $("pause").hidden ? pause() : resume(); }
	else if(k === "Escape"){ document.querySelectorAll(".modal").forEach(m => { if(m.id !== "pause") m.hidden = true; }); }
	if(k === "KeyR" && S.race && !S.paused) S.race.requestRescue();
	if(k === "KeyC"){ const order = ["classic", "far", "hood"]; S.settings.camera = order[(order.indexOf(S.settings.camera) + 1) % 3]; saveSettings(); hud.toast("Camera: " + ({ classic: "Classic", far: "Far", hood: "Bonnet" })[S.settings.camera], 1200); }
	if(k === "KeyM"){ S.muted = !S.muted; audio.setVolume(S.muted ? 0 : S.settings.volume); hud.toast(S.muted ? "Sound off" : "Sound on", 1200); }
});
addEventListener("keyup", e => {
	const k = e.code || "";
	if(k === "ArrowLeft" || k === "KeyA") S.input.left = false;
	if(k === "ArrowRight" || k === "KeyD") S.input.right = false;
});
addEventListener("blur", () => { S.input.left = S.input.right = false; });
addEventListener("pointerdown", () => audio.unlock(), { once: false, passive: true });

for(const [id, key] of [["touchLeft", "tl"], ["touchRight", "tr"]]){
	const el = $(id);
	const on = e => { e.preventDefault(); S.input[key] = true; el.classList.add("active"); };
	const off = () => { S.input[key] = false; el.classList.remove("active"); };
	el.addEventListener("pointerdown", on);
	el.addEventListener("pointerup", off);
	el.addEventListener("pointercancel", off);
	el.addEventListener("pointerleave", off);
}
function updateTouchZones(){ $("touch").hidden = !(mobile && S.race && !S.frozen && S.settings.touch === "touch"); }

// Phone tilt, the same maths as the original game.
function onTilt(e){
	const type = screen.orientation ? screen.orientation.type : (window.orientation === 90 ? "landscape-primary" : window.orientation === -90 ? "landscape-secondary" : "portrait-primary");
	const angle = type == "portrait-primary" ? e.gamma : type == "portrait-secondary" ? -e.gamma : type == "landscape-primary" ? e.beta : type == "landscape-secondary" ? -e.beta : 0;
	if(angle == null) return;
	S.input.tilt = Math.max(Math.min((-angle) / 180 * Math.PI, Math.PI / 6), -Math.PI / 6);
}
let tiltAsked = false;
function requestTilt(){
	if(!mobile || tiltAsked || S.settings.touch !== "tilt") return;
	tiltAsked = true;
	const D = window.DeviceOrientationEvent;
	if(D && D.requestPermission){
		D.requestPermission().then(s => { if(s === "granted") addEventListener("deviceorientation", onTilt); }).catch(() => {});
	}else addEventListener("deviceorientation", onTilt);
}
function steerInput(){
	if(mobile && S.settings.touch === "tilt" && S.input.tilt != null) return S.input.tilt;
	return phys.keyboardSteer(S.input.left || S.input.tl, S.input.right || S.input.tr);
}

// ---------- Camera ----------
const tmp = new THREE.Vector3();
function snapCamera(){
	const c = focusCar();
	if(!c) return;
	const p = c.model.position, d = c.data.dir;
	camera.position.set(p.x - Math.sin(d) * 5, 3, p.z - Math.cos(d) * 5);
	camera.lookAt(p.x, 0.6, p.z);
}
function followCamera(dt){
	const c = focusCar();
	if(!c) return;
	const warp = dt * 1000 / 16;
	const p = c.model.position, dir = c.model.rotation.y;
	const mode = S.settings.camera;
	if(mode === "hood"){
		const fx_ = Math.sin(dir), fz = Math.cos(dir);
		camera.position.set(p.x + fx_ * 0.3, 1.25, p.z + fz * 0.3);
		camera.lookAt(p.x + fx_ * 20, 1.0, p.z + fz * 20);
	}else{
		// Classic is the original camera: 5 behind, 3 up, 0.9 lag per 16 ms, looking at the car.
		const back = mode === "far" ? 8.5 : 5, up = mode === "far" ? 4.6 : 3, lag = mode === "far" ? 0.88 : 0.9;
		const tx = p.x + Math.sin(-dir) * back, tz = p.z - Math.cos(-dir) * back;
		const l = Math.pow(lag, warp);
		camera.position.set(camera.position.x * l + tx * (1 - l), up, camera.position.z * l + tz * (1 - l));
		if(mode === "far") camera.lookAt(p.x + Math.sin(dir) * 4, 0.6, p.z + Math.cos(dir) * 4);
		else camera.lookAt(p.x, 0.6, p.z);
	}
	if(S.shake > 0.002){
		camera.position.x += (Math.random() - 0.5) * S.shake;
		camera.position.y += (Math.random() - 0.5) * S.shake * 0.6;
		S.shake *= Math.exp(-dt * 9);
	}
}
let orbit = 0;
function menuCamera(dt){
	orbit += dt * 0.12;
	if(camMode === "overview" && S.world){
		const r = S.world.radius, c = S.world.center;
		tmp.set(c.x + Math.sin(orbit) * r * 0.95, Math.max(60, r * 0.55), c.z + Math.cos(orbit) * r * 0.95);
		camera.position.lerp(tmp, Math.min(1, dt * 1.5));
		camera.lookAt(c.x, 0, c.z);
	}else if(camMode === "winner" && S.race){
		const w = S.race.byId.get(S.winnerId) || S.race.cars[0];
		const p = w.model.position;
		tmp.set(p.x + Math.sin(orbit * 2) * 7, 2.6, p.z + Math.cos(orbit * 2) * 7);
		camera.position.lerp(tmp, Math.min(1, dt * 2));
		camera.lookAt(p.x, 0.8, p.z);
	}else{
		// Showcase: circle the player's car on the grid.
		const a = orbit * 2.2;
		const wide = innerWidth > 900;
		tmp.set(Math.sin(a) * 6.2 + (wide ? -1.6 : 0), 2.3, Math.cos(a) * 6.2);
		camera.position.lerp(tmp, Math.min(1, dt * 2.5));
		camera.lookAt(wide ? -1.9 : 0, 0.7, 0);
		if(S.showcase) animateCar(S.showcase, Math.sin(orbit * 3) * 0.3, 0, dt);
	}
}

// ---------- Name tags ----------
const proj = new THREE.Vector3();
function updateLabels(standings, focus){
	const r = S.race;
	const place = new Map(standings.map((s, i) => [s.car, i + 1]));
	for(const c of r.cars){
		const el = c.label;
		if(!el) continue;
		if(c === focus || c.gone || c.elim !== null || S.frozen){ el.style.display = "none"; continue; }
		proj.set(c.model.position.x, 2.1, c.model.position.z);
		const dist = proj.distanceTo(camera.position);
		proj.project(camera);
		if(proj.z > 1 || dist > 140 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1){ el.style.display = "none"; continue; }
		el.style.display = "";
		const x = (proj.x + 1) / 2 * innerWidth, y = (1 - proj.y) / 2 * innerHeight;
		const s = Math.max(0.55, Math.min(1.1, 22 / dist));
		el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(2)})`;
		el.style.zIndex = String(1000 - Math.round(dist));
		const p = "P" + place.get(c);
		if(el._p !== p){ el._p = p; el.firstElementChild.textContent = p; }
	}
}

// ---------- Main loop ----------
let last = performance.now(), hudTimer = 0, lightsShown = 0;
function frame(now){
	requestAnimationFrame(frame);
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	const r = S.race;
	let focus = null;
	if(r && !S.frozen){
		if(!S.paused){
			const steer = $("pause").hidden ? steerInput() : 0;
			r.update(dt, steer);
			// Start lights: one every 0.6 s, out at GO.
			const rt = r.raceTime;
			if(rt < 0){
				const n = rt < -COUNTDOWN ? 0 : Math.min(5, Math.floor((rt + COUNTDOWN) / (COUNTDOWN / 5)) + 1);
				if(n > lightsShown){ lightsShown = n; audio.sfx.light(); }
				hud.setLights(n);
			}else if(lightsShown <= 5){
				lightsShown = 6;
				hud.setLights(6);
				setTimeout(() => { if(lightsShown === 6) hud.setLights(-1); }, 1200);
			}
		}
		focus = focusCar();
		for(const c of r.cars){
			if(c.gone || c.elim !== null) continue;
			if(focus && Math.abs(c.pos.x - focus.pos.x) + Math.abs(c.pos.z - focus.pos.z) > 160) continue;
			if(!S.paused && r.phase === "racing") fx.trail(c, dt);
		}
		fx.update(dt);
		followCamera(dt);
		if(focus){
			const d = focus.data;
			const speed = Math.hypot(d.xv, d.yv);
			const slip = speed > 0.05 ? Math.abs(Math.sin(Math.atan2(d.xv, d.yv) - d.dir)) : 0;
			audio.updateEngine(r.phase === "racing" ? speed : 0.02, slip, r.draft ? focus.draft || 0 : 0);
			hud.setDraft(r.draft && r.phase === "racing" ? focus.draft || 0 : 0);
		}
		hudTimer -= dt;
		const standings = r.standings();
		if(hudTimer <= 0 && focus){
			hudTimer = 1 / 20;
			const d = focus.data, rt = r.raceTime;
			const done = focus.finish !== null;
			hud.setRace({
				lap: d.lap, laps: r.laps, raceMs: done ? focus.finish : rt,
				curMs: focus.lapStart !== null && !done ? rt - focus.lapStart : done ? null : Math.max(0, rt),
				bestMs: focus.best, lastMs: focus.lapTimes.length ? focus.lapTimes[focus.lapTimes.length - 1] : null,
				lastDelta: focus.me ? S.lastDelta : null,
				kmh: Math.hypot(d.xv, d.yv) * KMH,
				pos: standings.findIndex(s => s.car === focus) + 1, of: standings.filter(s => !s.car.gone).length
			});
			hud.setTower(standings, focus.id);
		}
		hud.drawMinimap(r.cars, focus);
		updateLabels(standings, focus);
	}else{
		menuCamera(dt);
		if(r) for(const c of r.cars) c.model && animateCar(c.model, 0, 0, dt);
		fx.update(dt);
	}
	if(S.world) S.world.update(dt, focus ? focus.model.position : (S.showcase && camMode === "showcase" ? S.showcase.position : null));
	renderer.render(scene, camera);
}

// ---------- Online ----------
const onlineMsg = msg => { $("onlineMsg").textContent = msg || ""; $("onlineMsg").hidden = !msg; };
function openOnline(){
	showScreen("online");
	camMode = "overview";
	onlineMsg("");
	const ok = onlineAvailable();
	$("onlineNotice").hidden = ok;
	$("onlineCards").style.opacity = ok ? "" : ".45";
	$("hostBtn").disabled = $("joinBtn").disabled = $("codeInput").disabled = !ok;
}
$("btnOnline").addEventListener("click", () => { audio.sfx.click(); openOnline(); });
$("codeInput").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
$("codeInput").addEventListener("keydown", e => { if(e.key === "Enter") $("joinBtn").click(); });

function lobbyDefaults(){
	return { track: S.setup.trackId === "classic" ? "classic" : S.setup.trackId, reverse: false, laps: (defFor(S.setup.trackId).laps || 3), mode: "race", custom: null, draft: true };
}
async function withBusy(btn, fn){
	btn.disabled = true;
	try { await fn(); } catch(e){ onlineMsg(e.message || String(e)); }
	btn.disabled = false;
}
$("hostBtn").addEventListener("click", () => withBusy($("hostBtn"), async () => {
	audio.unlock(); requestTilt();
	const net = await connect();
	S.net = net;
	await net.createRoom({ name: driverName(), hue: S.profile.hue, body: S.profile.body }, lobbyDefaults());
	enterLobby();
}));
$("joinBtn").addEventListener("click", () => withBusy($("joinBtn"), async () => {
	audio.unlock(); requestTilt();
	const code = $("codeInput").value.trim();
	if(code.length !== 4) throw new Error("Room codes are four letters.");
	const net = await connect();
	S.net = net;
	await net.joinRoom(code, { name: driverName(), hue: S.profile.hue, body: S.profile.body });
	enterLobby();
}));

function enterLobby(){
	S.raceId = null;
	S.resultsShown = null;
	S.room = null;
	$("roomCode").textContent = S.net.code;
	showScreen("lobby");
	camMode = "overview";
	S.net.watchRoom(room => onRoom(room));
	S.net.watchState((type, id, val) => {
		if(!S.race || S.ctx.source !== "online") return;
		if(type === "removed"){ if(!S.room || !S.room.players || !S.room.players[id]) S.race.removeCar(id); }
		else S.race.applyRemote(id, val);
	});
	// Direct links to the other drivers. Each driver may only send their own car,
	// and only the host may send the bots.
	S.net.mesh = new Mesh(S.net, {
		onState(from, carId, s){
			if(!S.race || S.ctx.source !== "online" || !S.room) return;
			const p = (S.room.players || {})[carId];
			if(carId === from || (p && p.bot && S.room.host === from)) S.race.applyRemote(carId, s);
		},
		onStatus(){ if(S.screen === "lobby" && S.room) renderLobby(S.room); }
	});
}

async function leaveRoom(msg){
	endRace();
	if(S.net){ try { await S.net.leave(); } catch {} }
	S.room = null;
	S.raceId = null;
	openOnline();
	if(typeof msg === "string") onlineMsg(msg);
}
$("leaveRoom").addEventListener("click", () => leaveRoom());
$("copyCode").addEventListener("click", async () => {
	const code = S.net && S.net.code;
	if(!code) return;
	try { await navigator.clipboard.writeText(code); $("copyCode").textContent = "Copied"; }
	catch { $("copyCode").textContent = code; }
	setTimeout(() => { $("copyCode").textContent = "Copy code"; }, 1500);
});

function onRoom(room){
	if(!S.net || !S.net.code) return;
	if(!room){ leaveRoom("The host closed the room."); return; }
	S.room = room;
	if(room.players && !room.players[S.net.uid]){ leaveRoom("You were removed from the room."); return; }
	// Host migration: if the host has dropped out, the longest-waiting driver takes over.
	if(room.host && room.players && !room.players[room.host] && S.net.nextHost(room) === S.net.uid) S.net.claimHost().catch(() => {});
	if(S.lastHost && room.host !== S.lastHost && room.players && room.players[room.host]){
		const who = room.host === S.net.uid ? "You're" : room.players[room.host].name + " is";
		if(S.race && !S.frozen) hud.toast(who + " now hosting", 2600);
		else $("lobbyStatus").textContent = who + " now hosting";
		if(S.race && S.ctx && S.ctx.source === "online") S.race.setAuthority(room.host === S.net.uid);
		if(S.screen === "results" && room.results){ S.lastHost = room.host; showResults(room.results, true); }
	}
	S.lastHost = room.host;
	if(S.net.mesh) S.net.mesh.sync(room.players);
	// Drivers (or bots) who left mid-race disappear, whichever way their updates were coming.
	if(S.race && S.ctx && S.ctx.source === "online" && room.players){
		for(const c of S.race.cars) if(!c.local && !c.gone && !room.players[c.id]) S.race.removeCar(c.id);
	}
	const race = room.race;
	if(room.phase === "race" && race && race.id !== S.raceId){
		S.raceId = race.id;
		beginOnlineRace(room);
	}else if(room.phase === "race" && S.race){
		S.race.applyElims(race && race.elim);
	}else if(room.phase === "results" && room.results && S.resultsShown !== (race && race.id)){
		S.resultsShown = race && race.id;
		showResults(room.results, true);
	}else if(room.phase === "lobby" && S.screen !== "lobby"){
		endRace();
		showScreen("lobby");
		camMode = "overview";
	}
	if(S.screen === "lobby") renderLobby(room);
}

const lobbySettingsControls = {
	draft: seg($("lobbyDraft"), "1", v => S.net.updateSettings({ draft: v === "1" })),
	mode: seg($("lobbyMode"), "race", v => S.net.updateSettings({ mode: v })),
	dir: seg($("lobbyDir"), "0", v => S.net.updateSettings({ reverse: v === "1" })),
	level: seg($("lobbyLevel"), "medium", v => { S.lobbyLevel = v; }),
	laps: stepper("lobbyLaps", () => (S.room && S.room.settings && S.room.settings.laps) || 3, v => S.net.updateSettings({ laps: v }), () => 1, () => 20)
};
let lobbyGridKey = null;
// How my car's updates reach this driver: straight to them, or through Firebase.
function netTag(p){
	if(p.bot || !S.net || p.id === S.net.uid) return "";
	const st = S.net.mesh ? S.net.mesh.status(p.id) : "relay";
	const label = st === "direct" ? "Direct" : st === "connecting" ? "Connecting" : "Via server";
	const tip = st === "direct" ? "Connected straight to this driver" : st === "connecting" ? "Trying a direct link" : "Your network blocked a direct link, so updates go through Firebase";
	return ` <span class="tag ${st === "direct" ? "ready" : ""}" title="${tip}">${label}</span>`;
}
function renderLobby(room){
	const net = S.net, host = net.isHost, st = room.settings || lobbyDefaults();
	const players = Object.entries(room.players || {}).map(([id, p]) => Object.assign({ id }, p)).sort((a, b) => (a.joined || 0) - (b.joined || 0));
	$("playerCount").textContent = `${players.length}/${MAX_CARS}`;
	$("playerList").innerHTML = "";
	for(const p of players){
		const li = document.createElement("li");
		li.className = "player";
		const tags = [p.id === room.host ? '<span class="tag host">Host</span>' : "", p.bot ? `<span class="tag bot">AI · ${({ easy: "Rookie", medium: "Racer", hard: "Ace" })[p.bot]}</span>` : p.id === room.host ? "" : `<span class="tag ${p.ready ? "ready" : ""}">${p.ready ? "Ready" : "Not ready"}</span>`].join(" ");
		li.innerHTML = `<i class="chip" style="background:hsl(${p.hue},100%,55%)"></i>
			<span class="pname">${escapeHtml(p.name)}${p.id === net.uid ? " (you)" : ""}<span class="pbody">${(BODIES.find(b => b.id === p.body) || BODIES[0]).name}</span></span>
			<span>${tags}${netTag(p)}</span>`;
		const x = document.createElement("button");
		x.className = "x-btn";
		x.setAttribute("aria-label", "Remove " + p.name);
		x.textContent = "✕";
		x.hidden = !host || p.id === net.uid;
		x.addEventListener("click", () => net.removePlayer(p.id));
		li.appendChild(x);
		$("playerList").appendChild(li);
	}
	$("botControls").hidden = !host;
	$("addBot").disabled = players.length >= MAX_CARS;

	const def = defFor(st.track, st.custom);
	const isChamp = st.mode === "champ";
	const rounds = (st.rounds || []).filter(id => trackById(id));
	$("lobbyTrackLabel").textContent = isChamp ? "Rounds" : "Track";
	$("lobbyTrackName").textContent = isChamp ? (rounds.length ? rounds.map(id => trackById(id).name).join(" → ") : "Pick 2 to 6 tracks in order") : def.name + (st.reverse ? " · reversed" : "");
	const gridDefs = isChamp ? TRACKS : st.custom && !allDefs().some(d => d.code === st.custom.code) ? [...allDefs(), def] : allDefs();
	const gk = gridDefs.map(d => d.id).join() + "|" + def.id + "|" + host + "|" + st.mode + "|" + rounds.join();
	if(gk !== lobbyGridKey){
		lobbyGridKey = gk;
		if(isChamp){
			renderTrackGrid($("lobbyTracks"), null, d => {
				const r = rounds.slice(), i = r.indexOf(d.id);
				if(i >= 0) r.splice(i, 1); else if(r.length < 6) r.push(d.id);
				net.updateSettings({ rounds: r });
			}, { compact: true, defs: gridDefs, multi: rounds });
		}else{
			renderTrackGrid($("lobbyTracks"), def.id, d => {
				net.updateSettings({ track: d.code ? "custom" : d.id, custom: d.code ? { name: d.name, code: d.code } : null, laps: d.laps || 3, reverse: false });
			}, { compact: true, defs: gridDefs });
		}
	}
	$("lobbyTracks").dataset.locked = host ? "" : "1";
	for(const el of [$("lobbyMode"), $("lobbyDir")]) el.dataset.locked = host ? "" : "1";
	document.querySelector('[data-stepper="lobbyLaps"]').dataset.locked = host && st.mode !== "elim" ? "" : "1";
	lobbySettingsControls.mode(st.mode);
	lobbySettingsControls.dir(st.reverse ? "1" : "0");
	lobbySettingsControls.draft(st.draft === false ? "0" : "1");
	$("lobbyDraft").dataset.locked = host ? "" : "1";
	$("lobbyDraft").querySelectorAll("button").forEach(b => { b.disabled = !host; });
	lobbySettingsControls.laps.render();
	$("lobbyDir").querySelectorAll("button").forEach(b => { b.disabled = !host || (!!def.code && b.dataset.v === "1"); });
	$("lobbyMode").querySelectorAll("button").forEach(b => { b.disabled = !host; });

	const humans = players.filter(p => !p.bot);
	const ready = humans.filter(p => p.ready || p.id === room.host).length;
	const go = $("lobbyGo");
	if(host){
		go.firstElementChild.textContent = isChamp ? "Start championship" : "Start race";
		go.disabled = (st.mode === "elim" && players.length < 2) || (isChamp && rounds.length < 2);
		$("lobbyStatus").textContent = st.mode === "elim" && players.length < 2 ? "Elimination needs at least two cars. Add a bot."
			: isChamp && rounds.length < 2 ? "Pick at least two tracks for the championship."
			: ready + " of " + humans.length + " drivers ready";
	}else{
		const me = (room.players || {})[net.uid];
		go.firstElementChild.textContent = me && me.ready ? "Not ready" : "I'm ready";
		go.disabled = false;
		$("lobbyStatus").textContent = room.phase === "race" ? "A race is on. You'll join the next one." : "Waiting for the host to start";
	}
	if(isChamp && rounds[0]) showTrack(trackById(rounds[0]), st.reverse); else showTrack(def, st.reverse);
}
$("addBot").addEventListener("click", () => {
	const room = S.room;
	if(!room) return;
	const used = new Set(Object.values(room.players || {}).map(p => p.name));
	const name = BOT_NAMES.find(n => !used.has(n)) || "Bot " + Math.floor(Math.random() * 99);
	audio.sfx.click();
	S.net.addBot({ name, hue: Math.floor(Math.random() * 360), body: BODIES[Math.floor(Math.random() * BODIES.length)].id, bot: S.lobbyLevel });
});
$("lobbyGo").addEventListener("click", () => {
	audio.unlock(); requestTilt();
	if(!S.net || !S.room) return;
	if(S.net.isHost) hostStart();
	else { const me = (S.room.players || {})[S.net.uid]; S.net.updateMe({ ready: !(me && me.ready) }); }
});

function hostStart(){
	const room = S.room, net = S.net;
	if(!room || !net.isHost) return;
	const st = room.settings || lobbyDefaults();
	const grid = Object.entries(room.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0)).map(([id]) => id).slice(0, MAX_CARS);
	if(st.mode === "elim" && grid.length < 2) return;
	if(st.mode === "champ"){
		const rounds = (st.rounds || []).filter(id => trackById(id));
		if(rounds.length < 2) return;
		startChampRoundOnline(newChamp(rounds.map(id => ({ track: id })), st.reverse, st.laps || 3));
		return;
	}
	net.startRace({
		id: ((room.race && room.race.id) || S.raceId || 0) + 1,
		startAt: net.now() + 1800 + COUNTDOWN,
		grid, track: st.track, reverse: !!st.reverse, laps: st.laps || 3, mode: st.mode || "race", custom: st.custom || null, draft: st.draft !== false
	});
}

function startChampRoundOnline(champ){
	const room = S.room, net = S.net, st = room.settings || lobbyDefaults();
	const ids = Object.entries(room.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0)).map(([id]) => id).slice(0, MAX_CARS);
	const r = champ.rounds[champ.idx];
	net.startRace({
		id: ((room.race && room.race.id) || S.raceId || 0) + 1,
		startAt: net.now() + 1800 + COUNTDOWN,
		grid: champ.idx === 0 ? ids : champGrid(champ, ids), track: r.track, reverse: !!champ.reverse && !trackById(r.track).code,
		laps: champ.laps, mode: "race", custom: null, draft: st.draft !== false, champ: true
	}, champ);
}
function hostNextRound(){
	const room = S.room;
	if(!room || !room.champ || !S.net.isHost) return;
	const c = JSON.parse(JSON.stringify(room.champ));
	c.idx++;
	startChampRoundOnline(c);
}

function beginOnlineRace(room){
	const r = room.race, net = S.net;
	const players = room.players || {};
	const entrants = r.grid.filter(id => players[id]).map(id => {
		const p = players[id];
		return { id, name: p.name, hue: p.hue, body: p.body, bot: p.bot || null, local: id === net.uid || (!!p.bot && room.host === net.uid) };
	});
	const def = defFor(r.track, r.custom);
	beginRace({
		source: "online", def, reverse: r.reverse, mode: r.mode, laps: r.mode === "elim" ? 99 : r.laps,
		entrants, myId: net.uid, startAt: r.startAt, authority: room.host === net.uid, draft: r.draft !== false, champ: !!r.champ
	});
	S.ctx.laps = r.laps;
}

// ---------- Leaderboards ----------
const boards = { tab: "drivers", sort: "wins", trackId: "monza", reverse: false, token: 0 };
seg($("boardTab"), "drivers", v => { boards.tab = v; renderBoards(); });
seg($("driverSort"), "wins", v => { boards.sort = v; loadDrivers(); });
const boardDirSet = seg($("boardDir"), "0", v => { boards.reverse = v === "1"; loadLaps(); });
$("btnBoards").addEventListener("click", () => { audio.sfx.click(); openBoards(); });
$("boardTrial").addEventListener("click", () => {
	audio.sfx.click();
	S.setup.trackId = boards.trackId;
	S.setup.reverse = boards.reverse;
	setupDirSeg(boards.reverse ? "1" : "0");
	openSetup("trial");
});

function openBoards(){
	showScreen("boards");
	camMode = "overview";
	$("boardsNotice").hidden = onlineAvailable();
	renderBoards();
}
function renderBoards(){
	$("boardDrivers").hidden = boards.tab !== "drivers";
	$("boardWeekly").hidden = boards.tab !== "weekly";
	if(boards.tab === "weekly"){ $("boardTracks").hidden = true; loadWeeklyBoard(); return; }
	$("boardTracks").hidden = boards.tab !== "tracks";
	if(boards.tab === "drivers") loadDrivers();
	else{
		renderTrackGrid($("boardTrackGrid"), boards.trackId, def => { boards.trackId = def.id; loadLaps(); }, { compact: true, defs: TRACKS });
		loadLaps();
	}
}
function whenAgo(ts){
	if(!ts) return "";
	const d = (Date.now() - ts) / 86400000;
	if(d < 1) return "Today";
	if(d < 2) return "Yesterday";
	if(d < 14) return Math.floor(d) + " days ago";
	return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const emptyRow = (cols, text) => `<tr class="empty"><td colspan="${cols}">${text}</td></tr>`;
const driverCell = (n, h, me) => `<td class="name"><i style="background:hsl(${h},100%,55%)"></i>${escapeHtml(n || "Driver")}${me ? " (you)" : ""}</td>`;

async function loadDrivers(){
	const token = ++boards.token;
	const body = $("driverBody");
	$("youName").textContent = driverName();
	if(!onlineAvailable()){
		body.innerHTML = emptyRow(6, "Set up online play to track wins and podiums.");
		return;
	}
	body.innerHTML = emptyRow(6, "Loading standings…");
	try {
		const net = await connect();
		const [rows, mine] = await Promise.all([net.topDrivers(boards.sort, 25), net.myStats()]);
		if(token !== boards.token) return;
		const k = boards.sort;
		body.innerHTML = rows.length ? rows.map((r, i) => `<tr class="${r.id === net.uid ? "me" : ""} ${i ? "" : "first"}">
			<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.id === net.uid)}
			<td class="num ${k === "wins" ? "hl lead" : "dim"}">${r.wins || 0}</td>
			<td class="num ${k === "podiums" ? "hl lead" : "dim"}">${r.podiums || 0}</td>
			<td class="num ${k === "races" ? "hl lead" : "dim"}">${r.races || 0}</td>
			<td class="dim">${r.races ? Math.round((r.wins || 0) / r.races * 100) + "%" : "-"}</td></tr>`).join("")
			: emptyRow(6, "No online races yet. Host a room and invite a friend.");
		$("youWins").textContent = (mine && mine.wins) || 0;
		$("youPodiums").textContent = (mine && mine.podiums) || 0;
		$("youRaces").textContent = (mine && mine.races) || 0;
		$("youNote").textContent = mine && mine.races ? `Win rate ${Math.round(mine.wins / mine.races * 100)}%. Last race ${whenAgo(mine.at).toLowerCase()}.` : "Race online to get on the board.";
		// Lap records held: how many tracks you top.
		const keys = TRACKS.flatMap(d => d.code ? [trackKey(d, false)] : [trackKey(d, false), trackKey(d, true)]);
		const tops = await Promise.all(keys.map(key => net.topLaps(key, 1).catch(() => [])));
		if(token === boards.token) $("youRecords").textContent = tops.filter(t => t[0] && t[0].id === net.uid).length;
	} catch(e){
		if(token === boards.token) body.innerHTML = emptyRow(6, "Couldn't load the standings. Check your connection.");
	}
}

async function loadLaps(){
	const token = ++boards.token;
	const def = trackById(boards.trackId) || TRACKS[1];
	if(def.code && boards.reverse){ boards.reverse = false; boardDirSet("0"); }
	$("boardDir").querySelectorAll("button").forEach(b => { b.disabled = !!def.code && b.dataset.v === "1"; });
	const key = trackKey(def, boards.reverse);
	$("boardTrackName").textContent = def.name + (boards.reverse ? " reversed" : "");
	$("boardTrackPlace").textContent = [def.place, def.realLength].filter(Boolean).join(" · ") || "Lap record";
	showTrack(def, boards.reverse);
	const body = $("lapBody");
	const mine = store.getBest(key);
	let rows = [];
	body.innerHTML = emptyRow(5, "Loading lap records…");
	if(onlineAvailable()){
		try {
			const net = await connect();
			rows = (await net.topLaps(key, 20)).map(r => ({ n: r.n, h: r.h, t: r.t, at: r.at, me: r.id === net.uid }));
		} catch {}
	}
	if(token !== boards.token) return;
	if(!rows.length && mine) rows = [{ n: driverName(), h: S.profile.hue, t: mine, me: true }];
	const first = rows[0] && rows[0].t;
	body.innerHTML = rows.length ? rows.map((r, i) => `<tr class="${r.me ? "me" : ""} ${i ? "" : "first"}">
		<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.me)}
		<td class="num ${i ? "" : "hl"}">${fmtTime(r.t)}</td>
		<td class="dim">${i ? "+" + ((r.t - first) / 1000).toFixed(3) : ""}</td>
		<td class="dim">${whenAgo(r.at)}</td></tr>`).join("")
		: emptyRow(5, "No laps set here yet. Be the first.");
}

// ---------- Weekly challenge ----------
const boardRows = (rows, uid) => rows.map((r, i) => `<li class="${i ? "" : "first"}"><span>${i + 1}</span><i class="chip" style="background:hsl(${r.h},100%,55%)"></i><span>${escapeHtml(r.n)}${r.id === uid ? " (you)" : ""}</span><span class="t">${fmtTime(r.t)}</span></li>`).join("");
async function loadWeeklyCard(){
	const wk = weeklyChallenge();
	$("weeklyTitle").textContent = wk.def.name + (wk.reverse ? " reversed" : "");
	$("weeklyEnds").textContent = "New track in " + timeLeft(wk.end - Date.now());
	const mine = store.getBest("weekly:" + wk.id);
	const board = $("weeklyBoard");
	board.innerHTML = `<li class="empty">${mine ? "Your best this week: " + fmtTime(mine) : "No laps yet this week. Set the pace."}</li>`;
	$("weeklyLast").textContent = "";
	if(!onlineAvailable()) return;
	try {
		const net = await connect();
		const [top, last] = await Promise.all([net.topWeekly(wk.id, 3), net.topWeekly(weeklyChallenge(Date.now(), 1).id, 1)]);
		if(top.length) board.innerHTML = boardRows(top, net.uid) + (mine && !top.some(r => r.id === net.uid) ? `<li class="empty">Your best: ${fmtTime(mine)}</li>` : "");
		const prev = weeklyChallenge(Date.now(), 1);
		if(last[0]) $("weeklyLast").textContent = `Last week: ${last[0].n} won ${prev.def.name}${prev.reverse ? " reversed" : ""} with ${fmtTime(last[0].t)}.`;
	} catch {}
}
$("weeklyGo").addEventListener("click", () => { audio.unlock(); requestTilt(); startChallenge(); });
$("wkGo").addEventListener("click", () => { audio.unlock(); requestTilt(); startChallenge(); });

async function loadWeeklyBoard(){
	const token = ++boards.token;
	const wk = weeklyChallenge(), prev = weeklyChallenge(Date.now(), 1);
	$("wkName").textContent = wk.def.name + (wk.reverse ? " reversed" : "");
	$("wkPlace").textContent = "This week · " + wk.id;
	$("wkEnds").textContent = "New track in " + timeLeft(wk.end - Date.now());
	$("wkLastName").textContent = prev.def.name + (prev.reverse ? " reversed" : "");
	showTrack(wk.def, wk.reverse);
	const body = $("wkBody");
	const mine = store.getBest("weekly:" + wk.id);
	if(!onlineAvailable()){
		body.innerHTML = mine ? `<tr class="me first"><td class="pos">1</td>${driverCell(driverName(), S.profile.hue, true)}<td class="num hl">${fmtTime(mine)}</td><td></td><td></td></tr>` : emptyRow(5, "No laps yet this week.");
		$("wkLastBoard").innerHTML = "";
		return;
	}
	body.innerHTML = emptyRow(5, "Loading…");
	try {
		const net = await connect();
		const [rows, last] = await Promise.all([net.topWeekly(wk.id, 20), net.topWeekly(prev.id, 3)]);
		if(token !== boards.token) return;
		const first = rows[0] && rows[0].t;
		body.innerHTML = rows.length ? rows.map((r, i) => `<tr class="${r.id === net.uid ? "me" : ""} ${i ? "" : "first"}">
			<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.id === net.uid)}
			<td class="num ${i ? "" : "hl"}">${fmtTime(r.t)}</td><td class="dim">${i ? "+" + ((r.t - first) / 1000).toFixed(3) : ""}</td>
			<td class="dim">${whenAgo(r.at)}</td></tr>`).join("") : emptyRow(5, "No laps yet this week. Be the first.");
		$("wkLastBoard").innerHTML = last.length ? boardRows(last, net.uid) : `<li class="empty">Nobody raced it.</li>`;
	} catch {
		if(token === boards.token) body.innerHTML = emptyRow(5, "Couldn't load the board. Check your connection.");
	}
}

// ---------- Accounts ----------
const acct = { info: { kind: "guest" } };
function renderAccount(){
	const a = acct.info;
	$("acctText").innerHTML = a.kind === "guest" ? "Playing as a guest"
		: `<b>${a.kind === "bvs" ? escapeHtml(a.label.toUpperCase()) : "Hwb"}</b> · stats saved to your account`;
	$("acctBtn").textContent = a.kind === "guest" ? "Sign in" : "Account";
}
async function refreshAccount(){
	if(!onlineAvailable()) return renderAccount();
	try { acct.info = (await connect()).account(); } catch {}
	renderAccount();
}
function acctMsg(text, ok){
	const el = $("acctErr");
	el.textContent = text || "";
	el.hidden = !text;
	el.classList.toggle("err", !ok);
}
function openAccount(){
	const online = onlineAvailable();
	const a = acct.info;
	$("acctOffline").hidden = online;
	$("acctSignedIn").hidden = !online || a.kind === "guest";
	$("acctForms").hidden = !online || a.kind !== "guest";
	$("bvsOption").hidden = !ACCOUNTS.bvs;
	$("hwbOption").hidden = !ACCOUNTS.hwb;
	$("acctKind").textContent = a.kind === "bvs" ? "BVS" : "Hwb";
	$("acctLabel").textContent = a.label || "";
	acctMsg("");
	openModal("account");
}
$("acctBtn").addEventListener("click", () => { audio.sfx.click(); openAccount(); });

// Signing in to an existing account switches player, so reload with that account's profile.
async function afterSignIn(net, uidBefore){
	if(net.uid !== uidBefore){
		const p = await net.loadProfile().catch(() => null);
		if(p) store.setProfile(Object.assign(store.getProfile(), p));
		location.reload();
		return;
	}
	await net.saveProfile(S.profile).catch(() => {});
	acct.info = net.account();
	renderAccount();
	openAccount();
	acctMsg("Account ready. Your stats now follow you to any computer.", true);
}
async function acctAction(btn, fn){
	const buttons = document.querySelectorAll("#acctForms button, #acctSignOut");
	buttons.forEach(b => { b.disabled = true; });
	acctMsg("");
	try { await fn(); } catch(e){ acctMsg(e.message || String(e)); }
	buttons.forEach(b => { b.disabled = false; });
}
function bvsInputs(){
	const id = normaliseBvs($("bvsId").value);
	if(!id) throw new Error("BVS numbers look like bvs-12345.");
	const pw = $("bvsPw").value;
	if(pw.length < 6) throw new Error("Passwords need at least 6 characters.");
	return [id, pw];
}
$("bvsCreate").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const [id, pw] = bvsInputs();
	const net = await connect(), before = net.uid;
	await net.createBvs(id, pw);
	await afterSignIn(net, before);
}));
$("bvsLogin").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const [id, pw] = bvsInputs();
	const net = await connect(), before = net.uid;
	await net.loginBvs(id, pw);
	await afterSignIn(net, before);
}));
$("bvsPw").addEventListener("keydown", e => { if(e.key === "Enter") $("bvsLogin").click(); });
$("hwbLogin").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const net = await connect(), before = net.uid;
	await net.loginHwb();
	await afterSignIn(net, before);
}));
$("acctSignOut").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const net = await connect();
	await net.signOut();
	location.reload();
}));

// Keep an account's name, colour and car in sync across devices.
let profileSyncTimer = null;
function syncProfileSoon(){
	if(acct.info.kind === "guest") return;
	clearTimeout(profileSyncTimer);
	profileSyncTimer = setTimeout(() => { connect().then(n => n.saveProfile(S.profile)).catch(() => {}); }, 1200);
}

async function recordStats(){
	if(!S.net) return;
	try {
		const st = await S.net.recordResult({ name: driverName(), hue: S.profile.hue });
		if(st && S.screen === "results"){
			const note = $("resultsNote");
			note.textContent = [note.textContent, `Career: ${st.wins} win${st.wins === 1 ? "" : "s"}, ${st.podiums} podium${st.podiums === 1 ? "" : "s"} from ${st.races} race${st.races === 1 ? "" : "s"}.`].filter(Boolean).join(" ");
		}
	} catch(e){ console.warn("Couldn't save race stats:", e.message || e); }
}

// ---------- Boot ----------
showTrack(defFor(S.setup.trackId), false);
showScreen("title");
{
	// Coming back from the editor's "Save & race".
	const params = new URLSearchParams(location.search);
	const play = params.get("play");
	if(play && customDefs().some(d => d.id === play)){
		S.setup.trackId = play;
		S.setup.laps = 3;
		openSetup("bots");
	}
	if(play){ params.delete("play"); history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "")); }
}
loadWeeklyCard();
refreshAccount();
requestAnimationFrame(frame);
window.__game = S;   // handy for debugging in the console
