export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export function isAllowedImageMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as AllowedImageMimeType);
}

export function validateImageUpload(input: { mimeType: string; sizeBytes: number }): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedImageMimeType(input.mimeType)) {
    return { ok: false, reason: "unsupported_image_type" };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: "empty_file" };
  }
  if (input.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, reason: "image_too_large" };
  }
  return { ok: true };
}
