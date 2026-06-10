import type { LocalOutboxItem, MetadataOperation, PageDto } from "@notes/shared";
import { notesApi } from "./api";
import { recordDiagnosticEvent } from "./diagnostics";
import { localDb } from "./localDb";

type MetadataSyncResult = {
  status?: "applied" | "skipped";
  reason?: string;
  page?: PageDto | null;
};

const maxSyncAttempts = 8;

export async function cachePages(workspaceId: string, pages: PageDto[]): Promise<void> {
  await localDb.localPages.bulkPut(
    pages.map((page) => ({
      id: page.id,
      workspaceId,
      parentPageId: page.parentPageId,
      title: page.title,
      icon: page.icon,
      sortOrder: page.sortOrder,
      updatedAt: page.updatedAt,
      archivedAt: page.archivedAt,
      deletedAt: page.deletedAt,
      syncStatus: "synced"
    }))
  );
}

export async function queueMetadataOperation(item: Omit<LocalOutboxItem, "createdAt" | "retryCount" | "status">): Promise<void> {
  await localDb.localOutbox.put({ ...item, createdAt: new Date().toISOString(), retryCount: 0, status: "pending" });
  recordDiagnosticEvent("info", "sync", "Queued metadata operation", { type: item.type, workspaceId: item.workspaceId, id: item.id });
  window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
  if (navigator.onLine) {
    window.setTimeout(() => {
      void flushMetadataOutbox(item.workspaceId);
    }, 250);
  }
}

export async function pendingMetadataOperationCount(workspaceId: string): Promise<number> {
  const items = await localDb.localOutbox.where({ workspaceId }).toArray();
  return items.filter((item) => item.status === "pending" || item.status === "failed" || item.status === "syncing").length;
}

function shouldRetry(item: LocalOutboxItem): boolean {
  return item.retryCount < maxSyncAttempts;
}

export async function flushMetadataOutbox(workspaceId: string): Promise<void> {
  if (!navigator.onLine) return;
  const outbox = await localDb.localOutbox.where({ workspaceId }).toArray();
  const pending = outbox.filter((item) => (item.status === "pending" || item.status === "failed") && shouldRetry(item));
  if (pending.length === 0) return;

  await localDb.localOutbox.bulkPut(pending.map((item) => ({ ...item, status: "syncing" })));
  window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
  recordDiagnosticEvent("info", "sync", "Flushing metadata outbox", { workspaceId, count: pending.length });

  const operations: MetadataOperation[] = pending.map((item) => ({
    idempotencyKey: item.id,
    workspaceId: item.workspaceId,
    type: item.type,
    payload: item.payload,
    clientCreatedAt: item.createdAt
  }));

  try {
    const response = await notesApi.syncMetadata(operations);
    const results = response.results as MetadataSyncResult[];
    const completedIds: string[] = [];
    const retryItems: LocalOutboxItem[] = [];

    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index]!;
      const result = results[index];

      if (result?.page) {
        await cachePages(workspaceId, [result.page]);
        completedIds.push(item.id);
        continue;
      }

      if (result?.status === "applied") {
        completedIds.push(item.id);
        continue;
      }

      if (result?.status === "skipped" && result.reason === "already_applied") {
        completedIds.push(item.id);
        continue;
      }

      const nextItem = { ...item, retryCount: item.retryCount + 1, status: "failed" as const };
      retryItems.push(nextItem);
      const pageId = String(item.payload.pageId ?? item.payload.id ?? "");
      if (pageId) {
        const page = await localDb.localPages.get(pageId);
        if (page) await localDb.localPages.put({ ...page, syncStatus: nextItem.retryCount >= maxSyncAttempts ? "conflict" : "pending" });
      }
      recordDiagnosticEvent("warn", "sync", "Metadata operation was not applied", { type: item.type, reason: result?.reason, retryCount: nextItem.retryCount });
    }

    if (completedIds.length > 0) await localDb.localOutbox.bulkDelete(completedIds);
    if (retryItems.length > 0) await localDb.localOutbox.bulkPut(retryItems);
    recordDiagnosticEvent("info", "sync", "Metadata outbox flush completed", { workspaceId, completed: completedIds.length, failed: retryItems.length });
    window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
    window.dispatchEvent(new CustomEvent("notes:metadata-flushed"));
  } catch (error) {
    const failed = pending.map((item) => ({ ...item, retryCount: item.retryCount + 1, status: "failed" as const }));
    await localDb.localOutbox.bulkPut(failed);
    recordDiagnosticEvent("error", "sync", "Metadata outbox flush failed", error);
    window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
  }
}
