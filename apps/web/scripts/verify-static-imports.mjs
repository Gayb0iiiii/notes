import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const entrypoints = ["src/main.tsx", "src/main.static.tsx"];
const missing = [];

for (const entrypoint of entrypoints) {
  const absoluteEntry = path.join(root, entrypoint);
  const source = readFileSync(absoluteEntry, "utf8");
  const importPattern = /import\s+["'](\.\/.+?)["'];/g;
  for (const match of source.matchAll(importPattern)) {
    const importedPath = match[1];
    if (!importedPath) continue;
    const resolved = path.resolve(path.dirname(absoluteEntry), importedPath);
    if (!existsSync(resolved)) {
      missing.push(`${entrypoint} -> ${importedPath}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing static imports:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Static imports verified.");
