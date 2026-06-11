import multipart, { type MultipartFile } from "@fastify/multipart";
import {
  NOTION_IMPORT_MAX_FILE_COUNT,
  NOTION_IMPORT_MAX_SINGLE_FILE_BYTES,
  NOTION_IMPORT_MAX_TOTAL_BYTES,
  classifyNotionImportFile,
  deriveParentSourcePath,
  extractHtmlTitle,
  normalizeNotionImportPath,
  titleFromImportPath,
  type NotionImportAssetPreview,
  type NotionImportIssue,
  type NotionImportPagePreview,
  type NotionImportPreview
} from "@notes/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { z } from "zod";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { importAssets, importErrors, importJobs, importPages } from "../db/schema";

const uploadQuerySchema = z.object({ workspaceId: z.string().uuid() });
const importParamsSchema = z.object({ importId: z.string().uuid() });
const maxPreviewRows = 50;
const maxHtmlTitleBytes = 512 * 1024;
const maxNestedZipDepth = 2;

interface ExtractedFile {
  sourcePath: string;
  diskPath: string;
  sizeBytes: number;
  kind: ReturnType<typeof classifyNotionImportFile>["kind"];
  mimeType: string;
  isPageCandidate: boolean;
  isAssetCandidate: boolean;
}

interface ScanResult {
  files: ExtractedFile[];
  pages: NotionImportPagePreview[];
  assets: NotionImportAssetPreview[];
  issues: NotionImportIssue[];
  totalSizeBytes: number;
  unsupportedCount: number;
  databaseCount: number;
}

interface ImportUploadRequest extends FastifyRequest {
  file(): Promise<MultipartFile | undefined>;
}

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error) reject(error);
      else if (!zipFile) reject(new Error("Could not open zip"));
      else resolve(zipFile);
    });
  });
}

function readZipEntry(zipFile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else if (!stream) reject(new Error("Could not read zip entry"));
      else resolve(stream);
    });
  });
}

function sourceIdGuess(workspaceId: string, sourcePath: string): string {
  return createHash("sha256").update(`${workspaceId}:${sourcePath}`).digest("hex").slice(0, 32);
}

function safeDestination(rootDir: string, sourcePath: string): string {
  const destination = path.resolve(rootDir, sourcePath);
  const rootWithSeparator = path.resolve(rootDir) + path.sep;
  if (!destination.startsWith(rootWithSeparator)) {
    throw Object.assign(new Error("Unsafe zip entry path"), { code: "unsafe_path" });
  }
  return destination;
}

function isZipPath(sourcePath: string): boolean {
  return sourcePath.toLowerCase().endsWith(".zip");
}

function mergeScanResults(results: ScanResult[]): ScanResult {
  return results.reduce<ScanResult>(
    (merged, result) => ({
      files: [...merged.files, ...result.files],
      pages: [...merged.pages, ...result.pages],
      assets: [...merged.assets, ...result.assets],
      issues: [...merged.issues, ...result.issues],
      totalSizeBytes: merged.totalSizeBytes + result.totalSizeBytes,
      unsupportedCount: merged.unsupportedCount + result.unsupportedCount,
      databaseCount: merged.databaseCount + result.databaseCount
    }),
    { files: [], pages: [], assets: [], issues: [], totalSizeBytes: 0, unsupportedCount: 0, databaseCount: 0 }
  );
}

async function titleForFile(file: ExtractedFile): Promise<string> {
  if (file.kind === "html" && file.sizeBytes <= maxHtmlTitleBytes) {
    const html = await readFile(file.diskPath, "utf8");
    return extractHtmlTitle(html) ?? titleFromImportPath(file.sourcePath);
  }
  return titleFromImportPath(file.sourcePath);
}

