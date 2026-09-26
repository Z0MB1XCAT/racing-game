// The garage: pick paint, number, underglow, tyre smoke and title; see what's locked
// and how close you are. Also works out the weekly crown holder.
import { CATEGORIES, DEFAULT_LOOK, progress, isUnlocked, requirement, unlockedIds, cleanLook, item, MAX_LEVEL } from "./cosmetics.js";
import { TRACKS } from "./tracks.js";
import { weeklyChallenge } from "./weekly.js";
import * as store from "./storage.js";

const $ = id => document.getElementById(id);

// Small CSS previews for each item.
function swatch(cat, it, hue){
	const h = `hsl(${hue},100%,50%)`, hd = `hsl(${hue},85%,30%)`;
	if(cat === "livery"){
		const m = it.main || h, s2 = it.second || hd, a = it.accent || "#f4f6fa";
		switch(it.pattern){
			case "stripe": return `linear-gradient(90deg, ${m} 0 40%, ${a} 40% 60%, ${m} 60%)`;
			case "twin": return `linear-gradient(90deg, ${m} 0 28%, ${a} 28% 36%, ${m} 36% 64%, ${a} 64% 72%, ${m} 72%)`;
			case "split": return `linear-gradient(180deg, ${m} 0 55%, ${s2} 55%)`;
			case "check": return `repeating-conic-gradient(${m} 0 25%, #f4f6fa 0 50%) 0 0 / 14px 14px`;
			case "fade": return `linear-gradient(180deg, ${m} 0 35%, ${s2})`;
			case "carbon": return `linear-gradient(90deg, transparent 0 42%, ${h} 42% 58%, transparent 58%), repeating-linear-gradient(45deg, #1a1c20 0 3px, #2a2d33 3px 6px)`;
			case "neon": return `linear-gradient(180deg, ${m} 0 80%, hsl(${hue},100%,70%) 80%)`;
			case "flames": return `linear-gradient(0deg, #ffc21f 0 18%, #ff5a1f 18% 38%, ${m} 38%)`;
			case "record": return `repeating-linear-gradient(60deg, ${m} 0 8px, ${s2} 8px 12px)`;
			case "gold": return "linear-gradient(135deg, #7a5b12, #f5d76e 45%, #c9a227 60%, #7a5b12)";
			case "chrome": return "linear-gradient(135deg, #8d959d, #ffffff 45%, #b9c2ca 60%, #6d757d)";
			case "team": return `linear-gradient(90deg, ${m} 0 46%, ${a} 46% 54%, ${m} 54%), linear-gradient(0deg, ${s2} 0 30%, transparent 30%)`;
			default: return m;
		}
	}
	if(cat === "glow") return !it.color ? "repeating-linear-gradient(45deg, #1c2029 0 6px, #232834 6px 12px)"
		: it.color === "rainbow" ? "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"
		: `radial-gradient(circle, ${it.color === "hue" ? h : it.color} 0 35%, transparent 72%), #0d1118`;
	if(cat === "smoke") return `radial-gradient(circle, ${it.color === "hue" ? h : it.color === "rainbow" ? "#fff" : it.color} 0 45%, transparent 75%), ${it.color === "rainbow" ? "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" : "#0d1118"}`;
	return "";
}

