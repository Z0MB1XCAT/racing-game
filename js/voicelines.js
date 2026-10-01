// Every line the race engineer and the two commentators can say, as text. tools/build-voices.mjs turns each one into a
// spoken clip (assets/voice/*.pak); js/voice.js plays clips; js/radio.js and js/commentary.js choose which to play.
//
// A clip id is "<voice>.<key>" for a single clip, or "<voice>.<key>.<n>" where a line has a few variations. Sentences
// with a name or a number in them are stitched from clips (a name, a phrase, a name), the way a game's own commentary
// is: the pieces are written so they run together ("goes past" ... "for second place").
//
// Voices: eng = the race engineer on the team radio, lead = the lead commentator, col = the co-commentator.
export const VOICES = {
	eng: { name: "Race engineer", kokoro: "bm_lewis", speed: 0.98 },
	lead: { name: "Commentator", kokoro: "bm_george", speed: 1.08 },
	col: { name: "Co-commentator", kokoro: "bf_emma", speed: 1.02 }
};

// The computer drivers' names (main.js picks from these), so the commentary can say them.
export const BOT_NAMES = ["Pixel Pete", "Nitro Nia", "Captain Kerb", "Slipstream Sam", "Apex Ava", "Chicane Charlie", "Grid Greta", "Lockup Leo", "Drift Dana", "Pitlane Pat", "Turbo Tia"];

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export const words = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

// id -> { v: voice, t: the words to speak }
export const LINES = {};
// family -> [ids]: lines with a few variations, to pick between
export const FAMILIES = {};
function add(v, key, texts){
	const list = Array.isArray(texts) ? texts : [texts];
	const ids = list.map((t, i) => {
		const id = list.length === 1 ? `${v}.${key}` : `${v}.${key}.${i}`;
		LINES[id] = { v, t };
		return id;
	});
	FAMILIES[`${v}.${key}`] = ids;
}

// ===================================================================================================================
// The race engineer. Short and calm, the way a team radio is: "Gap ahead, one point two."
// ===================================================================================================================
const E = (k, t) => add("eng", k, t);
E("rc", ["Radio check. Loud and clear.", "Radio check, reading you loud and clear."]);
E("grid", ["Okay, here we go. Nice and clean at the start.", "Lights are coming up. Stay calm, stay smooth.", "Good luck. Keep it clean into turn one."]);
E("startGood", ["Good start. Good start.", "Nice getaway. Keep it tidy.", "Clean start. Well done."]);
E("startBad", ["Lost a few places there. It's a long race. Stay calm.", "Okay, plenty of time. Stay focused."]);
E("leading", ["You are leading. Keep it clean.", "P one. Stay focused, nice and smooth."]);
E("youAre", ["You are", "Currently"]);
E("upTo", ["Up to", "Nice move. Now"]);
E("downTo", ["Down to", "Okay, you are now"]);
for(let n = 1; n <= 12; n++) E(`P.${n}`, `P ${words(n)}.`);
E("gapAhead", ["Gap ahead,", "Car ahead,"]);
E("gapBehind", ["Gap behind,", "Car behind,"]);
E("gapLeader", ["Gap to the leader,", "The leader is"]);
E("secs", "seconds.");
E("closing", ["You are closing.", "Closing, closing.", "You are catching the car ahead."]);
E("pulling", ["The car ahead is pulling away.", "Gap is growing, we need to respond."]);
E("stable", ["Gap is stable.", "Gap is holding."]);
E("behindClosing", ["The car behind is closing.", "The car behind is catching you."]);
E("behindDropping", ["You are pulling away from the car behind.", "Gap behind is growing. Good."]);
E("aheadClose", ["Car ahead, within a second. Use the tow.", "Right behind the car ahead. Use the slipstream."]);
E("behindClose", ["Car behind, under a second. Protect the position.", "Car behind is very close. Defend."]);
E("slipUse", ["Slipstream. Use the tow.", "Get in the slipstream."]);
E("defend", ["Defend. Defend.", "Hold your line. Car behind."]);
for(let n = 1; n <= 9; n++) E(`togo.${n}`, n === 1 ? "One lap to go." : `${words(n)[0].toUpperCase() + words(n).slice(1)} laps to go.`);
E("final", ["Final lap. Final lap. Bring it home.", "Last lap. Make it count."]);
E("half", ["Halfway. Everything looks good.", "We are halfway. Keep the rhythm."]);
E("paceGood", ["Good pace. Keep it up.", "Lap times are good. Stay consistent."]);
E("paceOff", ["We need a bit more. Push now.", "You are off the pace. Push, push."]);
E("push", ["Push now. Push, push.", "Okay, push now."]);
E("smooth", ["Nice and smooth. Keep the rhythm.", "That's it. Smooth through the corners."]);
E("fastest", ["That is the fastest lap. Purple, purple!", "Fastest lap of the race. Well done."]);
E("pb", ["Personal best. Nice lap.", "That's a new personal best."]);
E("lapOk", ["Okay, that's a good lap.", "Good lap. Keep going."]);
E("deltaUp", ["Up by", "You are up by"]);
E("deltaDown", ["Down by", "You are down by"]);
E("purple", "Purple sector.");
E("green", "Green sector.");
E("contact", ["Contact. Contact. Are you okay?", "Okay, that was contact. Keep going."]);
E("wall", ["Careful with the wall.", "Okay, that was the barrier. Check you are clear."]);
E("wide", ["Stay on the track. You are running wide.", "You are running wide. Tidy it up."]);
E("wrong", ["You are facing the wrong way. Turn around. Turn around."]);
E("back", ["Okay, you are back on the track. Go, go, go.", "Back on track. Let's go."]);
E("rainStart", ["We have rain on the circuit. Take care.", "It's starting to rain. Stay focused."]);
E("rainHeavy", ["The rain is getting heavier.", "Heavy rain now. Visibility is down."]);
E("rainEase", ["The rain is easing.", "Rain is easing off."]);
E("dry", ["The track is drying out."]);
E("night", ["It is getting dark. The lights are on around the circuit."]);
E("storm", ["There is lightning in the area. Stay sharp."]);
E("elimDanger", ["Danger. You are last. Get past someone before the lap is out.", "You are in the elimination zone. Find a way past, now."]);
E("elimSafe", ["You are safe for now. Keep it up.", "Okay, you are through. Next lap."]);
E("elimOut", ["That's it, you are out. Good effort."]);
E("win", ["And that is the win! Fantastic job, fantastic job!", "P one, P one! Brilliant drive!"]);
E("podium", ["Chequered flag. Podium! Great job.", "That's a podium. Well done."]);
E("finOther", ["Chequered flag. Good effort. Bring it home.", "Okay, that's the flag. We will debrief."]);
E("finP", ["Chequered flag,", "That's the flag,"]);
E("goodJob", ["Good job.", "Well done."]);
E("qualiGo", ["Okay, push lap. Go, go, go.", "Fresh lap. Make it count. Push."]);
E("qualiP", "on the grid.");
E("trialGo", ["Okay, here we go. Nice lap.", "Clear lap ahead. Go when you are ready."]);
for(let n = 0; n < 60; n++) E(`n.${n}`, `${words(n)}.`);
for(let n = 1; n <= 9; n++) E(`pt.${n}`, `point ${words(n)}.`);

