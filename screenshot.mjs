// node screenshot.mjs <url> [label] [width] [height] -> ./temporary screenshots/screenshot-N[-label].png
import puppeteer from "puppeteer";
import { mkdir, readdir } from "node:fs/promises";

const [url = "http://localhost:3000", label, w = "1440", h = "900"] = process.argv.slice(2);
const dir = "temporary screenshots";
await mkdir(dir, { recursive: true });
const n = (await readdir(dir)).map(f => +(/^screenshot-(\d+)/.exec(f)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0) + 1;
const out = `${dir}/screenshot-${n}${label ? "-" + label : ""}.png`;
const browser = await puppeteer.launch({ args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
page.on("pageerror", e => console.error("pageerror:", e.message));
page.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: out });
await browser.close();
console.log(out);
