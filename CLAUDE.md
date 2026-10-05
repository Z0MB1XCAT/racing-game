# CLAUDE.md

An improved fork of [jchabin/cars](https://github.com/jchabin/cars) for a group of school friends:
a browser racing game (three.js r128, plain ES modules, no build step) with online play over
Firebase Realtime Database, hosted on GitHub Pages. The README describes the features, file map
and tools in full; this file is the working agreement and the setup.

## Setup (a fresh clone or cloud session)

```
npm run setup      # three.js r128 -> tools/three.min.cjs, jchabin/cars -> original/, puppeteer
npm run serve      # http://localhost:3000 (start it in the background; never screenshot file://)
npm test           # physics equivalence + bots round every track
```

`tools/three.min.cjs`, `original/`, `node_modules/` and `temporary screenshots/` are git-ignored
on purpose; `npm run setup` recreates them. If the server is already running, don't start another.

## Working agreements (follow these every time)

- **Keep the handling the same.** The physics must stay exactly the original game's:
  `node tools/physics-equivalence.mjs` must print `bit-identical` after any change. New behaviour
  is only ever an optional addition that leaves the Classic path untouched (for example soft
  contact, or barriers with a `lvl` that only stop cars on one level of a bridge).
- **Bump the version on every update**: `VERSION` in `js/config.js` and `version.json`, same
  value, format `YYYY.MM.DD-N` (N counts up within the day). Players get an update bar from it.
  When the update has something players will notice, also add an entry at the top of `js/changelog.js`
  (its `version` is the one you just set): players see it once as "What's new" after they refresh.
- **Work directly on `main` in the project folder; don't use git worktrees.** The owner asked for this
  (2026-09-30). If a session starts inside `.claude/worktrees/...`, bring its commits onto `main` in the
  main checkout (fast-forward) and carry on there.
- **Commit locally; the owner pushes.** Don't push, and don't open PRs unless asked. End commit
  messages with the Co-Authored-By line.
- **Never create accounts in, or write test data to, the live Firebase.** Online tests use
  `?localnet` (two tabs over BroadcastChannel, no Firebase). `?localnet` is also how the e2e
  online flows run.
- **Tell the owner when they must act after pushing:**
  - changed `database.rules.json` -> they re-publish the rules in the Firebase console;
  - changed a circuit's layout or its track key -> they re-publish lap limits in the game
    (Admin -> Lap limits & bans -> Publish lap limits). Heights, camber and scenery don't count.
- **Weekly challenge maps are frozen for their week**: `LEGACY` in `js/tracks.js` keeps the old
  version of a track for a given ISO week, so a challenge doesn't change mid-week.
- **Check your work in the real game**, not just tests: screenshots from localhost, looked at
  (see the tools below), at least two rounds of compare-and-fix for anything visual.
- Before finishing: `npm test`, the relevant `tools/e2e.mjs` flows (all of solo, online, tv,
  midjoin, p2p, quali, champ, migrate, ghost when in doubt), and the specific checks below for
  what you touched. Report failures honestly with the output.

## Tools (all in `tools/`, node 18+; browser ones need the server running)

| Command | What it checks or does |
|---|---|
| `physics-equivalence.mjs` | our physics vs the original, bit-for-bit |
| `track-sim.mjs [id] [--rev]` | bots lap every track: lap times, stuck cars, escapes (Classic's practice bot flag is known) |
| `terrain-check.mjs` | on the F1 tracks the ground never pokes through the road, both directions |
| `remnant-check.mjs [id]` | the closed-off roads of a venue's other layouts never show through the track |
| `e2e.mjs <flow> [trackId]` | drives the game in headless Chrome (flows: solo, online, tv, midjoin, p2p, quali, champ, migrate, ghost, ...) |
| `audio-test.mjs` | sound survives bad values and rebuilds itself if it breaks |
| `levels-test.mjs` | driver levels to 100: the old curve to 30 untouched, 500 XP a level after, boundaries right (no browser) |
| `looks-test.mjs` | number plates, name effects, start-light themes, new titles and the solo-goal rules (no browser) |
| `codes-test.mjs` | prize codes (find, expire, hashed list, the tool on a copy, prizes unlock items) and look codes (round trip, junk refused) (no browser) |
| `season-test.mjs` | October's look (1 Oct on, 1 Nov off, every year), the Halloween challenge week, and that no ordinary week changes (no browser) |
| `music-test.mjs` | the menu songs (usual and October's) are audible, unclipped and about as loud as each other |
| `changelog-test.mjs` | the What's new changelog is well formed, newest first, and versions compare right (no browser) |
| `unlock-test.mjs` | the results screen's "Next unlock": always a locked item, level goals in XP, none once all is open (no browser) |
| `horn-test.mjs` | every horn sound is audible and balanced; a press (even a 15 ms tap) in one tab is heard in the other; Horn Off in a room silences it |
| `cover-test.mjs` | no rain under the Monaco tunnel / Suzuka bridge, and the sound knows it's covered |
| `weather-test.mjs` | dynamic weather over thousands of made-up races: calm (rain in about 1 race in 4, never twice), slow changes, cloud before rain, forecast, same sky everywhere; no browser |
| `sky-shots.mjs [id] [tod-weather ...]` | screenshots a track in each time and weather (`day-storm+bolt` holds a lightning strike); into `temporary screenshots/sky/` |
| `spot-shots.mjs <id> [rev] [rain] [spots...]` | screenshots round a track (fractions, `s<i>`, `v<frac>`, `above<frac>`, `tunnel`, `bridge`, `top`, ...) into `temporary screenshots/spots/` |
| `montage.mjs out.png cols a.png b.png ...` | several screenshots on one sheet (read it with the Read tool) |
| `corner-plot.mjs <id> <fraction> [radius]` | the game road over the real layout at a corner |
| `route-layouts.mjs [layout ...]` | traces the other layouts (Monaco FE, Monza Oval, Suzuka East...) through `data/osm/*-roads.json` into `data/circuits/` |
| `build-circuits.mjs [--corners]` | rebuilds `js/circuits.js` (real F1 layouts, elevation, camber) from `data/circuits/` |
| `fetch-osm.mjs [venue]`, `fetch-dem.mjs [venue]` | download the real surroundings (OpenStreetMap) and lie of the land (Open Topo Data) of Monaco, Spa, Monza, Suzuka into `data/osm/`, `data/dem/` |
| `build-places.mjs` | rebuilds `js/places/<venue>.js` (real surroundings, loaded on demand) from `data/osm/` and `data/dem/` |
| `place-plot.mjs <venue> [m] [frac]` | a map of a venue's surroundings as the game has them, with the circuit |
| `adaptive-test.mjs` | the 60 fps controller (`js/adaptive.js`) against simulated computers, no browser |
| `gfx-test.mjs` | FPS counter, adaptive sharpness on a software-drawn (slow) browser, Hold 60 fps off, saved step, Fast |
| `vendor-post.mjs` | rebuilds `vendor/three-r128/postprocessing.js` (bloom and pass chaining from three r128's examples) |
| `check-assets.mjs` | `assets/manifest.json` vs the files: they exist, plain glTF, within their triangle/size budgets |
| `asset-test.mjs` | the game with assets loading, missing, broken, replaced and on Low: it must cope with each |
| `sound-test.mjs [track] [--voices]` | a short race in a real browser: recorded effects load, the mix never clips or goes silent, and the voices stay hidden (with `--voices`: they speak, with subtitles) |
| `voice-test.mjs [--browser]` | the engineer and commentators against a made-up race (and, with `--browser`, every voice clip decodes) |
| `build-voices.mjs`, `build-sfx.mjs` | render the voice clips (Kokoro, needs `KOKORO_DIR` and ffmpeg) and pack the recorded effects (Kenney CC0); only when lines or sounds change |
| `preview-test.mjs` | picking a track in a menu: click returns at once with a loading chip, quick picks build only the last, no rebuild under a race |
| `build-models.mjs` | builds the simple models in `assets/models/` from code (replace any with a better one of the same name) |
| `screenshot.mjs <url> [label]` (repo root) | one screenshot into `temporary screenshots/` |

Generated files (`js/circuits.js`, `js/places/*.js`) are never edited by hand: change the build
script or its data and rebuild.

## Code conventions

- Plain ES modules loaded directly by the browser; three.js is the global `THREE` (r128). Still no build
  step: models and textures are plain files in `assets/` (see `assets/README.md`), loaded by `js/assets.js`.
  Every use of an asset must have a drawn-in-code fallback, so a missing file never breaks the game.
  Tabs for indentation. Comments are short, plain English, and explain why.
- The world builders (`buildWorldSteps` in `js/world.js`, and the terrain, place geometry, scenery, landscape and
  remnants builders under it) are generators, so a menu preview can be built a few milliseconds at a time between
  frames (`js/steps.js`). In any loop that can run long, add `if(slice.over()) yield "where";`; call a builder
  with `yield*`, and from outside use its plain wrapper (`buildWorld`, `buildTerrain`, `placeGeo`, `remnants`),
  which runs it to the end. A build must come out the same either way. `slice.log = []` records how long each
  stretch between pauses took, to find the ones that need another pause.
- Sound: every sound has a synthesised version in `js/audio.js`; recorded effects (`assets/audio`) and the voices
  (`assets/voice`) are layered on where they've loaded, so a missing file never breaks the game. The voices are
  switched off for now (`VOICES_ENABLED` in `js/config.js`; `?voices` to try them): off, they show and download
  nothing. What the engineer and
  commentators may say is in `js/voicelines.js` (text only): after changing a line, run `tools/build-voices.mjs`
  (`tools/check-assets.mjs` fails on a line with no clip). Never use real driver names, teams or catchphrases in them.
- The F1 tracks are real data: centrelines (bacinger/f1-circuits), heights from real altitudes,
  camber only on corners that really have it (`camber` in `tools/build-circuits.mjs`, with the
  corner's direction), every F1 venue's surroundings from OpenStreetMap (and the real terrain round
  Monaco, Spa, Monza and Suzuka), moved out near the track to fit the game's wider road (`js/placegeo.js`).
- Trackside sponsors are made up (`js/sponsors.js`): sound-alikes in the real ones' colours, never real
  names or logos. Credit sources in the README
  (OpenStreetMap is ODbL and must stay credited).
- Elevation is looks only; physics is flat. Things with height (cars, camera, scenery, fx) use
  `track.heightAt(x, z, hint)` with a road-sample hint so bridges resolve to the right level.

## Frontend design rules (for any UI work)

- **Invoke the `frontend-design` skill** before writing frontend code, every session.
- If a reference image is given: match layout, spacing, typography and colour; use placeholder
  content (`https://placehold.co/`) where needed; only add to the design if it drastically helps.
  Screenshot, compare against the reference, fix mismatches, re-screenshot: at least 2 rounds.
  Be specific when comparing ("heading is 32px but reference shows ~24px").
- Check the `images/` folder (if present) for logos, palettes and assets before designing, and use
  them rather than placeholders; use a defined palette exactly.
- Output: this project uses a few HTML files (not one), Tailwind via CDN
  (`<script src="https://cdn.tailwindcss.com"></script>`), mobile-first responsive.
- Guardrails:
  - Colours: never the default Tailwind palette as the brand colour; follow the game's existing
    colour branding (you may deviate slightly).
  - Shadows: layered, colour-tinted, low opacity; never flat `shadow-md`.
  - Typography: different fonts for headings and body; tight tracking (`-0.03em`) on large
    headings, line-height 1.7 on body.
  - Gradients: layer radial gradients; grain via an SVG noise filter for depth.
  - Animation: only `transform` and `opacity`, spring-style easing, never `transition-all`.
  - Every clickable element has hover, focus-visible and active states.
  - Images: gradient overlay (`bg-gradient-to-t from-black/60`) plus a `mix-blend-multiply` colour layer.
  - Consistent spacing tokens; surfaces layered base -> elevated -> floating.
- Don't add sections, features or content that weren't asked for or aren't in the reference.
