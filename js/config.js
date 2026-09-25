// Your Firebase project goes here (see README.md, "Set up online play").
// Until it's filled in, online play is switched off and everything else still works.
// These values are safe to publish: access is controlled by database.rules.json.
export const FIREBASE_CONFIG = {
	apiKey: "AIzaSyAMZmH-oWShDvC8Nw53ZBckXfp-4iS82io",
	authDomain: "racing-game-1ba96.firebaseapp.com",
	databaseURL: "https://racing-game-1ba96-default-rtdb.europe-west1.firebasedatabase.app",
	projectId: "racing-game-1ba96",
	appId: "1:824716632189:web:447b1a4b2749d116af5114"
};

// The track editor is finished but switched off for now. Set this to true to bring
// back the menu button, the editor page and "Your tracks" in the track lists.
export const EDITOR_ENABLED = false;

// Optional accounts, so stats follow a player between devices. Guests can still play.
export const ACCOUNTS = {
	bvs: true,                       // "bvs-12345" + password (Firebase Email/Password sign-in)
	hwb: true,                       // Hwb = school Microsoft 365 account (Firebase Microsoft sign-in)
	// "bvs-" followed by 3 to 8 digits. Adjust if your school's numbers look different.
	bvsPattern: /^bvs-\d{3,8}$/,
	// BVS logins are stored in Firebase as this made-up address. No email is ever sent.
	bvsEmailDomain: "bvs.invalid",
	// Only Microsoft accounts with these endings count as Hwb.
	hwbDomains: ["hwbmail.net", "hwbcymru.net"],
	// "organizations" = any school or work Microsoft account (the domain check above then limits it to Hwb).
	hwbTenant: "organizations"
};

export const GAME_NAME = "Online Racing Game";
export const EDITION = "Grand Prix";

// Room limits. Every car sends ~15 small updates a second, so keep rooms modest
// to stay well inside Firebase's free plan.
export const MAX_CARS = 10;
export const SEND_RATE = 15;

// Direct (peer-to-peer) connections between players during races. Firebase is only
// used to introduce players, and takes over automatically for anyone who can't connect.
export const P2P = {
	enabled: true,
	rate: 30,          // updates per second over direct links (Firebase fallback stays at SEND_RATE)
	iceServers: [
		{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
		{ urls: "stun:stun.cloudflare.com:3478" }
		// Optional TURN relay for networks that block direct links (see README, "Direct connections"):
		// { urls: "turn:YOUR-TURN-HOST:3478", username: "USER", credential: "PASSWORD" }
	]
};

export function firebaseReady(){
	return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.projectId);
}
