export const NOTION_IMPORT_MAX_FILE_COUNT = 20_000;
export const NOTION_IMPORT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const NOTION_IMPORT_MAX_SINGLE_FILE_BYTES = 250 * 1024 * 1024;

export const notionImportStatuses = [
  "uploaded",
  "extracting",
  "scanning",
  "preview_ready",
  "importing_metadata",
  "uploading_assets",
  "importing_documents",
  "reindexing_links",
  "completed",
  "failed",
  "cancelled"
] as const;

export type NotionImportStatus = (typeof notionImportStatuses)[number];
export type NotionImportSeverity = "warning" | "error";
export type NotionImportFileKind = "html" | "markdown" | "csv" | "image" | "pdf" | "file" | "unknown";
export type NotionImportPageAction = "add" | "skip";

export interface NotionImportCounts {
  fileCount: number;
  pageCount: number;
  assetCount: number;
  databaseCount: number;
  unsupportedCount: number;
  totalSizeBytes: number;
  errorCount: number;
}

export interface NotionImportPagePreview {
  sourcePath: string;
  sourceIdGuess: string;
  title: string;
  parentSourcePath: string | null;
  htmlPath?: string;
  markdownPath?: string;
  csvPath?: string;
  assetPaths: string[];
  path?: string;
  action?: NotionImportPageAction;
  reason?: string;
  existingPageId?: string;
}

export interface NotionImportAssetPreview {
  sourcePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  kind: NotionImportFileKind;
}

export interface NotionImportIssue {
  sourcePath: string | null;
  severity: NotionImportSeverity;
  code: string;
  message: string;
}

export interface NotionImportApplyResult {
  importId: string;
  status: NotionImportStatus;
  addedPages: number;
  skippedPages: number;
  errorCount: number;
  rootPageId: string | null;
  addedPageIds: string[];
}

export interface NotionImportPreview {
  importId: string;
  status: NotionImportStatus;
  originalFilename: string | null;
  counts: NotionImportCounts;
  pages: NotionImportPagePreview[];
  assets: NotionImportAssetPreview[];
  issues: NotionImportIssue[];
  warnings: string[];
  diff?: {
    addPages: number;
    skipPages: number;
    addAssets: number;
  };
  applyResult?: NotionImportApplyResult;
}

const htmlExtensions = new Set([".html", ".htm"]);
const markdownExtensions = new Set([".md", ".markdown"]);
const imageMimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export function normalizeNotionImportPath(input: string): { ok: true; path: string } | { ok: false; reason: string } {
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

export function getImportFileExtension(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const index = filename.lastIndexOf(".");
  if (index <= 0) return "";
  return filename.slice(index).toLowerCase();
}

export function classifyNotionImportFile(sourcePath: string): { kind: NotionImportFileKind; mimeType: string; isPageCandidate: boolean; isAssetCandidate: boolean } {
  const extension = getImportFileExtension(sourcePath);
  if (htmlExtensions.has(extension)) return { kind: "html", mimeType: "text/html", isPageCandidate: true, isAssetCandidate: false };
  if (markdownExtensions.has(extension)) return { kind: "markdown", mimeType: "text/markdown", isPageCandidate: true, isAssetCandidate: false };
  if (extension === ".csv") return { kind: "csv", mimeType: "text/csv", isPageCandidate: false, isAssetCandidate: true };
  if (extension === ".pdf") return { kind: "pdf", mimeType: "application/pdf", isPageCandidate: false, isAssetCandidate: true };
  if (imageMimeByExtension[extension]) return { kind: "image", mimeType: imageMimeByExtension[extension], isPageCandidate: false, isAssetCandidate: true };
  return { kind: "file", mimeType: "application/octet-stream", isPageCandidate: false, isAssetCandidate: true };
}

export function basenameWithoutImportExtension(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.(html?|markdown|md|csv)$/i, "").trim() || "Untitled";
}

export function titleFromImportPath(sourcePath: string): string {
  return decodeURIComponent(basenameWithoutImportExtension(sourcePath))
    .replace(/[-_]/g, " ")
    .replace(/\s+[a-f0-9]{32}$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Untitled";
}

export function extractHtmlTitle(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = h1 ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  return title
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
}

export function deriveParentSourcePath(sourcePath: string, pageSourcePaths: Set<string>): string | null {
  const slashIndex = sourcePath.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const directory = sourcePath.slice(0, slashIndex);
  const candidates = [`${directory}.html`, `${directory}.htm`, `${directory}.md`, `${directory}.markdown`, `${directory}/index.html`, `${directory}/index.htm`];
  for (const candidate of candidates) {
    if (pageSourcePaths.has(candidate)) return candidate;
  }
  return null;
}
