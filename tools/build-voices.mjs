// Renders the spoken lines in js/voicelines.js into clips with the Kokoro neural voice (Apache-2.0), tidies each one
// (silence trimmed, same loudness) and packs a voice's clips into assets/voice/<voice>.pak with an index beside it.
// The clips are in the repo, so this only needs running when the lines or the voices change.
//
// Setup (once, in any folder; kokoro-js isn't a dependency of the game): npm i kokoro-js
// Needs ffmpeg on the PATH. The model (about 90 MB) is fetched from huggingface.co the first time.
//   KOKORO_DIR=<that folder> node tools/build-voices.mjs [eng] [lead] [col] [--force] [--check]
//   --force   render every clip again (else clips already in the cache are kept)
//   --check   after packing, listen to the clips with a speech recogniser (whisper) and list any that don't say
//             what they should (a mispronounced name or number)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { VOICES, LINES, clipIds } from "../js/voicelines.js";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "assets", "voice");
const dir = process.env.KOKORO_DIR;
if(!dir){ console.error("Set KOKORO_DIR to the folder where you ran: npm i kokoro-js"); process.exit(1); }
const cache = process.env.VOICE_CACHE || join(process.env.TEMP || "/tmp", "voice-cache");
mkdirSync(cache, { recursive: true }); mkdirSync(out, { recursive: true });
const args = process.argv.slice(2), force = args.includes("--force"), check = args.includes("--check");
const wanted = args.filter(a => VOICES[a]);
const voices = wanted.length ? wanted : Object.keys(VOICES);
const imp = async name => import(pathToFileURL(join(dir, "node_modules", name, name === "kokoro-js" ? "dist/kokoro.js" : "dist/transformers.node.mjs")).href);

// ---- the wav files: 24 kHz mono 16-bit ----
function writeWav(path, f32, rate){
	const buf = Buffer.alloc(44 + f32.length * 2);
	buf.write("RIFF", 0); buf.writeUInt32LE(36 + f32.length * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
	buf.write("data", 36); buf.writeUInt32LE(f32.length * 2, 40);
	for(let i = 0; i < f32.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767), 44 + i * 2);
	writeFileSync(path, buf);
}
function readWav(path){
	const b = readFileSync(path), n = (b.length - 44) / 2, f = new Float32Array(n);
	for(let i = 0; i < n; i++) f[i] = b.readInt16LE(44 + i * 2) / 32768;
	return f;
}
// Silence off both ends (a little left, so a word isn't clipped), then every clip at the same loudness.
function tidy(f, rate){
	let peak = 0;
	for(const x of f) peak = Math.max(peak, Math.abs(x));
	if(peak < 1e-4) return f;
	const gate = peak * 0.012;
	let a = 0, b = f.length - 1;
	while(a < b && Math.abs(f[a]) < gate) a++;
	while(b > a && Math.abs(f[b]) < gate) b--;
	const pad = Math.round(rate * 0.012);
	a = Math.max(0, a - pad); b = Math.min(f.length - 1, b + pad * 2);
	const g = f.slice(a, b + 1);
	// Loudness over the stretches that are speech (not the pauses).
	let sum = 0, cnt = 0;
	for(const x of g) if(Math.abs(x) > gate * 4){ sum += x * x; cnt++; }
	const rms = Math.sqrt(sum / Math.max(1, cnt)) || 1e-3, want = Math.pow(10, -21 / 20);
	let gain = want / rms, pk = 0;
	for(const x of g) pk = Math.max(pk, Math.abs(x));
	gain = Math.min(gain, Math.pow(10, -1.5 / 20) / pk);                  // (never past -1.5 dBFS)
	const fade = Math.round(rate * 0.006);
	for(let i = 0; i < g.length; i++){
		let k = gain;
		if(i < fade) k *= i / fade; else if(g.length - 1 - i < fade) k *= (g.length - 1 - i) / fade;
		g[i] *= k;
	}
	return g;
}

