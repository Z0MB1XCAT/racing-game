// Race styles: ways to run a race that share the same track, cars and rules of the road. They sit on top of the mode (Race, Elimination,
// Championship): a style only matters in a plain Race. Sprint and Endurance are just a different length (with a banner at the halfway
// point for long ones); the three party styles (js/party.js) change who wins. Nothing here touches the handling.
import { PARTY } from "./party.js";

export const STYLES = [
	{ id: "standard", name: "Race", help: "First across the line after the last lap wins." },
	{ id: "sprint", name: "Sprint", laps: 2, help: "A short, sharp race: two laps to start with." },
	{ id: "endurance", name: "Endurance", laps: 15, maxLaps: 30, help: "A long race: 15 laps to start with, up to 30, with a banner at the halfway point." },
	{ id: "potato", name: "Hot Potato", party: "potato", help: PARTY.potato.blurb },
	{ id: "mouse", name: "Cat and mouse", party: "mouse", help: PARTY.mouse.blurb },
	{ id: "crown", name: "Crown chase", party: "crown", help: PARTY.crown.blurb }
];

export const styleOf = id => STYLES.find(s => s.id === id) || STYLES[0];
// The most laps a style lets you pick.
export const maxLaps = id => styleOf(id).maxLaps || 20;

// What a style makes of a base mode and lap count: { mode, laps, rule }. Only a plain Race takes a style. A party style is run as an
// elimination (potato, cat and mouse: caught or blown-up cars are out) or a race against the clock (crown), with no lap count.
export function styleRace(id, base){
	const s = styleOf(id);
	if(base.mode !== "race" || !s.party) return { mode: base.mode, laps: base.laps, rule: null };
	return { mode: s.party === "crown" ? "race" : "elim", laps: 99, rule: s.party };
}
