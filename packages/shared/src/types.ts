export type Role = "owner" | "editor";

export type SyncStatus =
  | "synced"
  | "offline"
  | "saving_locally"
  | "syncing"
  | "uploading_images"
  | "sync_error"
  | "attention_required";

export type PageOperationType =
  | "create_page"
  | "rename_page"
  | "move_page"
  | "archive_page"
  | "restore_page"
  | "reorder_page";

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  ownerUserId: string;
}

export interface PageDto {
  id: string;
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon: string | null;
  sortOrder: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface LocalPage {
  id: string;
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon?: string | null;
  sortOrder: number;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  syncStatus: "synced" | "pending" | "conflict" | "error";
}

export interface LocalOutboxItem<TPayload = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  type: PageOperationType;
  payload: TPayload;
  createdAt: string;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
}

export interface MetadataOperation<TPayload = Record<string, unknown>> {
  idempotencyKey: string;
  workspaceId: string;
  type: PageOperationType;
  payload: TPayload;
  clientCreatedAt: string;
}

export interface AssetQueueItem {
  id: string;
  workspaceId: string;
  pageId: string;
  localBlobId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
  remoteAssetId?: string;
  createdAt: string;
}

export interface PageMentionAttrs {
  pageId: string;
  fallbackTitle: string;
}

export interface ImageNodeAttrs {
  assetId: string;
  src: string;
  alt: string;
  uploadStatus: "pending" | "uploading" | "uploaded" | "failed";
}
