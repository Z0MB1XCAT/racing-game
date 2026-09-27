// Checks rain under cover: in the Monaco tunnel and under the Suzuka bridge the rain streaks
// aren't drawn and the sound knows it's under a roof. Needs node serve.mjs running.
//   node tools/cover-test.mjs
import puppeteer from "puppeteer";
const b = await puppeteer.launch({ headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];
for(const [id, where] of [["monaco", "tunnel"], ["suzuka", "bridge"]]){
	const p = await b.newPage();
	p.on("pageerror", e => errors.push(id + ": " + e.message));
	await p.setViewport({ width: 1000, height: 700 });
	await p.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
	await p.click("#btnBots"); await new Promise(r => setTimeout(r, 400));
	await p.click(`#setupTracks [data-id="${id}"]`); await new Promise(r => setTimeout(r, 800));
	await p.evaluate(() => { window.__game.setup.weather = "rain"; window.__game.setup.bots = 3; });
	await p.click("#setupGo");
	await new Promise(r => setTimeout(r, 6000));
	for(const spot of ["covered", "open"]){
		await p.evaluate((where, spot) => {
			const g = window.__game, c = g.track.center, n = c.n, f = g.track.features;
			let i = where === "tunnel" ? (f.tunnel[0] + 30) % n : f.bridge[0];
			if(spot === "open") i = (i + (where === "tunnel" ? 320 : 150)) % n;
			g.freeCam = { p: [c.x[i], c.h[i] + 1.5, c.z[i]], t: [c.x[(i + 10) % n], c.h[(i + 10) % n] + 1.5, c.z[(i + 10) % n]] };
			g.frozen = true;
		}, where, spot);
		// (The world and the rain follow the camera while frozen.)
		await p.evaluate(() => { const g = window.__game; g.frozen = false; });
		await new Promise(r => setTimeout(r, 1500));
		const res = await p.evaluate(() => {
			const g = window.__game, cam = g.freeCam.p;
			let rain = null;
			g.world.group.traverse(o => { if(o.isLineSegments && o.userData.fallY) rain = o; });
			const a = rain.geometry.attributes.position.array;
			let hidden = 0, all = a.length / 6;
			for(let i = 0; i < a.length; i += 6) if(a[i + 1] < -100) hidden++;
			return { cover: g.world.coverAt(...cam), smoothed: +(g.cover || 0).toFixed(2), rain: g.world.look.rain, hiddenStreaks: hidden + "/" + all };
		});
		console.log(id, where, spot.padEnd(7), JSON.stringify(res));
	}
	await p.close();
}
console.log(errors.length ? errors : "no page errors");
await b.close();
