// Online rooms. Everything goes through a tiny store interface with two backends:
// Firebase Realtime Database (the real thing) and a same-computer version over
// BroadcastChannel (open the game with ?localnet in two tabs to test without Firebase).
import { FIREBASE_CONFIG, firebaseReady, MAX_CARS, ACCOUNTS, P2P, SEND_RATE } from "./config.js";
import { champStandings } from "./champ.js";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const STALE_ROOM = 6 * 60 * 60 * 1000;

// BVS numbers: "bvs-" then some digits. Stored in lower case.
export function normaliseBvs(id){
	const v = String(id || "").trim().toLowerCase().replace(/\s+/g, "");
	return ACCOUNTS.bvsPattern.test(v) ? v : null;
}
const bvsEmail = id => `${id}@${ACCOUNTS.bvsEmailDomain}`;

// Hwb addresses: a real school email ending in one of ACCOUNTS.hwbDomains.
export function normaliseHwb(email){
	const v = String(email || "").trim().toLowerCase();
	return /^[^@\s]+@[^@\s]+$/.test(v) && ACCOUNTS.hwbDomains.some(d => v.endsWith("@" + d)) ? v : null;
}
// Links in verification and reset emails bring people back to the game.
const backToGame = () => ({ url: location.origin + location.pathname });