export function initGarage(ctx){
	// ctx: { S, connect, onlineAvailable, acct, saveProfile, placeShowcase, showScreen, setCam, audio, escapeHtml }
	const G = { tab: "livery", P: progress(null, { solo: soloFlags() }), crown: null, uid: null, loadedAt: 0 };

	function soloFlags(){ return store.load("solo", {}); }
	function setSoloFlag(key){
		const f = soloFlags();
		if(f[key]) return false;
		f[key] = true;
		store.save("solo", f);
		return true;
	}

	// Pull everything progress depends on. Finished weeks are cached forever.
	async function refresh(force){
		const account = ctx.acct.info.kind !== "guest";
		let stats = null, records = 0, weeklyWins = 0;
		if(ctx.onlineAvailable() && (force || Date.now() - G.loadedAt > 60000)){
			try {
				const net = await ctx.connect();
				G.uid = net.uid;
				const lastWeek = weeklyChallenge(Date.now(), 1).id;
				const past = [];
				for(let w = 1; w <= 26; w++) past.push(weeklyChallenge(Date.now(), w).id);
				const cache = store.load("weeklyWinners", {});
				const missing = past.filter(id => !(id in cache));
				const [st, tops, winners] = await Promise.all([
					net.myStats(),
					Promise.all(TRACKS.flatMap(d => d.code ? [d.id] : [d.id, d.id + "-rev"]).map(k => net.topLaps(k, 1).catch(() => []))),
					Promise.all(missing.map(id => net.weeklyWinner(id).catch(() => undefined)))
				]);
				missing.forEach((id, i) => { if(winners[i] !== undefined) cache[id] = winners[i]; });
				store.save("weeklyWinners", cache);
				stats = st;
				records = tops.filter(t => t[0] && t[0].id === net.uid).length;
				weeklyWins = past.filter(id => cache[id] === net.uid).length;
				G.crown = cache[lastWeek] || null;
				G.stats = stats; G.records = records; G.weeklyWins = weeklyWins;
				G.loadedAt = Date.now();
			} catch(e){ console.warn("Garage progress:", e.message || e); }
		}else if(G.stats !== undefined){
			stats = G.stats; records = G.records || 0; weeklyWins = G.weeklyWins || 0;
		}
		G.P = progress(stats, { records, weeklyWins, account, solo: soloFlags() });
		// Keep the saved look valid (items can be lost, e.g. the #1 number).
		const clean = cleanLook(ctx.S.profile.look, G.P, isCrown());
		if(JSON.stringify(clean) !== JSON.stringify(Object.assign({}, DEFAULT_LOOK, ctx.S.profile.look))){
			ctx.S.profile.look = clean;
			ctx.saveProfile();
			ctx.placeShowcase();
		}
		return G.P;
	}

	function isCrown(){ return !!G.crown && G.crown === G.uid; }

	function render(){
		const P = G.P;
		$("garageLevel").textContent = P.level;
		const span = P.nextXp ? P.nextXp - P.levelXp : 1;
		$("garageXpBar").style.transform = `scaleX(${P.nextXp ? Math.min(1, (P.xp - P.levelXp) / span) : 1})`;
		$("garageXp").textContent = P.nextXp ? `${P.xp.toLocaleString()} / ${P.nextXp.toLocaleString()} XP` : `${P.xp.toLocaleString()} XP · max level`;
		const unlocked = unlockedIds(P).size;
		const total = CATEGORIES.reduce((a, c) => a + (c.items ? c.items.length : 0), 0);
		$("garageCount").textContent = `${unlocked} of ${total} unlocked`;
		$("garageCrown").hidden = !isCrown();
		$("garageNumberPanel").hidden = G.tab !== "number";
		$("garageItems").hidden = G.tab === "number";
		const look = Object.assign({}, DEFAULT_LOOK, ctx.S.profile.look);
		if(G.tab === "number"){
			$("garageNum").textContent = look.number != null ? look.number : "–";
			$("garageNumOne").hidden = !isCrown();
			$("garageNumNote").textContent = isCrown() ? "You won last week's challenge, so #1 is yours this week." : "#1 belongs to whoever won last week's weekly challenge.";
			return;
		}
		const cat = CATEGORIES.find(c => c.id === G.tab);
		const grid = $("garageItems");
		grid.innerHTML = "";
		for(const it of cat.items){
			const open = isUnlocked(it, P);
			const on = look[cat.id] === it.id;
			const b = document.createElement("button");
			b.className = "gitem" + (open ? "" : " locked") + (on ? " on" : "");
			b.setAttribute("aria-pressed", String(on));
			const req = open ? null : requirement(it, P);
			const sw = cat.id === "title" ? `<span class="gswatch gtitle">${ctx.escapeHtml(it.name)}</span>` : `<span class="gswatch" style="background:${swatch(cat.id, it, ctx.S.profile.hue)}"></span>`;
			b.innerHTML = `${sw}<span class="gname">${ctx.escapeHtml(it.name)}</span>
				${on ? '<span class="gtag">Equipped</span>' : open ? "" : `<span class="greq">${ctx.escapeHtml(req.text)}</span>${req.need > 1 ? `<span class="gbar"><i style="transform:scaleX(${req.frac})"></i></span><span class="gprog">${req.have} / ${req.need}</span>` : ""}`}
				${open ? "" : '<svg class="glock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/></svg>'}`;
			b.addEventListener("click", () => {
				if(!open){ ctx.audio.sfx.wrong(); b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); return; }
				ctx.audio.sfx.click();
				ctx.S.profile.look = Object.assign({}, look, { [cat.id]: it.id });
				ctx.saveProfile();
				ctx.placeShowcase();
				render();
			});
			grid.appendChild(b);
		}
	}

	function setNumber(n){
		const look = Object.assign({}, DEFAULT_LOOK, ctx.S.profile.look);
		look.number = n;
		ctx.S.profile.look = cleanLook(look, G.P, isCrown());
		ctx.saveProfile();
		ctx.placeShowcase();
		render();
	}
	$("garageNumDown").addEventListener("click", () => { const l = ctx.S.profile.look || {}; setNumber(Math.max(2, (l.number && l.number > 2 ? l.number : 3) - 1)); });
	$("garageNumUp").addEventListener("click", () => { const l = ctx.S.profile.look || {}; setNumber(Math.min(99, (l.number && l.number >= 2 ? l.number : 1) + 1)); });
	$("garageNumOne").addEventListener("click", () => setNumber(1));
	$("garageNumOff").addEventListener("click", () => setNumber(null));

	const tabs = [...$("garageTab").querySelectorAll("button")];
	tabs.forEach(b => b.addEventListener("click", () => {
		ctx.audio.sfx.click();
		G.tab = b.dataset.v;
		tabs.forEach(x => x.setAttribute("aria-checked", String(x === b)));
		render();
	}));

	async function open(){
		ctx.showScreen("garage");
		ctx.setCam("showcase");
		render();
		await refresh(true);
		render();
	}

	// Unlocks newly earned between two progress snapshots, as display names.
	function newlyUnlocked(before, after){
		const a = unlockedIds(before), b = unlockedIds(after);
		const out = [];
		for(const key of b) if(!a.has(key)){
			const [cat, id] = key.split(":");
			const it = item(cat, id);
			const label = { livery: "paint", glow: "underglow", smoke: "tyre smoke", title: "title" }[cat];
			if(it) out.push(`${it.name} ${label}`);
		}
		return out;
	}

	// After an online race: stats changed.
	async function afterOnline(){
		const before = G.P;
		G.loadedAt = 0;
		await refresh(true);
		return { unlocked: newlyUnlocked(before, G.P), levelUp: G.P.level > before.level ? G.P.level : null };
	}
	// After a solo result: tick off solo goals.
	function afterSolo(flags){
		const before = G.P;
		let changed = false;
		for(const f of flags) changed = setSoloFlag(f) || changed;
		if(!changed) return { unlocked: [] };
		G.P = progress(G.stats, { records: G.records || 0, weeklyWins: G.weeklyWins || 0, account: ctx.acct.info.kind !== "guest", solo: soloFlags() });
		return { unlocked: newlyUnlocked(before, G.P) };
	}

	return {
		open, refresh, render, afterOnline, afterSolo, soloFlags,
		get level(){ return G.P.level; },
		get crown(){ return G.crown; },
		get maxLevel(){ return MAX_LEVEL; }
	};
}
