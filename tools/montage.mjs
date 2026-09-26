// Lays several screenshots out in a grid on one image, for reviewing many at once.
//   node tools/montage.mjs out.png cols a.png b.png ...
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
const [out, cols, ...files] = process.argv.slice(2);
const C = +cols, w = 1440 / C, h = w * 900 / 1440;
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${C},${w}px);gap:2px">` +
	files.map(f => `<div style="position:relative"><img style="width:${w}px;height:${h}px;display:block" src="data:image/png;base64,${readFileSync(f).toString("base64")}"><span style="position:absolute;left:4px;bottom:4px;color:#fff;background:#000a;font:12px sans-serif;padding:1px 4px">${f.split("/").pop()}</span></div>`).join("") + "</body>";
const b = await puppeteer.launch({ headless: "new" }), p = await b.newPage();
await p.setViewport({ width: C * (w + 2), height: Math.ceil(files.length / C) * (h + 2) });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
