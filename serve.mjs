// Tiny static server for local testing: node serve.mjs -> http://localhost:3000
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT) || 3000;
const types = {
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
	".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8"
};

createServer(async (req, res) => {
	try {
		let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([\/])+/, "");
		let file = join(root, path);
		if (!file.startsWith(root)) throw new Error("outside root");
		if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
		const body = await readFile(file);
		res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
		res.end(body);
	} catch {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not found");
	}
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