async function extractAndScanZip(zipPath: string, extractDir: string, workspaceId: string, depth = 0): Promise<ScanResult> {
  await mkdir(extractDir, { recursive: true });
  const zipFile = await openZip(zipPath);
  const files: ExtractedFile[] = [];
  const issues: NotionImportIssue[] = [];
  let totalSizeBytes = 0;
  let unsupportedCount = 0;
  let databaseCount = 0;

  await new Promise<void>((resolve, reject) => {
    zipFile.on("entry", async (entry) => {
      try {
        const normalized = normalizeNotionImportPath(entry.fileName);
        if (!normalized.ok) {
          throw Object.assign(new Error(`Unsafe zip entry: ${normalized.reason}`), { code: normalized.reason });
        }

        if (/\/$/.test(entry.fileName)) {
          await mkdir(safeDestination(extractDir, normalized.path), { recursive: true });
          zipFile.readEntry();
          return;
        }

        if (files.length + 1 > NOTION_IMPORT_MAX_FILE_COUNT) {
          throw Object.assign(new Error("Notion export contains too many files"), { code: "too_many_files" });
        }
        if (entry.uncompressedSize > NOTION_IMPORT_MAX_SINGLE_FILE_BYTES && !isZipPath(normalized.path)) {
          throw Object.assign(new Error("A single file in the export is too large"), { code: "single_file_too_large" });
        }
        if (totalSizeBytes + entry.uncompressedSize > NOTION_IMPORT_MAX_TOTAL_BYTES) {
          throw Object.assign(new Error("Notion export is too large to import safely"), { code: "zip_too_large" });
        }

        const classification = classifyNotionImportFile(normalized.path);
        if (classification.kind === "file" && !isZipPath(normalized.path)) unsupportedCount += 1;
        if (classification.kind === "csv") databaseCount += 1;

        const diskPath = safeDestination(extractDir, normalized.path);
        await mkdir(path.dirname(diskPath), { recursive: true });
        const stream = await readZipEntry(zipFile, entry);
        await pipeline(stream, createWriteStream(diskPath, { flags: "wx" }));
        const stored = await stat(diskPath);
        totalSizeBytes += entry.uncompressedSize;
        files.push({
          sourcePath: normalized.path,
          diskPath,
          sizeBytes: stored.size,
          kind: classification.kind,
          mimeType: classification.mimeType,
          isPageCandidate: classification.isPageCandidate,
          isAssetCandidate: classification.isAssetCandidate && !isZipPath(normalized.path)
        });
        zipFile.readEntry();
      } catch (error) {
        zipFile.close();
        reject(error);
      }
    });
    zipFile.once("end", () => resolve());
    zipFile.once("error", reject);
    zipFile.readEntry();
  });

  const pageFiles = files.filter((file) => file.isPageCandidate);
  const nestedZips = files.filter((file) => isZipPath(file.sourcePath));
  if (pageFiles.length === 0 && nestedZips.length > 0 && depth < maxNestedZipDepth) {
    const nestedResults = await Promise.all(
      nestedZips.map((file) => extractAndScanZip(file.diskPath, path.join(extractDir, `${path.basename(file.sourcePath)}-extract`), workspaceId, depth + 1))
    );
    const merged = mergeScanResults(nestedResults);
    if (merged.pages.length > 0 || merged.assets.length > 0) {
      return {
        ...merged,
        totalSizeBytes: totalSizeBytes + merged.totalSizeBytes,
        issues: [
          {
            sourcePath: null,
            severity: "warning",
            code: "nested_zip_export",
            message: "Detected a Notion export nested inside the uploaded zip and scanned the inner archive."
          },
          ...merged.issues
        ]
      };
    }
  }

  const pageSourcePaths = new Set(pageFiles.map((file) => file.sourcePath));
  const pages = await Promise.all(
    pageFiles.map(async (file) => ({
      sourcePath: file.sourcePath,
      sourceIdGuess: sourceIdGuess(workspaceId, file.sourcePath),
      title: await titleForFile(file),
      parentSourcePath: deriveParentSourcePath(file.sourcePath, pageSourcePaths),
      htmlPath: file.kind === "html" ? file.sourcePath : undefined,
      markdownPath: file.kind === "markdown" ? file.sourcePath : undefined,
      assetPaths: []
    }))
  );

  const assets = files
    .filter((file) => file.isAssetCandidate)
    .map((file) => ({
      sourcePath: file.sourcePath,
      originalFilename: file.sourcePath.split("/").pop() ?? file.sourcePath,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      kind: file.kind
    }));

  if (databaseCount > 0) {
    issues.push({
      sourcePath: null,
      severity: "warning",
      code: "databases_preview_only",
      message: "CSV database exports are detected, but database import is not enabled in this milestone."
    });
  }
  if (unsupportedCount > 0) {
    issues.push({
      sourcePath: null,
      severity: "warning",
      code: "generic_files_detected",
      message: "Some files are not page, image, PDF, or CSV assets and will need review before full import."
    });
  }

  return { files, pages, assets, issues, totalSizeBytes, unsupportedCount, databaseCount };
}

