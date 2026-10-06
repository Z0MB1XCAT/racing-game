// Voting for the next track on the results screen. Each driver's vote is kept on their own player entry in the room (the race number it
// is for, and the track), so it never carries over to the next race. The host's game reads the votes when it starts the next race, and
// the track with the most votes is the one it uses. Pure: no screen, no network.
import { seededRandom } from "./trackgen.js";

// The tracks on the ballot: the one just raced (so "again, please" is always an option) and others picked from the race number, so
// every screen shows the same ones. n is how many in all.
export function voteCandidates(raceId, current, allIds, n = 3){
	const rand = seededRandom("vote:" + raceId);
	const others = allIds.filter(id => id !== current);
	const picks = [];
	while(picks.length < Math.min(n - 1, others.length)) picks.push(others.splice(Math.floor(rand() * others.length), 1)[0]);
	return [current, ...picks];
}

// What each candidate got. votes is { driverId: trackId }; anything not on the ballot doesn't count.
export function tally(votes, candidates){
	const counts = Object.fromEntries(candidates.map(id => [id, 0]));
	for(const id of Object.values(votes || {})) if(typeof id === "string" && Object.prototype.hasOwnProperty.call(counts, id)) counts[id]++;
	return counts;
}

// The track that won: the most votes, a tie settled by the race number (so every screen agrees), or null if nobody voted.
export function winner(counts, candidates, raceId){
	const top = Math.max(0, ...candidates.map(id => counts[id] || 0));
	if(top === 0) return null;
	const tied = candidates.filter(id => counts[id] === top);
	return tied.length === 1 ? tied[0] : tied[Math.floor(seededRandom("tie:" + raceId)() * tied.length)];
}
