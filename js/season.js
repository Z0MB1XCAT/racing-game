// Seasonal looks. Halloween runs through October: it comes on at the start of 1 October and goes off at the start of
// 1 November, by the player's own calendar, every year, with nothing to switch or remember. It's all looks and sound
// (the handling never changes); the one thing it adds to play is a limited paint, earned in October (see cosmetics.js).
//
// Two questions, kept apart:
//   season()  what time of year it is, by the calendar: what can be earned right now.
//   looks()   what to draw and play: the same, unless the player turned the decorations off in Settings.
// ?season=halloween (or ?season=off) in the address forces the season, to look at it out of October. It only changes
// what is drawn and played, never what is earned, so it can't be used to collect the paint.
let forced = null, decorations = true;

// The season on a date: a Date in the player's own time zone. Pure, for tests.
export function seasonAt(date){
	return date.getMonth() === 9 ? "halloween" : null;
}

export function configureSeason({ search = "", decorations: on = true } = {}){
	const q = new URLSearchParams(search).get("season");
	forced = q === "off" ? "off" : q === "halloween" ? "halloween" : null;
	decorations = on !== false;
}
export function season(now = new Date()){ return seasonAt(now); }
export function looks(now = new Date()){
	if(!decorations) return null;
	return forced === "off" ? null : forced || seasonAt(now);
}
export const halloween = () => looks() === "halloween";
