import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const outDir = path.join(appRoot, "dev-dist");
const port = Number(process.env.PORT ?? 5178);
const apiTarget = new URL(process.env.API_TARGET ?? "http://localhost:4000");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

async function loadEsbuild() {
  try {
    return (await import("esbuild")).default;
  } catch {
    const pnpmDir = path.join(repoRoot, "node_modules/.pnpm");
    const candidates = fs
      .readdirSync(pnpmDir)
      .filter((name) => name.startsWith("esbuild@"))
      .sort((a, b) => {
        if (a === "esbuild@0.25.12") return -1;
        if (b === "esbuild@0.25.12") return 1;
        return b.localeCompare(a);
      });
    for (const candidate of candidates) {
      const entry = path.join(pnpmDir, candidate, "node_modules/esbuild/lib/main.js");
      if (fs.existsSync(entry)) return (await import(pathToFileURL(entry).href)).default;
    }
    throw new Error("esbuild is not installed in node_modules");
  }
}

function copyShell() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
  fs.cpSync(path.join(appRoot, "public"), outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#090d16" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="stylesheet" href="/assets/main.css" />
    <title>Notes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>
`
  );
}

const pwaStubPlugin = {
  name: "pwa-stub",
  setup(build) {
    build.onResolve({ filter: /^virtual:pwa-register$/ }, () => ({ path: "virtual:pwa-register", namespace: "pwa-stub" }));
    build.onLoad({ filter: /.*/, namespace: "pwa-stub" }, () => ({
      contents: "export function registerSW(options = {}) { setTimeout(() => options.onOfflineReady?.(), 0); return () => undefined; }",
      loader: "js"
    }));
  }
};

copyShell();

console.log("Loading esbuild...");
const esbuild = await loadEsbuild();
console.log(`Loaded esbuild ${esbuild.version}. Bundling app...`);
const context = await esbuild.context({
  entryPoints: [path.join(appRoot, "src/main.static.tsx")],
  bundle: true,
  sourcemap: true,
  format: "esm",
  target: ["es2022"],
  outdir: path.join(outDir, "assets"),
  entryNames: "main",
  assetNames: "assets/[name]",
  logLevel: "info",
  plugins: [pwaStubPlugin],
  define: {
    "import.meta.env.DEV": "true",
    "import.meta.env.PROD": "false",
    "import.meta.env.MODE": JSON.stringify("development")
  }
});

await context.rebuild();
await context.watch();
console.log("Bundle watcher ready.");

function safePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const resolved = path.resolve(outDir, `.${cleanPath}`);
  if (!resolved.startsWith(outDir)) return path.join(outDir, "index.html");
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  return path.join(outDir, "index.html");
}

function proxyApi(req, res) {
  const target = new URL(req.url ?? "/", apiTarget);
  const proxyReq = http.request(
    target,
    {
      method: req.method,
      headers: { ...req.headers, host: apiTarget.host },
      timeout: 1500
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("timeout", () => proxyReq.destroy());
  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "API unavailable" }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if ((req.url ?? "").startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  const filePath = safePath(req.url ?? "/");
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(ext) ?? "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Notes local dev server ready at http://localhost:${port}/`);
});

process.on("SIGINT", async () => {
  await context.dispose();
  server.close(() => process.exit(0));
});
