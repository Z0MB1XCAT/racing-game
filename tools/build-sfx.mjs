// Packs sound effects from Kenney's free (CC0) sound packs into assets/audio/sfx.pak with an index (sfx.json), the same
// plain format as the voice packs: every clip a small mono mp3, one file to fetch. Only a chosen few are used.
//   node tools/build-sfx.mjs <folder holding the unzipped packs>
// The packs (all CC0, https://kenney.nl/assets): Impact Sounds, Interface Sounds, UI Audio (each unzips to
// kenney_impact-sounds/, kenney_interface-sounds/, kenney_ui-audio/ with an Audio/ folder inside).
// Needs ffmpeg on the PATH. js/sfxbank.js plays the groups by name.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const src = process.argv[2];
if(!src){ console.error("usage: node tools/build-sfx.mjs <folder with the unzipped Kenney packs>"); process.exit(1); }
const out = join(resolve(import.meta.dirname, ".."), "assets", "audio");
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "sfx-"));

const pk = { impact: "kenney_impact-sounds", ui: "kenney_ui-audio", iface: "kenney_interface-sounds" };
const nums = (n, ...k) => k.map(i => String(i).padStart(n, "0"));
// group -> [pack, file name without .ogg]...
const GROUPS = {
	"ui.click": ["iface", "click_001", "click_002", "click_003"],
	"ui.select": ["iface", "select_001", "select_002", "select_003"],
	"ui.back": ["iface", "back_001", "back_002"],
	"ui.toggle": ["iface", "toggle_001", "toggle_002", "toggle_003"],
	"ui.confirm": ["iface", "confirmation_001", "confirmation_002"],
	"ui.error": ["iface", "error_004", "error_006"],
	"ui.open": ["iface", "open_001", "open_002"],
	"ui.close": ["iface", "close_001", "close_002"],
	"ui.tick": ["iface", "tick_001", "tick_002"],
	"ui.hover": ["ui", "rollover1", "rollover2", "rollover3"],
	"ui.sparkle": ["iface", "glass_002", "glass_004"],
	"hit.metalHeavy": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactMetal_heavy_" + n)],
	"hit.metalMed": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactMetal_medium_" + n)],
	"hit.metalLight": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactMetal_light_" + n)],
	"hit.plateHeavy": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactPlate_heavy_" + n)],
	"hit.plateMed": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactPlate_medium_" + n)],
	"hit.plateLight": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactPlate_light_" + n)],
	"hit.softHeavy": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactSoft_heavy_" + n)],
	"hit.softMed": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactSoft_medium_" + n)],
	"hit.tin": ["impact", ...nums(3, 0, 1, 2, 3, 4).map(n => "impactTin_medium_" + n)],
	"hit.glass": ["impact", ...nums(3, 0, 1, 2).map(n => "impactGlass_light_" + n)]
};

const index = {}, groups = {}, chunks = [];
let offset = 0;
for(const [group, [pack, ...files]] of Object.entries(GROUPS)){
	groups[group] = [];
	for(const f of files){
		const ogg = join(src, pk[pack], "Audio", f + ".ogg");
		if(!existsSync(ogg)){ console.error("missing " + ogg); process.exit(1); }
		const wav = join(tmp, f + ".wav"), mp3 = join(tmp, f + ".mp3");
		// Peak to -2 dBFS, so the levels are set in code and a clip is as loud as its neighbours.
		const probe = execFileSync("ffmpeg", ["-hide_banner", "-i", ogg, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		const m = /max_volume: (-?[\d.]+) dB/.exec(probe);
		const gain = m ? -2 - parseFloat(m[1]) : 0;
		execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", ogg, "-ac", "1", "-ar", "44100", "-af", `volume=${gain}dB`, "-codec:a", "libmp3lame", "-b:a", "64k", mp3]);
		const bytes = readFileSync(mp3), id = f;
		const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], { encoding: "utf8" }));
		index[id] = [offset, bytes.length, Math.round(dur * 1000)];
		groups[group].push(id);
		chunks.push(bytes); offset += bytes.length;
	}
}
writeFileSync(join(out, "sfx.pak"), Buffer.concat(chunks));
writeFileSync(join(out, "sfx.json"), JSON.stringify({ clips: index, groups }));
copyFileSync(join(src, pk.impact, "License.txt"), join(out, "LICENSE-kenney.txt"));
console.log(`${Object.keys(index).length} clips in ${Object.keys(groups).length} groups, ${(offset / 1024).toFixed(0)} KB`);
