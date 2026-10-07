// The starting grid of a solo race: who is where, how many cars a track's start holds, and which rows the timing tower shows.
// (The cars' places on the road are GRID in physics.js; this only decides the order.)

// A fair shuffle (the old one, sort with a random answer, favours the middle).
export function shuffle(list, rand = Math.random){
	const a = list.slice();
	for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
	return a;
}

// The starting order: everyone shuffled, with you on the place you asked for (1 is pole, 0 is wherever the draw puts you).
// A place past the back of the grid is the back.
export function lineUp(entrants, myId, place = 0, rand = Math.random){
	const list = shuffle(entrants, rand);
	const want = Math.floor(Number(place));
	if(!(want >= 1)) return list;
	const me = list.find(e => e.id === myId);
	if(!me) return list;
	const rest = list.filter(e => e !== me);
	rest.splice(Math.min(want, list.length) - 1, 0, me);
	return rest;
}

// How many bots a track's start can hold with you: one fewer than the cars. (cars: what its start allows, MAX_SOLO_CARS at most.)
export const maxBots = cars => Math.max(1, Math.floor(Number(cars) || 0) - 1);

// A start place as words: "Random", "Pole", "P3".
export const placeName = n => !(n >= 1) ? "Random" : n === 1 ? "Pole" : "P" + n;

// Which standings the timing tower shows when there are more cars than rows: the leaders, then a window round the car it follows
// (you), so you never fall off the bottom. Returns indexes into the standings, in order.
export function towerRows(count, focus, max = 10){
	if(count <= max) return Array.from({ length: count }, (_, i) => i);
	if(!(focus >= 0)) focus = 0;
	if(focus <= max - 2) return Array.from({ length: max }, (_, i) => i);      // near the front: the top rows as always
	const head = Math.min(3, max - 4), room = max - head;
	const start = Math.max(head, Math.min(focus - Math.floor(room * 0.6), count - room));
	return [...Array.from({ length: head }, (_, i) => i), ...Array.from({ length: room }, (_, i) => start + i)];
}
