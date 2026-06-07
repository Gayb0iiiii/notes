import type { LocalOutboxItem, MetadataOperation, PageDto } from "@notes/shared";
import { notesApi } from "./api";
import { localDb } from "./localDb";

type MetadataSyncResult = {
  status?: "applied" | "skipped";
  reason?: string;
  page?: PageDto | null;
};

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
  window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
}

export async function pendingMetadataOperationCount(workspaceId: string): Promise<number> {
  const items = await localDb.localOutbox.where({ workspaceId }).toArray();
  return items.filter((item) => item.status === "pending" || item.status === "failed" || item.status === "syncing").length;
}

export async function flushMetadataOutbox(workspaceId: string): Promise<void> {
  if (!navigator.onLine) return;
  const outbox = await localDb.localOutbox.where({ workspaceId }).toArray();
  const pending = outbox.filter((item) => item.status === "pending" || item.status === "failed");
  if (pending.length === 0) return;
  await localDb.localOutbox.bulkPut(pending.map((item) => ({ ...item, status: "syncing" })));
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
    const failedItems: LocalOutboxItem[] = [];

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

      const pageId = String(item.payload.pageId ?? item.payload.id ?? "");
      if (pageId) {
        const page = await localDb.localPages.get(pageId);
        if (page) await localDb.localPages.put({ ...page, syncStatus: "conflict" });
      }
      failedItems.push({ ...item, retryCount: item.retryCount + 1, status: "failed" });
    }

    if (completedIds.length > 0) await localDb.localOutbox.bulkDelete(completedIds);
    if (failedItems.length > 0) await localDb.localOutbox.bulkPut(failedItems);
    window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
  } catch {
    await localDb.localOutbox.bulkPut(pending.map((item) => ({ ...item, retryCount: item.retryCount + 1, status: "failed" })));
    window.dispatchEvent(new CustomEvent("notes:outbox-changed"));
  }
}
