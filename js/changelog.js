// What changed, newest first. After an update the game shows the entries you haven't seen once ("What's new"), and the
// How to play screen can open the latest ones again. Keep items short and plain: players read them. Add an entry at the top
// when a version has something players will notice (version = the VERSION in js/config.js that shipped it).
export const CHANGELOG = [
	{
		version: "2026.10.07-3", date: "7 October 2026", title: "See the graphics, and a quicker start",
		items: [
			"Settings now shows what Fast and Pretty look like, side by side. Tap a picture to choose it.",
			"The menus load the circuits' surroundings and sounds in the background, one at a time, the one you're looking at first. On a slow school connection the track behind the menu is ready sooner."
		]
	},
	{
		version: "2026.10.07-2", date: "7 October 2026", title: "Your own keys, and Auto-pause",
		items: [
			"Choose your own keys in Settings > Change keys. Each action has two, and your keys follow your account to any computer.",
			"Auto-pause: a solo race now pauses by itself when you switch to another tab or window (you can turn it off in Settings)."
		]
	},
	{
		version: "2026.10.07-1", date: "7 October 2026", title: "Smarter bots and bigger grids",
		items: [
			"Bots now have ten levels (a slider) instead of three. Rookie, Racer and Ace are levels 3, 6 and 10.",
			"Every bot has a name and a personality: Bold, Careful, Wet weather, Slipstreamer or Late charger. The results and the lobby show them.",
			"Adaptive bots (Race bots, off by default) speed up or slow down to stay within about a second of you.",
			"Race up to 19 bots and choose where you start, from pole to the back. Each track holds as many cars as its start straight allows.",
			"Restart in the pause menu keeps the same grid. Race again after the results deals a new one."
		]
	},
	{
		version: "2026.10.06-3", date: "6 October 2026", title: "Podium styles",
		items: [
			"Pick how you celebrate when you win: Confetti, Fireworks, Fizz, Flames or Rainbow (Garage > Podium). Everyone in the room sees the winner's style on the results screen, with its own jingle.",
			"Tap a style in the garage to see and hear it, even one you haven't unlocked yet. Your look code carries it too."
		]
	},
	{
		version: "2026.10.06-2", date: "6 October 2026", title: "Vote for the next track",
		items: [
			"After an online race you can vote for the next track: the one you just raced or two others. The most votes wins when the next race starts."
		]
	},
	{
		version: "2026.10.06-1", date: "6 October 2026", title: "New ways to race",
		items: [
			"Race styles (the Style row under Mode): Sprint (2 laps), Endurance (15 to 30 laps, with a halfway banner), and three party games.",
			"Hot Potato: pass the potato on by touching another car before the fuse runs out. Last car left wins.",
			"Cat and mouse: the cat catches mice by touching them. Survive until the time is up, or catch them all as the cat.",
			"Crown chase: lead the race to wear the crown. The most seconds on top wins.",
			"Wheel of chaos: a new surprise every lap, like night, fog or mirror steering.",
			"Grid: after qualifying you can start with the fastest car last."
		]
	},
	{
		version: "2026.10.05-9", date: "5 October 2026", title: "Levels to 100",
		items: [
			"Driver levels now go all the way to 100 (they stopped at 30). Past 30 your level badge turns gold.",
			"New rewards: a Gold Border for your name at level 31, the Platinum paint and Hall of Famer title at 50, the Obsidian paint and Immortal title at 75, and the Centurion title at 100."
		]
	},
	{
		version: "2026.10.05-8", date: "5 October 2026", title: "More ways to look good",
		items: [
			"Number plates: pick the plate behind your race number in the garage (Blackout, rally Plate, Chequered, Neon, Gold).",
			"Name effects: Ice, Flame, Neon, Gold or Rainbow on your name in the timing tower, over your car and in the results. Everyone sees them.",
			"Start lights: choose red, amber, ice, green or neon for the lights before a race.",
			"Four new titles to win against the bots: Wet Weather Wizard, Night Owl, Underdog and Clean Racer."
		]
	},
	{
		version: "2026.10.05-7", date: "5 October 2026", title: "Codes and announcements",
		items: [
			"Prize codes: got a code from a teacher? Garage > Prize code (or Have a prize code? on the title screen) unlocks the item for good.",
			"Look codes: Garage > Copy look code gives a line of text to send a friend. Use a look code applies one: you get what you've unlocked.",
			"Announcements: news from the admin, like a tournament at lunch, shows at the top of the title screen. You can dismiss it."
		]
	},
	{
		version: "2026.10.05-6", date: "5 October 2026", title: "Halloween",
		items: [
			"The game goes spooky all October by itself: misty menus, bats, jack-o'-lanterns by every track and a creepy tune. It switches off on 1 November. Settings > Seasonal look turns it off sooner.",
			"The Halloween challenge: the weekly challenge for 26 October to 1 November is Spa at night in fog.",
			"A limited Halloween paint, Jack-o'-Lantern (it glows in the dark), and the title Trick or Treater. Finish a lap of the Halloween challenge, or a bot race at night in fog, in October. Yours to keep.",
			"Time of day and weather in races are still whatever the host picks: only the menus and the scenery turn spooky."
		]
	},
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
