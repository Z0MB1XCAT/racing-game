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
| `e2e.mjs <flow> [trackId]` | drives the game in headless Chrome (flows: solo, online, tv, midjoin, p2p, quali, champ, migrate, ghost, ...) |
| `audio-test.mjs` | sound survives bad values and rebuilds itself if it breaks |
| `cover-test.mjs` | no rain under the Monaco tunnel / Suzuka bridge, and the sound knows it's covered |
| `spot-shots.mjs <id> [rev] [rain] [spots...]` | screenshots round a track (fractions, `s<i>`, `v<frac>`, `above<frac>`, `tunnel`, `bridge`, `top`, ...) into `temporary screenshots/spots/` |
| `montage.mjs out.png cols a.png b.png ...` | several screenshots on one sheet (read it with the Read tool) |
| `corner-plot.mjs <id> <fraction> [radius]` | the game road over the real layout at a corner |
| `build-circuits.mjs [--corners]` | rebuilds `js/circuits.js` (real F1 layouts, elevation, camber) from `data/circuits/` |
| `build-places.mjs` | rebuilds `js/places.js` (real surroundings, OpenStreetMap) from `data/osm/` |
| `screenshot.mjs <url> [label]` (repo root) | one screenshot into `temporary screenshots/` |

Generated files (`js/circuits.js`, `js/places.js`) are never edited by hand: change the build
script or its data and rebuild.

## Code conventions

- Plain ES modules loaded directly by the browser; three.js is the global `THREE` (r128).
  Tabs for indentation. Comments are short, plain English, and explain why.
- The F1 tracks are real data: centrelines (bacinger/f1-circuits), heights from real altitudes,
  camber only on corners that really have it (`camber` in `tools/build-circuits.mjs`, with the
  corner's direction), Jeddah's surroundings from OpenStreetMap. Credit sources in the README
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
