import Archive from "lucide-react/dist/esm/icons/archive.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import FilePlus2 from "lucide-react/dist/esm/icons/file-plus-2.js";
import Menu from "lucide-react/dist/esm/icons/menu.js";
import Pencil from "lucide-react/dist/esm/icons/pencil.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import X from "lucide-react/dist/esm/icons/x.js";
import { useState } from "react";
import type { PageDto } from "@notes/shared";
import { localDb } from "../lib/localDb";
import { queueMetadataOperation } from "../lib/syncEngine";

interface SidebarProps {
  workspaceId: string;
  pages: PageDto[];
  activePageId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (pageId: string) => void;
  onLocalChange: () => void;
}

export function Sidebar({ workspaceId, pages, activePageId, open, onToggle, onSelect, onLocalChange }: SidebarProps) {
  const visiblePages = pages.filter((page) => !page.archivedAt && !page.deletedAt);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDeletePage, setPendingDeletePage] = useState<PageDto | null>(null);

  async function createPage(parentPageId: string | null = null) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await localDb.localPages.put({
      id,
      workspaceId,
      parentPageId,
      title: "Untitled",
      sortOrder: Date.now(),
      updatedAt: now,
      syncStatus: "pending"
    });
    await queueMetadataOperation({
      id: crypto.randomUUID(),
      workspaceId,
      type: "create_page",
      payload: { id, title: "Untitled", parentPageId, sortOrder: Date.now() }
    });
    onSelect(id);
    onLocalChange();
  }

  async function archivePages(pageIds: string[]) {
    const archivedAt = new Date().toISOString();
    for (const pageId of pageIds) {
      const page = await localDb.localPages.get(pageId);
      if (page) await localDb.localPages.put({ ...page, archivedAt, updatedAt: archivedAt, syncStatus: "pending" });
      await queueMetadataOperation({ id: crypto.randomUUID(), workspaceId, type: "archive_page", payload: { pageId } });
    }
    setPendingDeletePage(null);
    onLocalChange();
  }

  async function archivePageOnly(page: PageDto) {
    const directChildren = visiblePages.filter((candidate) => candidate.parentPageId === page.id);
    const now = new Date().toISOString();

    for (const child of directChildren) {
      const localChild = await localDb.localPages.get(child.id);
      if (localChild) {
        await localDb.localPages.put({ ...localChild, parentPageId: page.parentPageId, updatedAt: now, syncStatus: "pending" });
      }
      await queueMetadataOperation({
        id: crypto.randomUUID(),
        workspaceId,
        type: "move_page",
        payload: { pageId: child.id, parentPageId: page.parentPageId, sortOrder: child.sortOrder }
      });
    }

    await archivePages([page.id]);
  }

  function descendantIds(pageId: string): string[] {
    const children = visiblePages.filter((page) => page.parentPageId === pageId);
    return children.flatMap((child) => [child.id, ...descendantIds(child.id)]);
  }

  function requestDelete(page: PageDto) {
    if (visiblePages.some((candidate) => candidate.parentPageId === page.id)) {
      setPendingDeletePage(page);
      return;
    }
    void archivePages([page.id]);
  }

  function startRename(page: PageDto) {
    setEditingPageId(page.id);
    setDraftTitle(page.title);
  }

  async function saveRename(pageId: string) {
    const title = draftTitle.trim() || "Untitled";
    const page = await localDb.localPages.get(pageId);
    if (page) await localDb.localPages.put({ ...page, title, updatedAt: new Date().toISOString(), syncStatus: "pending" });
    await queueMetadataOperation({ id: crypto.randomUUID(), workspaceId, type: "rename_page", payload: { pageId, title } });
    setEditingPageId(null);
    setDraftTitle("");
    onLocalChange();
  }

  function renderBranch(parentPageId: string | null, depth = 0) {
    return visiblePages
      .filter((page) => page.parentPageId === parentPageId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .map((page) => (
        <div key={page.id}>
          <div className={`tree-row ${activePageId === page.id ? "active" : ""}`} style={{ paddingLeft: 12 + depth * 14 }}>
            {editingPageId === page.id ? (
              <input
                className="page-title-input"
                value={draftTitle}
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveRename(page.id);
                  if (event.key === "Escape") setEditingPageId(null);
                }}
              />
            ) : (
              <button className="page-title-button" onClick={() => onSelect(page.id)}>{page.icon ?? ""}{page.title}</button>
            )}
            {editingPageId === page.id ? (
              <button title="Save" onClick={() => void saveRename(page.id)}><Check size={14} /></button>
            ) : (
              <button title="Rename" onClick={() => startRename(page)}><Pencil size={14} /></button>
            )}
            <button title="Create subpage" onClick={() => void createPage(page.id)}><FilePlus2 size={14} /></button>
            <button title="Delete" onClick={() => requestDelete(page)}><Archive size={14} /></button>
            {editingPageId === page.id ? <button title="Cancel" onClick={() => setEditingPageId(null)}><X size={14} /></button> : null}
          </div>
          {renderBranch(page.id, depth + 1)}
        </div>
      ));
  }

  return (
    <>
      <button className="mobile-menu" title="Pages" onClick={onToggle}><Menu size={18} /></button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-header">
          <strong>Pages</strong>
          <button title="Create page" onClick={() => void createPage(null)}><Plus size={16} /></button>
        </div>
        <nav>{renderBranch(null)}</nav>
      </aside>
      {pendingDeletePage ? (
        <div className="delete-dialog-backdrop" role="presentation">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setPendingDeletePage(null);
            }}
          >
            <h2 id="delete-dialog-title">Delete page?</h2>
            <p>
              <strong>{pendingDeletePage.title}</strong> has subpages. Choose what should happen to them.
            </p>
            <div className="delete-dialog-actions">
              <button type="button" autoFocus onClick={() => void archivePageOnly(pendingDeletePage)}>Delete page only</button>
              <button type="button" className="danger-action" onClick={() => void archivePages([pendingDeletePage.id, ...descendantIds(pendingDeletePage.id)])}>Delete page and subpages</button>
              <button type="button" onClick={() => setPendingDeletePage(null)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
