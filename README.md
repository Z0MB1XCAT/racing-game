# Online Racing Game: Grand Prix edition

A fork of [jchabin/cars](https://github.com/jchabin/cars) (the "Online Racing Game") with
new tracks, a racing-game UI, bots, time trials, online rooms and leaderboards. **The car handling is
the original code, unchanged.** `tools/physics-equivalence.mjs` runs both versions side by side
and checks they give exactly the same results. There are two additions, and each can be switched off
per race: **slipstream**, and **soft car contact** (cars don't fling each other apart the way the
original did).

## What's in it

- **9 tracks**: the original Classic track, Monaco, Spa-Francorchamps, Monza, Suzuka (with
  its crossover), Jeddah (at night), Daytona (tri-oval), Crossroads (a figure-8 with a flat
  crossing) and Glacier Pass (snowy switchbacks). Every track except Classic can also be raced in reverse.
- **Modes**: Race, Elimination (last car is out every lap), Championship (2 to 6 rounds, F1
  points, the leader starts at the back of the next round's grid) and Time trial with a ghost
  of your best lap.
- **Weekly challenge**: every Monday at 00:00 UTC a new track and direction are picked
  automatically from the date, with a fresh leaderboard. Last week's winner shows on the title
  screen. You never need to update anything.
- **Accounts (optional)**: sign in with a BVS number and password, or with your Hwb email and a
  password (a verification link goes to your Hwb inbox), and your stats, lap records, name and car follow you to any computer.
  A guest's stats move onto the new account when they create one. A BVS number and an Hwb email
  can be **linked** to one account, so either logs in and a forgotten password can be reset through Hwb.
- **Direct connections (P2P)**: during races, players send car positions straight to each other
  over WebRTC. Firebase only introduces players, then carries no positions at all while everyone
  is connected directly. Anyone whose network blocks direct links automatically falls back to
  Firebase, and the lobby shows each driver as *Direct* or *Via server*.
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
  - **What you can change:** paint, race number, underglow, tyre-smoke colour and a title.
  - **Paint** includes stripes, chequered, carbon, flames, chrome, gold, a **BVS** livery, and a
    colour scheme for each of the 11 teams on the 2026 F1 grid (colours only, no logos or sponsor names).
  - **Earning items:** your **driver level** (1–30) comes from XP in online races, plus
    achievements (wins, podiums, championships, lap records, weekly wins). A few starter items
    unlock from solo play.
  - **The #1 number and a crown** go to whoever topped last week's weekly challenge, until the
    next week ends.
- **Moderation**:
  - **Name filter:** rude driver names (including l33t spellings) are refused, and anyone else's
    shows up as "Driver 1234".
  - **Admin page:** the **bvs-11018** account gets it. From there you can rename (and lock the
    name of), reset or ban any player, remove lap and weekly records, close rooms, and publish
    **lap-time limits**, so impossible laps are refused by the database.
- **Host migration**: if the host leaves or their laptop dies, the driver who has been in the
  room longest takes over, including running the bots, mid-race.
- **Slipstream**: tuck in behind a car and you get towed along, worth about 7% extra speed at
  a full tow, so you gain roughly a car length a second. A car pushing right behind the leader
  helps them a little too. Nothing changes when you're alone. It's on by default, and the host
  can turn it off in the lobby (or you can in solo setup) for the pure original feel.
- **Car contact**: in the original, touching another car added the whole difference in speed to
  both cars, sideways included, so a light rub threw you across the track. **Soft** (the default)
  only pushes cars apart along the line between them and soaks up most of the hit, so rubbing is a
  nudge and a real hit still knocks you off line. Walls are unchanged. **Original** brings back the
  old bounce exactly. It's in solo setup and the lobby (host's choice).
- **Leaderboards**: driver standings (wins, podiums, races, win rate) from online races with
  at least two real drivers, plus a lap-record board for every track in both directions. Lap
  records come from Time trial only.
- **Online rooms**: four-letter codes, a lobby with ready-up, host picks track, laps and bots.
  Up to 10 cars per room.
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

  You hear the cars around you too, panned left and right, with a doppler sweep as they pass.
  There's tyre squeal, wind in the slipstream, metal-on-metal and barrier-scrape crashes, start-light
  beeps, a white-flag bell, a finish fanfare and crowd, and music for menus and races, all made in
  the browser (no audio files). **Settings** has separate Engines, Effects and Music volumes, and
  can turn music off during races.
- **Rear-view mirror** at the top of the screen (switch it off in Settings), and hold **B** to look behind you.
- **Scenery**: every circuit gets a pit building with team garages, grandstands full of fans (who cheer at the start and the finish), fans behind the fences at corners, billboards, a bridge over the track, and trees or city blocks to suit the place. Nothing is allowed to stick onto the road: every piece is checked against the whole circuit, including where it doubles back. The TV cameras only use positions that can see the cars, and cut away if a tree or building gets in the way.
- Skid marks, sparks, tyre smoke, three cameras and four car bodies (looks only).
- **R** puts your car back on the track if you get stuck. If a crash knocks you outside
  the walls, it happens automatically.

Controls: **← →** or **A D** steer, **R** reset car, hold **B** look back, **C** camera, **M** mute, **Esc** pause.
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
3. Open **Admin → Lap limits & bans → Publish lap limits** once. From then on, any lap faster
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
| `js/world.js`, `js/scenery.js` | Sky, road and themes for each track; pits, grandstands, fans, billboards, buildings and trees |
| `js/race.js` | Race rules: laps, finishing, elimination, ghosts, syncing cars |
| `js/bots.js`, `js/progress.js`, `js/navfield.js`, `js/rescue.js` | AI drivers, race order, getting cars back on track |
| `js/net.js` | Online rooms, accounts, leaderboards (Firebase, or `?localnet` for testing) |
| `js/p2p.js` | Direct WebRTC links between players, with Firebase fallback |
| `js/broadcast.js` | TV cameras, the director, highlights and the replay player |
| `js/cosmetics.js`, `js/garage.js` | Unlockable looks, levels and the garage screen |
| `js/filter.js`, `js/admin.js`, `js/limits.js` | Name filter, admin page, lap-time limits |
| `js/champ.js`, `js/weekly.js` | Championship points and the automatic weekly challenge |
| `js/audio.js`, `js/engine-worklet.js`, `js/music.js` | Engine model for each car body, sound effects and the music sequencer |
| `js/main.js`, `js/hud.js` | Menus, HUD, camera and input |
| `editor/` | Track editor |

### Checks
`tools/` has three scripts that need [three.js r128](https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js)
saved as `tools/three.min.cjs`, plus the original repo cloned into `original/`.
The last two also need puppeteer installed.
- `node tools/physics-equivalence.mjs` checks that the physics matches the original.
- `node tools/track-sim.mjs` drives bots round every track and reports lap times, stuck cars and escapes.
- `node tools/draft-test.mjs daytona` compares slipstream on and off (lap times, gaps, lead changes).
- `node tools/scenery-shots.mjs [trackId ...]` takes screenshots of each track (overview, racing with the mirror, looking back, highlights).
- `node tools/engine-demo.mjs` renders a clip of each engine to WAV (with spectrograms) for tuning the sound. Engine settings are `ENGINES` in `js/audio.js`.
- `node tools/contact-test.mjs monaco` compares original and soft car contact (side hit, rear tap, a bot race).
- `node tools/e2e.mjs solo|online|p2p|champ|quali|tv|midjoin|admin|migrate|account|link|draft|tour` (`p2p fallback` tests the blocked case) plays through the game in a headless browser.

## Credits and licence

- Original game, physics and the Classic track: [jchabin/cars](https://github.com/jchabin/cars).
- Circuit layouts are simplified from the real tracks.
- Licensed under **GPL-3.0**, the same as the original (see [LICENSE](LICENSE)). If you share
  your version, keep it open source and keep this credit.
