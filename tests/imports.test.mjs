import assert from "node:assert/strict";
import test from "node:test";

const imageMimeByExtension = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

function normalizeNotionImportPath(input) {
  const slashed = input.replace(/\\/g, "/");
  if (slashed.startsWith("/")) return { ok: false, reason: "absolute_unix_path" };
  if (/^[a-zA-Z]:\//.test(slashed)) return { ok: false, reason: "absolute_windows_path" };
  const cleaned = slashed;
  if (!cleaned || cleaned.includes("\0")) return { ok: false, reason: "empty_or_null_path" };
  const parts = cleaned.split("/");
  if (parts.some((part) => part === "..")) return { ok: false, reason: "path_traversal" };
  const normalized = parts.filter((part) => part && part !== ".").join("/");
  if (!normalized) return { ok: false, reason: "empty_path" };
  return { ok: true, path: normalized };
}

function getImportFileExtension(sourcePath) {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const index = filename.lastIndexOf(".");
  if (index <= 0) return "";
  return filename.slice(index).toLowerCase();
}

function classifyNotionImportFile(sourcePath) {
  const extension = getImportFileExtension(sourcePath);
  if (extension === ".html" || extension === ".htm") return { kind: "html", mimeType: "text/html", isPageCandidate: true, isAssetCandidate: false };
  if (extension === ".md" || extension === ".markdown") return { kind: "markdown", mimeType: "text/markdown", isPageCandidate: true, isAssetCandidate: false };
  if (extension === ".csv") return { kind: "csv", mimeType: "text/csv", isPageCandidate: false, isAssetCandidate: true };
  if (extension === ".pdf") return { kind: "pdf", mimeType: "application/pdf", isPageCandidate: false, isAssetCandidate: true };
  if (imageMimeByExtension[extension]) return { kind: "image", mimeType: imageMimeByExtension[extension], isPageCandidate: false, isAssetCandidate: true };
  return { kind: "file", mimeType: "application/octet-stream", isPageCandidate: false, isAssetCandidate: true };
}

function deriveParentSourcePath(sourcePath, pageSourcePaths) {
  const slashIndex = sourcePath.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const directory = sourcePath.slice(0, slashIndex);
  const candidates = [`${directory}.html`, `${directory}.htm`, `${directory}.md`, `${directory}.markdown`, `${directory}/index.html`, `${directory}/index.htm`];
  for (const candidate of candidates) {
    if (pageSourcePaths.has(candidate)) return candidate;
  }
  return null;
}

test("notion import path normalization rejects traversal and absolute entries", () => {
  assert.deepEqual(normalizeNotionImportPath("Workspace/Page.html"), { ok: true, path: "Workspace/Page.html" });
  assert.deepEqual(normalizeNotionImportPath("../secrets.env"), { ok: false, reason: "path_traversal" });
  assert.deepEqual(normalizeNotionImportPath("/Users/me/file.html"), { ok: false, reason: "absolute_unix_path" });
  assert.deepEqual(normalizeNotionImportPath("C:/Users/me/file.html"), { ok: false, reason: "absolute_windows_path" });
});

test("notion import classifier identifies pages, images, pdfs, csvs, and generic files", () => {
  assert.equal(classifyNotionImportFile("Topic.html").kind, "html");
  assert.equal(classifyNotionImportFile("Topic/Sub.md").kind, "markdown");
  assert.equal(classifyNotionImportFile("Topic/photo.PNG").mimeType, "image/png");
  assert.equal(classifyNotionImportFile("Topic/manual.pdf").kind, "pdf");
  assert.equal(classifyNotionImportFile("Topic/database.csv").kind, "csv");
  assert.equal(classifyNotionImportFile("Topic/archive.bin").kind, "file");
});

test("notion import parent inference matches Notion folder exports", () => {
  const pages = new Set(["Topic.html", "Topic/Subtopic.html", "Topic/Subtopic/Deep.html"]);
  assert.equal(deriveParentSourcePath("Topic/Subtopic.html", pages), "Topic.html");
  assert.equal(deriveParentSourcePath("Topic/Subtopic/Deep.html", pages), "Topic/Subtopic.html");
  assert.equal(deriveParentSourcePath("Topic.html", pages), null);
});
