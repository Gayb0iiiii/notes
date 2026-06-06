import type { SyncStatus as Status } from "@notes/shared";

const labels: Record<Status, string> = {
  synced: "Synced",
  offline: "Offline",
  saving_locally: "Saving locally",
  syncing: "Syncing",
  uploading_images: "Uploading images",
  sync_error: "Sync error",
  attention_required: "Needs attention"
};

export function SyncStatus({ status }: { status: Status }) {
  return <span className="sync-status" data-status={status}>{labels[status]}</span>;
}