// Linked BVS + Hwb: the account's real login is the Hwb email. bvsLinks/{bvs-number}
// points at it, with the email locked by the account's password (PBKDF2 + AES-GCM),
// so a BVS number can be used to log in without anyone being able to look up
// which Hwb email belongs to which number.
const te = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function linkKey(id, pw){
	const base = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveKey"]);
	return crypto.subtle.deriveKey({ name: "PBKDF2", salt: te.encode("orl-link:" + id), iterations: 150000, hash: "SHA-256" },
		base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealEmail(id, email, pw){
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await linkKey(id, pw), te.encode(email));
	return { iv: b64(iv), ct: b64(ct) };
}
// The Hwb email, or null if the password doesn't open it.
async function openEmail(id, link, pw){
	try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(link.iv) }, await linkKey(id, pw), unb64(link.ct))); }
	catch { return null; }
}
const staleLinkMsg = id => `That password doesn't match ${id}. If you changed your password, log in once with your Hwb email (that updates your BVS login too).`;
const BAD_LOGIN = ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"];

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
		if(what === "hwb") return new Error("Hwb accounts are switched off in Firebase. Turn on Email/Password under Authentication → Sign-in method.");
	}
	if(what === "hwb"){
		const hwb = {
			"auth/email-already-in-use": "That Hwb email already has an account. Log in instead, or use Forgot password.",
			"auth/user-not-found": "That Hwb email or password isn't right. New here? Use Create account. Forgotten it? Use Forgot password.",
			"auth/invalid-credential": "That Hwb email or password isn't right. New here? Use Create account. Forgotten it? Use Forgot password.",
			"auth/invalid-login-credentials": "That Hwb email or password isn't right. New here? Use Create account. Forgotten it? Use Forgot password."
		};
		if(hwb[code]) return new Error(hwb[code]);
	}
	const map = {
		"auth/email-already-in-use": "That BVS number already has an account. Log in instead.",
		"auth/invalid-email": "That doesn't look like an email address.",
		"auth/missing-email": "Type your Hwb email first.",
		"auth/unauthorized-continue-uri": "Add this site's address under Authentication → Settings → Authorized domains in Firebase.",
		"auth/invalid-continue-uri": "Add this site's address under Authentication → Settings → Authorized domains in Firebase.",
		"auth/credential-already-in-use": "That account is already in use.",
		"auth/requires-recent-login": "Log out and back in, then try again.",
		"auth/user-not-found": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/wrong-password": "That password isn't right.",
		"auth/invalid-credential": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/invalid-login-credentials": "That BVS number or password isn't right. If you haven't made an account yet, use Create account.",
		"auth/weak-password": "Passwords need at least 6 characters.",
		"auth/too-many-requests": "Too many tries. Wait a minute and try again.",
		"auth/operation-not-allowed": "This sign-in option isn't switched on in Firebase yet (see README, Accounts).",
		"auth/network-request-failed": "Couldn't reach the sign-in server. Check your connection."
	};
	if(map[code]) return new Error(map[code]);
	const msg = (e && e.message) || String(e);
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
		const email = (u.email || "").toLowerCase();
		if(email.endsWith("@" + ACCOUNTS.bvsEmailDomain)) return { kind: "bvs", label: email.split("@")[0] };
		return { kind: "hwb", label: email, verified: !!u.emailVerified };
	}
	async createBvs(id, pw){
		const u = this.auth.currentUser;
		if(await this.get("bvsLinks/" + id).catch(() => null)) throw new Error("That BVS number is linked to an Hwb account already. Use Log in.");
		const cred = window.firebase.auth.EmailAuthProvider.credential(bvsEmail(id), pw);
		try {
			// A guest keeps their stats: the guest account becomes the BVS account.
			if(u && u.isAnonymous) await u.linkWithCredential(cred);
			else await this.auth.createUserWithEmailAndPassword(bvsEmail(id), pw);
		} catch(e){ throw friendlyAuthError(e, "bvs"); }
		return this.auth.currentUser.uid;
	}
	async loginBvs(id, pw){
		try { await this.auth.signInWithEmailAndPassword(bvsEmail(id), pw); return this.auth.currentUser.uid; }
		catch(e){
			if(!BAD_LOGIN.includes(e && e.code)) throw friendlyAuthError(e, "bvs");
			// Not a plain BVS account: it may be linked to an Hwb account.
			if(!this.auth.currentUser) await this.auth.signInAnonymously().catch(() => {});
			const link = await this.get("bvsLinks/" + id).catch(() => null);
			if(!link) throw friendlyAuthError(e, "bvs");
			const email = await openEmail(id, link, pw);
			if(!email) throw new Error(staleLinkMsg(id));
			try { await this.auth.signInWithEmailAndPassword(email, pw); }
			catch(e2){ throw BAD_LOGIN.includes(e2 && e2.code) ? new Error(staleLinkMsg(id)) : friendlyAuthError(e2, "bvs"); }
			return this.auth.currentUser.uid;
		}
	}
	// { bvs, hwb, waiting } for the signed-in account, or null if it isn't linked.
	// waiting: the Hwb email hasn't been confirmed yet (a BVS account mid-link).
	async linkInfo(){
		const u = this.auth.currentUser;
		if(!u || u.isAnonymous) return null;
		const p = await this.get("private/" + u.uid).catch(() => null);
		if(!p || !p.bvs) return null;
		return { bvs: p.bvs, hwb: p.hwb, waiting: this.account().kind === "bvs" };
	}
	async reauth(pw){
		const u = this.auth.currentUser;
		try { await u.reauthenticateWithCredential(window.firebase.auth.EmailAuthProvider.credential(u.email, pw)); }
		catch(e){ throw BAD_LOGIN.includes(e && e.code) ? new Error("That password isn't right.") : friendlyAuthError(e, "account"); }
	}
	// Signed in with BVS: add an Hwb email. The account moves to the Hwb email once
	// they click the link in it; the BVS number keeps working through bvsLinks.
	async linkHwb(email, pw){
		const u = this.auth.currentUser, id = this.account().label;
		await this.reauth(pw);
		await this.set("bvsLinks/" + id, Object.assign({ uid: u.uid }, await sealEmail(id, email, pw)));
		await this.set("private/" + u.uid, { bvs: id, hwb: email });
		try { await u.verifyBeforeUpdateEmail(email, backToGame()); }
		catch(e){
			await this.remove("bvsLinks/" + id).catch(() => {});
			await this.remove("private/" + u.uid).catch(() => {});
			throw friendlyAuthError(e, "hwb");
		}
	}
	// Signed in with a confirmed Hwb email: add a BVS number that isn't taken.
	async linkBvs(id, pw){
		const u = this.auth.currentUser;
		await this.reauth(pw);
		const methods = await this.auth.fetchSignInMethodsForEmail(bvsEmail(id)).catch(() => []);
		if(methods && methods.length) throw new Error(`${id} already has its own account. Log in with it and add your Hwb email from there.`);
		const taken = await this.get("bvsLinks/" + id).catch(() => null);
		if(taken && taken.uid !== u.uid) throw new Error(`${id} is already linked to another account.`);
		await this.set("bvsLinks/" + id, Object.assign({ uid: u.uid }, await sealEmail(id, u.email, pw)));
		await this.set("private/" + u.uid, { bvs: id, hwb: u.email });
	}
	// After an Hwb login: if the password was reset, re-lock the BVS link with the new one.
	async refreshLink(pw){
		try {
			const u = this.auth.currentUser;
			const p = await this.get("private/" + u.uid);
			if(!p || !p.bvs) return;
			const link = await this.get("bvsLinks/" + p.bvs);
			if(!link || link.uid !== u.uid) return;
			if(await openEmail(p.bvs, link, pw) === u.email) return;
			await this.set("bvsLinks/" + p.bvs, Object.assign({ uid: u.uid }, await sealEmail(p.bvs, u.email, pw)));
			if(p.hwb !== u.email) await this.update("private/" + u.uid, { hwb: u.email });
		} catch(e){ console.warn("Couldn't update the BVS link", e); }
	}
	// Hwb: real school email + password. A verification link goes to their inbox.
	async createHwb(email, pw){
		const u = this.auth.currentUser;
		const cred = window.firebase.auth.EmailAuthProvider.credential(email, pw);
		try {
			if(u && u.isAnonymous) await u.linkWithCredential(cred);
			else await this.auth.createUserWithEmailAndPassword(email, pw);
		} catch(e){ throw friendlyAuthError(e, "hwb"); }
		await this.auth.currentUser.sendEmailVerification(backToGame()).catch(e => { throw friendlyAuthError(e, "hwb"); });
		return this.auth.currentUser.uid;
	}
	async loginHwb(email, pw){
		try { await this.auth.signInWithEmailAndPassword(email, pw); }
		catch(e){ throw friendlyAuthError(e, "hwb"); }
		await this.refreshLink(pw);
		return this.auth.currentUser.uid;
	}
	async resendVerification(){
		try { await this.auth.currentUser.sendEmailVerification(backToGame()); }
		catch(e){ throw friendlyAuthError(e, "hwb"); }
	}
	// Re-read the account after they've clicked the link in their email.
	async checkVerified(){
		await this.auth.currentUser.reload();
		return !!this.auth.currentUser.emailVerified;
	}
	async resetPassword(email){
		try { await this.auth.sendPasswordResetEmail(email, backToGame()); }
		catch(e){ throw friendlyAuthError(e, "hwb"); }
	}
	async signOut(){ await this.auth.signOut(); }
	// Ghost laps kept with an account, so they follow you to other computers.
	// slot: "best-<trackKey>" or "weekly". The samples are stored as one string.
	async saveGhost(slot, ghost, extra){
		const u = this.auth.currentUser;
		if(!u || u.isAnonymous) return;
		await this.set(`ghosts/${u.uid}/${slot}`, Object.assign({ ms: Math.round(ghost.ms), s: JSON.stringify(ghost.s) }, extra || {}));
	}
	async loadGhost(slot){
		const u = this.auth.currentUser;
		if(!u || u.isAnonymous) return null;
		const g = await this.get(`ghosts/${u.uid}/${slot}`);
		if(!g || typeof g.s !== "string") return null;
		try { return Object.assign({}, g, { s: JSON.parse(g.s) }); } catch { return null; }
	}
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
		if(this.read("bvsLinks/" + id)) throw new Error("That BVS number is linked to an Hwb account already. Use Log in.");
		if(this.read("_accounts/" + id)) throw new Error("That BVS number already has an account. Log in instead.");
		await this.set("_accounts/" + id, { pw, uid: this.uid });
		this.acct = { kind: "bvs", label: id }; this.saveId();
		return this.uid;
	}
	async loginBvs(id, pw){
		const a = this.read("_accounts/" + id);
		if(!a){
			const link = this.read("bvsLinks/" + id);
			if(!link) throw new Error("There's no account for that BVS number yet. Create one first.");
			const email = await openEmail(id, link, pw);
			if(!email) throw new Error(staleLinkMsg(id));
			return this.loginHwb(email, pw);
		}
		if(a.pw !== pw) throw new Error("That password isn't right.");
		this.uid = a.uid; this.acct = { kind: "bvs", label: id }; this.saveId();
		return this.uid;
	}
	// No real emails here: Hwb accounts count as verified straight away.
	async createHwb(email, pw){
		if(pw.length < 6) throw new Error("Passwords need at least 6 characters.");
		const key = "_accounts/" + email.replace(/[.@]/g, "_");
		if(this.read(key)) throw new Error("That Hwb email already has an account. Log in instead, or use Forgot password.");
		await this.set(key, { pw, uid: this.uid });
		this.acct = { kind: "hwb", label: email, verified: true }; this.saveId();
		return this.uid;
	}
	async loginHwb(email, pw){
		const a = this.read("_accounts/" + email.replace(/[.@]/g, "_"));
		if(!a || a.pw !== pw) throw new Error("That Hwb email or password isn't right. New here? Use Create account. Forgotten it? Use Forgot password.");
		this.uid = a.uid; this.acct = { kind: "hwb", label: email, verified: true }; this.saveId();
		return this.uid;
	}
	async linkInfo(){
		const p = this.acct.kind !== "guest" && this.read("private/" + this.uid);
		return p && p.bvs ? { bvs: p.bvs, hwb: p.hwb, waiting: this.acct.kind === "bvs" } : null;
	}
	checkPw(pw){
		const a = this.read("_accounts/" + (this.acct.kind === "bvs" ? this.acct.label : this.acct.label.replace(/[.@]/g, "_")));
		if(!a || a.pw !== pw) throw new Error("That password isn't right.");
		return a;
	}
	// No inbox here, so the email switch happens straight away.
	async linkHwb(email, pw){
		const a = this.checkPw(pw), id = this.acct.label;
		const key = "_accounts/" + email.replace(/[.@]/g, "_");
		if(this.read(key)) throw new Error("That Hwb email already has an account. Log in instead, or use Forgot password.");
		await this.set("bvsLinks/" + id, Object.assign({ uid: this.uid }, await sealEmail(id, email, pw)));
		await this.set("private/" + this.uid, { bvs: id, hwb: email });
		await this.set(key, a);
		await this.remove("_accounts/" + id);
		this.acct = { kind: "hwb", label: email, verified: true }; this.saveId();
	}
	async linkBvs(id, pw){
		this.checkPw(pw);
		if(this.read("_accounts/" + id)) throw new Error(`${id} already has its own account. Log in with it and add your Hwb email from there.`);
		const taken = this.read("bvsLinks/" + id);
		if(taken && taken.uid !== this.uid) throw new Error(`${id} is already linked to another account.`);
		await this.set("bvsLinks/" + id, Object.assign({ uid: this.uid }, await sealEmail(id, this.acct.label, pw)));
		await this.set("private/" + this.uid, { bvs: id, hwb: this.acct.label });
	}
	async resendVerification(){}
	async checkVerified(){ return true; }
	async resetPassword(){}
	async signOut(){ this.uid = "local-" + Math.random().toString(36).slice(2, 9); this.acct = { kind: "guest" }; this.saveId(); }
	async saveGhost(slot, ghost, extra){
		if(this.acct.kind === "guest") return;
		await this.set(`ghosts/${this.uid}/${slot}`, Object.assign({ ms: Math.round(ghost.ms), s: JSON.stringify(ghost.s) }, extra || {}));
	}
	async loadGhost(slot){
		if(this.acct.kind === "guest") return null;
		const g = this.read(`ghosts/${this.uid}/${slot}`);
		if(!g || typeof g.s !== "string") return null;
		try { return Object.assign({}, g, { s: JSON.parse(g.s) }); } catch { return null; }
	}

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
		return { name: profile.name, hue: profile.hue, body: profile.body, look: profile.look || null, ready: !!ready, joined: this.now(), owner: this.uid };
	}

	// cb(room) whenever anything except car positions changes; cb(null) if the room disappears.
	watchRoom(cb){
		const room = {};
		let seen = false;
		const emit = () => { this.room = room.host ? room : null; cb(this.room); };
		for(const key of ["host", "phase", "settings", "players", "race", "results", "champ", "quali"]){
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
		const u = { race, phase: "race", results: null, resultsBy: null, humans: null, state: null, quali: null };
		if(champ !== undefined) u.champ = champ;
		return this.store.update(this.path(), u);
	}
	// Qualifying finished: publish the order. The host then starts the race from it.
	finishQuali(results){
		return this.store.update(this.path(), { phase: "qualiResults", quali: { results, order: results.map(r => r.id) } });
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
		if(champ && champ.done){
			const top = champStandings(champ)[0];
			if(top && resultsBy[top.id]) resultsBy[top.id].champ = 1;
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
			titles: (cur.titles || 0) + (mine.champ === 1 ? 1 : 0),
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
	async submitWeekly(week, ms, profile, trackKey){
		const mine = await this.store.get(`weekly/${week}/${this.uid}`);
		if(mine && mine.t <= ms) return false;
		await this.store.set(`weekly/${week}/${this.uid}`, { n: String(profile.name).slice(0, 20), h: profile.hue, t: Math.round(ms), at: this.now(), k: trackKey });
		return true;
	}
	// Last week's winner holds the crown and the #1 number this week.
	async crownHolder(lastWeek){
		const top = await this.store.top(`weekly/${lastWeek}`, "t", 1);
		return top[0] ? top[0].id : null;
	}
	// Weekly wins over past weeks (finished weeks never change, so the caller caches them).
	async weeklyWinner(week){
		const top = await this.store.top(`weekly/${week}`, "t", 1);
		return top[0] ? top[0].id : null;
	}

	// ----- moderation -----
	isAdmin(){ const a = this.account(); return a.kind === "bvs" && a.label === ACCOUNTS.admin; }
	nameLock(uid = this.uid){ return this.store.get("nameLock/" + uid); }
	isBanned(uid = this.uid){ return this.store.get("banned/" + uid).then(v => !!v); }
	minLaps(){ return this.store.get("config/minLap"); }
	// Admin only (the database rules refuse these for anyone else).
	allDrivers(n = 200){ return this.store.top("stats", "races", n, true); }
	async renameDriver(uid, name, trackKeys, weeks){
		await this.store.set("nameLock/" + uid, name);
		const st = await this.store.get("stats/" + uid);
		if(st) await this.store.update("stats/" + uid, { n: name });
		for(const k of trackKeys){ if(await this.store.get(`laps/${k}/${uid}`)) await this.store.update(`laps/${k}/${uid}`, { n: name }); }
		for(const w of weeks){ if(await this.store.get(`weekly/${w}/${uid}`)) await this.store.update(`weekly/${w}/${uid}`, { n: name }); }
	}
	unlockName(uid){ return this.store.remove("nameLock/" + uid); }
	resetStats(uid){ return this.store.remove("stats/" + uid); }
	setBanned(uid, on){ return on ? this.store.set("banned/" + uid, { at: this.now() }) : this.store.remove("banned/" + uid); }
	bannedList(){ return this.store.get("banned").then(v => v || {}); }
	removeLap(trackKey, uid){ return this.store.remove(`laps/${trackKey}/${uid}`); }
	removeWeekly(week, uid){ return this.store.remove(`weekly/${week}/${uid}`); }
	publishMinLaps(map){ return this.store.set("config/minLap", map); }
	liveRooms(){ return this.store.get("rooms").then(v => v || {}); }
	closeRoom(code){ return this.store.remove("rooms/" + code); }
	topWeekly(week, n = 10){ return this.store.top(`weekly/${week}`, "t", n); }

	// ----- accounts -----
	account(){ return this.store.account(); }
	async createBvs(id, pw){ this.store.uid = await this.store.createBvs(id, pw); }
	async loginBvs(id, pw){ this.store.uid = await this.store.loginBvs(id, pw); }
	linkInfo(){ return this.store.linkInfo(); }
	saveGhost(slot, ghost, extra){ return this.store.saveGhost(slot, ghost, extra); }
	loadGhost(slot){ return this.store.loadGhost(slot); }
	linkHwb(email, pw){ return this.store.linkHwb(email, pw); }
	linkBvs(id, pw){ return this.store.linkBvs(id, pw); }
	async createHwb(email, pw){ this.store.uid = await this.store.createHwb(email, pw); }
	async loginHwb(email, pw){ this.store.uid = await this.store.loginHwb(email, pw); }
	resendVerification(){ return this.store.resendVerification(); }
	checkVerified(){ return this.store.checkVerified(); }
	resetPassword(email){ return this.store.resetPassword(email); }
	async signOut(){ await this.store.signOut(); }
	// Your driver name, colour and car follow your account between devices.
	saveProfile(p){
		if(this.account().kind === "guest") return Promise.resolve();
		return this.store.set("users/" + this.uid, { name: String(p.name).slice(0, 18), hue: p.hue, body: p.body, look: p.look || null, solo: p.solo || null });
	}
	loadProfile(){ return this.store.get("users/" + this.uid); }
}
