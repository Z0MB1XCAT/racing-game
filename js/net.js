// Online rooms. Everything goes through a tiny store interface with two backends:
// Firebase Realtime Database (the real thing) and a same-computer version over
// BroadcastChannel (open the game with ?localnet in two tabs to test without Firebase).
import { FIREBASE_CONFIG, firebaseReady, MAX_CARS, ACCOUNTS, P2P, SEND_RATE } from "./config.js";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const STALE_ROOM = 6 * 60 * 60 * 1000;

// BVS numbers: "bvs-" then some digits. Stored in lower case.
export function normaliseBvs(id){
	const v = String(id || "").trim().toLowerCase().replace(/\s+/g, "");
	return ACCOUNTS.bvsPattern.test(v) ? v : null;
}
const bvsEmail = id => `${id}@${ACCOUNTS.bvsEmailDomain}`;

// `what` says which sign-in method was being used, so "switched off" errors can name the right toggle.
function friendlyAuthError(e, what){
	const code = (e && e.code) || "";
	console.warn(`Sign-in problem (${what || "account"}):`, code || "", e && e.message);
	if(/verify the new email/i.test((e && e.message) || ""))
		return new Error("Firebase's email enumeration protection is blocking new accounts. Untick it under Authentication → Settings → User actions, then Save.");
	if(code === "auth/admin-restricted-operation")
		return new Error("New accounts are blocked in Firebase. Tick Enable create (sign-up) under Authentication → Settings → User actions, then Save.");
	if(code === "auth/operation-not-allowed"){
		if(what === "guest") return new Error("Guest sign-in is switched off in Firebase. Turn on Anonymous under Authentication → Sign-in method.");
		if(what === "bvs") return new Error("BVS accounts are switched off in Firebase. Turn on Email/Password under Authentication → Sign-in method.");
		if(what === "hwb") return new Error("Hwb sign-in is switched off in Firebase. Turn on Microsoft under Authentication → Sign-in method.");
	}
	const map = {
		"auth/email-already-in-use": "That BVS number already has an account. Log in instead.",
		"auth/credential-already-in-use": "That account is already in use.",
		"auth/user-not-found": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/wrong-password": "That password isn't right.",
		"auth/invalid-credential": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/invalid-login-credentials": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/weak-password": "Passwords need at least 6 characters.",
		"auth/too-many-requests": "Too many tries. Wait a minute and try again.",
		"auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
		"auth/popup-closed-by-user": "The sign-in window was closed before you finished.",
		"auth/cancelled-popup-request": "The sign-in window was closed before you finished.",
		"auth/operation-not-allowed": "This sign-in option isn't switched on in Firebase yet (see README, Accounts).",
		"auth/network-request-failed": "Couldn't reach the sign-in server. Check your connection."
	};
	if(map[code]) return new Error(map[code]);
	const msg = (e && e.message) || String(e);
	// Microsoft returns AADSTS errors when the school hasn't allowed the app.
	if(/AADSTS(65001|90094|90095|50105|500011|700016)|admin(istrator)? (consent|approval)/i.test(msg))
		return new Error("Your school's Microsoft settings don't allow signing in to this game with Hwb. Use a BVS account instead.");
	return new Error(msg.replace(/^Firebase: /, ""));
}

// ---------- Firebase backend ----------
class FirebaseStore {
	constructor(app){ this.app = app; this.auth = app.auth(); this.db = app.database(); this.offset = 0; }
	static async connect(){
		const fb = window.firebase;
		if(!fb) throw new Error("Online play couldn't load. Check your connection, or your network may be blocking Firebase.");
		const app = fb.apps.length ? fb.app() : fb.initializeApp(FIREBASE_CONFIG);
		const store = new FirebaseStore(app);
		// Keep whoever is already signed in on this browser (account or guest).
		const existing = await new Promise(r => { const off = store.auth.onAuthStateChanged(u => { off(); r(u); }); });
		let user = existing;
		if(!user){
			try { user = (await store.auth.signInAnonymously()).user; }
			catch(e){ throw friendlyAuthError(e, "guest"); }
		}
		store.uid = user.uid;
		store.db.ref(".info/serverTimeOffset").on("value", s => { store.offset = s.val() || 0; });
		return store;
	}

