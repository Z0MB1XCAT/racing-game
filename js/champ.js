// Championships: several rounds, F1 points, standings between races.
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function newChamp(rounds, reverse, laps){
	return {
		id: Math.random().toString(36).slice(2, 8),
		rounds: rounds.slice(0, 8),
		reverse: !!reverse,
		laps,
		idx: 0,          // round being raced (or just raced)
		done: false,
		points: {},      // id -> total points
		wins: {},        // id -> wins
		bestPos: {},     // id -> best finish
		gained: {},      // id -> points from the last round
		names: {}        // id -> { n, h }, so standings still show drivers who left
	};
}

// Adds a finished round's results. Returns a new object (safe to store as-is).
export function scoreRound(champ, results){
	const c = normalise(JSON.parse(JSON.stringify(champ)));
	c.gained = {};
	for(const r of results){
		const pts = r.status === "finished" && r.pos <= POINTS.length ? POINTS[r.pos - 1] : 0;
		c.points[r.id] = (c.points[r.id] || 0) + pts;
		c.gained[r.id] = pts;
		if(r.status === "finished" && r.pos === 1) c.wins[r.id] = (c.wins[r.id] || 0) + 1;
		if(r.status === "finished") c.bestPos[r.id] = Math.min(c.bestPos[r.id] || 99, r.pos);
		c.names[r.id] = { n: r.name, h: r.hue };
	}
	c.done = c.idx >= c.rounds.length - 1;
	return c;
}

// Firebase drops empty objects, so fill them back in after a round trip.
function normalise(c){
	for(const k of ["points", "wins", "bestPos", "gained", "names"]) c[k] = c[k] || {};
	c.rounds = c.rounds || [];
	return c;
}

// Points, then wins, then best finish.
export function champStandings(c){
	c = normalise(Object.assign({}, c));
	return Object.keys(c.names || {}).map(id => ({
		id, name: c.names[id].n, hue: c.names[id].h,
		pts: c.points[id] || 0, wins: c.wins[id] || 0, best: c.bestPos[id] || 99, gained: (c.gained || {})[id] || 0
	})).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.best - b.best);
}

// Grid for the next round: championship order reversed, so the leader starts at the back.
export function champGrid(c, ids){
	const order = champStandings(c).map(s => s.id);
	return [...ids].sort((a, b) => {
		const ia = order.indexOf(a), ib = order.indexOf(b);
		return (ib < 0 ? -1 : ib) - (ia < 0 ? -1 : ia);
	});
}
