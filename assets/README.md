# Models and textures

Everything the game draws in code can be replaced by a file here. Nothing is required: if a file is
missing or fails to load, the game draws its own version, so a bad asset can never break a race.

`manifest.json` lists what there is. To add or swap something, put the file in `models/` or
`textures/`, add (or change) its line in the manifest, then run:

```bash
node tools/check-assets.mjs
```

It checks every file exists, is the right kind, and is within its size budget. Then reload the game.
(The game loads assets in the background, so the menu appears first and the track is built again
with them a moment later.)

## Models (glTF `.glb`)

```json
"lamp-post": { "file": "models/lamp-post.glb", "scale": "world", "min": "low", "maxTris": 80, "maxKB": 20 }
```

- **Units are metres**, origin at the model's base (the ground), facing +x is "reaching over the road".
- `scale`: `"world"` means the model is in real metres and is scaled by the track's map scale like the
  real buildings are (a 8 m lamp is 8 m on every track); `"game"` means used as it is, in game units.
- `min`: `"low"` (default) loads on every quality; `"high"` only when the game is on High quality.
- `maxTris`, `maxKB`: budgets, checked by `tools/check-assets.mjs` (the game itself doesn't enforce them).
- Models are always drawn as **many copies**, so keep them small: a street lamp is placed thousands of
  times. A budget of under about 100 triangles for anything that repeats a lot is a good rule.
- **Plain glTF only:** no Draco or Meshopt compression, no KTX2 textures (PNG, JPEG or WebP inside is
  fine). Materials are read as flat colour (`baseColorFactor`) and an optional colour texture; the game
  turns them into its own Lambert (or, for shiny metal, Phong) material so they take the same light as
  everything else. Author colours the normal way (sRGB); the loader converts.
- A material called **`glow`** is swapped for the game's own lit material where a model supports it (the
  lamps come on at night). Give a part that material name if it should light up.

The models that are used today, and where:

| Model | Used for |
|---|---|
| `lamp-post` | street lamps in Monaco and Monza (`js/landscape.js`); High quality only (Low keeps the old two-box lamp) |
| `floodlight-pole`, `floodlight-head` | the floodlights round every circuit (`js/world.js`). The pole is one unit tall and is stretched up to the head. |
| `gantry` | the start/finish gantry over the line (`js/world.js`): its width and height are read from the model (`modelSize`), and the banner hangs at its height |
| `marshal-post-red`, `marshal-post-green`, `cone`, `flag-red`, `flag-green`, `flag-checkers` | marshal posts with a flag and three cones at the outside of the tight corners, and flags along the pit roof (`js/trackside.js`); High quality only |
| `pumpkin` | jack-o'-lanterns behind the barriers in October (`js/trackside.js`, `js/season.js`); built by `tools/build-models.mjs` (its face is a `glow` part that stays lit); High quality only |
| `tent`, `tent-closed`, `tent-long` | paddock tents behind the pit garages (`js/trackside.js`); High quality only |

`tools/build-models.mjs` builds the lamp and floodlight models from code, so there's a real file to load.
Replace any of them with a better one of the same name and the game uses it.

The files in `models/kenney/` are from the [Kenney Racing Kit](https://www.kenney.nl/assets/racing-kit)
(CC0, licence note in the folder). The manifest maps game names onto them (`"gantry"` is
`kenney/overheadLights.glb`), and the ones it doesn't list yet (grandstands, pit garages, a billboard,
rails, trees) are there to be used. The game only downloads what the manifest lists.

- `ground`: models are dropped so their lowest point sits on the ground (kit models don't all start there);
  `"ground": false` keeps the model's own origin (the floodlight head is meant to float).
- `modelSize("name")` (in `js/assets.js`) says how big a loaded model is in game units, so a place can fit
  itself to whatever model it gets.

## Textures (PNG / JPEG / WebP)

```json
"asphalt": { "file": "textures/asphalt.jpg", "tint": true, "maxKB": 600 }
```

Two names are used, both for fine detail under the colours the tracks already have:

- **`asphalt`**: the road. The image's left edge is one side of the road, its right edge the other, and it
  repeats along the road once per road width. It should tile seamlessly from top to bottom.
- **`grass`**: the ground on the F1 tracks. It repeats every 10 game units and should tile seamlessly both ways.
  An optional `"repeat": [x, y]` multiplies how often a texture tiles.

No photo textures are used today. A photographic tarmac (ambientCG, CC0) was tried and looked flatter than the
game's own drawn tarmac with its rubbered racing lines, so the road keeps the drawn one. Try yours in the
game before keeping it.

`tint`: `true` (default) multiplies the track's own colour by the texture, so a near-white texture just
adds grain and patches and the track keeps the look its theme gives it; `false` shows the texture's own
colours (for a photograph). Without an entry, the game draws a texture of its own (`js/materials.js`).

Sizes: 512 or 1024 pixels square is plenty; dimensions that are a power of two (256, 512, 1024) are best.
Keep each file under about 600 KB: players download them. CC0 texture libraries (ambientCG, Poly Haven)
are a good source; keep the licence note next to the file.

## Where the data comes from

Assets are files, not an API: the game doesn't call anything at runtime. To get something in, drop the
file in and list it. Anything used must be free to redistribute in a public game (CC0, or credit it in the
main README).