// ===================================================================================================================
// The lead commentator. Names and numbers are separate clips: "<name> <what happened> <name> <for third place>".
// ===================================================================================================================
const L = (k, t) => add("lead", k, t);
// A name said as part of a sentence (c) and at the end of one (f).
for(const name of BOT_NAMES){
	const key = name.toLowerCase().replace(/[^a-z]+/g, "_");
	L(`nm.${key}`, `${name},`);
	L(`nmf.${key}`, `${name}.`);
}
// A car with no name we can say: "Number twenty-three".
L("number", "Number");
for(let n = 0; n < 100; n++){ L(`n.${n}`, `${words(n)},`); L(`nf.${n}`, `${words(n)}.`); }
for(let n = 2; n <= 12; n++) L(`for.${n}`, `for ${ORD[n]} place!`);
for(let n = 2; n <= 12; n++) L(`takes.${n}`, `takes ${ORD[n]} place.`);

L("welcome.classic", ["Hello and welcome to the classic circuit, where it all began."]);
L("welcome.monaco", ["Hello and welcome to Monte Carlo, where there is no room for error between the barriers."]);
L("welcome.spa", ["Hello and welcome to Spa-Francorchamps, in the heart of the Ardennes."]);
L("welcome.monza", ["Hello and welcome to Monza, the Temple of Speed."]);
L("welcome.suzuka", ["Hello and welcome to Suzuka, the figure-eight circuit in Japan."]);
L("welcome.jeddah", ["Hello and welcome to Jeddah, one of the fastest street circuits in the world."]);
L("welcome.daytona", ["Hello and welcome to Daytona, and the high banking of the tri-oval."]);
L("welcome.figure8", ["Hello and welcome to Crossroads, where the track crosses itself."]);
L("welcome.glacier", ["Hello and welcome to Glacier Pass, and it is cold out there today."]);
L("welcome.custom", ["Hello and welcome to this circuit, built just for the occasion."]);
L("raceIs", ["It is a", "Today's race is a"]);
L("lapRace", ["lap race."]);
L("grid", ["The cars are lined up on the grid.", "The grid is set, and the tension is building.", "Everything is ready. Here we go."]);
L("lightsOut", ["And it's lights out, and away we go!", "Lights out! And we are racing!", "Here we go! Lights out, and away!"]);
L("leadsTurn1", ["leads them into the first corner.", "takes the lead into turn one.", "is first into the opening corner."]);
L("goes", ["goes past", "gets the move done on", "sweeps around the outside of", "dives down the inside of", "slips past", "picks off"]);
L("takesLead", ["takes the lead from", "goes into the lead, passing", "is the new race leader, taking it from"]);
L("newLeader", ["A new leader!", "Lead change!", "And that's a lead change!"]);
L("and", "and");
L("contact", ["make contact!", "touch there!", "clash wheels!"]);
L("oh", ["Oh!", "Oh, no!", "Ooh!"]);
L("hitsWall", ["hits the wall!", "is in the barrier!", "has a big moment into the wall!", "slams into the wall!"]);
L("fastestLap", ["sets the fastest lap!", "goes quickest of all!", "has the fastest lap so far!"]);
L("allOver", ["is all over the back of", "is right on the gearbox of", "is glued to the back of"]);
L("battle", ["What a battle we have here!", "They are nose to tail!", "This is a proper fight!"]);
L("finalLap", ["Final lap! Here we go!", "One lap to go! Anything could happen!", "This is it, the final lap!"]);
L("leadsFinal", ["leads on the final lap.", "has the lead, with one lap left."]);
L("takesFlag", ["takes the chequered flag!", "wins it!", "is the winner!", "crosses the line to win!"]);
L("photo", ["Photo finish!", "What a finish! It is incredibly close!"]);
L("beats", ["beats"]);
L("margin", ["by the narrowest of margins!", "by a whisker!"]);
L("isOut", ["is eliminated!", "is out. That's the end of the road.", "has been knocked out!"]);
L("rain", ["And here comes the rain.", "Rain is falling at the circuit now.", "Spots of rain, and it is getting heavier!"]);
L("dry", ["The rain is easing off."]);
L("night", ["The sun has gone down, and the floodlights are on."]);
L("thunder", ["That was a flash of lightning!"]);
L("fill", ["It is all to play for.", "Still a lot of racing left.", "The gaps are small at the front.", "They are all pushing hard."]);
L("qualiStart", ["Qualifying is under way. Everyone has a flying lap to find."]);
L("onPole", ["sets the pace in qualifying.", "goes top of the timesheets."]);
L("back", ["is back under way.", "rejoins the track."]);

