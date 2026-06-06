import { localDb } from "./localDb";

export const demoWorkspaceId = "00000000-0000-4000-8000-000000000001";
export const demoPageId = "00000000-0000-4000-8000-000000000101";

export async function bootstrapOfflineWorkspace(): Promise<string> {
  const existing = await localDb.localPages.where({ workspaceId: demoWorkspaceId }).first();
  if (existing) return demoWorkspaceId;

  const now = new Date().toISOString();
  await localDb.localPages.put({
    id: demoPageId,
    workspaceId: demoWorkspaceId,
    parentPageId: null,
    title: "Offline Demo Notes",
    sortOrder: 0,
    updatedAt: now,
    syncStatus: "pending"
  });
  return demoWorkspaceId;
}

export async function bootstrapOfflineDemo(): Promise<void> {
  await bootstrapOfflineWorkspace();
}

export function isDemoLogin(username: string, password: string): boolean {
  return username === "owner" && password === "change-me-now";
}
