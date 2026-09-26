// Game shell: screens, input, camera, and wiring races to the menus and online rooms.
import { TRACKS, trackById } from "./tracks.js";
import { buildTrack } from "./trackgen.js";
import { makeTracker } from "./progress.js";
import { buildWorld } from "./world.js";
import { makeCar, disposeCar, animateCar, BODIES } from "./cars.js";
import { Race, COUNTDOWN, QUALI_LAPS } from "./race.js";
import { Hud, fmtTime } from "./hud.js";
import { Effects } from "./fx.js";
import * as audio from "./audio.js";
import * as store from "./storage.js";
import { connect, onlineAvailable, normaliseBvs, normaliseHwb } from "./net.js";
import { newChamp, scoreRound, champStandings, champGrid } from "./champ.js";
import { weeklyChallenge, timeLeft } from "./weekly.js";
import { Mesh } from "./p2p.js";
import { DEFAULT_LOOK, botLook } from "./cosmetics.js";
import { isRude, cleanName } from "./filter.js";
import { initGarage } from "./garage.js";
import { initAdmin } from "./admin.js";
import { minLapMs } from "./limits.js";
import { Director, Replay, buildHighlights, pickFocus, SHOT_NAMES } from "./broadcast.js";
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
	setup: { mode: "bots", trackId: "monza", reverse: false, laps: 3, bots: 5, level: "medium", gameMode: "race", draft: true, contact: "soft", rounds: [], quali: false },
	champ: null, champEntrants: null, lastHost: null,
	lobbyLevel: "medium",
	lastDelta: null,
	shake: 0,
	input: { left: false, right: false, tl: false, tr: false, tilt: null }
};
S.profile.look = Object.assign({}, DEFAULT_LOOK, S.profile.look);
const CROWN_SVG = '<svg class="crown-ico" viewBox="0 0 24 24" aria-label="Weekly champion"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/></svg>';
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
	S.showcase = makeCar(S.profile.body, S.profile.hue, { look: S.profile.look });
	S.showcase.position.set(0, 0, 0);
	S.showcase.visible = !S.race;
	scene.add(S.showcase);
}
function carNumber(){ const n = S.profile.look && S.profile.look.number; return n == null ? "--" : String(n).padStart(2, "0"); }

// ---------- Screens ----------
function showScreen(name){
	S.screen = name;
	audio.playMusic("menu");
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
	const v = e.target.value.replace(/[<>]/g, "").slice(0, 18);
	const rude = isRude(v);
	$("nameNote").hidden = !rude;
	$("nameNote").textContent = rude ? "Pick a different name. That one won't be shown to other players." : "";
	if(rude) return;
	S.profile.name = v;
	saveProfile(); updateShowcaseTag();
});
function applyNameLock(name){
	if(!name) return;
	S.profile.name = name;
	store.setProfile(S.profile);
	$("nameInput").value = name;
	$("nameInput").disabled = true;
	$("nameNote").hidden = false;
	$("nameNote").textContent = "An admin set your driver name.";
	updateShowcaseTag();
}
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
	$("showNum").textContent = carNumber();
	$("showName").textContent = driverName();
	$("showBody").textContent = (BODIES.find(b => b.id === S.profile.body) || BODIES[0]).name;
}
updateShowcaseTag();

// ---------- Settings ----------
function saveSettings(){ store.setSettings(S.settings); }
seg($("setQuality"), S.settings.quality, v => { S.settings.quality = v; saveSettings(); applyQuality(); });
seg($("setCamera"), S.settings.camera, v => { S.settings.camera = v; saveSettings(); });
seg($("setRaceMusic"), S.settings.raceMusic ? "1" : "0", v => { S.settings.raceMusic = v === "1"; saveSettings(); if(S.screen === "race" && S.race && S.race.phase !== "countdown") audio.playMusic(S.settings.raceMusic ? "race" : null); });
seg($("setShake"), S.settings.shake ? "1" : "0", v => { S.settings.shake = v === "1"; saveSettings(); });
seg($("setMirror"), S.settings.mirror ? "1" : "0", v => { S.settings.mirror = v === "1"; saveSettings(); });
seg($("setTouch"), S.settings.touch, v => { S.settings.touch = v; saveSettings(); updateTouchZones(); });
$("setVolume").value = S.settings.volume;
$("setVolume").addEventListener("input", e => { S.settings.volume = +e.target.value; saveSettings(); audio.setVolume(S.settings.volume); });
audio.setVolume(S.settings.volume);
for(const [id, key, kind] of [["setMusic", "music", "music"], ["setSfx", "sfx", "sfx"], ["setEngineVol", "engineVol", "engine"]]){
	$(id).value = S.settings[key];
	$(id).addEventListener("input", e => {
		S.settings[key] = +e.target.value; saveSettings(); audio.setLevel(kind, S.settings[key]);
		if(kind === "engine" && S.settings[key] > 0 && S.race && !S.frozen && !S.paused) audio.startEngine();
	});
	$(id).addEventListener("change", () => { if(kind === "sfx") audio.sfx.lap(); });
	audio.setLevel(kind, S.settings[key]);
}
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
seg($("setupContact"), "soft", v => { S.setup.contact = v; });
seg($("setupQuali"), "0", v => { S.setup.quali = v === "1"; });
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
	const entrants = [{ id: "me", name: driverName(), hue: S.profile.hue, body: S.profile.body, look: S.profile.look, local: true }];
	if(st.mode === "bots"){
		const hues = spreadHues(st.bots, S.profile.hue);
		const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
		for(let i = 0; i < st.bots; i++) entrants.push({ id: "bot" + i, name: names[i % names.length], hue: hues[i], body: BODIES[Math.floor(Math.random() * BODIES.length)].id, look: botLook(), bot: st.level, local: true });
		entrants.sort(() => Math.random() - 0.5);
	}
	if(champMode()){
		S.champ = newChamp(st.rounds.map(id => ({ track: id })), st.reverse, st.laps);
		S.champEntrants = entrants;
		startChampRound();
		return;
	}
	const mode = st.mode === "trial" ? "trial" : st.gameMode;
	const race = grid => beginRace({
		source: "solo", def, reverse: st.reverse, mode, laps: mode === "elim" ? 99 : st.laps,
		entrants: grid ? grid.map(id => entrants.find(e => e.id === id)).filter(Boolean) : entrants, myId: "me", draft: mode !== "trial" && st.draft, contact: st.contact,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, restart: startSolo
	});
	if(st.quali && st.mode === "bots") startQuali(def, st.reverse, entrants, race);
	else race();
}

