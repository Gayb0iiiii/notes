import type { MetadataOperation, PageDto, Role } from "./types";

export function canEdit(role: Role): boolean {
  return role === "owner" || role === "editor";
}

export function canManageUsers(role: Role): boolean {
  return role === "owner";
}

export function sortPagesForTree(pages: PageDto[]): PageDto[] {
  return [...pages].sort((a, b) => {
    if (a.parentPageId !== b.parentPageId) {
      return (a.parentPageId ?? "").localeCompare(b.parentPageId ?? "");
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.title.localeCompare(b.title);
  });
}

export function normalizeTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : "Untitled";
}

type ArchiveFields = { archivedAt: string | Date | null; deletedAt: string | Date | null };

export function isArchived(page: ArchiveFields): boolean {
  return Boolean(page.archivedAt || page.deletedAt);
}

export function shouldApplyMetadataOperation(
  page: (ArchiveFields & { parentPageId: string | null }) | null,
  operation: MetadataOperation
): { apply: boolean; reason?: string } {
  if (operation.type === "create_page") {
    return { apply: true };
  }

  if (!page) {
    return { apply: false, reason: "page_missing" };
  }

  if (operation.type === "archive_page") {
    return { apply: true };
  }

  if (isArchived(page) && operation.type !== "restore_page") {
    return { apply: false, reason: "archive_wins" };
  }

  if (operation.type === "restore_page" && page.deletedAt) {
    return { apply: false, reason: "hard_delete_not_restorable" };
  }

  return { apply: true };
}

export function mergePageLinks(sourcePageId: string, targetPageIds: string[]): Array<{ sourcePageId: string; targetPageId: string }> {
  return [...new Set(targetPageIds)]
    .filter((targetPageId) => targetPageId !== sourcePageId)
    .map((targetPageId) => ({ sourcePageId, targetPageId }));
}