// ---- render ----
const { env } = await imp("@huggingface/transformers");
env.cacheDir = process.env.HF_CACHE || join(process.env.TEMP || "/tmp", "hf");
const { KokoroTTS } = await imp("kokoro-js");
console.log("loading the voice model...");
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });

for(const v of voices){
	const ids = clipIds(v), index = {}, chunks = [];
	let offset = 0, done = 0;
	console.log(`\n${v}: ${ids.length} clips (${VOICES[v].kokoro})`);
	for(const id of ids){
		const wav = join(cache, id + ".wav"), norm = join(cache, id + ".norm.wav"), mp3 = join(cache, id + ".mp3");
		if(force || !existsSync(wav)){
			const a = await tts.generate(LINES[id].t, { voice: VOICES[v].kokoro, speed: VOICES[v].speed });
			writeWav(wav, a.audio, a.sampling_rate);
		}
		if(force || !existsSync(mp3)){
			writeWav(norm, tidy(readWav(wav), 24000), 24000);
			execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", norm, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "40k", mp3]);
		}
		const bytes = readFileSync(mp3), ms = Math.round((readFileSync(norm).length - 44) / 2 / 24);
		index[id] = [offset, bytes.length, ms, LINES[id].t];
		chunks.push(bytes); offset += bytes.length;
		if(++done % 25 === 0) console.log(`  ${done}/${ids.length}`);
	}
	writeFileSync(join(out, v + ".pak"), Buffer.concat(chunks));
	writeFileSync(join(out, v + ".json"), JSON.stringify({ voice: v, model: "Kokoro-82M " + VOICES[v].kokoro, clips: index }));
	console.log(`${v}: ${(offset / 1024).toFixed(0)} KB, ${(Object.values(index).reduce((s, c) => s + c[2], 0) / 1000).toFixed(0)} s of speech`);
}

// ---- listen back ----
if(check){
	console.log("\nlistening back with whisper-tiny...");
	const { pipeline } = await imp("@huggingface/transformers");
	const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", { dtype: "q8" });
	// Said and heard compared as plain words, with numbers as digits ("eighty four" = "84", "sixth" = "6th" = "6").
	const NUM = Object.fromEntries("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ").map((w, i) => [w, i]));
	const TEN = Object.fromEntries("twenty thirty forty fifty sixty seventy eighty ninety".split(" ").map((w, i) => [w, (i + 2) * 10]));
	const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
	const numify = words => {
		const out = [];
		for(let i = 0; i < words.length; i++){
			const w = words[i];
			if(TEN[w] !== undefined){ const nx = NUM[words[i + 1]]; if(nx !== undefined && nx >= 1 && nx <= 9){ out.push(String(TEN[w] + nx)); i++; } else out.push(String(TEN[w])); }
			else if(NUM[w] !== undefined) out.push(String(NUM[w]));
			else if(ORD[w] !== undefined) out.push(String(ORD[w]));
			else out.push(w.replace(/^(\d+)(st|nd|rd|th)$/, "$1"));
		}
		return out.join(" ");
	};
	const norm = s => numify(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().split(" ")).replace(/^p (\d+)$/, "p$1").replace(/\bp (\d+)\b/g, "p$1");
	let bad = 0, total = 0;
	for(const v of voices) for(const id of clipIds(v)){
		const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(cache, id + ".norm.wav"), "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], { maxBuffer: 1 << 26 });
		const audio = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
		const heard = norm((await asr(audio)).text), said = norm(LINES[id].t);
		total++;
		// Close enough: the same words, ignoring a few small differences (digits vs words, hyphens).
		const a = new Set(said.split(" ")), b = new Set(heard.split(" "));
		const common = [...a].filter(w => b.has(w)).length;
		if(common / Math.max(1, a.size) < 0.7){ bad++; console.log(`  ${id}: said "${LINES[id].t}" / heard "${heard}"`); }
	}
	console.log(`${total - bad} of ${total} clips heard back as written`);
}
