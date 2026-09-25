// Track editor. Produces the same track codes as the original game's editor, so
// old codes import fine and new ones work anywhere a track code is accepted.
import { load, save, getCustomTracks, setCustomTracks } from "../js/storage.js";
import { EDITOR_ENABLED } from "../js/config.js";

// Switched off in js/config.js: send people back to the game.
if(!EDITOR_ENABLED){
	location.replace("../");
	throw new Error("Track editor is disabled");
}

const GRID_SLOTS = [[0, 0], [2, 0], [-2, 0], [0, -3], [-2, -3], [2, -3], [0, -6], [2, -6], [-2, -6], [0, -9]];
const $ = id => document.getElementById(id);
const canvas = $("board"), g = canvas.getContext("2d");

let T = { walls: [], lines: [], trees: [], arrows: [] };  // track units, y up
let tool = "wall", history = [], editingId = null;
const view = { scale: 14, ox: 0, oy: 0 };
let drag = null, spaceDown = false, hover = null;

document.body.style.visibility = "";

// ---------- Codes ----------
function toCode(t){
	const p = ([x, y]) => `${x},${y}`;
	return t.walls.map(w => `${p(w[0])}/${p(w[1])}`).join(" ") + " |" +
		t.lines.map(l => `${p(l[0])}/${p(l[1])}`).join(" ") + " |" +
		t.trees.map(p).join(" ") + " |" +
		t.arrows.map(a => `${a.x},3,${a.y}/${a.deg}`).join(" ") + " |";
}
function fromCode(code){
	const parts = String(code).replace(/<br\s*\/?>/gi, " ").trim().split("|");
	if(parts.length < 2) throw new Error("That doesn't look like a track code. It should have sections split by | characters.");
	const nums = s => (s || "").trim().split(/\s+/).filter(Boolean);
	const seg = s => nums(s).map(t => t.split("/")).filter(x => x.length === 2)
		.map(([a, b]) => [a.split(",").map(Number), b.split(",").map(Number)]).filter(([a, b]) => [...a, ...b].every(isFinite));
	const t = {
		walls: seg(parts[0]),
		lines: seg(parts[1]),
		trees: nums(parts[2]).map(s => s.split(",").map(Number)).filter(p => p.length === 2 && p.every(isFinite)),
		arrows: nums(parts[3]).map(s => { const [pos, deg] = s.split("/"); const [x, , y] = (pos || "").split(",").map(Number); return { x, y, deg: Number(deg) }; }).filter(a => [a.x, a.y, a.deg].every(isFinite))
	};
	if(!t.walls.length) throw new Error("That track code has no walls in it.");
	return t;
}

// ---------- View ----------
function resize(){
	const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
	canvas.width = Math.round(r.width * dpr);
	canvas.height = Math.round(r.height * dpr);
	if(!view.init){ view.ox = canvas.width / 2; view.oy = canvas.height * 0.62; view.scale = 14 * dpr; view.init = true; }
	draw();
}
const toScreen = ([x, y]) => [view.ox + x * view.scale, view.oy - y * view.scale];
function toGrid(e){
	const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
	const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
	return { raw: [(sx - view.ox) / view.scale, -(sy - view.oy) / view.scale], sx, sy };
}
const snap = p => [Math.round(p[0]), Math.round(p[1])];

// Zoom so the whole track (and the starting grid) fits on screen.
function fitView(){
	const pts = [[0, -3], [0, 2], ...T.walls.flat(), ...T.lines.flat(), ...T.trees];
	const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
	const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
	const dpr = window.devicePixelRatio || 1;
	view.scale = Math.max(4 * dpr, Math.min(40 * dpr, Math.min(canvas.width / (maxX - minX + 6), canvas.height / (maxY - minY + 6))));
	view.ox = canvas.width / 2 - (minX + maxX) / 2 * view.scale;
	view.oy = canvas.height / 2 + (minY + maxY) / 2 * view.scale;
	draw();
}

