import { validateImageUpload } from "@notes/shared";
import { apiUrl, notesApi } from "./api";
import { localDb } from "./localDb";

export async function queueOrUploadImage(workspaceId: string, pageId: string, file: File): Promise<{ assetId: string; src: string; uploadStatus: "pending" | "uploaded" }> {
  const validation = validateImageUpload({ mimeType: file.type, sizeBytes: file.size });
  if (!validation.ok) throw new Error(validation.reason);

  if (!navigator.onLine) {
    const id = crypto.randomUUID();
    const localBlobId = crypto.randomUUID();
    await localDb.localBlobs.put({ id: localBlobId, blob: file, createdAt: new Date().toISOString() });
    await localDb.localAssetQueue.put({
      id,
      workspaceId,
      pageId,
      localBlobId,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    return { assetId: id, src: URL.createObjectURL(file), uploadStatus: "pending" };
  }

  const upload = await notesApi.uploadUrl({ workspaceId, filename: file.name, mimeType: file.type, sizeBytes: file.size });
  await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  await notesApi.completeAsset(upload.assetId);
  return { assetId: upload.assetId, src: apiUrl(`/api/assets/${upload.assetId}`), uploadStatus: "uploaded" };
}
