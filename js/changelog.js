// What changed, newest first. After an update the game shows the entries you haven't seen once ("What's new"), and the
// How to play screen can open the latest ones again. Keep items short and plain: players read them. Add an entry at the top
// when a version has something players will notice (version = the VERSION in js/config.js that shipped it).
export const CHANGELOG = [
	{
		version: "2026.10.05-5", date: "5 October 2026", title: "Horn, rematch and invite links",
		items: [
			"Horn: hold H to honk. Pick your horn in the garage (the bicycle bell, duck, air horn, cow and train horn unlock as you level up). Everyone in the race hears it from where your car is.",
			"Rematch: on the results screen of an online race, tap Rematch. When more than half of the drivers have, the same race starts again.",
			"Invite links: in the lobby, Copy invite link, and send it to a friend. It opens the game with your room's code ready to join.",
			"Next unlock: the results screen shows the garage item you're closest to unlocking, and how far along you are.",
			"The host can switch the horn off for a whole room (Horn: Off in the lobby) for a serious race."
		]
	}
];

// "2026.10.05-12" -> [2026, 10, 5, 12]
const parts = v => String(v || "").split(/[.-]/).map(n => parseInt(n, 10) || 0);
// Like a < b: negative if a is older than b, 0 if the same, positive if newer. (-9 comes before -10, which a plain text compare gets wrong.)
export function cmpVersion(a, b){
	const x = parts(a), y = parts(b);
	for(let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if(d) return d; }
	return 0;
}
// The entries newer than `seen`, newest first, at most `max`.
export function entriesSince(seen, list = CHANGELOG, max = 3){
	return list.filter(e => cmpVersion(e.version, seen) > 0).slice(0, max);
}
