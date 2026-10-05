# Online Racing Game: Grand Prix edition

A fork of [jchabin/cars](https://github.com/jchabin/cars) (the "Online Racing Game") with
new tracks, a racing-game UI, bots, time trials, online rooms and leaderboards. **The car handling is
the original code, unchanged.** `tools/physics-equivalence.mjs` runs both versions side by side
and checks they give exactly the same results. There are two additions, and each can be switched off
per race: **slipstream**, and **soft car contact** (cars don't fling each other apart the way the
original did).

## What's in it

- **9 tracks, 19 layouts**: the original Classic track, Monaco, Spa-Francorchamps, Monza, Suzuka, Jeddah
  (at night), Daytona (tri-oval), Crossroads (a figure-8 with a flat crossing) and Glacier Pass
  (snowy switchbacks). Every track except Classic can also be raced in reverse.
- **The five F1 tracks are the real circuits**: built from their real centrelines and real
  elevation. Spa drops into Eau Rouge and climbs Raidillon (about 100 m of climb), Monaco climbs
  from Ste Devote to the Casino and runs through the tunnel, Suzuka's back straight crosses the
  Degner section on a bridge, and Jeddah is flat apart from its 12-degree banked Turn 13. Hills are
  kept to the real climbs and descents (small wobbles in the elevation data are smoothed out), and
  only corners that really have camber get it (Casino, Eau Rouge/Raidillon, Pouhon, Blanchimont,
  the Lesmos, Suzuka Turn 1, the Reverse Bank, Spoon and 130R); the rest are level side to side,
  and raised road edges get retaining walls.
  Monaco is matched corner by corner to photos: a narrower road at a larger scale so the Grand
  Hotel hairpin is a real hairpin (parallel legs, tight tip) and the Nouvelle Chicane a real
  chicane; the tunnel runs under the Fairmont hotel (red Monte-Carlo banner over the mouth, the
  white stair tower, sea fence on the way in); catch fencing along the barriers; taller buildings;
  and the harbour with moored yachts beside the track from the tunnel exit to La Rascasse. Inside, the
  tunnel has tiled walls, #MonacoGP banners and rows of ceiling lamps.
  Jeddah is built from real map data: the real buildings around the circuit (Diamond Tower,
  Sail Tower, the malls and hotels), the Red Sea coastline, the lagoon and the marina with its
  piers and yachts, parks and palms, the streets with their lamps, Al-Rahma "floating" mosque,
  and the lit-up city behind; plus the bright painted run-offs and footbridges over the track.
  In the Monaco tunnel and under the Suzuka bridge there's no rain, you hear it on the roof, and
  the engines echo.
  Spa's hills come from real corner altitudes joined by steady climbs and descents: level
  through La Source, down to Eau Rouge, steeply up Raidillon, on up Kemmel to Les Combes, down
  through Pouhon to Stavelot and back up past Blanchimont. Red and yellow kerbs and tyre walls,
  and catch fencing.
  Monza is the real Grand Prix circuit (not the old high-speed oval) traced from OpenStreetMap,
  which maps every chicane, at a larger scale with a narrower road like Monaco: the Rettifilo is a
  real right-left chicane, then the Curva Grande, the Roggia chicane, both Lesmos (leaning into the
  right), the run under the old banking to the Ascari left-right-left, the back straight and the
  Parabolica. Two laps to a race by default.
- **Daytona is the real 2.5-mile tri-oval** (not the road course), from OpenStreetMap, with its
  banking: **31 degrees in all four turns, 18 through the tri-oval** (the whole frontstretch) and
  **3 on the backstretch**, easing from one to the next the way the real transitions do. The real
  banked surface is 40 ft wide, so in the turns the outside edge is 20.6 ft (6.3 m) above the
  inside; the game's road is about three times wider than the real one next to the cars, so the
  banking rises exactly that real height (in car lengths) across it, at a gentler angle. The track
  sits on flat ground: the inside edge is level with the infield and the banking climbs to the
  outside wall, where there's a tall catch fence, with an embankment behind it. The start line,
  gantry, grid and floodlights all follow the banking. The start/finish
  line is at the apex of the tri-oval. Around it, from the real map: the huge frontstretch
  grandstand (its real outline and height, packed with fans), the pits and garages in the infield,
  and Lake Lloyd running along the backstretch.
  Hills, camber, banking, the tunnel and the
  bridge are looks only: the handling is the same flat physics as always. Corners are still opened
  up where the original car (which can't brake) needs room, and a few spots where two parts of a
  circuit run side by side are eased apart to fit barriers between them. These tracks have new lap
  record boards (Monza and Daytona got fresh ones again when they moved to the real map data). (The weekly challenge that was running when they arrived, Jeddah reversed in
  week 2026-W39, finishes on the old layout.)
- **Track layouts**: the real circuits' other layouts, picked with the Layout switch under a
  track (in solo setup, the online lobby, championships and the leaderboards). 19 in all:
  - **Monaco**: GP, and **Formula E** (2015-2019): sharp right after Sainte-Devote, along Avenue
    J.F. Kennedy (its own carriageway each way) and round a squared-off hairpin into the Nouvelle
    Chicane, then Tabac, the pool and La Rascasse, beside the harbour.
  - **Spa-Francorchamps**: GP, and **Moto** (the full lap with the old, faster Bus Stop).
  - **Monza**: GP, the **Oval** (the 1955 high-speed ring on its own, with its two bankings), and
    **GP + Oval**, a 10 km lap: the whole GP circuit, then back down the main straight (one road,
    used twice a lap) and right onto the oval, round both bankings and back to the line. Arrow
    boards at the fork show the way: the first time down the straight they close off the oval, the
    second time the GP circuit. The GP circuit passes under the north banking at the Serraglio.
  - **Suzuka**: GP, **Moto** (the bike line through the final chicane), **East** (Turns 1-2, the
    Esses and Dunlop, then the link back to the pits), **West** (Degner, the hairpin, Spoon, 130R
    and the chicane, over the crossover bridge, back to Degner by the link road) and **South** (the
    separate 1.3 km course beside the paddock).
  - **Jeddah**: GP, and **Formula E** (the southern half of the Corniche with a hairpin across to
    the return road, and chicanes on both long runs; Turns 8 and 10-11 are temporary chicanes that
    aren't mapped, so they're added where the real ones go).
  - **Daytona**: Oval, and the **Road course** (the Rolex 24 lap: the tri-oval, the infield, the
    Bus Stop on the backstretch and the banking in Turns 3 and 4, at the oval's real banking).
  Whichever layout you race, the rest of the venue's circuit is still there, closed off: Monza's
  old oval (crossing over the GP track by the Lesmos) when racing the GP, the climb to the Casino
  when racing Monaco's Formula E lap, the rest of the figure-of-eight and the South Course at
  Suzuka East, and so on, as road with a barrier across it wherever it meets the track (looks
  only: the track's own barriers keep the cars on the lap). Each layout is traced from
  OpenStreetMap along the real roads, shares its circuit's scenery and surroundings, takes its heights and camber from the main layout wherever they share the road,
  and has its own lap records. (There's no "Jeddah Half" layout: it doesn't exist. Monaco's GP
  and "full" layouts are the same one. Monza's bankings have no published height survey, so their
  rise, about 6 m, is an estimate.) The weekly challenge picks from the main layouts only
  (a week can also be picked by hand: `CHOSEN` in `js/weekly.js`; 2026-W40 is Monaco).
- **Modes**: Race, Elimination (last car is out every lap), Championship (2 to 6 rounds, F1
  points, the leader starts at the back of the next round's grid) and Time trial against a ghost
  of your fastest lap ever. A slower lap never replaces the ghost. A **delta bar** at the top shows
  live how far ahead (green) or behind (red) of the ghost you are.
- **Race other people's ghosts**: every lap record and weekly best uploads its ghost. Press
  **Race ghost** next to anyone on the lap-record or weekly board, pick **Ghost: Track record** in
  time trial setup, or **Race the leader's ghost** on the weekly card. Their car shows as a named
  ghost and the delta bar measures you against them. Your own ghost can stay on track too, or be
  hidden: **My ghost: Show / Hide** in time trial setup, **G** during the lap, or the pause menu.
- **Sectors**: each lap is split into three, shown under the lap times. Purple is the best anyone
  has done (in a race, the fastest in the session; in time trial, the best you know of, including
  the record holder's), green is your own best, yellow is slower.
- **Time of day and weather** (solo setup, or the host in a room): time is Default, Day, Sunset,
  Night or Dynamic; weather is Clear, Cloudy, Fog, Rain, Storm, Snow or Dynamic. Dynamic time moves
  about an hour every 30 seconds, so a race can run from afternoon into night. At night the
  floodlights, headlights and windows come on.
  - **Dynamic weather is calm on purpose.** Spells last a few minutes and change over about a
    minute, the sky clouds over a minute before any rain, the first spell is always dry, and a shower
    is never followed by another within two spells. In a five-lap race that is about one race in
    four seeing any rain at all, and never rain twice (`tools/weather-test.mjs` runs thousands of
    made-up races to check). Each circuit has its own usual weather, shown on the setup screen:
    Jeddah never rains, Daytona gets thunderstorms, Suzuka is often damp, Glacier Pass snows.
  - **Wet roads**: the tarmac darkens, shines in the wheel ruts and puddles and reflects the sky
    (and the floodlights at night); the kerbs sheen. Drops land on the camera and run back at
    speed. After a shower in the sun, a rainbow. Storms bring wind (and the sound of it) and
    lightning bolts with thunder; plain rain doesn't. Snow settles on the ground and the road.
    Fast quality keeps the plain wet look and skips the reflections, lens drops and bolts.
  - **Forecast**: under the lap times a strip shows the next six minutes (colour for each kind of
    weather), with a line like "Rain in 1 min", and a short banner appears when something is about
    to arrive. Fixed weather has no forecast. Every screen in a room sees the same sky at the same
    time. It's looks only: the handling is the same.
- **Weekly challenge**: every Monday at 00:00 UTC a new track and direction are picked
  automatically from the date, with a fresh leaderboard. Last week's winner shows on the title
  screen. You never need to update anything. The challenge has its own ghost and delta bar: your
  best lap on it this week, starting fresh each Monday.
- **Accounts (optional)**: sign in with a BVS number and password, or with your Hwb email and a
  password (a verification link goes to your Hwb inbox), and your stats, lap records, ghosts, name and car follow you to any computer.
  A guest's stats move onto the new account when they create one. A BVS number and an Hwb email
  can be **linked** to one account, so either logs in and a forgotten password can be reset through Hwb.
- **Direct connections (P2P)**: during races, players send car positions straight to each other
  over WebRTC. Firebase only introduces players, then carries no positions at all while everyone
  is connected directly. Anyone whose network blocks direct links automatically falls back to
  Firebase, and the lobby shows each driver as *Direct* or *Via server*. Direct links send 60 updates
  a second (Firebase 15). Each update is moved on by how old it is when it arrives, using the same
  handling maths as the game, so contact happens where the other car really is. Contact is sent at once.
- **Rematch**: on the results screen of an online race, every driver but the host has a **Rematch** button (tap again to
  take it back), and a row of start lights shows who has asked: one light per human driver, red as they vote, green once
  there are enough. When more than half of the human drivers want one, the same race starts again with the same settings
  (the host counts as yes, since **Race again** is theirs to press; the host's button still starts it at once). Bots don't
  vote, a big screen never does, and championship and qualifying results have no rematch (the host starts the next round).
  A vote is the race number stored on your own player entry, so it stops counting as soon as the next race has its own.
- **Qualifying** (host's choice, or in solo setup): a hotlap session before the race. Cars are
  see-through ghosts so nobody can block anyone, and slipstream is off. Everyone gets a flying
  lap plus two timed laps, and the best lap sets the grid. It works before championship rounds too.
- **TV coverage**:
  - **Live spectating:** anyone who joins mid-race, gets knocked out or has finished watches
    live on F1-style trackside cameras. A director follows the closest battle and cuts to crashes
    and overtakes, with captions.
  - **Controls:** ◀ ▶ (or ← →) to pick a driver, **C** to change camera (auto, trackside, chase,
    helicopter, onboard).
  - **Highlights:** after each race, an automatic reel of the start, overtakes, lead changes,
    crashes and the finish (photo finishes included). It's skippable, and afterwards there's a
    **Full replay** with play, pause, speed and a timeline.
- **Garage** (unlockable looks, no effect on speed):
  - **What you can change:** paint, race number, underglow, headlight colour, tyre-smoke colour, a title and a horn.
  - **Paint** (43 of them) includes **Blackout** (gloss black, free for everyone), Matte Black,
    **Monster** (black with glowing green claw marks), stripes, chequered, carbon, camo, arctic camo,
    tiger, zebra, hazard, candy cane, polka dots, pixel camo, sunset, galaxy, synthwave, lightning,
    lava, flames, chrome, gold, a **BVS** livery, and a colour scheme for each of the 11 teams on the
    2026 F1 grid (colours only, no logos or sponsor names). Monster, lava, synthwave and galaxy glow a
    little at night.
  - **Headlights:** halogen, xenon, rally yellow, ice blue, green, pink, purple, red, your car colour
    or rainbow. The lamps and the beam on the road at night both take the colour, and everyone in a
    room sees yours. The garage shows the beam on your car while you pick.
  - **Underglow** adds red, purple, toxic, gold and flashing **Blues and Twos**; **tyre smoke**
    adds black, green, pink and orange; new titles include Monster, Night Rider, Rain Master,
    Ghostbuster, Globetrotter and Speed Demon.
  - **Earning items:** your **driver level** (1–30) comes from XP in online races, plus
    achievements (wins, podiums, championships, lap records, weekly wins). Every results screen ends with a
    **Next unlock** panel: the cheapest garage item you don't have yet, what it needs ("Reach level 7 · 240 XP to go",
    "Win 10 online races · 7 of 10") and a progress bar. Level goals count in XP, so it says how much is left, not
    "level 6 of 7". It updates when the race's XP lands. Signing in isn't offered (a race can't earn it). A few starter items
    unlock from solo play, including new goals: finish a bot race at night, or in the rain, and
    beat someone else's ghost in time trial.
  - **The #1 number and a crown** go to whoever topped last week's weekly challenge, until the
    next week ends.
- **Room chat**: a chat panel in the lobby, quick messages (GG, Good race!, Rematch? ...), a small
  feed during races (press **Enter** or **T** to type; steering lets go while you do) and a chat
  dock on the results screen. It can be switched off in Settings.
  - **Everyone:** rude words are starred out, links, email addresses and phone numbers are refused,
    and you can't send faster than about one message a second. Lap times are fine.
  - **Guests (no account) get much more protection:** messages up to 60 characters (accounts 120),
    anything rude is refused outright, and so is anything that looks like contact details or
    personal questions (Snapchat, Insta, "add me", "how old", "what school", @names, long numbers).
    Guests also see everyone else's messages through that same strict filter, one message every 3
    seconds at most. The database enforces the length, rate, links, @ and number limits too, so a
    modified copy of the game can't get round them.
  - **Mute and report:** mute anyone from their message or the driver list. **Report** sends the
    message to the admin and mutes them for you.
- **Moderation**:
  - **Name filter:** rude driver names (including l33t spellings) are refused, and anyone else's
    shows up as "Driver 1234".
  - **Admin page:** the **bvs-11018** account gets it. From there you can rename (and lock the
    name of), reset or ban any player, remove lap and weekly records, close rooms, and publish
    **lap-time limits**, so impossible laps are refused by the database. The **Chat** tab shows
    reported messages and all the chat in live rooms (exactly as typed), and can delete messages and
    **mute people from chat** without banning them. Banned players can't chat either.
- **Host migration**: if the host leaves or their laptop dies, the driver who has been in the
  room longest takes over, including running the bots, mid-race.
- **Slipstream**: tuck in behind a car and you get towed along, worth about 7% extra speed at
  a full tow, so you gain roughly a car length a second. A car pushing right behind the leader
  helps them a little too. Nothing changes when you're alone. It's on by default, and the host
  can turn it off in the lobby (or you can in solo setup) for the pure original feel.
- **Car contact**: the original treated every car as a circle 2 units across (so side by side you
  "touched" with a gap between you) and added the whole difference in speed to both cars, sideways
  included, so a light rub threw you across the track. **Soft** (the default) uses each car's real
  outline, wheels and wings included, so cars only touch when they visibly touch; it pushes them apart
  only where they overlap and soaks up most of the hit. It also stops a rare original-wall glitch
  that could slide a car more than 150 units along a wall in one frame. Normal wall hits are unchanged.
  **Original** brings back the old behaviour exactly. It's in solo setup and the lobby (host's choice).
- **Leaderboards**: driver standings (wins, podiums, races, win rate) from online races with
  at least two real drivers, plus a lap-record board for every track in both directions. Lap
  records come from Time trial only.
- **Online rooms**: four-letter codes, a lobby with ready-up, host picks track, laps and bots.
  Up to 10 cars per room. **Copy invite link** in the lobby copies a link like `https://your-site/?room=ABCD`: whoever opens it
  lands on Online with the code filled in and **Join room** highlighted (one press to join; it never joins on its own, so a
  player can still set their name first). A bad code is ignored and a closed room says so when they press Join.
- **Bots** in three levels (Rookie, Racer, Ace), in solo races and online rooms.
- **HUD**: F1-style start lights, timing tower, lap and race timers, best lap, speedometer,
  minimap, final-lap and wrong-way banners, results podium.
- **Lap records** saved on your device, and shared with everyone on your site once Firebase is set up.
- **Track editor** (hidden for now, see below) that reads and writes the original game's
  track codes, with a *Save & race* button.
- **Sound**: every car body has its own engine, modelled live cylinder by cylinder (firing pulses
  through headers, pipes and a muffler, intake roar, engine-block knock, and no two firings alike),
  with a gearbox, so you hear the revs climb and the gear changes:
  - **Formula:** high V6 turbo wail with a turbo whistle and eight quick gears.
  - **GT:** V8 burble with crackles on the upshift.
  - **Stock car:** deep, rough V8 with four long gears.
  - **Classic:** buzzy four-cylinder, close to the old sound.

  You hear the cars around you too, panned left and right, with a doppler sweep as they pass, duller the
  further away they are. Under the car: tyre squeal (a wobbling tone with the scrub of rubber under it), a rattle
  that speeds up as you run over a kerb, and a rough hush on the grass. Crashes layer a recorded crunch (from a
  free sound pack) on a synthesised thump; the menus have soft recorded clicks, ticks and a faint hover sound.
  There's wind in the slipstream, start-light beeps, a white-flag bell, a finish fanfare and crowd. Everything
  also works with no sound files at all: each recorded sound has a synthesised version to fall back on.
- **Music** that follows the race: three driving tracks (a daytime one in two flavours, and a slow, spacious one
  after dark), each built in layers. A pulse and a pad at the start, then hats, an arpeggio, a lead melody as
  the race goes on or you're in a close fight, and everything at once on the final lap, when the key lifts too.
  Menus have their own loop.
- **Team radio and commentary** are built and switched off for now (nothing shows, nothing is downloaded): set
  `VOICES_ENABLED = true` in `js/config.js` to bring them back, or add `?voices` to the address to try them. When on:
  - **Team radio**: your race engineer talks to you in short, calm messages through a radio filter (band-limited,
    a touch of drive, static underneath, a click at each end): your place, the gaps to the cars either side
    ("Gap ahead, one point two. Gap behind, point eight."), a tow to use or a car to defend against, laps to go,
    incidents, rain and nightfall, the finish. **Full** or **Key moments** only (incidents, the final lap,
    elimination, the finish) in Settings.
  - **Commentary**: a lead commentator and a co-commentator call the race like a broadcast: lights out, who leads into
    turn one, passes, lead changes, crashes, contact, the fastest lap, battles, the final lap, the finish and photo
    finishes, the rain, and a word about the circuit when it goes quiet. It also calls the highlights in the replay.
    Subtitles show everything that's said (switch them off in Settings). The voices are made with the Kokoro
    neural voice and play as recorded clips stitched into sentences. The computer drivers are called by name; any
    other driver is "Number 23", with their real name in the subtitles. **Settings** has Voices, Team radio,
    Commentary and Subtitles, and a **Hear the voices** button.
- **Big screen** (Online > Big screen, or the link `?tv=ABCD`): put a room on a classroom projector. It joins as a
  watcher (never on the grid, never the host), shows the room code and who's in between races, then the race as
  a broadcast (auto cameras, a big timing tower, the map and lap counter, and the commentary and subtitles when
  the voices are on) and the results. **Race bots > Watch the bots race** does the same with computer drivers and no room.
- **Horn** (hold **H**): every car has one, heard from where the car is (quieter with distance, left and right, and everyone's
  horn is their own, as picked in the garage). Six sounds, made in code: the classic two-tone, a bicycle bell, a duck, an air
  horn, a cow and a train horn (the first is free, the rest unlock with driver level; clicking one in the garage plays it, even
  while it's locked). A short tap still arrives: the press count travels with the car's updates, so even a 15 ms tap is
  heard on every screen. The race winner sounds a short-short-long fanfare as they cross the line. The host can switch the
  horn **Off** for the whole room (Horn, in the lobby settings) for a serious race. It's sound only: the handling is the same.
- **Rear-view mirror** at the top of the screen (switch it off in Settings), and hold **B** to look behind you.
- **Scenery**: every circuit gets a pit building with team garages, grandstands full of fans (who cheer at the start and the finish), fans behind the fences at corners, billboards, a bridge over the track, and trees or city blocks to suit the place. Nothing is allowed to stick onto the road: every piece is checked against the whole circuit, including where it doubles back. The TV cameras only use positions that can see the cars, and cut away if a tree or building gets in the way.
- **The real surroundings of every F1 track**, from OpenStreetMap, on the real lie of the land:
  - **Monaco**: all of the principality, about 4,500 buildings at their real size (most with their real
    number of floors) climbing the hillside, the Casino (green copper roof and turrets), the Hôtel de
    Paris and the Hermitage, the Yacht Club, the palace on the Rock, the harbour's piers with yachts,
    the gardens, the Stade Nautique's pool and the streets winding up the hill.
  - **Spa**: the Ardennes forest exactly where it is, the meadows, the villages of Francorchamps and
    Burnenville, the real grandstands as proper seating full of fans, and the valley and hills round
    Eau Rouge from the real terrain.
  - **Monza**: the royal park's woods and lawns round the circuit, the town of Monza and the villages
    beyond with their red roofs, the park's own trees, the real grandstands, the railway and the river.
  - **Suzuka**: the wooded hills (every slope the map leaves blank is wooded, as it really is), the rice
    fields, the amusement park with its **two big wheels** where they really stand, the hotel, the
    factories and the town.
  - Near the track, the real surroundings are moved out to fit the game's wider road, so they line it the
    way they really do; further out, they're exactly where the map has them. Streets have lamps that come
    on at night, windows light up after dark, and on **Low** graphics the smallest far-off buildings are
    left out.
- **Holds 60 fps by itself** (Settings > Hold 60 fps, on by default): the game watches how long each frame
  takes and, if a computer can't keep up, steps down a ladder (`js/ladders.js`): a little less sharpness (never
  the driving), the glow off, the rear-view mirror redrawn every 2nd, 3rd, then 6th frame (it's a whole second
  drawing of the scene: nearly half of what's drawn on Monaco), shadows off, the forests thinned to 85%, 70%,
  55%, 40% (trees are most of what's drawn on Spa, Monza and Suzuka), and more sharpness last. When there's
  room again it climbs back. Where the browser can time the graphics chip, it's used: a chip with room goes
  straight back up (worked out from its sharpness, no blind tries), and a processor that's the limit isn't
  "fixed" by blurring the picture. Where a computer settled is remembered for next time, a machine that can't
  hold a steady rate even at the cheapest step is put on Fast from then on (in Auto), and a stall (switching
  tabs, a track being built) is never mistaken for a slow computer. **Settings > FPS counter** shows the frame
  rate, frame time, the current step, the graphics chip's time against the game's own code, triangles, draw
  calls and which graphics card the browser found (useful for telling me what a PC has).
- **Lighting** (Pretty, and the first steps of the ladder): a **glow** round bright lights (night windows,
  floodlights, headlights, neon, the sun), drawn only at dusk and night and at a quarter of the resolution; a
  finishing pass with FXAA edge smoothing, a gentle colour grade (a touch more contrast and colour, golden
  highlights when the sun is low, cooler shadows, darker corners) and dithering so skies don't band; a new
  **sky** (a sun or moon disc with a glow, soft clouds that thicken with the weather, dithered); **steady
  shadows** (the shadow map follows the car in whole texels, so edges don't crawl); building walls a little
  darker at the foot (baked in, free to draw); and white road lines dimmed at night (unlit lines would glow like
  neon). The cars are drawn exactly as before; only the bright glow reaches them.
- **Sponsors**: the boards round every track carry made-up sponsors that sound like the real ones
  (ROLAX, PIRATELLI, DXL, PETRAMCO, ZWS, CRYPTIC.COM, SAILFORCE, LEMONOVO, QATAIR, MCS CRUISES, TAG HOUR,
  DUNLOOP, HONDO...), each in its own colours, with the local ones at each track (TAG HOUR and RICHARD
  MILD in Monaco, UNIDEBIT and LAVAZZO at Monza, HONDO and DUNLOOP at Suzuka, PETRAMCO and SAUDAIR in
  Jeddah). The bridge over the track carries the local one (Suzuka's is the DUNLOOP arch). No real names or logos.
- **A graphics pipeline for models and textures** (`assets/`, no build step): drop a `.glb` model or a
  `.jpg`/`.png` texture in the folder, list it in `assets/manifest.json`, and the game uses it. Models are
  placed as many cheap copies (a street lamp goes up thousands of times), can light up at night, and can
  wait for High quality; a missing or broken file just means the game draws its own version, so an asset
  can never break a race. Today: fine tarmac grain and rubbered racing lines on every road, a grass texture
  on the F1 tracks' ground, and models for the floodlights (all tracks) and the street lamps (Monaco and
  Monza, High quality). On High quality the start gantry is a model too, and each circuit gets
  life along it: marshal posts with flags and cones at the outside of the tight corners, flags along the pit
  roof and paddock tents behind the garages (from the free Kenney Racing Kit, CC0). The ground isn't one flat
  colour any more: meadows, forest floor and farmland go lighter, darker and drier in broad patches. The cars
  are untouched. Swap in better models of the same name to upgrade them. `assets/README.md` says how.
- Skid marks, sparks, tyre smoke, three cameras and four car bodies (looks only).
- **R** puts your car back on the track if you get stuck. If a crash knocks you outside
  the walls, it happens automatically.

Controls: **← →** or **A D** steer, **R** reset car, hold **B** look back, **H** horn, **C** camera, **M** mute, **Esc** pause.
On phones, tilt to steer or tap the screen sides (Settings).

---

## Put it on GitHub Pages

1. Create a new **public** repository on GitHub (for example `racing-game`).
2. Upload everything in this folder **except** `original/`, `node_modules/` and
   `temporary screenshots/` (the `.gitignore` already skips them if you use git):
   ```bash
   git init
   git add .
   git commit -m "Online Racing Game GP"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/racing-game.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick **main** and **/ (root)**, then **Save**.
4. After a minute the game is live at `https://YOUR-USERNAME.github.io/racing-game/`.

**Updating:** when you push a new version, change `VERSION` in `js/config.js` and the same value in
`version.json`. Anyone with the game already open then gets a "new version" bar with a Refresh button,
and the lobby marks players on an older copy with *Needs refresh* (an old copy can miss new settings
like weather). After they refresh, the game shows a **What's new** popup once (the entries in `js/changelog.js` newer than
the version they last played; a first-ever visit and a link into a room or a big screen skip it, and it waits for next time).
How to play > **What's new** opens the latest entries again. **When a version has something players will notice, add an entry
at the top of `js/changelog.js`** (its `version` is the `VERSION` that ships it; keep items short and plain).

Bots, time trial and the editor work straight away. Online rooms need the next part.

## Set up online play (Firebase)

Online rooms use Firebase **Realtime Database**, same as the original game. The free
**Spark** plan is enough, and you don't need a card.

For comparison with Supabase:
- Realtime Database is one big JSON tree instead of tables.
- `database.rules.json` does the job of row-level security policies.
- Anonymous sign-in is the same idea as Supabase anonymous users.

### 1. Create the project
1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it anything (for example `racing-game`). You can switch Google Analytics off. The game doesn't use it.

### 2. Create the database
1. In the left menu: **Build → Realtime Database → Create Database**.
2. Pick the location closest to you (for the UK, `europe-west1`).
3. Choose **Start in locked mode**. The next step replaces the rules anyway.
4. Open the **Rules** tab. Delete what's there, paste in the whole of
   [`database.rules.json`](database.rules.json), and click **Publish**.

The rules let signed-in players read rooms. Only the host can change a room's settings,
and each player can only write their own car. The lap records board works the same way.
Chat messages are checked as well: only players in the room, not banned or muted, at most one
message a second (guests one every 2.5 s), with the length, link and number limits above.
Career stats are checked too: the database only accepts +1 race per result the host
recorded, and a win or podium only if that result says so. That stops people typing their
own numbers in. **If you change the rules file later, paste it in and Publish again.**

### 3. Turn on anonymous sign-in
1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Anonymous** → switch on → **Save**.
3. **Settings** tab → **Authorized domains** → **Add domain** → `YOUR-USERNAME.github.io`
   (`localhost` is already there for testing).

### 4. Copy your config into the game
1. Click the gear next to *Project Overview* → **Project settings**.
2. Under **Your apps**, click the **Web** icon (`</>`). Give it a nickname and register it.
   You don't need Firebase Hosting.
3. Firebase shows a `firebaseConfig` block. Copy these values into
   [`js/config.js`](js/config.js):
   ```js
   export const FIREBASE_CONFIG = {
   	apiKey: "AIza...",
   	authDomain: "racing-game-xxxx.firebaseapp.com",
   	databaseURL: "https://racing-game-xxxx-default-rtdb.europe-west1.firebasedatabase.app",
   	projectId: "racing-game-xxxx",
   	appId: "1:1234:web:abcd"
   };
   ```
   If `databaseURL` is missing from the block, copy it from the top of the
   **Realtime Database** page (it starts with `https://` and ends in `firebasedatabase.app`
   or `firebaseio.com`).
4. Commit and push. Open the site, click **Race online → Create room**, and send the code to your friends.

These keys are meant to be public. Anyone can see them in a web page. What protects the
database is the rules from step 2 plus the authorized domains from step 3.

### 5. Accounts (optional)

Turn on whichever sign-in options you want, then publish the latest `database.rules.json` again.

**BVS accounts** (BVS number + password)
1. **Authentication → Sign-in method → Add new provider → Email/Password**. Switch on the first
   toggle only (not "Email link") → **Save**.

Nothing is emailed. A BVS number is stored as `bvs-12345@bvs.invalid` behind the scenes, and other
players only ever see driver names. A plain BVS account has no "forgot password" (link an Hwb email
to get one, see below). If someone forgets theirs, delete their user under **Authentication → Users**
and they can make the account again. Their stats stay with the old account ID, so they will lose them. The BVS format is set by `ACCOUNTS.bvsPattern` in
`js/config.js`: "bvs-" plus 3 to 8 digits.

**Hwb accounts** (Hwb email + a password made up for the game)

Players type their Hwb email and a new password. The game then emails a link to their Hwb inbox to
prove the address is theirs. They also get a working **Forgot password?** link.

1. This uses the same **Email/Password** sign-in as BVS accounts, so nothing else needs switching on.
2. Leave **Email enumeration protection** switched off (Authentication → Settings → User actions),
   the same as for BVS.
3. Recommended: **Authentication → Templates → Email address verification**. Set the sender
   name to "Online Racing Game" and write a friendly message. Do the same for **Password reset**.
   Emails come from `noreply@YOUR-PROJECT.firebaseapp.com`, and school email filters sometimes
   put them in Junk, so tell people to check there.
4. Only addresses ending `@hwbmail.net` or `@hwbcymru.net` are accepted (`ACCOUNTS.hwbDomains` in
   `js/config.js`). Set `hwb: false` there to hide the option.

Pupils' Hwb addresses are stored in Firebase Authentication only. Other players never see them,
but you can, as the owner of the Firebase project.

**Linking a BVS number and an Hwb email** (Account → the box under your name)
- **Signed in with BVS:** type your Hwb email and your password. A link goes to your Hwb inbox.
  Once it's clicked, the account's login becomes the Hwb email, and your BVS number still works.
  Same account, same stats. Until then, keep logging in with the BVS number.
- **Signed in with Hwb** (after confirming the email): type your BVS number and password. It works
  straight away, as long as that number doesn't already have its own account.
- Either way there's **one password** for both. A forgotten one is reset with **Forgot password?**
  on the Hwb side. After a reset, log in once with the Hwb email; that updates the BVS login too.
- **How it's stored:** `bvsLinks/bvs-12345` in the database says which account a number belongs
  to. The Hwb email in it is locked with the account's password, so nobody can look up whose email
  a BVS number belongs to. Only the owner of a BVS account can create a link for it.
- The admin account (**bvs-11018**) can't be linked: the database rules recognise the admin by
  that exact BVS login.
- **This needs the latest `database.rules.json` published** (step 2).
- Firebase sends the "verify your new email" message using **Authentication → Templates → Email
  address change**. You can give it the same friendly sender name.

### 6. Admin and lap limits

1. Make sure the latest `database.rules.json` is published (step 2). It contains the admin, ban and
   lap-limit rules.
2. Sign in on the game with the BVS account **bvs-11018**. An **Admin** button appears on the
   title screen.
3. Open **Admin → Lap limits & bans → Publish lap limits** once (and again after tracks change, like
   the 2026 F1 remaster). From then on, any lap faster
   than that track's limit is refused. The limits sit about 18% below what the car can
   physically manage, so real laps are never blocked.
4. To change who the admin is, edit `ACCOUNTS.admin` in `js/config.js` **and** the
   `bvs-11018@bvs.invalid` address in `database.rules.json`, then publish the rules again.

The BVS livery is blue and white. To change it, edit
`BVS_COLOURS` in `js/cosmetics.js`. Team colours are in the same file.

### How much can we play for free?
The free plan allows **100 people connected at once**. The title screen connects to load the
weekly challenge and your account, so that includes people sitting in menus.
When direct links work, races use almost none of the data allowance. When they don't, each car sends about 15 small updates a second through Firebase. On the free plan's 10 GB a month:
- 4 players get roughly 4,500 minutes of racing.
- A full 8-car room gets about 1,000 minutes.

You can check usage under **Realtime Database → Usage**. To stretch it further, lower
`SEND_RATE` in `js/config.js` to 10. Remote cars will still look smooth.

### Testing online play without Firebase
Open `http://localhost:3000/?localnet` in two tabs of the same browser. Rooms then run between
those tabs only. Useful for checking things before you push.

---

## Running it on your computer

You need [Node.js](https://nodejs.org). Then:

```bash
node serve.mjs
```

and open <http://localhost:3000>. Opening `index.html` directly from the file system won't work,
because the game uses JavaScript modules.

## Making tracks

The editor is switched off at the moment. To turn it back on, set `EDITOR_ENABLED = true` in
`js/config.js`. That brings back the menu button, the `editor/` page and *Your tracks* in the
track lists. While it's off, `editor/` just sends people back to the game.

Once it's on, open **Track editor** from the menu.
- Drag to draw walls and lines. The first line you draw is the start line; draw the others
  in the order cars should cross them. Laps only count once a car has crossed them all.
- The white markers show where cars start. They drive up the screen, so put the start line
  just in front of them.
- **Save & race** puts the track under *Your tracks* on this device.
- **Copy code** gives you a code to share. Codes from the original game import as they are.
- Old codes could change the handling with `SPEED`/`BOUNCE` "mods". Those parts are ignored
  so everyone drives the same car. `LAPS`, `OOB_DIST` and `MOUNTAIN_DIST` still work.

## How it's built

| File | What it does |
| --- | --- |
| `js/physics.js` | The original handling, copied over unchanged, plus the optional soft car contact |
| `js/slipstream.js` | Slipstream, applied on top of the physics each frame |
| `js/tracks.js` | Track list: circuit shapes and the Classic track code |
| `js/trackgen.js` | Turns a circuit into walls, kerbs, checkpoints and a racing line |
| `js/circuits.js`, `js/terrain.js` | Real F1 circuit data (generated); hills, the Monaco tunnel and the Suzuka bridge |
| `js/world.js`, `js/scenery.js` | Sky, road and themes for each track; pits, grandstands, fans, billboards, buildings and trees |
| `js/atmosphere.js`, `js/weatherfx.js`, `js/lens.js` | The weather timeline and each circuit's climate; wet-road, snow and lightning looks; drops on the camera lens |
| `js/trackside.js` | Marshal posts, flags, cones and paddock tents from the models in `assets/` (skipped if they aren't loaded) |
| `js/steps.js` | Time slicing for the world builders: they are generators that pause every few milliseconds, so picking a track in a menu builds its preview between frames instead of freezing the page |
| `js/landscape.js`, `js/placegeo.js`, `js/places/` | The real surroundings of the F1 tracks (OpenStreetMap, real terrain), placed round the game's road |
| `js/sponsors.js` | The made-up trackside sponsors and their boards |
| `js/gfx.js`, `js/adaptive.js`, `js/ladders.js` | The renderer's dials, the controller that turns them to hold 60 fps, the ladder of steps, the GPU timer and the FPS counter |
| `js/post.js` | The glow and finishing pass (bloom, FXAA, colour grade, vignette, dither) |
| `js/assets.js`, `js/materials.js`, `assets/`, `vendor/` | Models and textures loaded from `assets/manifest.json` (glTF via the vendored r128 loader), placed as instances; the road and ground textures, drawn in code unless a file replaces them |
| `js/remnants.js` | The rest of a venue's circuit (its other layouts' roads), closed off |
| `js/race.js` | Race rules: laps, finishing, elimination, ghosts, syncing cars |
| `js/bots.js`, `js/progress.js`, `js/navfield.js`, `js/rescue.js` | AI drivers, race order, getting cars back on track |
| `js/net.js` | Online rooms, accounts, leaderboards (Firebase, or `?localnet` for testing) |
| `js/p2p.js` | Direct WebRTC links between players, with Firebase fallback |
| `js/broadcast.js` | TV cameras, the director, highlights and the replay player |
| `js/cosmetics.js`, `js/garage.js` | Unlockable looks, levels and the garage screen |
| `js/filter.js`, `js/admin.js`, `js/limits.js` | Name and chat filters, admin page, lap-time limits |
| `js/chat.js` | Room chat: lobby panel, race feed, results dock, mute and report |
| `js/champ.js`, `js/weekly.js` | Championship points and the automatic weekly challenge |
| `js/audio.js`, `js/engine-worklet.js`, `js/music.js` | Engine model for each car body, sound effects, the mix (buses, ducking, limiter) and the layered music sequencer |
| `js/sfxbank.js`, `assets/audio/` | Recorded effects (Kenney's CC0 packs) played by group name, with the synthesised sounds as the fallback |
| `js/voice.js`, `js/voicelines.js`, `js/speechkit.js`, `assets/voice/` | The voices: every line as text, the clip packs, stitching sentences from clips, the radio and broadcast chains, the queue |
| `js/radio.js`, `js/commentary.js` | The race engineer (what to tell the player) and the two commentators (what to call), driven by the race's events |
| `js/main.js`, `js/hud.js` | Menus, HUD, camera and input |
| `editor/` | Track editor |

### Checks
`tools/` has three scripts that need [three.js r128](https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js)
saved as `tools/three.min.cjs`, plus the original repo cloned into `original/`.
The last two also need puppeteer installed.
- `node tools/physics-equivalence.mjs` checks that the physics matches the original.
- `node tools/track-sim.mjs` drives bots round every track and reports lap times, stuck cars and escapes.
- `node tools/draft-test.mjs daytona` compares slipstream on and off (lap times, gaps, lead changes).
- `node tools/fetch-osm.mjs [venue ...]` downloads the real surroundings of Monaco, Spa, Monza and Suzuka from OpenStreetMap into `data/osm/`, and `node tools/fetch-dem.mjs [venue ...]` the lie of the land round them into `data/dem/`.
- `node tools/build-places.mjs` rebuilds `js/places/<venue>.js` (real surroundings, loaded by the game when it needs them) from `data/osm/` and `data/dem/`.
- `node tools/vendor-post.mjs` rebuilds `vendor/three-r128/postprocessing.js` (the glow parts of three.js r128's examples, in one file).
- `node tools/adaptive-test.mjs` plays the 60 fps controller against simulated computers (strong, weak, crawling, a faster screen, stalls).
- `node tools/gfx-test.mjs` checks the FPS counter, the game turning itself down on a computer drawing in software, "Hold 60 fps" off, the saved step and Fast, in the real game.
- `node tools/build-models.mjs` builds the game's own simple models (street lamp, floodlight) into `assets/models/*.glb`.
- `node tools/check-assets.mjs` checks `assets/manifest.json` against the files (they exist, plain glTF, within their triangle and size budgets).
- `node tools/asset-test.mjs` plays the game with assets loading, missing, broken and replaced, and checks it copes with each.
- `node tools/preview-test.mjs` checks what picking a track in a menu does: the click returns at once with a "Loading ..." chip, the page keeps drawing frames while the preview builds, a quick run of picks (or a pick mid-build) builds only the last, and a race started after a pick isn't rebuilt under.
- `node tools/place-plot.mjs <venue> [metres across] [lap fraction]` draws a map of a venue's surroundings as the game has them, with the circuit.
- `node tools/route-layouts.mjs [layout ...]` traces the other layouts (Monaco Formula E, Monza Oval, Suzuka East...) through the OpenStreetMap roads in `data/osm/*-roads.json` into `data/circuits/<layout>.geojson`.
- `node tools/build-circuits.mjs` rebuilds `js/circuits.js` from `data/circuits/` (real layouts and elevation).
- `node tools/build-circuits.mjs --corners` also lists each circuit's corners by distance from the start line (for placing camber).
- `node tools/spot-shots.mjs <trackId> [rev] [tunnel|bridge|over|bridgeside|high|low|top|0.25|s700|end0|rem0 ...]` screenshots chosen places round a track (`end<k>`, `rem<k>`: the closed-off roads of the venue's other layouts).
- `node tools/corner-plot.mjs <trackId> <lap fraction> [radius] [label]` overlays the game's road on the real layout (with distance labels) to see how much a corner has been opened up.
- `node tools/terrain-check.mjs` checks the ground never pokes through the road on the F1 tracks (both directions).
- `node tools/remnant-check.mjs [trackId]` checks the closed-off roads of a venue's other layouts never show through the track.
- `node tools/montage.mjs out.png cols a.png b.png ...` puts several screenshots on one sheet.
- `node tools/walls-plot.mjs <trackId> <x> <z> [radius]` draws the physics walls around a point.
- `node tools/weather-test.mjs` checks the dynamic weather over thousands of made-up races (calm, slow, cloud before rain, forecast, same sky on every screen); no browser.
- `node tools/sky-shots.mjs [trackId] [tod-weather ...]` screenshots a track at different times and weather (e.g. `monza night-rain`).
- `node tools/scenery-shots.mjs [trackId ...]` takes screenshots of each track (overview, racing with the mirror, looking back, highlights).
- `node tools/engine-demo.mjs` renders a clip of each engine to WAV (with spectrograms) for tuning the sound. Engine settings are `ENGINES` in `js/audio.js`.
- `node tools/changelog-test.mjs` checks the What's new changelog: entries are well formed and newest first, none is newer than the game, and versions compare right (-9 before -10). No browser.
- `node tools/unlock-test.mjs` checks the results screen's "Next unlock" logic: it always names a locked item with something left to do, level goals count in XP, and nothing shows once everything is open. No browser.
- `node tools/horn-test.mjs` checks the horn in a real browser: every horn sound is audible and about as loud as the others, a press (even a 15 ms tap) in one tab is heard in the other over `?localnet`, and with the room's Horn switched Off nothing happens.
- `node tools/sound-test.mjs [track] [--voices]` plays a short race in a real browser and listens to the mix: the recorded effects load, nothing clips or goes silent, and the voices stay out of sight (no settings, subtitles or voice files); with `--voices` it turns them on and checks the engineer and commentators speak, with subtitles.
- `node tools/voice-test.mjs [--browser]` plays a made-up race through the engineer and commentators and prints what they would say; with `--browser` it also decodes every clip in the voice packs.
- `node tools/build-voices.mjs [eng] [lead] [col] [--force] [--check]` renders the lines in `js/voicelines.js` into `assets/voice/*.pak` with the Kokoro voice (needs `npm i kokoro-js` in a scratch folder and `KOKORO_DIR` pointing at it, plus ffmpeg); `--check` listens back with a speech recogniser. Only needed when a line or a voice changes.
- `node tools/build-sfx.mjs <folder>` packs the chosen sounds from Kenney's Impact Sounds, Interface Sounds and UI Audio packs (CC0) into `assets/audio/sfx.pak`.
- `node tools/contact-test.mjs monaco` compares original and soft car contact (side hit, rear tap, a bot race).
- `node tools/e2e.mjs solo|online|rematch|invite|whatsnew|p2p|champ|quali|tv|midjoin|admin|migrate|account|link|ghost|rival|draft|tour` (`p2p fallback` tests the blocked case) plays through the game in a headless browser.

## Credits and licence

- Original game, physics and the Classic track: [jchabin/cars](https://github.com/jchabin/cars).
- F1 circuit centrelines: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT, see
  `data/circuits/`). Elevation: [Open Topo Data](https://www.opentopodata.org/) (EU-DEM, SRTM). Monaco's
  heights are from its corners' known elevations, as the town is too steep for the elevation data.
- The surroundings of Monaco, Spa, Monza and Suzuka (buildings, forests, fields, water, streets,
  railways, trees, landmarks; `node tools/fetch-osm.mjs`): © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, ODbL. The lie of the land round them: [Open Topo Data](https://www.opentopodata.org/)
  (EU-DEM 25 m for Monaco, Spa and Monza, SRTM 30 m for Suzuka; `node tools/fetch-dem.mjs`).
- Jeddah's surroundings (buildings, coastline, lagoon, marina piers, parks, streets, mosques), the
  Monza and Daytona circuit outlines, every other track layout (traced along the mapped roads and
  raceways), and Daytona's surroundings (Lake Lloyd, the grandstand, the
  infield buildings): © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL
  (see `data/osm/` and `data/circuits/`).
  A few towers OpenStreetMap doesn't have were placed from satellite imagery, with heights
  estimated from their shadows.
- `assets/models/kenney/`: models from the [Racing Kit](https://www.kenney.nl/assets/racing-kit) by Kenney
  (CC0; licence note in the folder). Only some are used so far (the start gantry, marshal posts, cones,
  flags and tents); the rest of the kit sits there ready for grandstands and pit buildings.
- `vendor/three-r128/GLTFLoader.js` (and the post-processing scripts beside it): from three.js r128 (MIT, © three.js authors).
- `assets/audio/` (menu sounds and crash impacts): [Kenney](https://www.kenney.nl/assets) Impact Sounds, Interface Sounds and UI Audio, CC0 (notice beside the files).
- `assets/voice/` (the race engineer and the commentators): spoken by the [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) neural voice (Apache-2.0), voices `bm_lewis`, `bm_george` and `bf_emma`, rendered by `tools/build-voices.mjs`.
- Licensed under **GPL-3.0**, the same as the original (see [LICENSE](LICENSE)). If you share
  your version, keep it open source and keep this credit.
