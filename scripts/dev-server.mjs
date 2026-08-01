import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(new URL("..", import.meta.url))));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".edn": "text/plain; charset=utf-8",
  ".hal": "text/plain; charset=utf-8",
  ".hara": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const requested = pathname === "/" ? "/index.html" : pathname;
    let filepath = normalize(join(root, requested));
    if (!filepath.startsWith(root)) throw new Error("Path traversal rejected");
    try {
      const info = await stat(filepath);
      if (info.isDirectory()) filepath = join(filepath, "index.html");
    } catch {
      filepath = join(root, "index.html");
    }
    const body = await readFile(filepath);
    response.writeHead(200, {
      "content-type": mime[extname(filepath)] || "application/octet-stream",
      "cache-control": "no-store",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, () => {
  console.log(`Hara Studio running at http://localhost:${port}`);
});
