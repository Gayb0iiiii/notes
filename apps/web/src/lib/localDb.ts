import Dexie, { type Table } from "dexie";
import type { AssetQueueItem, LocalOutboxItem, LocalPage } from "@notes/shared";

export class NotesLocalDb extends Dexie {
  localPages!: Table<LocalPage, string>;
  localOutbox!: Table<LocalOutboxItem, string>;
  localAssetQueue!: Table<AssetQueueItem, string>;
  localBlobs!: Table<{ id: string; blob: Blob; createdAt: string }, string>;
  localDocuments!: Table<{ pageId: string; html: string; updatedAt: string }, string>;

  constructor() {
    super("notes-local");
    this.version(1).stores({
      localPages: "id, workspaceId, parentPageId, updatedAt, syncStatus",
      localOutbox: "id, workspaceId, status, createdAt",
      localAssetQueue: "id, workspaceId, pageId, status, createdAt",
      localBlobs: "id, createdAt"
    });
    this.version(2).stores({
      localPages: "id, workspaceId, parentPageId, updatedAt, syncStatus",
      localOutbox: "id, workspaceId, status, createdAt",
      localAssetQueue: "id, workspaceId, pageId, status, createdAt",
      localBlobs: "id, createdAt",
      localDocuments: "pageId, updatedAt"
    });
  }
}

export const localDb = new NotesLocalDb();