	// ----- accounts -----
	account(){
		const u = this.auth.currentUser;
		if(!u || u.isAnonymous) return { kind: "guest" };
		const ms = u.providerData.find(p => p.providerId === "microsoft.com");
		if(ms) return { kind: "hwb", label: ms.email || u.email || "Hwb account" };
		const email = u.email || "";
		return { kind: "bvs", label: email.split("@")[0] };
	}
	async createBvs(id, pw){
		const u = this.auth.currentUser;
		const cred = window.firebase.auth.EmailAuthProvider.credential(bvsEmail(id), pw);
		try {
			// A guest keeps their stats: the guest account becomes the BVS account.
			if(u && u.isAnonymous) await u.linkWithCredential(cred);
			else await this.auth.createUserWithEmailAndPassword(bvsEmail(id), pw);
		} catch(e){ throw friendlyAuthError(e, "bvs"); }
		return this.auth.currentUser.uid;
	}
	async loginBvs(id, pw){
		try { await this.auth.signInWithEmailAndPassword(bvsEmail(id), pw); }
		catch(e){ throw friendlyAuthError(e, "bvs"); }
		return this.auth.currentUser.uid;
	}
	async loginHwb(){
		const fb = window.firebase;
		const provider = new fb.auth.OAuthProvider("microsoft.com");
		// Work/school Microsoft accounts only, then check it's an Hwb address.
		provider.setCustomParameters({ tenant: ACCOUNTS.hwbTenant, prompt: "select_account" });
		const u = this.auth.currentUser;
		let result;
		try {
			result = u && u.isAnonymous ? await u.linkWithPopup(provider) : await this.auth.signInWithPopup(provider);
		} catch(e){
			if(e && e.code === "auth/credential-already-in-use" && e.credential){
				// This Hwb account already exists: switch to it.
				try { result = await this.auth.signInWithCredential(e.credential); } catch(e2){ throw friendlyAuthError(e2, "hwb"); }
			}else throw friendlyAuthError(e, "hwb");
		}
		const user = result.user;
		const ms = user.providerData.find(p => p.providerId === "microsoft.com");
		const email = ((ms && ms.email) || user.email || "").toLowerCase();
		if(!ACCOUNTS.hwbDomains.some(d => email.endsWith("@" + d))){
			// Not an Hwb account: undo the link (or sign out) and say why.
			const linkedToGuest = u && u.isAnonymous && u.uid === user.uid;
			try {
				if(linkedToGuest) await user.unlink("microsoft.com");
				else if(result.additionalUserInfo && result.additionalUserInfo.isNewUser) await user.delete();
				else await this.auth.signOut();
			} catch { await this.auth.signOut().catch(() => {}); }
			throw new Error(`That isn't an Hwb account. Sign in with your school address (ending ${ACCOUNTS.hwbDomains.map(d => "@" + d).join(" or ")}).`);
		}
		return user.uid;
	}
	async signOut(){ await this.auth.signOut(); }
	now(){ return Date.now() + this.offset; }
	set(p, v){ return this.db.ref(p).set(v); }
	update(p, v){ return this.db.ref(p).update(v); }
	remove(p){ return this.db.ref(p).remove(); }
	get(p){ return this.db.ref(p).once("value").then(s => s.val()); }
	onValue(p, cb){
		const ref = this.db.ref(p), h = s => cb(s.val());
		ref.on("value", h);
		return () => ref.off("value", h);
	}
	onChild(p, cb){
		const ref = this.db.ref(p);
		const a = s => cb("added", s.key, s.val()), c = s => cb("changed", s.key, s.val()), r = s => cb("removed", s.key, null);
		ref.on("child_added", a); ref.on("child_changed", c); ref.on("child_removed", r);
		return () => { ref.off("child_added", a); ref.off("child_changed", c); ref.off("child_removed", r); };
	}
	onDisconnectRemove(p){
		const od = this.db.ref(p).onDisconnect();
		od.remove();
		return () => od.cancel();
	}
	async top(p, field, n, desc = false){
		const q = this.db.ref(p).orderByChild(field);
		const s = await (desc ? q.limitToLast(n) : q.limitToFirst(n)).once("value");
		const out = [];
		s.forEach(c => { out.push(Object.assign({ id: c.key }, c.val())); });
		return desc ? out.reverse() : out;
	}
}