function buildPreview(job: typeof importJobs.$inferSelect, pages: NotionImportPagePreview[], assets: NotionImportAssetPreview[], issues: NotionImportIssue[]): NotionImportPreview {
  return {
    importId: job.id,
    status: job.status,
    originalFilename: job.originalFilename,
    counts: {
      fileCount: job.fileCount,
      pageCount: job.pageCount,
      assetCount: job.assetCount,
      databaseCount: job.databaseCount,
      unsupportedCount: job.unsupportedCount,
      totalSizeBytes: job.totalSizeBytes,
      errorCount: job.errorCount
    },
    pages: pages.slice(0, maxPreviewRows),
    assets: assets.slice(0, maxPreviewRows),
    issues,
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  };
}

async function loadPreview(importId: string, request: FastifyRequest): Promise<NotionImportPreview> {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, importId)).limit(1);
  if (!job) throw Object.assign(new Error("Import not found"), { statusCode: 404 });
  await requireWorkspaceRole(request, job.workspaceId);
  if (job.previewJson) {
    const preview = JSON.parse(job.previewJson) as NotionImportPreview;
    return {
      ...preview,
      status: job.status,
      originalFilename: job.originalFilename,
      counts: {
        fileCount: job.fileCount,
        pageCount: job.pageCount,
        assetCount: job.assetCount,
        databaseCount: job.databaseCount,
        unsupportedCount: job.unsupportedCount,
        totalSizeBytes: job.totalSizeBytes,
        errorCount: job.errorCount
      }
    };
  }

  const [pageRows, assetRows, errorRows] = await Promise.all([
    db.select().from(importPages).where(eq(importPages.importJobId, importId)).limit(maxPreviewRows),
    db.select().from(importAssets).where(eq(importAssets.importJobId, importId)).limit(maxPreviewRows),
    db.select().from(importErrors).where(eq(importErrors.importJobId, importId))
  ]);
  return buildPreview(
    job,
    pageRows.map((page) => ({
      sourcePath: page.sourcePath,
      sourceIdGuess: page.sourceIdGuess,
      title: page.title,
      parentSourcePath: page.parentSourcePath,
      htmlPath: page.htmlPath ?? undefined,
      markdownPath: page.markdownPath ?? undefined,
      csvPath: page.csvPath ?? undefined,
      assetPaths: JSON.parse(page.assetPaths) as string[]
    })),
    assetRows.map((asset) => ({
      sourcePath: asset.sourcePath,
      originalFilename: asset.originalFilename ?? asset.sourcePath,
      mimeType: asset.mimeType ?? "application/octet-stream",
      sizeBytes: asset.sizeBytes,
      kind: asset.kind
    })),
    errorRows.map((error) => ({ sourcePath: error.sourcePath, severity: error.severity, code: error.code, message: error.message }))
  );
}