// Qualifying: a hotlap session (no contact, no slipstream). Best lap sets the grid.
function startQuali(def, reverse, entrants, then){
	beginRace({
		source: "solo", def, reverse, mode: "quali", laps: QUALI_LAPS, entrants, myId: "me", draft: false,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, qualiThen: then,
		restart: () => startQuali(def, reverse, entrants, then)
	});
}

function startChampRound(qualiGrid){
	const c = S.champ;
	const def = defFor(c.rounds[c.idx].track);
	if(S.setup.quali && !qualiGrid){ startQuali(def, c.reverse && !def.code, S.champEntrants, grid => startChampRound(grid)); return; }
	const ids = S.champEntrants.map(e => e.id);
	const order = qualiGrid || (c.idx === 0 ? ids : champGrid(c, ids));
	beginRace({
		source: "solo", def, reverse: c.reverse && !def.code, mode: "race", laps: c.laps,
		entrants: order.map(id => S.champEntrants.find(e => e.id === id)), myId: "me", draft: S.setup.draft, contact: S.setup.contact,
		startAt: soloNow() + 700 + COUNTDOWN, authority: true, champ: true, restart: () => startChampRound(qualiGrid)
	});
}

// Weekly challenge: a time trial on this week's track.
function startChallenge(){
	const wk = weeklyChallenge();
	S.setup.mode = "trial";
	beginRace({
		source: "solo", def: wk.def, reverse: wk.reverse, mode: "trial", laps: 1,
		entrants: [{ id: "me", name: driverName(), hue: S.profile.hue, body: S.profile.body, look: S.profile.look, local: true }], myId: "me", draft: false,
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
		net: opts.source === "online" ? S.net : null, ghost, draft: opts.draft !== false, contact: opts.contact,
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
		if(garage && garage.crown && c.id === garage.crown) el.lastElementChild.insertAdjacentHTML("afterbegin", CROWN_SVG);
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
	audio.playMusic(null);
	audio.startEngine();
}

function endRace(keepTrack){
	clearInterval(S.qualiTimer);
	stopTv();
	S.replay = null;
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

// Spectating: joined mid-race, knocked out, or finished a few seconds ago.
function spectating(){
	const r = S.race;
	if(!r || S.frozen || r.mode === "trial") return false;
	return !r.me || r.me.elim !== null || (r.me.finish !== null && r.raceTime - r.me.finish > 3500);
}
function focusCar(){
	const r = S.race;
	if(!r) return null;
	if(spectating()){ const c = r.byId.get(tv.focusId); if(c && !c.gone && c.elim === null) return c; }
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
			if(S.settings.raceMusic && r.mode !== "trial") audio.playMusic("race");
			if(r.mode === "quali"){ hud.banner("Qualifying", "Best lap sets the grid", "go", 1800); audio.sfx.go(); break; }
			hud.banner("Go", "", "go", 900);
			audio.sfx.go();
			if(S.world) S.world.cheer(0.8);
			break;
		case "hit": {
			const c = d.car;
			const dist = focus ? Math.hypot(c.pos.x - focus.pos.x, c.pos.z - focus.pos.z) : 0;
			const near = Math.max(0, 1 - dist / 60);
			if(c === focus || d.other === focus){
				audio.thud(d.strength, 1, d.type);
				if(S.settings.shake) S.shake = Math.min(0.5, S.shake + d.strength * 1.2);
			}else if(near > 0) audio.thud(d.strength, near * 0.6, d.type);
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
				if(isRecord && TRACKS.every(t => store.getBest(trackKey(t, false)) != null)) garageNote(garage.afterSolo(["allTracks"]), true);
				const wk = weeklyChallenge();
				if(S.ctx.def.id === wk.def.id && !!S.ctx.reverse === wk.reverse){
					const wkKey = "weekly:" + wk.id, prev = store.getBest(wkKey);
					if(prev == null || d.ms < prev){ store.setBest(wkKey, d.ms); submitWeekly(wk.id, d.ms, key); if(!isRecord) weeklyBest = true; }
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
		case "qualiDone":
			if(d.car.me){
				const pos = r.standings().findIndex(s => s.car === d.car) + 1;
				hud.banner(d.ms != null ? "Qualified P" + pos : "No time set", d.ms != null ? fmtTime(d.ms) : "", "finish", 3000);
				audio.sfx.finish(d.ms != null && pos === 1 ? 2 : 0);
			}
			break;
		case "finalLap":
			hud.banner("Final lap", "", "final", 1600);
			audio.sfx.finalLap();
			audio.musicIntensity(1);
			break;
		case "finish":
			if(S.world && (d.position === 1 || d.car.me)) S.world.cheer(0.9);
			if(d.car.me){
				const pos = d.position || (r.standings().findIndex(s => s.car === d.car) + 1);
				hud.banner(pos === 1 ? "Winner" : "Finished P" + pos, fmtTime(d.ms), "finish", 4000);
				audio.sfx.finish(r.mode === "trial" ? 0 : pos);
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
			if(r.mode === "quali"){
				if(S.ctx.source === "solo") setTimeout(() => showResults(d, false, { quali: true }), 900);
				else if(S.net && S.net.isHost) S.net.finishQuali(d);
				break;
			}
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

function lapFloor(key){
	const entry = trackCache.get(key);
	return entry ? minLapMs(entry) : 0;
}
async function submitWeekly(week, ms, key){
	if(!onlineAvailable() || ms < lapFloor(key)) return;
	try { await (await connect()).submitWeekly(week, ms, { name: driverName(), hue: S.profile.hue }, key); } catch {}
}

async function submitRecord(key, ms){
	if(!onlineAvailable() || key.startsWith("custom") || ms < lapFloor(key)) return;
	try {
		const net = await connect();
		await net.submitLap(key, ms, { name: driverName(), hue: S.profile.hue });
	} catch {}
}

// ---------- Results ----------
function showResults(results, online, opts = {}){
	const quali = !!opts.quali;
	clearInterval(S.qualiTimer);
	if(!S.race && !online) return;
	const key = (online ? "o" : "s") + (S.race ? S.race.startAt : "");
	if(online && !quali && S.statsKey !== key){ S.statsKey = key; recordStats(); }
	if(!quali && !opts.afterHighlights && S.race && S.highlightsKey !== key && S.race.rec.frames.length > 60){
		S.highlightsKey = key;
		S.frozen = true;
		audio.stopEngine();
		$("touch").hidden = true;
		startReplay("highlights", () => showResults(results, online, Object.assign({}, opts, { afterHighlights: true })));
		if(S.replay) return;
	}
	stopTv();
	S.frozen = true;
	audio.stopEngine();
	hud.show(false);
	$("touch").hidden = true;
	for(const el of $("labels").querySelectorAll(".label")) el.style.display = "none";
	const myId = S.race ? S.race.myId : S.net && S.net.uid;
	const def = S.ctx ? S.ctx.def : null;
	$("resultsTrack").textContent = def ? `${def.name}${S.ctx.reverse ? " reversed" : ""} · ${quali ? "Qualifying" : S.ctx.mode === "elim" ? "Elimination" : S.ctx.laps + (S.ctx.laps === 1 ? " lap" : " laps")}` : "Results";
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
	if(quali) $("resultsTitle").textContent = me ? (me.status === "finished" ? `You qualified P${me.pos}` : "No time set") : "Qualifying";
	const champ = !quali && S.ctx && S.ctx.champ ? (online ? S.room && S.room.champ : S.champ) : null;
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
	$("resultsNote").textContent = (S.pendingNote || []).join(" ");
	S.pendingNote = [];
	if(quali){
		// Race starts from this order: straight away if you press the button, or after 10 seconds.
		const go = () => { clearInterval(S.qualiTimer); S.qualiTimer = null; if(online) hostAfterQuali(); else if(S.ctx && S.ctx.qualiThen) S.ctx.qualiThen(results.map(r => r.id)); };
		if(!online || (S.net && S.net.isHost)){
			const b = addBtn("Start the race", "", go);
			let left = 10;
			S.qualiTimer = setInterval(() => { left--; b.firstElementChild.textContent = `Start the race (${left})`; if(left <= 0) go(); }, 1000);
		}else $("resultsNote").textContent = "The race starts in a few seconds, from this grid.";
		addBtn(online ? "Leave room" : "Main menu", "ghost", online ? leaveRoom : goTitle);
	}else if(!online && champ){
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
	if(!quali && S.race && S.race.rec.frames.length > 60){
		const again = Object.assign({}, opts, { afterHighlights: true });
		addBtn("Highlights", "ghost", () => startReplay("highlights", () => showResults(results, online, again)));
		addBtn("Full replay", "ghost", () => startReplay("replay", () => showResults(results, online, again)));
	}
	showScreen("results");
	camMode = "winner";
	// Solo results tick off solo goals in the garage (once per race).
	if(!quali && !online && S.soloFlagsKey !== key && me && S.ctx && S.ctx.mode !== "trial" && results.length > 1){
		const flags = [];
		if(me.status === "finished" || (me.pos === 1 && S.ctx.mode === "elim")) flags.push("race");
		const lvl = S.setup.level;
		if(me.pos === 1 && me.status !== "dnf"){ if(lvl === "medium" || lvl === "hard") flags.push("winRacer"); if(lvl === "hard") flags.push("winAce"); }
		S.soloFlagsKey = key;
		garageNote(garage.afterSolo(flags));
	}
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
	audio.duckMusic(true);
	openModal("pause");
}
function resume(){
	closeModal("pause");
	audio.duckMusic(false);
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
	if(k === "KeyB") S.input.back = true;
	if(k.startsWith("Arrow") && S.race) e.preventDefault();
	if(e.repeat) return;
	if((k === "Escape" || k === "KeyP") && S.race && !S.frozen){ $("pause").hidden ? pause() : resume(); }
	else if(k === "Escape"){ document.querySelectorAll(".modal").forEach(m => { if(m.id !== "pause") m.hidden = true; }); }
	if(k === "KeyR" && S.race && !S.paused) S.race.requestRescue();
	if((S.replay || spectating()) && (k === "ArrowLeft" || k === "ArrowRight")){ cycleFocus(k === "ArrowLeft" ? -1 : 1); return; }
	if((S.replay || spectating()) && k === "KeyC"){ const sh = director().cycleShot(); $("tvShot").textContent = "Camera: " + SHOT_NAMES[sh]; return; }
	if(S.replay && k === "Escape"){ endReplay(); return; }
	if(S.replay && k === "Space"){ $("tvPlay").click(); e.preventDefault(); return; }
	if(k === "KeyC"){ const order = ["classic", "far", "hood"]; S.settings.camera = order[(order.indexOf(S.settings.camera) + 1) % 3]; saveSettings(); hud.toast("Camera: " + ({ classic: "Classic", far: "Far", hood: "Bonnet" })[S.settings.camera], 1200); }
	if(k === "KeyM"){ S.muted = !S.muted; audio.setVolume(S.muted ? 0 : S.settings.volume); hud.toast(S.muted ? "Sound off" : "Sound on", 1200); }
});
addEventListener("keyup", e => {
	const k = e.code || "";
	if(k === "ArrowLeft" || k === "KeyA") S.input.left = false;
	if(k === "ArrowRight" || k === "KeyD") S.input.right = false;
	if(k === "KeyB") S.input.back = false;
});
addEventListener("blur", () => { S.input.left = S.input.right = S.input.back = false; });
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
let lookingBack = false;
function followCamera(dt){
	const c = focusCar();
	if(!c) return;
	const warp = dt * 1000 / 16;
	const p = c.model.position, dir = c.model.rotation.y;
	const mode = S.settings.camera;
	// Holding B: look behind, from just in front of the car.
	if(S.input.back){
		lookingBack = true;
		const fx_ = Math.sin(dir), fz = Math.cos(dir);
		camera.position.set(p.x + fx_ * 5.5, 2.6, p.z + fz * 5.5);
		camera.lookAt(p.x - fx_ * 6, 0.8, p.z - fz * 6);
		return;
	}
	if(lookingBack){ lookingBack = false; snapCamera(); if(mode !== "hood") return; }
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

// ---------- Rear-view mirror ----------
// The view behind your car, rendered into a small texture and drawn flipped (like a
// real mirror) inside the #mirrorGlass box at the top of the screen.
const mirror = { cam: new THREE.PerspectiveCamera(42, 4, 0.5, 340), rt: null, scene: new THREE.Scene(), view: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad: null, tick: 0 };
{
	const g = new THREE.PlaneBufferGeometry(2, 2);
	const uv = g.attributes.uv;
	for(let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
	mirror.quad = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }));
	mirror.scene.add(mirror.quad);
}
function mirrorWanted(){
	const r = S.race;
	return !!(S.settings.mirror && r && !S.frozen && !S.replay && r.me && r.me.elim === null && !r.me.gone && !S.input.back && !spectating() && r.mode !== "trial");
}
function renderMirror(){
	const want = mirrorWanted();
	document.body.classList.toggle("mirror-on", want);
	if(!want) return;
	const glass = $("mirrorGlass").getBoundingClientRect();
	if(glass.width < 40 || glass.height < 10) return;      // hidden on small screens
	const pr = renderer.getPixelRatio() * (quality() === "high" ? 1 : 0.7);
	const w = Math.round(glass.width * pr), h = Math.round(glass.height * pr);
	if(!mirror.rt || mirror.rt.width !== w || mirror.rt.height !== h){
		if(mirror.rt) mirror.rt.dispose();
		mirror.rt = new THREE.WebGLRenderTarget(w, h);
		mirror.quad.material.map = mirror.rt.texture;
		mirror.quad.material.needsUpdate = true;
	}
	// Slower machines refresh the mirror every other frame.
	if(quality() === "high" || (mirror.tick++ & 1) === 0){
		const car = S.race.me, p = car.model.position, dir = car.model.rotation.y;
		const fx_ = Math.sin(dir), fz = Math.cos(dir);
		mirror.cam.aspect = glass.width / glass.height;
		mirror.cam.far = Math.min(340, camera.far);
		mirror.cam.updateProjectionMatrix();
		mirror.cam.position.set(p.x - fx_ * 0.4, 1.7, p.z - fz * 0.4);
		mirror.cam.lookAt(p.x - fx_ * 30, 0.7, p.z - fz * 30);
		car.model.visible = false;
		renderer.shadowMap.autoUpdate = false;
		renderer.setRenderTarget(mirror.rt);
		renderer.render(scene, mirror.cam);
		renderer.setRenderTarget(null);
		renderer.shadowMap.autoUpdate = true;
		car.model.visible = true;
	}
	const bottom = innerHeight - glass.bottom;
	renderer.setScissorTest(true);
	renderer.setScissor(glass.left, bottom, glass.width, glass.height);
	renderer.setViewport(glass.left, bottom, glass.width, glass.height);
	const auto = renderer.autoClear;
	renderer.autoClear = false;
	renderer.render(mirror.scene, mirror.view);
	renderer.autoClear = auto;
	renderer.setScissorTest(false);
	renderer.setViewport(0, 0, innerWidth, innerHeight);
}

// ---------- TV coverage ----------
const tv = { director: null, live: false, focusId: null, holdUntil: 0, manualUntil: 0 };
function director(){
	if(!tv.director || tv.director.track !== S.track || tv.director.occ !== (S.world && S.world.occluders)) tv.director = new Director(camera, S.track, S.tracker, S.world);
	return tv.director;
}
function showTv(kind){
	const el = $("tv");
	el.hidden = false;
	document.body.classList.add("tv-on");
	el.classList.toggle("replay", kind !== "live");
	$("tvTag").textContent = kind === "live" ? "Live" : kind === "highlights" ? "Highlights" : "Replay";
	$("tvSub").textContent = kind === "live" && S.race && !S.race.me ? "You'll race next time" : "";
	$("tvReplayCtl").hidden = kind !== "replay";
	$("tvSkip").hidden = kind !== "highlights";
	$("tvExit").hidden = kind !== "replay";
	$("tvShot").textContent = "Camera: " + SHOT_NAMES[director().shot];
	hud.spectating("");
}
function stopTv(){
	if(tv.director) tv.director.release();
	tv.live = false;
	$("tv").hidden = true;
	document.body.classList.remove("tv-on");
}
function tvThird(car, pos, text){
	if(!car) return;
	const name = $("tvName");
	if(name._id !== car.id){ name._id = car.id; name.textContent = car.name; name.style.setProperty("--c", `hsl(${car.hue},100%,55%)`); }
	const p = pos ? "P" + pos : "";
	if($("tvPos").textContent !== p) $("tvPos").textContent = p;
	const ev = $("tvEvent");
	if(ev.textContent !== (text || "")) ev.textContent = text || "";
	ev.hidden = !text;
}
function cycleFocus(step){
	const r = S.race;
	if(!r) return;
	const list = S.replay ? r.cars.filter(c => !c.gone) : r.standings().map(x => x.car).filter(c => c.elim === null && !c.gone);
	if(!list.length) return;
	const cur = S.replay ? S.replay.focusId : tv.focusId;
	const i = list.findIndex(c => c.id === cur);
	const next = list[(i + step + list.length) % list.length].id;
	if(S.replay) S.replay.focusId = next;
	else { tv.focusId = next; tv.manualUntil = r.raceTime + 20000; }
	director().newFocus();
}
function updateSpectator(dt, r){
	if(!tv.live){ tv.live = true; showTv("live"); director().newFocus(); }
	const t = r.raceTime / 1000;
	if(!tv.focusId || !r.byId.get(tv.focusId) || r.raceTime > tv.manualUntil){
		const f = pickFocus(r, tv.focusId, tv.holdUntil, t);
		if(f !== tv.focusId){ tv.focusId = f; tv.holdUntil = t + 6; director().newFocus(); }
	}
	const c = r.byId.get(tv.focusId);
	if(!c) return;
	director().update(dt, t, { x: c.model.position.x, z: c.model.position.z, dir: c.model.rotation.y });
	const pos = r.standings().findIndex(x => x.car === c) + 1;
	const ev = r.events.length ? r.events[r.events.length - 1] : null;
	tvThird(c, pos, ev && r.raceTime - ev.t < 3500 && (ev.a === c.id || ev.b === c.id) ? ev.text : "");
}

// Highlights reel or full replay of the race that just finished.
function startReplay(kind, then){
	const r = S.race;
	if(!r || !r.rec.frames.length){ if(then) then(); return; }
	const endT = r.rec.frames[r.rec.frames.length - 1].t;
	const clips = kind === "highlights" ? buildHighlights(r.events, endT) : null;
	if(kind === "highlights" && clips.length < 2){ if(then) then(); return; }
	const winner = r.standings()[0];
	S.replay = new Replay(r, clips, (r.me && r.me.id) || (winner && winner.car.id));
	S.replayKind = kind;
	S.replayThen = then;
	document.querySelectorAll("[data-screen]").forEach(el => { el.hidden = true; });
	S.screen = "replay";
	hud.show(false);
	director().newFocus();
	showTv(kind);
	$("tvPlay").textContent = "Pause";
}
function endReplay(){
	const then = S.replayThen;
	S.replay = null;
	S.replayThen = null;
	stopTv();
	if(then) then();
}
function replayFrame(dt){
	const rp = S.replay;
	rp.step(dt);
	if(rp.done){ endReplay(); return; }
	const focus = rp.apply(dt);
	if(rp.cutNeeded){ director().newFocus(); rp.cutNeeded = false; }
	if(focus) director().update(dt, rp.t / 1000, focus);
	tvThird(focus && focus.car, null, rp.caption);
	if(S.replayKind === "replay" && rp.end > rp.start){
		const v = Math.round((rp.t - rp.start) / (rp.end - rp.start) * 1000);
		if(!$("tvScrub")._drag) $("tvScrub").value = v;
	}
	updateLabels([], focus && focus.car);
}
$("tvPrev").addEventListener("click", () => cycleFocus(-1));
$("tvNext").addEventListener("click", () => cycleFocus(1));
$("tvShot").addEventListener("click", () => { const sh = director().cycleShot(); $("tvShot").textContent = "Camera: " + SHOT_NAMES[sh]; });
$("tvSkip").addEventListener("click", () => endReplay());
$("tvExit").addEventListener("click", () => endReplay());
$("tvPlay").addEventListener("click", () => { if(!S.replay) return; S.replay.playing = !S.replay.playing; if(S.replay.playing && S.replay.t >= S.replay.end) S.replay.seek(0); $("tvPlay").textContent = S.replay.playing ? "Pause" : "Play"; });
$("tvSpeed").addEventListener("click", () => { if(!S.replay) return; const order = [1, 2, 0.5, 0.25]; S.replay.speed = order[(order.indexOf(S.replay.speed) + 1) % order.length]; $("tvSpeed").textContent = S.replay.speed + "×"; });
$("tvScrub").addEventListener("input", e => { if(S.replay){ S.replay.seek(e.target.value / 1000); e.target._drag = true; } });
$("tvScrub").addEventListener("change", e => { e.target._drag = false; });

// ---------- Name tags ----------
const proj = new THREE.Vector3();
function updateLabels(standings, focus){
	const r = S.race;
	const place = new Map(standings.map((s, i) => [s.car, i + 1]));
	for(const c of r.cars){
		const el = c.label;
		if(!el) continue;
		if(c === focus || c.gone || (c.elim !== null && !S.replay) || (S.frozen && !S.replay) || !c.model.visible){ el.style.display = "none"; continue; }
		proj.set(c.model.position.x, 2.1, c.model.position.z);
		const dist = proj.distanceTo(camera.position);
		proj.project(camera);
		if(proj.z > 1 || dist > 140 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1){ el.style.display = "none"; continue; }
		el.style.display = "";
		const x = (proj.x + 1) / 2 * innerWidth, y = (1 - proj.y) / 2 * innerHeight;
		const s = Math.max(0.55, Math.min(1.1, 22 / dist));
		el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(2)})`;
		el.style.zIndex = String(1000 - Math.round(dist));
		const p = place.has(c) ? "P" + place.get(c) : "";
		if(el._p !== p){ el._p = p; el.firstElementChild.textContent = p; }
	}
}

// ---------- Main loop ----------
let last = performance.now(), hudTimer = 0, lightsShown = 0;
// Who you can hear: the car you're watching, plus the nearest others, panned
// left/right from the camera, quieter with distance and with a touch of doppler.
const earRight = new THREE.Vector3(), earPrev = new Map();
S.engineCars = [];
function engineMix(r, focus, dt){
	const list = [];
	earRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
	const onboard = !tv.live;
	const grid = r.phase !== "racing";
	for(const c of r.cars){
		if(c.gone || c.elim !== null) continue;
		const dx = c.pos.x - camera.position.x, dz = c.pos.z - camera.position.z;
		const dist = Math.hypot(dx, dz);
		if(dist > 90 && c !== focus) continue;
		const main = onboard && c === focus;
		const rate = earPrev.has(c.id) && dt > 0 ? (dist - earPrev.get(c.id)) / dt : 0;
		earPrev.set(c.id, dist);
		const fall = main ? 1 : Math.max(0, 1 - dist / 90) ** 2 * (onboard ? 0.55 : 0.9);
		// Revving on the grid: each car blips its throttle a little differently.
		const rev = grid ? 0.12 + 0.3 * Math.max(0, Math.sin(performance.now() / (170 + (c.hue % 7) * 23) + c.hue)) ** 3 : null;
		list.push({
			id: c.id, body: c.body, speed: grid ? 0 : Math.hypot(c.data.xv, c.data.yv), rev,
			gain: fall, pan: main ? 0 : (dx * earRight.x + dz * earRight.z) / Math.max(8, dist),
			pitch: main ? 1 : Math.max(0.85, Math.min(1.15, 1 - rate * 0.004)), d: main ? -1 : dist
		});
	}
	list.sort((a, b) => a.d - b.d);
	S.engineCars = list;
}

function frame(now){
	requestAnimationFrame(frame);
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	const r = S.race;
	let focus = null;
	if(S.replay && r){
		replayFrame(dt);
		fx.update(dt);
		if(S.world) S.world.update(dt, camera.position);
		renderer.render(scene, camera);
		document.body.classList.remove("mirror-on");
		return;
	}
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
		if(spectating()) updateSpectator(dt, r);
		else { if(tv.live) stopTv(); followCamera(dt); }
		if(focus){
			const d = focus.data;
			const speed = Math.hypot(d.xv, d.yv);
			const slip = speed > 0.05 ? Math.abs(Math.sin(Math.atan2(d.xv, d.yv) - d.dir)) : 0;
			engineMix(r, focus, dt);
			audio.updateEngines(S.engineCars, { speed: r.phase === "racing" ? speed : 0, slip, draft: r.draft ? focus.draft || 0 : 0 }, dt);
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
	renderMirror();
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
	return { track: S.setup.trackId === "classic" ? "classic" : S.setup.trackId, reverse: false, laps: (defFor(S.setup.trackId).laps || 3), mode: "race", custom: null, draft: true, contact: "soft" };
}
async function withBusy(btn, fn){
	btn.disabled = true;
	try { await fn(); } catch(e){ onlineMsg(e.message || String(e)); }
	btn.disabled = false;
}
$("hostBtn").addEventListener("click", () => withBusy($("hostBtn"), async () => {
	audio.unlock(); requestTilt();
	const net = await connect();
	if(await net.isBanned().catch(() => false)) throw new Error("This account has been banned from online play by the admin.");
	S.net = net;
	await net.createRoom({ name: driverName(), hue: S.profile.hue, body: S.profile.body }, lobbyDefaults());
	enterLobby();
}));
$("joinBtn").addEventListener("click", () => withBusy($("joinBtn"), async () => {
	audio.unlock(); requestTilt();
	const code = $("codeInput").value.trim();
	if(code.length !== 4) throw new Error("Room codes are four letters.");
	const net = await connect();
	if(await net.isBanned().catch(() => false)) throw new Error("This account has been banned from online play by the admin.");
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
		if(S.screen === "results" && room.phase === "qualiResults" && room.quali){ S.lastHost = room.host; showResults(room.quali.results, true, { quali: true }); }
		else if(S.screen === "results" && room.results){ S.lastHost = room.host; showResults(room.results, true); }
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
	}else if(room.phase === "qualiResults" && room.quali && S.resultsShown !== "q" + (race && race.id)){
		S.resultsShown = "q" + (race && race.id);
		showResults(room.quali.results, true, { quali: true });
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
	contact: seg($("lobbyContact"), "soft", v => S.net.updateSettings({ contact: v })),
	quali: seg($("lobbyQuali"), "0", v => S.net.updateSettings({ quali: v === "1" })),
	mode: seg($("lobbyMode"), "race", v => S.net.updateSettings({ mode: v })),
	dir: seg($("lobbyDir"), "0", v => S.net.updateSettings({ reverse: v === "1" })),
	level: seg($("lobbyLevel"), "medium", v => { S.lobbyLevel = v; }),
	laps: stepper("lobbyLaps", () => (S.room && S.room.settings && S.room.settings.laps) || 3, v => S.net.updateSettings({ laps: v }), () => 1, () => 20)
};
let lobbyGridKey = null;
function lookTitle(p){
	if(p.bot || !p.look || !p.look.title || p.look.title === "rookie") return "";
	const t = { botslayer: "Bot Slayer", racer: "Racer", winner: "Race Winner", podium: "Podium Hunter", veteran: "Veteran", record: "Record Holder", weekly: "Weekly Winner", serial: "Serial Winner", champion: "Champion", legend: "Legend" }[p.look.title];
	return t ? `<span class="ptitle">${t}</span>` : "";
}
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
			<span class="pname">${garage && garage.crown === p.id ? CROWN_SVG : ""}${escapeHtml(cleanName(p.name, p.id))}${p.id === net.uid ? " (you)" : ""}<span class="pbody">${(BODIES.find(b => b.id === p.body) || BODIES[0]).name}${p.look && p.look.number != null ? " · #" + p.look.number : ""}</span>${lookTitle(p)}</span>
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
	lobbySettingsControls.contact(st.contact === "classic" ? "classic" : "soft");
	$("lobbyContact").dataset.locked = host ? "" : "1";
	$("lobbyContact").querySelectorAll("button").forEach(b => { b.disabled = !host; });
	lobbySettingsControls.quali(st.quali ? "1" : "0");
	$("lobbyQuali").dataset.locked = host ? "" : "1";
	$("lobbyQuali").querySelectorAll("button").forEach(b => { b.disabled = !host; });
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
	const next = { track: st.track, reverse: !!st.reverse, laps: st.laps || 3, mode: st.mode || "race", custom: st.custom || null, draft: st.draft !== false, contact: st.contact === "classic" ? "classic" : "soft" };
	net.startRace(Object.assign({}, next, {
		id: ((room.race && room.race.id) || S.raceId || 0) + 1,
		startAt: net.now() + 1800 + COUNTDOWN, grid
	}, st.quali ? { mode: "quali", laps: QUALI_LAPS, draft: false, next } : {}));
}

function startChampRoundOnline(champ, qualiGrid){
	const room = S.room, net = S.net, st = room.settings || lobbyDefaults();
	const ids = Object.entries(room.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0)).map(([id]) => id).slice(0, MAX_CARS);
	const r = champ.rounds[champ.idx];
	const next = { track: r.track, reverse: !!champ.reverse && !trackById(r.track).code, laps: champ.laps, mode: "race", custom: null, draft: st.draft !== false, contact: st.contact === "classic" ? "classic" : "soft", champ: true };
	const base = { id: ((room.race && room.race.id) || S.raceId || 0) + 1, startAt: net.now() + 1800 + COUNTDOWN, grid: champ.idx === 0 ? ids : champGrid(champ, ids) };
	if(st.quali) net.startRace(Object.assign({}, next, base, { mode: "quali", laps: QUALI_LAPS, draft: false, champ: false, next }), champ);
	else net.startRace(Object.assign({}, next, base), champ);
}
// After qualifying: race from the qualifying order (anyone who joined since goes to the back).
function hostAfterQuali(){
	const room = S.room;
	if(!room || !S.net || !S.net.isHost || room.phase !== "qualiResults" || !room.race || !room.race.next) return;
	const order = ((room.quali && room.quali.order) || []).filter(id => room.players && room.players[id]);
	const rest = Object.keys(room.players || {}).filter(id => !order.includes(id));
	S.net.startRace(Object.assign({}, room.race.next, {
		id: room.race.id + 1, startAt: S.net.now() + 1800 + COUNTDOWN, grid: [...order, ...rest].slice(0, MAX_CARS)
	}));
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
		return { id, name: cleanName(p.name, id), hue: p.hue, body: p.body, look: p.look || (p.bot ? botLook() : null), bot: p.bot || null, local: id === net.uid || (!!p.bot && room.host === net.uid) };
	});
	const def = defFor(r.track, r.custom);
	beginRace({
		source: "online", def, reverse: r.reverse, mode: r.mode, laps: r.mode === "elim" ? 99 : r.laps,
		entrants, myId: net.uid, startAt: r.startAt, authority: room.host === net.uid, draft: r.draft !== false, contact: r.contact, champ: !!r.champ
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
const driverCell = (n, h, me, id) => `<td class="name"><i style="background:hsl(${h},100%,55%)"></i>${garage && id && garage.crown === id ? CROWN_SVG : ""}${escapeHtml(cleanName(n, id))}${me ? " (you)" : ""}</td>`;

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
			<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.id === net.uid, r.id)}
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
		<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.me, r.id)}
		<td class="num ${i ? "" : "hl"}">${fmtTime(r.t)}</td>
		<td class="dim">${i ? "+" + ((r.t - first) / 1000).toFixed(3) : ""}</td>
		<td class="dim">${whenAgo(r.at)}</td></tr>`).join("")
		: emptyRow(5, "No laps set here yet. Be the first.");
}

// ---------- Weekly challenge ----------
const boardRows = (rows, uid) => rows.map((r, i) => `<li class="${i ? "" : "first"}"><span>${i + 1}</span><i class="chip" style="background:hsl(${r.h},100%,55%)"></i><span>${escapeHtml(cleanName(r.n, r.id))}${r.id === uid ? " (you)" : ""}</span><span class="t">${fmtTime(r.t)}</span></li>`).join("");
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
			<td class="pos">${i + 1}</td>${driverCell(r.n, r.h, r.id === net.uid, r.id)}
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
		: a.kind === "hwb" && !a.verified ? `<b>Hwb</b> · check your inbox for the link`
		: `<b>${a.kind === "bvs" ? escapeHtml(a.label.toUpperCase()) : acct.link ? escapeHtml(acct.link.bvs.toUpperCase()) + " + Hwb" : "Hwb"}</b> · stats saved to your account`;
	$("acctBtn").textContent = a.kind === "guest" ? "Sign in" : "Account";
}
function profileForSync(){ return Object.assign({}, S.profile, { solo: garage ? garage.soloFlags() : {} }); }
async function refreshAccount(){
	if(!onlineAvailable()) return renderAccount();
	try {
		const net = await connect();
		acct.info = net.account();
		$("btnAdmin").hidden = !net.isAdmin();
		acct.link = await net.linkInfo().catch(() => null);
		const lock = await net.nameLock().catch(() => null);
		if(lock) applyNameLock(lock);
	} catch {}
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
	$("verifyBox").hidden = !(a.kind === "hwb" && !a.verified);
	acctMsg("");
	openModal("account");
	renderLink();
}
// Linking a BVS number and an Hwb email to the same account, so either logs in.
async function renderLink(){
	const box = $("linkBox"), card = $("linkedCard"), a = acct.info;
	box.hidden = card.hidden = true;
	if(!onlineAvailable() || a.kind === "guest") return;
	const info = acct.link = await (await connect()).linkInfo().catch(() => null);
	renderAccount();
	if(info){
		card.hidden = false;
		$("linkedLabel").textContent = `${info.bvs.toUpperCase()} + ${info.hwb}`;
		$("linkedNote").textContent = info.waiting
			? `Nearly there: click the link we sent to ${info.hwb} (look in Junk too). Until then, keep logging in with your BVS number.`
			: "Log in with either one, using the same password. Forgotten it? Use Forgot password with your Hwb email.";
	}
	// The admin account stays a plain BVS login: the database rules recognise it by that address.
	const mode = a.kind === "bvs" ? (ACCOUNTS.hwb && a.label !== ACCOUNTS.admin ? "hwb" : null)
		: (ACCOUNTS.bvs && a.verified && !info ? "bvs" : null);
	if(!mode || (info && !info.waiting)) return;
	box.hidden = false;
	box.dataset.mode = mode;
	const hwb = mode === "hwb";
	$("linkTitle").textContent = info ? "Send the Hwb link again" : hwb ? "Add your Hwb email" : "Add your BVS number";
	$("linkHelp").textContent = hwb
		? "Then you can log in with your BVS number or your Hwb email, and reset a forgotten password through Hwb. We'll email a link to check it's yours."
		: "Then you can log in with your BVS number too, using the same password.";
	$("linkIdLabel").textContent = hwb ? "Hwb email" : "BVS number";
	$("linkId").type = hwb ? "email" : "text";
	$("linkId").placeholder = hwb ? "you@hwbcymru.net" : "bvs-00000";
	if(info && hwb) $("linkId").value = info.hwb;
}
$("linkGo").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const hwb = $("linkBox").dataset.mode === "hwb", pw = $("linkPw").value;
	const net = await connect();
	if(hwb){
		const email = normaliseHwb($("linkId").value);
		if(!email) throw new Error(`Use your Hwb email (ending ${ACCOUNTS.hwbDomains.map(d => "@" + d).join(" or ")}).`);
		if(pw.length < 6) throw new Error("Type the password you use for this game.");
		const id = acct.info.label;
		await net.linkHwb(email, pw);
		acct.info = net.account();
		$("linkPw").value = "";
		openAccount();
		acctMsg(acct.info.kind === "hwb" ? `Linked. Log in with ${id.toUpperCase()} or ${email}.` : `We've sent a link to ${email}. Click it to finish linking (check Junk).`, true);
	}else{
		const id = normaliseBvs($("linkId").value);
		if(!id) throw new Error("BVS numbers look like bvs-12345.");
		if(pw.length < 6) throw new Error("Type the password you use for this game.");
		await net.linkBvs(id, pw);
		$("linkPw").value = "";
		openAccount();
		acctMsg(`Linked. You can log in with ${id.toUpperCase()} too, using the same password.`, true);
	}
}));
$("linkPw").addEventListener("keydown", e => { if(e.key === "Enter") $("linkGo").click(); });
$("acctBtn").addEventListener("click", () => { audio.sfx.click(); openAccount(); });