// ---------- Same-computer backend (for testing) ----------
function clone(v){ return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
function parts(p){ return p.split("/").filter(Boolean); }

class LocalStore {
	static async connect(){
		const s = new LocalStore();
		await new Promise(r => setTimeout(r, 250));
		return s;
	}
	constructor(){
		// Kept in localStorage so a reload doesn't wipe accounts and boards while testing.
		try { this.tree = JSON.parse(localStorage.getItem("org-localnet-tree") || "{}"); } catch { this.tree = {}; }
		this.listeners = new Set();
		this.onLeave = [];
		// Per-tab identity that survives a reload, so account switching can be tested.
		let saved = null;
		// (A window opened from another tab inherits its sessionStorage, so it starts fresh.)
		try { if(!window.opener) saved = JSON.parse(sessionStorage.getItem("org-localnet-id") || "null"); } catch {}
		this.uid = (saved && saved.uid) || "local-" + Math.random().toString(36).slice(2, 9);
		this.acct = (saved && saved.acct) || { kind: "guest" };
		this.saveId();
		this.chan = new BroadcastChannel("org-gp-localnet");
		this.gotSnap = false;
		this.chan.onmessage = e => {
			const m = e.data;
			if(m.t === "hello") this.chan.postMessage({ t: "snap", to: m.from, tree: this.tree });
			else if(m.t === "snap" && m.to === this.uid && !this.gotSnap){ this.gotSnap = true; this.tree = m.tree || {}; this.notify(); }
			else if(m.t === "op") this.apply(m.op);
		};
		this.chan.postMessage({ t: "hello", from: this.uid });
		addEventListener("pagehide", () => { for(const p of this.onLeave) this.remove(p); });
	}
	now(){ return Date.now(); }
	saveId(){ try { sessionStorage.setItem("org-localnet-id", JSON.stringify({ uid: this.uid, acct: this.acct })); } catch {} }

	// Pretend accounts for ?localnet testing. Nothing here is secure; it never touches Firebase.
	account(){ return this.acct; }
	async createBvs(id, pw){
		if(pw.length < 6) throw new Error("Passwords need at least 6 characters.");
		if(this.read("_accounts/" + id)) throw new Error("That BVS number already has an account. Log in instead.");
		await this.set("_accounts/" + id, { pw, uid: this.uid });
		this.acct = { kind: "bvs", label: id }; this.saveId();
		return this.uid;
	}
	async loginBvs(id, pw){
		const a = this.read("_accounts/" + id);
		if(!a) throw new Error("There's no account for that BVS number yet. Create one first.");
		if(a.pw !== pw) throw new Error("That password isn't right.");
		this.uid = a.uid; this.acct = { kind: "bvs", label: id }; this.saveId();
		return this.uid;
	}
	async loginHwb(){ throw new Error("Hwb sign-in needs the real Firebase project; it can't be tested with ?localnet."); }
	async signOut(){ this.uid = "local-" + Math.random().toString(36).slice(2, 9); this.acct = { kind: "guest" }; this.saveId(); }

	read(p){
		let n = this.tree;
		for(const k of parts(p)){ if(n == null || typeof n !== "object") return null; n = n[k]; }
		return n === undefined ? null : n;
	}
	write(p, v){
		const ks = parts(p);
		if(!ks.length){ this.tree = v || {}; return; }
		let n = this.tree;
		const trail = [];
		for(let i = 0; i < ks.length - 1; i++){
			if(n[ks[i]] == null || typeof n[ks[i]] !== "object") n[ks[i]] = {};
			trail.push([n, ks[i]]);
			n = n[ks[i]];
		}
		const last = ks[ks.length - 1];
		if(v == null) delete n[last]; else n[last] = v;
		for(let i = trail.length - 1; i >= 0; i--){
			const [parent, k] = trail[i];
			if(parent[k] && typeof parent[k] === "object" && !Object.keys(parent[k]).length) delete parent[k];
		}
	}
	apply(op){
		if(op.t === "set") this.write(op.p, op.v);
		else if(op.t === "update") for(const k in op.v) this.write(op.p + "/" + k, op.v[k]);
		clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => { try { localStorage.setItem("org-localnet-tree", JSON.stringify(Object.assign({}, this.tree, { rooms: undefined }))); } catch {} }, 300);
		this.notify();
	}
	op(op){ this.apply(op); this.chan.postMessage({ t: "op", op }); return Promise.resolve(); }
	set(p, v){ return this.op({ t: "set", p, v: clone(v) }); }
	update(p, v){ return this.op({ t: "update", p, v: clone(v) }); }
	remove(p){ return this.op({ t: "set", p, v: null }); }
	get(p){ return Promise.resolve(clone(this.read(p))); }
	notify(){
		for(const l of [...this.listeners]){
			const v = this.read(l.p);
			if(l.kind === "value"){
				const j = JSON.stringify(v);
				if(j !== l.last){ l.last = j; l.cb(clone(v)); }
			}else{
				const now = {};
				if(v && typeof v === "object") for(const k in v) now[k] = JSON.stringify(v[k]);
				for(const k in now){
					if(!(k in l.last)) l.cb("added", k, JSON.parse(now[k]));
					else if(l.last[k] !== now[k]) l.cb("changed", k, JSON.parse(now[k]));
				}
				for(const k in l.last) if(!(k in now)) l.cb("removed", k, null);
				l.last = now;
			}
		}
	}
	onValue(p, cb){
		const l = { p, kind: "value", cb, last: undefined };
		this.listeners.add(l);
		queueMicrotask(() => this.notify());
		return () => this.listeners.delete(l);
	}
	onChild(p, cb){
		const l = { p, kind: "child", cb, last: {} };
		this.listeners.add(l);
		queueMicrotask(() => this.notify());
		return () => this.listeners.delete(l);
	}
	onDisconnectRemove(p){
		this.onLeave.push(p);
		return () => { this.onLeave = this.onLeave.filter(x => x !== p); };
	}
	async top(p, field, n, desc = false){
		const v = this.read(p) || {};
		return Object.entries(v).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => desc ? b[field] - a[field] : a[field] - b[field]).slice(0, n);
	}
}

