// Admin page, only for the ACCOUNTS.admin BVS account (the database rules enforce it too).
// Rename players, reset stats, ban/unban, remove lap and weekly records, close rooms,
// read room chat and reports (and mute people from chat), and publish the
// fastest-believable lap time for every track.
const $ = id => document.getElementById(id);

export function initAdmin(ctx){
	// ctx: { connect, escapeHtml, fmtTime, showScreen, setCam, trackKeys(), trackName(key), weeks(), minLapMap(), audio }
	const A = { tab: "drivers" };
	const esc = s => ctx.escapeHtml(String(s ?? ""));
	const msg = t => { $("adminMsg").textContent = t || ""; };
	const tabs = [...$("adminTab").querySelectorAll("button")];
	tabs.forEach(b => b.addEventListener("click", () => {
		A.tab = b.dataset.v;
		tabs.forEach(x => x.setAttribute("aria-checked", String(x === b)));
		render();
	}));

	const btn = (label, cls, fn) => {
		const b = document.createElement("button");
		b.className = "back-btn admin-act " + (cls || "");
		b.textContent = label;
		b.addEventListener("click", async () => {
			b.disabled = true;
			try { await fn(); } catch(e){ msg("That didn't work: " + (e.message || e) + " (are you signed in as the admin account?)"); }
			b.disabled = false;
		});
		return b;
	};
	const table = (head, rows) => {
		const t = document.createElement("table");
		t.className = "results standings admin-table";
		t.innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
		const tb = document.createElement("tbody");
		for(const r of rows) tb.appendChild(r);
		if(!rows.length) tb.innerHTML = `<tr class="empty"><td colspan="${head.length}">Nothing here yet.</td></tr>`;
		t.appendChild(tb);
		return t;
	};
	const tr = (cells) => {
		const row = document.createElement("tr");
		for(const c of cells){
			const td = document.createElement("td");
			if(c instanceof Node) td.appendChild(c); else td.innerHTML = c;
			row.appendChild(td);
		}
		return row;
	};
	const actions = (...bs) => { const d = document.createElement("div"); d.className = "admin-acts"; bs.forEach(b => d.appendChild(b)); return d; };

	async function render(){
		const box = $("adminBody");
		box.innerHTML = '<p class="msg" style="color:var(--mute)">Loading…</p>';
		msg("");
		const net = await ctx.connect();
		if(!net.isAdmin()){ box.innerHTML = '<p class="msg err">Sign in as the admin BVS account to use this page.</p>'; return; }
		box.innerHTML = "";

		if(A.tab === "drivers"){
			const [drivers, banned] = await Promise.all([net.allDrivers(300), net.bannedList()]);
			const locks = {};
			await Promise.all(drivers.map(async d => { locks[d.id] = await net.nameLock(d.id); }));
			const rows = drivers.map(d => {
				const input = document.createElement("input");
				input.className = "text-input admin-name";
				input.value = locks[d.id] || d.n || "";
				input.maxLength = 18;
				return tr([
					`<span class="name"><i style="background:hsl(${d.h},100%,55%)"></i>${esc(d.n)}</span>${locks[d.id] ? ' <span class="tag host">Name locked</span>' : ""}${banned[d.id] ? ' <span class="tag" style="color:#ff8a8a">Banned</span>' : ""}<br><small class="dim">${esc(d.id)}</small>`,
					String(d.races || 0), String(d.wins || 0), String(d.podiums || 0),
					actions(
						input,
						btn("Rename", "", async () => { const n = input.value.trim(); if(!n) return; await net.renameDriver(d.id, n, ctx.trackKeys(), ctx.weeks()); msg(`Renamed to ${n}. They can't change it back.`); render(); }),
						locks[d.id] ? btn("Unlock name", "", async () => { await net.unlockName(d.id); render(); }) : document.createTextNode(""),
						btn("Reset stats", "danger", async () => { if(!confirm(`Reset all wins, podiums and races for ${d.n}?`)) return; await net.resetStats(d.id); render(); }),
						btn(banned[d.id] ? "Unban" : "Ban", "danger", async () => { if(!banned[d.id] && !confirm(`Ban ${d.n}? They won't be able to join rooms or post laps or stats.`)) return; await net.setBanned(d.id, !banned[d.id]); render(); })
					)
				]);
			});
			box.appendChild(table(["Driver", "Races", "Wins", "Podiums", ""], rows));
		}

		if(A.tab === "laps"){
			const sel = document.createElement("select");
			sel.className = "text-input admin-select";
			for(const k of ctx.trackKeys()){ const o = document.createElement("option"); o.value = k; o.textContent = ctx.trackName(k); sel.appendChild(o); }
			sel.value = A.lapKey || ctx.trackKeys()[0];
			sel.addEventListener("change", () => { A.lapKey = sel.value; render(); });
			box.appendChild(sel);
			const key = sel.value;
			const laps = await net.topLaps(key, 50);
			box.appendChild(table(["Pos", "Driver", "Lap", ""], laps.map((r, i) => tr([
				String(i + 1), `${esc(r.n)}<br><small class="dim">${esc(r.id)}</small>`, ctx.fmtTime(r.t),
				actions(btn("Remove", "danger", async () => { await net.removeLap(key, r.id); render(); }))
			]))));
		}

		if(A.tab === "weekly"){
			for(const w of ctx.weeks()){
				const h = document.createElement("h3");
				h.className = "opt-label";
				h.style.margin = "12px 0 6px";
				h.textContent = w;
				box.appendChild(h);
				const rows = await net.topWeekly(w, 50);
				box.appendChild(table(["Pos", "Driver", "Lap", ""], rows.map((r, i) => tr([
					String(i + 1), `${esc(r.n)}<br><small class="dim">${esc(r.id)}</small>`, ctx.fmtTime(r.t),
					actions(btn("Remove", "danger", async () => { await net.removeWeekly(w, r.id); render(); }))
				]))));
			}
		}

		if(A.tab === "rooms"){
			const rooms = await net.liveRooms();
			const rows = Object.entries(rooms).sort((a, b) => (b[1].created || 0) - (a[1].created || 0)).map(([code, r]) => {
				const players = Object.values(r.players || {});
				return tr([
					`<b>${esc(code)}</b>`, esc(r.phase || "lobby"),
					`${players.filter(p => !p.bot).length} drivers, ${players.filter(p => p.bot).length} bots<br><small class="dim">${players.map(p => esc(p.name)).join(", ")}</small>`,
					new Date(r.created || 0).toLocaleString(),
					actions(btn("Close room", "danger", async () => { if(!confirm(`Close room ${code}? Everyone in it goes back to the menu.`)) return; await net.closeRoom(code); render(); }))
				]);
			});
			box.appendChild(table(["Code", "Phase", "Who", "Made", ""], rows));
		}

		if(A.tab === "chat"){
			const [rooms, reports, mutes] = await Promise.all([net.liveRooms(), net.chatReports(), net.chatBans()]);
			const when = t => t ? new Date(t).toLocaleString() : "";
			const who = (n, uid) => `${esc(n)}<br><small class="dim">${esc(uid)}</small>`;
			const muteBtn = uid => btn(mutes[uid] ? "Unmute chat" : "Mute in chat", "danger", async () => { await net.setChatBan(uid, !mutes[uid]); await render(); msg(mutes[uid] ? "They can chat again." : "Muted: they can't send chat messages any more."); });
			const heading = text => { const h = document.createElement("h3"); h.className = "opt-label"; h.style.margin = "14px 0 6px"; h.textContent = text; box.appendChild(h); };
			heading("Reported messages");
			box.appendChild(table(["Said by", "Message", "Room", "Reported by", ""], Object.entries(reports).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).map(([id, r]) => tr([
				who(r.n, r.u), esc(r.m), `${esc(r.room)}<br><small class="dim">${when(r.t)}</small>`, `<small class="dim">${esc(r.by)}</small>`,
				actions(muteBtn(r.u), btn("Dismiss", "", async () => { await net.removeReport(id); render(); }))
			]))));
			heading("Chat in live rooms (exactly as typed, before anyone's filter)");
			const lines = [];
			for(const [code, r] of Object.entries(rooms)) for(const [key, m] of Object.entries(r.chat || {})) lines.push({ code, key, m });
			lines.sort((a, b) => (b.m.t || 0) - (a.m.t || 0));
			box.appendChild(table(["Room", "Driver", "Message", ""], lines.slice(0, 150).map(({ code, key, m }) => tr([
				`<b>${esc(code)}</b><br><small class="dim">${when(m.t)}</small>`, who(m.n, m.u) + (m.g ? ' <span class="tag">Guest</span>' : ""), esc(m.m),
				actions(muteBtn(m.u), btn("Delete", "danger", async () => { await net.removeChat(key, code); render(); }))
			]))));
			heading("Muted from chat");
			box.appendChild(table(["Player", ""], Object.keys(mutes).map(id => tr([esc(id), actions(btn("Unmute chat", "", async () => { await net.setChatBan(id, false); render(); }))]))));
		}

		if(A.tab === "news"){
			const cur = await net.announcement();
			const live = cur && cur.text && (!cur.until || Date.now() < cur.until);
			const p = document.createElement("p");
			p.className = "msg";
			p.textContent = "A message at the top of everyone's title screen until it runs out or you clear it, like: Tournament at lunch in room 12. Players can dismiss it (they'll see a new one). Keep it short.";
			box.appendChild(p);
			const ta = document.createElement("textarea");
			ta.className = "text-input admin-news";
			ta.id = "newsText";
			ta.maxLength = 200;
			ta.rows = 3;
			ta.placeholder = "Tournament at lunch in room 12";
			ta.setAttribute("aria-label", "Announcement text");
			ta.value = cur && cur.text ? cur.text : "";
			box.appendChild(ta);
			const sel = document.createElement("select");
			sel.className = "text-input admin-select";
			sel.id = "newsFor";
			sel.setAttribute("aria-label", "How long it shows");
			for(const [label, hours] of [["For 1 day", 24], ["For 3 days", 72], ["For 1 week", 168], ["Until I clear it", 0]]){ const o = document.createElement("option"); o.value = hours; o.textContent = label; sel.appendChild(o); }
			box.appendChild(sel);
			const status = document.createElement("p");
			status.className = "msg";
			status.style.color = "var(--mute)";
			status.textContent = live ? "Showing now" + (cur.until ? " until " + new Date(cur.until).toLocaleString() : ", with no end") + "." : cur && cur.text ? "The last announcement has run out." : "Nothing is showing.";
			box.appendChild(status);
			box.appendChild(actions(
				btn("Publish", "", async () => {
					const text = ta.value.trim().slice(0, 200);
					if(!text){ msg("Write something first."); return; }
					const hours = Number(sel.value), at = Date.now();
					await net.publishAnnouncement({ text, at, until: hours ? at + hours * 3600000 : 0 });
					msg("Published. It shows on everyone's title screen."); render();
				}),
				btn("Clear", "danger", async () => { await net.publishAnnouncement(null); msg("Cleared."); render(); })
			));
		}

		if(A.tab === "settings"){
			const current = (await net.minLaps()) || {};
			const map = ctx.minLapMap();
			const p = document.createElement("p");
			p.className = "msg";
			p.innerHTML = "Lap limits stop fake lap records: any lap faster than this is refused by the database. They're set about 18% below what's physically possible, so real laps are never blocked. Publish them once, and again after changing any track.";
			box.appendChild(p);
			box.appendChild(table(["Track", "Limit", "Published"], Object.entries(map).map(([k, ms]) => tr([esc(ctx.trackName(k)), ctx.fmtTime(ms), current[k] ? ctx.fmtTime(current[k]) : '<span class="dim">not yet</span>']))));
			box.appendChild(actions(btn("Publish lap limits", "", async () => { await net.publishMinLaps(map); msg("Lap limits published."); render(); })));
			const banned = await net.bannedList();
			const h = document.createElement("h3");
			h.className = "opt-label"; h.style.margin = "18px 0 6px"; h.textContent = "Banned players";
			box.appendChild(h);
			box.appendChild(table(["Player", ""], Object.keys(banned).map(id => tr([esc(id), actions(btn("Unban", "", async () => { await net.setBanned(id, false); render(); }))]))));
		}
	}

	return {
		open(){ ctx.showScreen("admin"); ctx.setCam("overview"); render(); }
	};
}
