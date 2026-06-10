export const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024;

export function isSupportedAssetMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export function validateAssetUpload(input: { mimeType: string; sizeBytes: number }): { ok: true } | { ok: false; reason: string } {
  if (!isSupportedAssetMimeType(input.mimeType)) {
    return { ok: false, reason: "unsupported_asset_type" };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: "empty_file" };
  }
  if (input.sizeBytes > MAX_ASSET_SIZE_BYTES) {
    return { ok: false, reason: "asset_too_large" };
  }
  return { ok: true };
}

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_SIZE_BYTES = MAX_ASSET_SIZE_BYTES;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export function isAllowedImageMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return mimeType.startsWith("image/");
}

export function validateImageUpload(input: { mimeType: string; sizeBytes: number }): { ok: true } | { ok: false; reason: string } {
  return validateAssetUpload(input);
}