function draw(){
	const W = canvas.width, H = canvas.height, s = view.scale;
	g.clearRect(0, 0, W, H);
	// grid
	g.lineWidth = 1;
	const x0 = Math.floor(-view.ox / s), x1 = Math.ceil((W - view.ox) / s), y0 = Math.floor((view.oy - H) / s), y1 = Math.ceil(view.oy / s);
	g.beginPath();
	for(let x = x0; x <= x1; x++){ const sx = Math.round(view.ox + x * s) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, H); }
	for(let y = y0; y <= y1; y++){ const sy = Math.round(view.oy - y * s) + 0.5; g.moveTo(0, sy); g.lineTo(W, sy); }
	g.strokeStyle = s > 8 ? "rgba(151,163,184,.10)" : "rgba(151,163,184,.05)";
	g.stroke();
	g.beginPath();
	for(let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10){ const sx = Math.round(view.ox + x * s) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, H); }
	for(let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10){ const sy = Math.round(view.oy - y * s) + 0.5; g.moveTo(0, sy); g.lineTo(W, sy); }
	g.strokeStyle = "rgba(151,163,184,.16)";
	g.stroke();

	// starting grid and direction
	const unit = s / 5;
	for(const [x, y] of GRID_SLOTS){
		const [sx, sy] = toScreen([-x / 5, y / 5]);
		g.fillStyle = "rgba(243,245,249,.85)";
		g.fillRect(sx - unit * 0.5, sy - unit, unit, unit * 2);
	}
	const [ax, ay] = toScreen([0, 0.9]);
	g.fillStyle = "#3ddc84";
	g.beginPath(); g.moveTo(ax, ay - s * 0.9); g.lineTo(ax - s * 0.45, ay); g.lineTo(ax + s * 0.45, ay); g.fill();

	g.lineCap = "round";
	// trees
	g.fillStyle = "#1bad2c";
	for(const t of T.trees){ const [x, y] = toScreen(t); g.beginPath(); g.arc(x, y, Math.max(3, s * 0.35), 0, Math.PI * 2); g.fill(); }
	// walls
	g.strokeStyle = "#f48342";
	g.lineWidth = Math.max(2, s * 0.22);
	g.beginPath();
	for(const [a, b] of T.walls){ const [x1_, y1_] = toScreen(a), [x2, y2] = toScreen(b); g.moveTo(x1_, y1_); g.lineTo(x2, y2); }
	g.stroke();
	// lines, numbered in crossing order
	T.lines.forEach(([a, b], i) => {
		const [x1_, y1_] = toScreen(a), [x2, y2] = toScreen(b);
		g.strokeStyle = i ? "#e23b3b" : "#2580db";
		g.lineWidth = Math.max(3, s * 0.3);
		g.beginPath(); g.moveTo(x1_, y1_); g.lineTo(x2, y2); g.stroke();
		g.fillStyle = "#f3f5f9";
		g.font = `800 ${Math.max(12, s * 0.9)}px "Barlow Condensed", sans-serif`;
		g.textAlign = "center";
		g.fillText(i ? String(i) : "START", (x1_ + x2) / 2, (y1_ + y2) / 2 - Math.max(6, s * 0.4));
	});
	// arrows
	g.strokeStyle = "#ff3a3a";
	g.lineWidth = Math.max(2, s * 0.18);
	for(const a of T.arrows){
		const ang = (90 - a.deg) * Math.PI / 180;
		const [x, y] = toScreen([a.x, a.y]);
		const ex = x - Math.cos(ang) * s * 0.7, ey = y - Math.sin(ang) * s * 0.7;
		g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
		g.fillStyle = "#ff3a3a"; g.beginPath(); g.arc(x, y, Math.max(2.5, s * 0.16), 0, Math.PI * 2); g.fill();
	}
	// eraser cursor
	if(tool === "erase" && hover){
		g.strokeStyle = "rgba(243,245,249,.6)"; g.lineWidth = 1.5;
		g.beginPath(); g.arc(hover.sx, hover.sy, s * 0.8, 0, Math.PI * 2); g.stroke();
	}
}

