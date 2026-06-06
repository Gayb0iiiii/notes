import assert from "node:assert/strict";
import test from "node:test";

const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function shouldApplyMetadataOperation(page, operation) {
  if (operation.type === "create_page") return { apply: true };
  if (!page) return { apply: false, reason: "page_missing" };
  if (operation.type === "archive_page") return { apply: true };
  if ((page.archivedAt || page.deletedAt) && operation.type !== "restore_page") {
    return { apply: false, reason: "archive_wins" };
  }
  if (operation.type === "restore_page" && page.deletedAt) {
    return { apply: false, reason: "hard_delete_not_restorable" };
  }
  return { apply: true };
}

function validateImageUpload(input) {
  if (!allowedImageMimeTypes.includes(input.mimeType)) return { ok: false, reason: "unsupported_image_type" };
  if (input.sizeBytes <= 0) return { ok: false, reason: "empty_file" };
  if (input.sizeBytes > 15 * 1024 * 1024) return { ok: false, reason: "image_too_large" };
  return { ok: true };
}

test("archive wins over later rename metadata operations", () => {
  const page = { archivedAt: "2026-06-05T00:00:00.000Z", deletedAt: null, parentPageId: null };
  const result = shouldApplyMetadataOperation(page, {
    type: "rename_page",
    idempotencyKey: "op-1",
    workspaceId: "workspace-1",
    payload: { pageId: "page-1", title: "New title" },
    clientCreatedAt: "2026-06-05T00:01:00.000Z"
  });

  assert.deepEqual(result, { apply: false, reason: "archive_wins" });
});

test("create page is valid without an existing server page", () => {
  const result = shouldApplyMetadataOperation(null, {
    type: "create_page",
    idempotencyKey: "op-2",
    workspaceId: "workspace-1",
    payload: { pageId: "page-2", title: "Offline page" },
    clientCreatedAt: "2026-06-05T00:02:00.000Z"
  });

  assert.deepEqual(result, { apply: true });
});

test("image validation blocks svg and oversize uploads", () => {
  assert.deepEqual(validateImageUpload({ mimeType: "image/svg+xml", sizeBytes: 100 }), {
    ok: false,
    reason: "unsupported_image_type"
  });
  assert.deepEqual(validateImageUpload({ mimeType: "image/png", sizeBytes: 16 * 1024 * 1024 }), {
    ok: false,
    reason: "image_too_large"
  });
  assert.deepEqual(validateImageUpload({ mimeType: "image/webp", sizeBytes: 1024 }), { ok: true });
});
