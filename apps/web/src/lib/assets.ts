import { validateImageUpload } from "@notes/shared";
import { notesApi } from "./api";
import { localDb } from "./localDb";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function queueLocalImage(workspaceId: string, pageId: string, file: File, id = crypto.randomUUID()) {
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
  return { assetId: id, src: await fileToDataUrl(file), uploadStatus: "pending" as const };
}

export async function queueOrUploadImage(workspaceId: string, pageId: string, file: File): Promise<{ assetId: string; src: string; uploadStatus: "pending" | "uploaded" }> {
  const validation = validateImageUpload({ mimeType: file.type, sizeBytes: file.size });
  if (!validation.ok) throw new Error(validation.reason);

  if (!navigator.onLine) {
    return queueLocalImage(workspaceId, pageId, file);
  }

  try {
    const upload = await notesApi.uploadUrl({ workspaceId, filename: file.name, mimeType: file.type, sizeBytes: file.size });
    await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    await notesApi.completeAsset(upload.assetId);
    const asset = await notesApi.asset(upload.assetId);
    return { assetId: upload.assetId, src: asset.url, uploadStatus: "uploaded" };
  } catch {
    return queueLocalImage(workspaceId, pageId, file);
  }
}