// ---------- Editing ----------
function remember(){ history.push(JSON.stringify(T)); if(history.length > 200) history.shift(); }
function changed(){ save("editorDraft", { name: $("trackName").value, t: T, id: editingId }); warnings(); draw(); }

function eraseAt(p){
	const near = (q, r = 0.8) => Math.hypot(q[0] - p[0], q[1] - p[1]) < r;
	const before = JSON.stringify(T);
	T.walls = T.walls.filter(([a, b]) => !near(a) && !near(b));
	T.lines = T.lines.filter(([a, b]) => !near(a) && !near(b));
	T.trees = T.trees.filter(t => !near(t));
	T.arrows = T.arrows.filter(a => !near([a.x, a.y]));
	return before !== JSON.stringify(T);
}

canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("pointerdown", e => {
	canvas.setPointerCapture(e.pointerId);
	const m = toGrid(e);
	if(e.button === 2 || e.button === 1 || spaceDown){ drag = { pan: true, sx: m.sx, sy: m.sy, ox: view.ox, oy: view.oy }; canvas.style.cursor = "grabbing"; return; }
	const p = snap(m.raw);
	remember();
	if(tool === "wall") T.walls.push([p, p.slice()]);
	else if(tool === "line") T.lines.push([p, p.slice()]);
	else if(tool === "tree") T.trees.push(p);
	else if(tool === "arrow") T.arrows.push({ x: p[0], y: p[1], deg: 90, sx: m.sx, sy: m.sy });
	else if(tool === "erase" && !eraseAt(m.raw)) history.pop();
	drag = { tool, start: p, sx: m.sx, sy: m.sy };
	changed();
});
canvas.addEventListener("pointermove", e => {
	const m = toGrid(e);
	hover = m;
	if(!drag){ if(tool === "erase") draw(); return; }
	if(drag.pan){ view.ox = drag.ox + (m.sx - drag.sx); view.oy = drag.oy + (m.sy - drag.sy); draw(); return; }
	const p = snap(m.raw);
	if(drag.tool === "wall") T.walls[T.walls.length - 1][1] = p;
	else if(drag.tool === "line") T.lines[T.lines.length - 1][1] = p;
	else if(drag.tool === "tree"){ if(!T.trees.some(t => t[0] === p[0] && t[1] === p[1])) T.trees.push(p); }
	else if(drag.tool === "arrow"){
		const a = T.arrows[T.arrows.length - 1];
		const ang = Math.atan2(drag.sy - m.sy, drag.sx - m.sx);
		a.deg = Math.floor(90 - ang * 180 / Math.PI);
	}else if(drag.tool === "erase") eraseAt(m.raw);
	draw();
});
function endDrag(){
	if(drag && !drag.pan){
		// Drop zero-length walls and lines.
		T.walls = T.walls.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
		T.lines = T.lines.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
		for(const a of T.arrows){ delete a.sx; delete a.sy; }
		changed();
	}
	drag = null;
	canvas.style.cursor = "";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", e => {
	e.preventDefault();
	const m = toGrid(e);
	const k = Math.exp(-e.deltaY * 0.0015);
	const dpr = window.devicePixelRatio || 1;
	const ns = Math.max(4 * dpr, Math.min(60 * dpr, view.scale * k));
	view.ox = m.sx - (m.sx - view.ox) * ns / view.scale;
	view.oy = m.sy - (m.sy - view.oy) * ns / view.scale;
	view.scale = ns;
	draw();
}, { passive: false });

function setTool(t){
	tool = t;
	document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
	draw();
}
document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => setTool(b.dataset.tool)));
function undo(){ if(history.length){ T = JSON.parse(history.pop()); changed(); } }
$("undoBtn").addEventListener("click", undo);
$("clearBtn").addEventListener("click", () => {
	if(!T.walls.length && !T.lines.length && !T.trees.length && !T.arrows.length) return;
	remember();
	T = { walls: [], lines: [], trees: [], arrows: [] };
	changed();
});
addEventListener("keydown", e => {
	if(/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
	if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); undo(); return; }
	const tools = { 1: "wall", 2: "line", 3: "tree", 4: "arrow", 5: "erase" };
	if(tools[e.key]) setTool(tools[e.key]);
	if(e.code === "Space"){ spaceDown = true; canvas.style.cursor = "grab"; e.preventDefault(); }
});
addEventListener("keyup", e => { if(e.code === "Space"){ spaceDown = false; canvas.style.cursor = ""; } });

