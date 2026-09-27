// Room chat: a panel in the lobby, and a small overlay in races and on the results screen.
// Every message is filtered before it's sent and again when it's shown (filter.js). Guests
// (no account) get the strict filter both ways, shorter messages and a slower rate, and the
// database enforces the same limits. Anyone can mute or report anyone; the admin page sees
// reports and can mute people from chat.
import { filterChat, QUICK_CHAT, cleanName } from "./filter.js";
import * as store from "./storage.js";

const KEEP = 50;                    // the host trims the room's chat to this many messages
const FEED_MS = 9000;               // how long a message stays in the race overlay
const LONG_NUMBER = /[0-9](?:[^0-9a-z]*[0-9]){7}/i;   // the same check the database makes
const $ = id => document.getElementById(id);

export function initChat(ctx){
	// ctx: { S, escapeHtml, audio, isGuest(), myName(), myHue(), mobile, onMuteChange() }
	const C = {
		net: null, msgs: [], mode: "off", blocked: false, open: false, unread: 0, expanded: null,
		muted: new Set(store.load("chatMuted", [])), lastSend: 0, lastText: "", recent: []
	};
	const esc = ctx.escapeHtml;
	const on = () => ctx.S.settings.chat !== false;

	// ----- sending -----
	function err(where, text){
		const el = $(where === "lobby" ? "lobbyChatErr" : "chatFloatErr");
		el.textContent = text || "";
		el.hidden = !text;
		clearTimeout(el._t);
		if(text) el._t = setTimeout(() => { el.hidden = true; }, 4000);
	}
	async function send(text, where){
		if(!C.net || !C.net.code || !on()) return false;
		if(C.blocked){ err(where, "The admin has switched chat off for you."); return false; }
		const guest = ctx.isGuest();
		const f = filterChat(text, guest);
		if(!f.ok){ if(f.why) err(where, f.why); ctx.audio.sfx.wrong(); return false; }
		if(LONG_NUMBER.test(f.text)){ err(where, "Long numbers aren't allowed in chat."); return false; }
		const now = Date.now();
		C.recent = C.recent.filter(t => now - t < 20000);
		if(now - C.lastSend < (guest ? 3000 : 1300) || C.recent.length >= (guest ? 4 : 6)){ err(where, "Slow down a little."); return false; }
		if(f.text.toLowerCase() === C.lastText && now - C.lastSend < 20000){ err(where, "You just said that."); return false; }
		C.lastSend = now; C.recent.push(now); C.lastText = f.text.toLowerCase();
		err(where, "");
		try {
			await C.net.sendChat({ n: String(ctx.myName()).slice(0, 20), h: ctx.myHue(), m: f.text, g: guest });
			return true;
		} catch(e){
			console.warn("Chat not sent:", e && e.message);
			err(where, "Couldn't send that. Wait a moment and try again.");
			return false;
		}
	}

	// ----- receiving -----
	function onChild(type, key, v){
		if(!C.net) return;      // left the room; its listeners go a moment later
		if(type === "removed"){ C.msgs = C.msgs.filter(m => m.key !== key); render(); return; }
		if(!v || typeof v.m !== "string" || typeof v.u !== "string") return;
		const m = Object.assign({ key, at: Date.now() }, v);
		const i = C.msgs.findIndex(x => x.key === key);
		if(i >= 0) C.msgs[i] = m; else { C.msgs.push(m); C.msgs.sort((a, b) => a.key < b.key ? -1 : 1); }
		if(type === "added" && m.u !== C.net.uid && visible(m)){
			if(C.mode === "results" && !C.expanded) C.unread++;
		}
		// The host keeps the chat short (the database only ever holds the last KEEP or so).
		if(C.net.isHost && C.msgs.length > KEEP) for(const old of C.msgs.slice(0, C.msgs.length - KEEP)) C.net.removeChat(old.key).catch(() => {});
		render();
	}
	// What a message says once filtered for whoever's reading: guests get the strict filter
	// on everything, and nobody sees a guest's message that fails it.
	function shown(m){
		if(m.u === (C.net && C.net.uid)) return m.m;
		const f = filterChat(m.m, !!m.g || ctx.isGuest());
		return f.ok ? f.text : null;
	}
	function visible(m){ return !C.muted.has(m.u) && shown(m) != null; }

	// ----- drawing -----
	const MUTE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
	const FLAG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 4h11l-2 4 2 4H6z" fill="currentColor"/></svg>';
	function line(m, withActions){
		const text = shown(m);
		const mine = C.net && m.u === C.net.uid;
		const li = document.createElement("li");
		li.className = "cm" + (mine ? " mine" : "");
		li.dataset.key = m.key;
		li.innerHTML = `<i class="cm-chip" style="background:hsl(${+m.h || 0},100%,55%)"></i><span class="cm-body"><b class="cm-name">${esc(cleanName(m.n, m.u))}</b><span class="cm-text">${esc(text)}</span></span>`;
		if(C.mode === "race" && !C.open){
			// Fade out over the feed time, carrying on from where it was before a redraw.
			li.classList.add("fade");
			li.style.animationDelay = `-${Math.min(FEED_MS, Date.now() - m.at)}ms`;
		}
		if(withActions && !mine){
			const acts = document.createElement("span");
			acts.className = "cm-acts";
			const mute = document.createElement("button");
			mute.className = "cm-act"; mute.innerHTML = MUTE_SVG;
			mute.setAttribute("aria-label", `Mute ${cleanName(m.n, m.u)}`); mute.title = "Mute";
			mute.addEventListener("click", () => { setMuted(m.u, true); });
			const rep = document.createElement("button");
			rep.className = "cm-act"; rep.innerHTML = FLAG_SVG;
			rep.setAttribute("aria-label", `Report this message from ${cleanName(m.n, m.u)}`); rep.title = "Report";
			rep.addEventListener("click", () => report(m));
			acts.append(mute, rep);
			li.appendChild(acts);
		}
		return li;
	}
	function fill(list, msgs, withActions){
		const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
		list.innerHTML = "";
		for(const m of msgs) list.appendChild(line(m, withActions));
		if(!msgs.length && withActions){
			const li = document.createElement("li");
			li.className = "cm-empty";
			li.textContent = "No messages yet. Say hi, or use a quick message.";
			list.appendChild(li);
		}
		if(atEnd || !list._seen){ list.scrollTop = list.scrollHeight; list._seen = true; }
	}
	function render(){
		const msgs = C.msgs.filter(visible);
		const guest = ctx.isGuest();
		// Lobby panel.
		const lobbyOn = C.mode === "lobby";
		if(lobbyOn){
			$("lobbyChat").classList.toggle("is-off", !on());
			$("lobbyChatNote").textContent = !on() ? "Off in Settings" : C.blocked ? "Chat is off for you" : guest ? "Guest: extra-safe chat" : "";
			fill($("lobbyChatLog"), on() ? msgs : [], true);
			$("lobbyChatInput").maxLength = guest ? 60 : 120;
			$("lobbyChatInput").disabled = $("lobbyChatSend").disabled = !on() || C.blocked;
			$("lobbyChatQuick").querySelectorAll("button").forEach(b => { b.disabled = !on() || C.blocked; });
			$("lobbyChatOff").hidden = on();
		}
		// Overlay (race feed / results dock).
		const float = $("chatFloat");
		const floatOn = on() && (C.mode === "race" || C.mode === "results");
		float.hidden = !floatOn;
		if(!floatOn) return;
		float.dataset.mode = C.mode;
		if(C.mode === "results"){
			if(C.expanded === null) C.expanded = innerWidth >= 1500;
			float.classList.toggle("open", C.expanded);
			$("chatFloatToggle").querySelector("span").textContent = C.unread ? `Chat · ${C.unread} new` : "Chat";
			$("chatFloatToggle").setAttribute("aria-expanded", String(C.expanded));
			fill($("chatFloatLog"), msgs, true);
			$("chatFloatForm").hidden = false;
			$("chatFloatQuick").hidden = false;
			$("chatFloatInput").maxLength = guest ? 60 : 120;
			$("chatFloatInput").disabled = C.blocked;
			$("chatFloatHint").hidden = true;
		}else{
			float.classList.remove("open");
			const now = Date.now();
			fill($("chatFloatLog"), C.open ? msgs.slice(-6) : msgs.filter(m => now - m.at < FEED_MS).slice(-4), false);
			$("chatFloatForm").hidden = !C.open;
			$("chatFloatQuick").hidden = true;
			$("chatFloatHint").hidden = C.open || ctx.mobile;
		}
	}

	function setMuted(uid, yes){
		if(yes) C.muted.add(uid); else C.muted.delete(uid);
		store.save("chatMuted", [...C.muted].slice(-200));
		render();
		if(ctx.onMuteChange) ctx.onMuteChange();
	}
	async function report(m){
		if(!confirm(`Report this message from ${cleanName(m.n, m.u)} to the admin? You'll stop seeing their messages too.`)) return;
		try { await C.net.reportChat(m.key, m); } catch(e){ console.warn("Report not sent", e); }
		setMuted(m.u, true);
		err(C.mode === "lobby" ? "lobby" : "float", "Reported. Thanks for looking out for everyone.");
	}

	// ----- inputs -----
	function wire(formId, inputId, quickId, where){
		$(formId).addEventListener("submit", async e => {
			e.preventDefault();
			const input = $(inputId);
			if(await send(input.value, where)) input.value = "";
			if(where === "float" && C.mode === "race") close();
		});
		const quick = $(quickId);
		for(const q of QUICK_CHAT){
			const b = document.createElement("button");
			b.type = "button"; b.className = "chat-chip"; b.textContent = q;
			b.addEventListener("click", () => { ctx.audio.sfx.click(); send(q, where); });
			quick.appendChild(b);
		}
	}
	wire("lobbyChatForm", "lobbyChatInput", "lobbyChatQuick", "lobby");
	wire("chatFloatForm", "chatFloatInput", "chatFloatQuick", "float");
	$("chatFloatInput").addEventListener("keydown", e => {
		if(e.key === "Escape" && C.mode === "race"){ e.preventDefault(); e.stopPropagation(); close(); }
	});
	$("chatFloatToggle").addEventListener("click", () => {
		ctx.audio.sfx.click();
		C.expanded = !C.expanded;
		if(C.expanded) C.unread = 0;
		render();
	});
	function openInput(){
		if(C.mode !== "race" || !on() || C.blocked) return false;
		C.open = true;
		render();
		$("chatFloatInput").focus();
		return true;
	}
	function close(){
		C.open = false;
		$("chatFloatInput").blur();
		render();
	}

	return {
		// Join a room's chat (after creating or joining the room).
		async attach(net){
			this.detach();
			C.net = net;
			C.msgs = [];
			C.unread = 0;
			C.expanded = null;
			net.watchChat(onChild);
			const [banned, muted] = await Promise.all([net.isBanned().catch(() => false), net.chatMuted().catch(() => false)]);
			C.blocked = banned || muted;
			render();
		},
		detach(){ C.net = null; C.msgs = []; C.open = false; C.mode = "off"; render(); },
		// Called every frame with where we are: "lobby", "race", "results" or "off".
		tick(mode){
			if(!C.net) mode = "off";
			if(mode !== C.mode){
				C.mode = mode;
				// The race ended while typing: let go of the keyboard.
				if(mode !== "race" && C.open){ C.open = false; $("chatFloatInput").blur(); }
				if(mode === "results") C.expanded = null;
				render();
				return;
			}
			// Let old messages fade out of the race overlay.
			if(mode === "race" && !C.open && C.msgs.length){
				const n = C.msgs.filter(m => Date.now() - m.at < FEED_MS).length;
				if(n !== C.feedCount){ C.feedCount = n; render(); }
			}
		},
		openInput, render,
		get typing(){ return C.open; },
		isMuted: uid => C.muted.has(uid),
		setMuted
	};
}