// Signing in to an existing account switches player, so reload with that account's profile.
async function afterSignIn(net, uidBefore){
	if(net.uid !== uidBefore){
		const p = await net.loadProfile().catch(() => null);
		if(p){
			const { solo, ...rest } = p;
			store.setProfile(Object.assign(store.getProfile(), rest));
			if(solo) store.save("solo", Object.assign(store.load("solo", {}), solo));
		}
		location.reload();
		return;
	}
	await net.saveProfile(profileForSync()).catch(() => {});
	acct.info = net.account();
	$("btnAdmin").hidden = !net.isAdmin();
	garage.refresh(true).then(() => { $("titleLevel").textContent = garage.level; });
	renderAccount();
	openAccount();
	acctMsg("Account ready. Your stats now follow you to any computer.", true);
}
async function acctAction(btn, fn){
	const buttons = document.querySelectorAll("#acctForms button, #acctSignOut, #verifyBox button, #linkBox button");
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
function hwbInputs(needPassword = true){
	const raw = $("hwbEmail").value;
	const email = normaliseHwb(raw);
	if(!email) throw new Error(`Use your Hwb email (ending ${ACCOUNTS.hwbDomains.map(d => "@" + d).join(" or ")}).`);
	const pw = $("hwbPw").value;
	if(needPassword && pw.length < 6) throw new Error("Passwords need at least 6 characters.");
	return [email, pw];
}
$("hwbCreate").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const [email, pw] = hwbInputs();
	const net = await connect(), before = net.uid;
	await net.createHwb(email, pw);
	await afterSignIn(net, before);
	if(!acct.info.verified) acctMsg(`Account made. We've sent a link to ${email}: click it, then press "I've clicked the link".`, true);
}));
$("hwbLogin").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const [email, pw] = hwbInputs();
	const net = await connect(), before = net.uid;
	await net.loginHwb(email, pw);
	await afterSignIn(net, before);
}));
$("hwbPw").addEventListener("keydown", e => { if(e.key === "Enter") $("hwbLogin").click(); });
$("hwbForgot").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const [email] = hwbInputs(false);
	await (await connect()).resetPassword(email);
	acctMsg(`If ${email} has an account, a password reset link is on its way. Check Junk too.`, true);
}));
$("verifyCheck").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	const net = await connect();
	const ok = await net.checkVerified();
	acct.info = net.account();
	renderAccount();
	openAccount();
	acctMsg(ok ? "Email confirmed. Your stats now follow you to any computer." : "Not confirmed yet. Click the link in the email first (check Junk), then try again.", ok);
}));
$("verifyResend").addEventListener("click", e => acctAction(e.currentTarget, async () => {
	await (await connect()).resendVerification();
	acctMsg("Sent again. It can take a minute to arrive.", true);
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
	profileSyncTimer = setTimeout(() => { connect().then(n => n.saveProfile(profileForSync())).catch(() => {}); }, 1200);
}

async function recordStats(){
	if(!S.net) return;
	try {
		const st = await S.net.recordResult({ name: driverName(), hue: S.profile.hue });
		if(st){
			const note = $("resultsNote");
			const career = `Career: ${st.wins} win${st.wins === 1 ? "" : "s"}, ${st.podiums} podium${st.podiums === 1 ? "" : "s"} from ${st.races} race${st.races === 1 ? "" : "s"}.`;
			// While the highlights play, keep the note for the results screen.
			if(S.screen !== "results") (S.pendingNote = S.pendingNote || []).push(career);
			else note.textContent = [note.textContent, `Career: ${st.wins} win${st.wins === 1 ? "" : "s"}, ${st.podiums} podium${st.podiums === 1 ? "" : "s"} from ${st.races} race${st.races === 1 ? "" : "s"}.`].filter(Boolean).join(" ");
			garageNote(await garage.afterOnline());
		}
	} catch(e){ console.warn("Couldn't save race stats:", e.message || e); }
}

// ---------- Garage and admin ----------
const garage = initGarage({
	S, connect, onlineAvailable, acct, escapeHtml, audio, showScreen, placeShowcase,
	saveProfile: () => { saveProfile(); updateShowcaseTag(); },
	setCam: m => { camMode = m; }
});
function garageNote(res, toast){
	if(!res) return;
	const bits = [];
	if(res.xp > 0) bits.push(`+${res.xp} XP.`);
	if(res.levelUp) bits.push(`Level ${res.levelUp}!`);
	if(res.levelUp || (res.unlocked && res.unlocked.length)) setTimeout(() => audio.sfx.unlock(), 900);
	if(res.unlocked && res.unlocked.length) bits.push("New in your garage: " + res.unlocked.join(", ") + ".");
	if(!bits.length) return;
	if(toast && S.race && !S.frozen) hud.toast(bits.join(" "), 3500);
	else if(S.screen !== "results"){ (S.pendingNote = S.pendingNote || []).push(...bits); }
	else{ const note = $("resultsNote"); note.textContent = [note.textContent, ...bits].filter(Boolean).join(" "); }
	$("titleLevel").textContent = garage.level;
}
$("btnGarage").addEventListener("click", () => { audio.sfx.click(); garage.open(); });
const admin = initAdmin({
	connect, escapeHtml, fmtTime, showScreen, audio,
	setCam: m => { camMode = m; },
	trackKeys: () => TRACKS.flatMap(d => d.code ? [d.id] : [d.id, d.id + "-rev"]),
	trackName: k => { const d = trackById(k.replace(/-rev$/, "")); return d ? d.name + (k.endsWith("-rev") ? " reversed" : "") : k; },
	weeks: () => [weeklyChallenge().id, weeklyChallenge(Date.now(), 1).id],
	minLapMap: () => Object.fromEntries(TRACKS.flatMap(d => (d.code ? [false] : [false, true]).map(rev => { const e = getTrack(d, rev); return [e.key, minLapMs(e)]; })))
});
$("btnAdmin").addEventListener("click", () => { audio.sfx.click(); admin.open(); });

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
refreshAccount().then(() => garage.refresh(true)).then(() => { $("titleLevel").textContent = garage.level; });
requestAnimationFrame(frame);
window.__game = S;   // handy for debugging in the console