// ---------- Rooms ----------
let connecting = null;

export function onlineAvailable(){
	return firebaseReady() || localNet();
}

export function localNet(){
	return /[?&]localnet\b/.test(location.search);
}

export async function connect(){
	if(!connecting){
		connecting = (localNet() ? LocalStore.connect() : firebaseReady() ? FirebaseStore.connect() : Promise.reject(new Error("Online play isn't set up yet.")))
			.then(store => new Net(store))
			.catch(e => { connecting = null; throw e; });
	}
	return connecting;
}

export class Net {
	constructor(store){
		this.store = store;
		this.code = null;
		this.unsubs = [];
		this.cancelLeave = [];
		this.room = null;
		this.mesh = null;
		this.sent = { direct: 0, relay: 0 };
	}
	get uid(){ return this.store.uid; }
	now(){ return this.store.now(); }
	path(sub = ""){ return "rooms/" + this.code + (sub ? "/" + sub : ""); }
	get isHost(){ return !!this.room && this.room.host === this.uid; }

	async createRoom(profile, settings){
		for(let attempt = 0; attempt < 12; attempt++){
			let code = "";
			for(let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
			const existing = await this.store.get("rooms/" + code + "/created");
			if(existing && this.now() - existing < STALE_ROOM) continue;
			this.code = code;
			await this.store.set(this.path(), {
				host: this.uid,
				created: this.now(),
				phase: "lobby",
				settings,
				players: { [this.uid]: this.playerRecord(profile, true) }
			});
			this.watchPresence();
			return code;
		}
		throw new Error("Couldn't find a free room code. Try again.");
	}

	async joinRoom(code, profile){
		code = code.toUpperCase();
		const room = await this.store.get("rooms/" + code);
		if(!room || !room.host) throw new Error(`There's no room ${code}. Check the code with whoever is hosting.`);
		if(this.now() - (room.created || 0) > STALE_ROOM) throw new Error(`Room ${code} has closed. Ask the host to make a new one.`);
		const count = Object.keys(room.players || {}).length;
		if(count >= MAX_CARS && !(room.players || {})[this.uid]) throw new Error(`Room ${code} is full (${MAX_CARS} cars).`);
		this.code = code;
		await this.store.set(this.path("players/" + this.uid), this.playerRecord(profile, false));
		this.watchPresence();
		return room;
	}

	// If this tab drops off, only my own car and player entry go. The room carries on.
	watchPresence(){
		this.cancelLeave.push(this.store.onDisconnectRemove(this.path("players/" + this.uid)));
		this.cancelLeave.push(this.store.onDisconnectRemove(this.path("state/" + this.uid)));
	}

	// Host migration: when the host has gone, the longest-waiting real driver takes over.
	nextHost(room, excluding){
		const humans = Object.entries((room && room.players) || {})
			.filter(([id, p]) => !p.bot && id !== excluding)
			.sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
		return humans.length ? humans[0][0] : null;
	}
	claimHost(){ return this.store.set(this.path("host"), this.uid); }

	playerRecord(profile, ready){
		return { name: profile.name, hue: profile.hue, body: profile.body, ready: !!ready, joined: this.now(), owner: this.uid };
	}

	// cb(room) whenever anything except car positions changes; cb(null) if the room disappears.
	watchRoom(cb){
		const room = {};
		let seen = false;
		const emit = () => { this.room = room.host ? room : null; cb(this.room); };
		for(const key of ["host", "phase", "settings", "players", "race", "results", "champ"]){
			this.unsubs.push(this.store.onValue(this.path(key), v => {
				room[key] = v;
				if(key === "host"){
					if(v) seen = true;
					else if(seen){ cb(null); return; }
				}
				emit();
			}));
		}
	}

	watchState(cb){
		this.unsubs.push(this.store.onChild(this.path("state"), cb));
	}

	updateMe(partial){ return this.store.update(this.path("players/" + this.uid), partial); }
	updateSettings(partial){ return this.store.update(this.path("settings"), partial); }
	addBot(bot){
		const id = "bot-" + Math.random().toString(36).slice(2, 8);
		return this.store.set(this.path("players/" + id), Object.assign({ ready: true, joined: this.now(), owner: this.uid }, bot)).then(() => id);
	}
	removePlayer(id){
		this.store.remove(this.path("state/" + id));
		return this.store.remove(this.path("players/" + id));
	}
	startRace(race, champ){
		const u = { race, phase: "race", results: null, resultsBy: null, humans: null, state: null };
		if(champ !== undefined) u.champ = champ;
		return this.store.update(this.path(), u);
	}
	eliminate(id, order){ return this.store.set(this.path("race/elim/" + id), order); }

	// The host publishes the result. `resultsBy` is what the database rules check
	// before accepting anyone's win/podium stats for this race.
	finishRace(results, champ){
		const race = this.room && this.room.race;
		const key = `${this.code}:${race ? race.id : 0}:${race ? race.startAt : 0}`;
		const resultsBy = {};
		let humans = 0;
		for(const r of results){
			if(r.bot) continue;
			humans++;
			resultsBy[r.id] = { pos: r.status === "dnf" ? 99 : r.pos, key };
		}
		const u = { phase: "results", results, resultsBy, humans };
		if(champ !== undefined) u.champ = champ;
		return this.store.update(this.path(), u);
	}

	// Adds this race to my career stats (online races with 2+ real drivers only).
	async recordResult(profile){
		const mine = await this.store.get(this.path("resultsBy/" + this.uid));
		const humans = await this.store.get(this.path("humans"));
		if(!mine || !(humans >= 2)) return null;
		const cur = (await this.store.get("stats/" + this.uid)) || {};
		if(cur.last === mine.key) return cur;
		const next = {
			n: String(profile.name).slice(0, 20), h: profile.hue,
			races: (cur.races || 0) + 1,
			wins: (cur.wins || 0) + (mine.pos === 1 ? 1 : 0),
			podiums: (cur.podiums || 0) + (mine.pos <= 3 ? 1 : 0),
			last: mine.key, room: this.code, at: this.now()
		};
		await this.store.set("stats/" + this.uid, next);
		return next;
	}
	topDrivers(field = "wins", n = 25){ return this.store.top("stats", field, n, true); }
	myStats(){ return this.store.get("stats/" + this.uid); }
	backToLobby(){ return this.store.update(this.path(), { phase: "lobby", race: null, state: null, champ: null }); }
	// Car updates go over direct links where there are any, and through Firebase only
	// while at least one driver in the room is not connected directly.
	sendState(id, s){
		if(this.mesh) this.mesh.broadcast(id, s);
		if(this.mesh && this.mesh.allDirect()){ this.sent.direct++; return; }
		this.sent.relay++;
		return this.store.set(this.path("state/" + id), s);
	}
	sendRate(){ return this.mesh && this.mesh.allDirect() ? P2P.rate : SEND_RATE; }

	async leave(){
		if(this.mesh){ this.mesh.close(); this.mesh = null; }
		for(const u of this.unsubs) u();
		this.unsubs = [];
		for(const c of this.cancelLeave) c();
		this.cancelLeave = [];
		if(this.code){
			if(this.isHost){
				// Hand the room to the next driver, or close it if nobody's left.
				const next = this.nextHost(this.room, this.uid);
				if(next) await this.store.set(this.path("host"), next);
				else { await this.store.remove(this.path()); this.code = null; }
			}
			if(this.code){
				await this.store.remove(this.path("players/" + this.uid));
				await this.store.remove(this.path("state/" + this.uid));
			}
		}
		this.code = null;
		this.room = null;
	}

	// Shared lap records.
	async submitLap(key, ms, profile){
		const mine = await this.store.get(`laps/${key}/${this.uid}`);
		if(mine && mine.t <= ms) return false;
		await this.store.set(`laps/${key}/${this.uid}`, { n: String(profile.name).slice(0, 20), h: profile.hue, t: Math.round(ms), at: this.now() });
		return true;
	}
	topLaps(key, n = 10){ return this.store.top(`laps/${key}`, "t", n); }

	// Weekly challenge board (resets itself: each week has its own board).
	async submitWeekly(week, ms, profile){
		const mine = await this.store.get(`weekly/${week}/${this.uid}`);
		if(mine && mine.t <= ms) return false;
		await this.store.set(`weekly/${week}/${this.uid}`, { n: String(profile.name).slice(0, 20), h: profile.hue, t: Math.round(ms), at: this.now() });
		return true;
	}
	topWeekly(week, n = 10){ return this.store.top(`weekly/${week}`, "t", n); }

	// ----- accounts -----
	account(){ return this.store.account(); }
	async createBvs(id, pw){ this.store.uid = await this.store.createBvs(id, pw); }
	async loginBvs(id, pw){ this.store.uid = await this.store.loginBvs(id, pw); }
	async loginHwb(){ this.store.uid = await this.store.loginHwb(); }
	async signOut(){ await this.store.signOut(); }
	// Your driver name, colour and car follow your account between devices.
	saveProfile(p){
		if(this.account().kind === "guest") return Promise.resolve();
		return this.store.set("users/" + this.uid, { name: String(p.name).slice(0, 18), hue: p.hue, body: p.body });
	}
	loadProfile(){ return this.store.get("users/" + this.uid); }
}
