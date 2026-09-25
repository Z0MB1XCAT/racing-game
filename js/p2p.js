// Peer-to-peer car updates over WebRTC, with Firebase as the fallback.
//
// Every pair of real drivers in a room tries to open a direct data channel.
// Firebase is only used to introduce them (a few small messages per pair). While
// every other driver is connected directly, car positions skip Firebase entirely.
// If any pair can't connect (school networks often block this), positions keep going
// through Firebase as before, so nothing breaks; it just uses more of the free quota.
import { P2P } from "./config.js";

const TIMEOUT = 10000;        // give a connection attempt this long
const RETRY_AFTER = 60000;    // after 3 failed attempts, try again this much later

export class Mesh {
	// onState(fromUid, carId, state) for incoming car updates; onStatus(uid, status) when a link changes.
	constructor(net, { onState, onStatus }){
		this.net = net;
		this.store = net.store;
		this.peers = new Map();
		this.onState = onState;
		this.onStatus = onStatus || (() => {});
		this.enabled = !!P2P.enabled && typeof RTCPeerConnection !== "undefined" && !/[?&]nop2p\b/.test(location.search);
	}
	get me(){ return this.net.uid; }
	pairPath(other){ return this.net.path("rtc/" + [this.me, other].sort().join("__")); }

	// Keep one link per other real driver in the room.
	sync(players){
		if(!this.enabled || !this.net.code) return;
		const humans = Object.entries(players || {}).filter(([id, p]) => !p.bot && id !== this.me).map(([id]) => id);
		for(const id of humans) if(!this.peers.has(id)) this.peers.set(id, new Peer(this, id));
		for(const [id, peer] of this.peers) if(!humans.includes(id)){ peer.close(true); this.peers.delete(id); }
	}

	// "direct" | "connecting" | "relay"
	status(id){
		if(!this.enabled) return "relay";
		const p = this.peers.get(id);
		return p ? p.status : "connecting";
	}
	// True when nobody needs updates through Firebase.
	allDirect(){
		if(!this.enabled) return false;
		for(const p of this.peers.values()) if(p.status !== "direct") return false;
		return true;
	}
	counts(){
		let direct = 0;
		for(const p of this.peers.values()) if(p.status === "direct") direct++;
		return { direct, total: this.peers.size };
	}
	broadcast(carId, state){
		if(!this.peers.size) return;
		const msg = JSON.stringify({ id: carId, s: state });
		for(const p of this.peers.values()) p.send(msg);
	}
	close(){
		for(const p of this.peers.values()) p.close(false);
		this.peers.clear();
	}
}

class Peer {
	constructor(mesh, id){
		this.mesh = mesh;
		this.id = id;
		this.path = mesh.pairPath(id);
		this.offerer = mesh.me < id;         // one side offers, the other answers
		this.status = "connecting";
		this.attempts = 0;
		this.queue = Promise.resolve();
		this.startedAt = Date.now();
		this.unsub = mesh.store.onValue(this.path, v => { this.queue = this.queue.then(() => this.onSignal(v || {})).catch(() => {}); });
		this.timer = setInterval(() => this.check(), 2000);
		if(this.offerer) this.offer();
	}

	setStatus(s){
		if(this.status === s) return;
		this.status = s;
		this.mesh.onStatus(this.id, s);
	}

	makePc(gen){
		this.closePc();
		const pc = new RTCPeerConnection({ iceServers: P2P.iceServers });
		this.pc = pc;
		this.gen = gen;
		this.remoteSet = false;
		this.pending = [];
		this.seen = new Set();
		this.startedAt = Date.now();
		const me = this.mesh.me;
		pc.onicecandidate = e => {
			if(!e.candidate || this.pc !== pc) return;
			const key = `${gen}_${Math.random().toString(36).slice(2, 9)}`;
			this.mesh.store.set(`${this.path}/c/${me}/${key}`, JSON.parse(JSON.stringify(e.candidate.toJSON()))).catch(() => {});
		};
		pc.onconnectionstatechange = () => {
			if(this.pc === pc && (pc.connectionState === "failed" || pc.connectionState === "closed")) this.setStatus("relay");
		};
		pc.ondatachannel = e => this.useChannel(e.channel);
		return pc;
	}

	async offer(){
		this.attempts++;
		const gen = Date.now();
		const pc = this.makePc(gen);
		// Unordered and no retransmits: like UDP. A late position is useless, the next one is coming.
		this.useChannel(pc.createDataChannel("cars", { ordered: false, maxRetransmits: 0 }));
		const offer = await pc.createOffer();
		// Publish first (this resets the signalling node), then start gathering candidates.
		await this.mesh.store.set(this.path, { gen, offer: { type: offer.type, sdp: offer.sdp } });
		if(this.pc === pc) await pc.setLocalDescription(offer);
	}

	async onSignal(v){
		if(!v.gen) return;
		if(!this.offerer && v.offer && v.gen !== this.gen){
			// A new attempt from the other side: start fresh and answer it.
			const pc = this.makePc(v.gen);
			await pc.setRemoteDescription(v.offer);
			this.remoteSet = true;
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			await this.mesh.store.update(this.path, { answer: { type: answer.type, sdp: answer.sdp } });
		}
		if(!this.pc || v.gen !== this.gen) return;
		if(this.offerer && v.answer && !this.remoteSet){
			await this.pc.setRemoteDescription(v.answer);
			this.remoteSet = true;
		}
		const theirs = (v.c && v.c[this.id]) || {};
		for(const [k, cand] of Object.entries(theirs)){
			if(!k.startsWith(this.gen + "_") || this.seen.has(k)) continue;
			this.seen.add(k);
			this.pending.push(cand);
		}
		if(this.remoteSet){
			const list = this.pending;
			this.pending = [];
			for(const cand of list) await this.pc.addIceCandidate(cand).catch(() => {});
		}
	}

	useChannel(dc){
		this.dc = dc;
		dc.onopen = () => { if(this.dc === dc){ this.attempts = 0; this.setStatus("direct"); } };
		dc.onclose = () => { if(this.dc === dc) this.setStatus("relay"); };
		dc.onmessage = e => {
			let m;
			try { m = JSON.parse(e.data); } catch { return; }
			if(m && typeof m.id === "string" && m.s && typeof m.s === "object") this.mesh.onState(this.id, m.id, m.s);
		};
	}

	send(msg){
		const dc = this.dc;
		if(!dc || dc.readyState !== "open" || dc.bufferedAmount > 65536) return;
		try { dc.send(msg); } catch {}
	}

	// Timeouts and retries. Until a link is open, Firebase carries the updates.
	check(){
		if(this.status === "direct"){
			if(!this.dc || this.dc.readyState !== "open") this.setStatus("relay");
			return;
		}
		const waited = Date.now() - this.startedAt;
		if(waited < TIMEOUT) return;
		this.setStatus("relay");
		if(!this.offerer) return;
		if(this.attempts < 3 || waited > RETRY_AFTER){
			if(waited > RETRY_AFTER) this.attempts = 0;
			this.offer().catch(() => {});
		}
	}

	closePc(){
		if(this.dc){ try { this.dc.close(); } catch {} }
		if(this.pc){ try { this.pc.close(); } catch {} }
		this.dc = null;
		this.pc = null;
	}

	close(removeSignal){
		clearInterval(this.timer);
		if(this.unsub) this.unsub();
		this.closePc();
		if(removeSignal) this.mesh.store.remove(this.path).catch(() => {});
	}
}
