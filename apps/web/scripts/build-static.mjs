import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const outDir = path.join(appRoot, "dist");
const require = createRequire(import.meta.url);

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
      if (fs.existsSync(entry)) return require(entry);
    }
    throw new Error("esbuild is not installed in node_modules");
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
fs.cpSync(path.join(appRoot, "public"), outDir, { recursive: true });

// viewport-fit=cover is required for env(safe-area-inset-*) to return
// non-zero values on iPhones with a notch or Dynamic Island.
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

const esbuildInstance = await loadEsbuild();
console.log(`Loaded esbuild ${esbuildInstance.version}. Building app...`);
esbuildInstance.buildSync({
  entryPoints: [path.join(appRoot, "src/main.static.tsx")],
  bundle: true,
  sourcemap: false,
  format: "esm",
  target: ["es2022"],
  outdir: path.join(outDir, "assets"),
  entryNames: "main",
  assetNames: "assets/[name]",
  logLevel: "info",
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.MODE": JSON.stringify("production")
  }
});

console.log(`Built static app to ${outDir}`);