// ===================================================================================================================
// The co-commentator: no names, just what it means.
// ===================================================================================================================
const C = (k, t) => add("col", k, t);
C("react", ["Oh, that was close!", "Brilliant move!", "That's what racing is all about!", "What a battle!", "You cannot give an inch there."]);
C("tip", ["The slipstream makes all the difference on the straights.", "It's all about the exit speed from the last corner.", "Smooth and tidy wins races here.", "The racing line is everything. Wide is slow.", "One mistake at this speed and it's all over.", "The barriers are very close. There's no margin for error."]);
C("gapClosing", ["The gap is coming down, and that's going to make things interesting."]);
C("gapBig", ["It's a lonely race at the front. There's a clear gap behind."]);
C("afterCrash", ["That'll sting. These barriers are unforgiving."]);
C("afterContact", ["A little contact there. Both of them will want to get on with it."]);
C("finalTip", ["Everything comes down to this lap now. Every corner counts."]);
C("winC", ["What a drive. That was a real statement."]);
C("venue.classic", ["It's a simple layout, but it rewards a tidy line."]);
C("venue.monaco", ["Monte Carlo is the ultimate test. The walls are right there, and the tunnel is a place you can't afford to get wrong."]);
C("venue.spa", ["Spa has everything. Fast sweeps, a long straight, and weather that can change in a moment."]);
C("venue.monza", ["Monza is all about the straights. Get the tow, and you can pull off the pass of the race."]);
C("venue.suzuka", ["Suzuka is a driver's circuit. The crossover bridge makes it special, and the flowing corners never let up."]);
C("venue.jeddah", ["Jeddah is flat out between the walls. One tiny mistake, and the race is over."]);
C("venue.daytona", ["On the banking it's all about the pack. The slipstream is everything, and they'll swap places all race long."]);
C("venue.figure8", ["Watch the crossing point. That's where the traffic can get very exciting."]);
C("venue.glacier", ["The setting is beautiful, but it's all about keeping the car on the road."]);

// The clips each voice needs, in the order a pack is written.
export const clipIds = voice => Object.keys(LINES).filter(id => LINES[id].v === voice);