export async function importRoutes(app: FastifyInstance) {
  await app.register(multipart as never, { limits: { files: 1, fileSize: NOTION_IMPORT_MAX_TOTAL_BYTES, fields: 0 } } as never);

  app.post("/notion/upload", async (request) => {
    const auth = await requireAuth(request);
    const query = uploadQuerySchema.parse(request.query);
    const role = await requireWorkspaceRole(request, query.workspaceId);
    if (role !== "owner") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });

    const file = await (request as ImportUploadRequest).file();
    if (!file) throw Object.assign(new Error("Zip file is required"), { statusCode: 400 });
    if (!file.filename.toLowerCase().endsWith(".zip")) {
      throw Object.assign(new Error("Notion export must be a .zip file"), { statusCode: 400 });
    }

    const importId = randomUUID();
    const importRoot = path.join(tmpdir(), "notes-imports", importId);
    const zipPath = path.join(importRoot, "source.zip");
    const extractDir = path.join(importRoot, "extract");
    await mkdir(importRoot, { recursive: true });

    await db.insert(importJobs).values({
      id: importId,
      workspaceId: query.workspaceId,
      uploadedBy: auth.userId,
      status: "uploaded",
      originalFilename: file.filename,
      tempStoragePath: importRoot
    });

    try {
      await pipeline(file.file, createWriteStream(zipPath, { flags: "wx" }));
      await db.update(importJobs).set({ status: "extracting", tempStoragePath: importRoot, updatedAt: new Date() }).where(eq(importJobs.id, importId));
      const scan = await extractAndScanZip(zipPath, extractDir, query.workspaceId);
      await db.update(importJobs).set({ status: "scanning", updatedAt: new Date() }).where(eq(importJobs.id, importId));

      if (scan.pages.length > 0) {
        await db.insert(importPages).values(
          scan.pages.map((page) => ({
            importJobId: importId,
            sourcePath: page.sourcePath,
            sourceIdGuess: page.sourceIdGuess,
            title: page.title,
            parentSourcePath: page.parentSourcePath,
            htmlPath: page.htmlPath,
            markdownPath: page.markdownPath,
            csvPath: page.csvPath,
            assetPaths: JSON.stringify(page.assetPaths)
          }))
        );
      }
      if (scan.assets.length > 0) {
        await db.insert(importAssets).values(
          scan.assets.map((asset) => ({
            importJobId: importId,
            sourcePath: asset.sourcePath,
            originalFilename: asset.originalFilename,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            kind: asset.kind
          }))
        );
      }
      if (scan.issues.length > 0) {
        await db.insert(importErrors).values(scan.issues.map((issue) => ({ importJobId: importId, ...issue })));
      }

      const [updatedJob] = await db
        .update(importJobs)
        .set({
          status: "preview_ready",
          fileCount: scan.files.length,
          pageCount: scan.pages.length,
          assetCount: scan.assets.length,
          databaseCount: scan.databaseCount,
          unsupportedCount: scan.unsupportedCount,
          totalSizeBytes: scan.totalSizeBytes,
          errorCount: scan.issues.filter((issue) => issue.severity === "error").length,
          updatedAt: new Date()
        })
        .where(eq(importJobs.id, importId))
        .returning();
      const preview = buildPreview(updatedJob, scan.pages, scan.assets, scan.issues);
      await db.update(importJobs).set({ previewJson: JSON.stringify(preview), updatedAt: new Date() }).where(eq(importJobs.id, importId));
      return { preview };
    } catch (error) {
      const issue = {
        importJobId: importId,
        sourcePath: null,
        severity: "error" as const,
        code: error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code) : "scan_failed",
        message: error instanceof Error ? error.message : "Import preview failed"
      };
      await db.insert(importErrors).values(issue);
      const [failedJob] = await db
        .update(importJobs)
        .set({ status: "failed", errorCount: 1, updatedAt: new Date() })
        .where(eq(importJobs.id, importId))
        .returning();
      const preview = buildPreview(failedJob, [], [], [{ sourcePath: null, severity: "error", code: issue.code, message: issue.message }]);
      await db.update(importJobs).set({ previewJson: JSON.stringify(preview), updatedAt: new Date() }).where(eq(importJobs.id, importId));
      return { preview };
    }
  });

  app.get("/:importId/preview", async (request) => {
    await requireAuth(request);
    const params = importParamsSchema.parse(request.params);
    return { preview: await loadPreview(params.importId, request) };
  });

  app.get("/:importId/status", async (request) => {
    await requireAuth(request);
    const params = importParamsSchema.parse(request.params);
    return { preview: await loadPreview(params.importId, request) };
  });

  app.post("/:importId/cancel", async (request) => {
    await requireAuth(request);
    const params = importParamsSchema.parse(request.params);
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, params.importId)).limit(1);
    if (!job) throw Object.assign(new Error("Import not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, job.workspaceId);
    if (role !== "owner") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await db.update(importJobs).set({ status: "cancelled", updatedAt: new Date() }).where(eq(importJobs.id, params.importId));
    return { preview: await loadPreview(params.importId, request) };
  });

  app.post("/:importId/run", async (request) => {
    await requireAuth(request);
    const params = importParamsSchema.parse(request.params);
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, params.importId)).limit(1);
    if (!job) throw Object.assign(new Error("Import not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, job.workspaceId);
    if (role !== "owner") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    throw Object.assign(new Error("Notion import run is not implemented yet; preview is the only enabled milestone."), { statusCode: 501 });
  });
}
