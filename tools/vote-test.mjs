// Voting for the next track (js/vote.js). No browser.
//   node tools/vote-test.mjs
import { voteCandidates, tally, winner } from "../js/vote.js";
import { TRACKS } from "../js/tracks.js";

const problems = [];
const ok = (cond, msg) => { console.log("  " + (cond ? "ok  " : "FAIL") + " " + msg); if(!cond) problems.push(msg); };
const ids = TRACKS.filter(t => !t.code).map(t => t.id);

// The ballot.
const c = voteCandidates(7, "monza", ids);
ok(c.length === 3 && c[0] === "monza" && new Set(c).size === 3 && c.every(id => ids.includes(id)), "three tracks, the one just raced first, all different, all real (" + c.join(", ") + ")");
ok(JSON.stringify(voteCandidates(7, "monza", ids)) === JSON.stringify(c), "the same race number gives the same ballot on every screen");
let differs = 0; for(let r = 1; r < 40; r++) if(JSON.stringify(voteCandidates(r, "monza", ids)) !== JSON.stringify(voteCandidates(r + 1, "monza", ids))) differs++;
ok(differs > 30, "a different race gives a different ballot (" + differs + " of 39 changed)");
const seen = new Set(); for(let r = 1; r <= 300; r++) voteCandidates(r, "monza", ids).forEach(id => seen.add(id));
ok(seen.size === ids.length, "every track turns up on a ballot sometime (" + seen.size + " of " + ids.length + ")");
ok(voteCandidates(1, "layout-that-isnt-in-the-list", ids)[0] === "layout-that-isnt-in-the-list" && voteCandidates(1, "spa-moto", ids).length === 3, "the track just raced can be a layout that isn't in the main list");
ok(voteCandidates(1, "a", ["a", "b"]).join() === "a,b" && voteCandidates(1, "a", ["a"]).join() === "a", "a short list gives a short ballot");

// Counting.
const cand = ["monza", "spa", "daytona"];
let t = tally({ u1: "spa", u2: "spa", u3: "monza", u4: "nope", u5: 5, u6: null, u7: "__proto__", u8: "constructor" }, cand);
ok(t.monza === 1 && t.spa === 2 && t.daytona === 0, "votes are counted per track; ones not on the ballot, wrong types and prototype names don't count");
ok(Object.values(tally(null, cand)).every(n => n === 0) && Object.values(tally({}, cand)).every(n => n === 0), "no votes is all zeros, no error");

// The winner.
ok(winner(t, cand, 1) === "spa", "the most votes wins");
ok(winner({ monza: 0, spa: 0, daytona: 0 }, cand, 1) === null, "nobody voting gives no winner (the host keeps the track as it was)");
const tie = { monza: 2, spa: 2, daytona: 1 };
ok(["monza", "spa"].includes(winner(tie, cand, 5)) && winner(tie, cand, 5) === winner(tie, cand, 5), "a tie goes to one of the tied tracks, the same one on every screen");
let m = 0, s = 0; for(let r = 1; r <= 400; r++){ const w = winner(tie, cand, r); if(w === "monza") m++; else if(w === "spa") s++; else m = s = -1e9; }
ok(m > 130 && s > 130 && m + s === 400, "and over many races a tie is settled both ways about equally (" + m + " / " + s + ")");
ok(winner({ monza: 1, spa: 1, daytona: 1 }, cand, 3) !== null, "a three-way tie still gives an answer");
ok(winner({ monza: 3 }, ["monza", "spa"], 2) === "monza", "a track with no entry counts as no votes");

if(problems.length){ console.log("\n" + problems.length + " problem(s)"); process.exit(1); }
console.log("\nvote-test: OK");