// ---------- Checks ----------
function warnings(){
	const out = [];
	if(T.walls.length < 4) out.push("Draw walls on both sides of your track (tool 1).");
	if(!T.lines.length) out.push("Draw a start line across the track just in front of the white car markers (tool 2).");
	else{
		const [a, b] = T.lines[0];
		const crossesMiddle = Math.min(a[0], b[0]) <= 0 && Math.max(a[0], b[0]) >= 0;
		const ahead = (a[1] + b[1]) / 2;
		if(!crossesMiddle || ahead < 1 || ahead > 12) out.push("Put the start line straight across the track, a few squares above the car markers, so cars cross it first.");
		if(T.lines.length < 2) out.push("Add at least one more line further round the track. Laps only count after cars cross it.");
	}
	$("warnings").innerHTML = out.length ? out.map(w => `<li>${w}</li>`).join("") : `<li class="ok">Looks ready to race.</li>`;
	return out;
}

// ---------- Code dialog ----------
let codeMode = "export";
function openCode(mode){
	codeMode = mode;
	$("codeTitle").textContent = mode === "export" ? "Track code" : "Import a track code";
	$("codeHelp").textContent = mode === "export" ? "Copied. Share it with friends, or paste it back in with Import code." : "Paste a code from this editor or the original game's editor.";
	$("codeText").value = mode === "export" ? toCode(T) : "";
	$("codeText").readOnly = mode === "export";
	$("codeErr").hidden = true;
	$("codeCancel").hidden = mode === "export";
	$("codeModal").hidden = false;
	$("codeText").focus();
	if(mode === "export"){
		$("codeText").select();
		navigator.clipboard && navigator.clipboard.writeText(toCode(T)).catch(() => { $("codeHelp").textContent = "Select the code and copy it (Ctrl+C)."; });
	}
}
$("exportBtn").addEventListener("click", () => openCode("export"));
$("importBtn").addEventListener("click", () => openCode("import"));
$("codeCancel").addEventListener("click", () => { $("codeModal").hidden = true; });
$("codeOk").addEventListener("click", () => {
	if(codeMode === "import"){
		try {
			const t = fromCode($("codeText").value);
			remember();
			T = t;
			changed();
			fitView();
		} catch(err){
			$("codeErr").textContent = err.message;
			$("codeErr").hidden = false;
			return;
		}
	}
	$("codeModal").hidden = true;
});

// ---------- Save & race ----------
$("trackName").addEventListener("input", changed);
$("raceBtn").addEventListener("click", () => {
	warnings();
	if(!T.lines.length || T.walls.length < 4){ $("warnings").firstElementChild && $("warnings").firstElementChild.scrollIntoView({ block: "nearest" }); return; }
	const list = getCustomTracks();
	const name = $("trackName").value.trim() || "My track";
	const code = toCode(T);
	if(!editingId) editingId = "trk-" + Date.now().toString(36);
	const i = list.findIndex(t => t.id === editingId);
	const entry = { id: editingId, name, code, saved: Date.now() };
	if(i >= 0) list[i] = entry; else list.push(entry);
	setCustomTracks(list);
	changed();
	location.href = "../?play=" + encodeURIComponent(editingId);
});

// ---------- Start ----------
const params = new URLSearchParams(location.search);
const editId = params.get("edit");
const existing = editId && getCustomTracks().find(t => t.id === editId);
if(existing){
	editingId = existing.id;
	$("trackName").value = existing.name;
	try { T = fromCode(existing.code); } catch {}
}else{
	const draft = load("editorDraft", null);
	if(draft && draft.t){ T = draft.t; $("trackName").value = draft.name || ""; editingId = draft.id || null; }
}
addEventListener("resize", resize);
resize();
if(T.walls.length) fitView();
warnings();
