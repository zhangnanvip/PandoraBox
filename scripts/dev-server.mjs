import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png"
};

function resolvePath(url) {
  const requested = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const clean = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  return join(root, clean === "/" ? "index.html" : clean);
}

async function serveFile(res, filePath) {
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || "/");
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat?.isFile()) {
      await serveFile(res, filePath);
      return;
    }

    await serveFile(res, join(root, "index.html"));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`PandoraBox running at http://localhost:${port}`);
});
