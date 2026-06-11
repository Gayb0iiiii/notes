import Archive from "lucide-react/dist/esm/icons/archive.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import FilePlus2 from "lucide-react/dist/esm/icons/file-plus-2.js";
import Menu from "lucide-react/dist/esm/icons/menu.js";
import Pencil from "lucide-react/dist/esm/icons/pencil.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import X from "lucide-react/dist/esm/icons/x.js";
import { useEffect, useMemo, useState } from "react";
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

type SearchIndex = Record<string, string>;

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function blurActiveTextInput() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(activeElement.tagName)) {
    activeElement.blur();
  }
}

export function Sidebar({ workspaceId, pages, activePageId, open, onToggle, onSelect, onLocalChange }: SidebarProps) {
  const visiblePages = useMemo(() => pages.filter((page) => !page.archivedAt && !page.deletedAt), [pages]);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDeletePage, setPendingDeletePage] = useState<PageDto | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchIndex>({});
  const storageKey = `notes.collapsedPages.${workspaceId}`;

  const pageById = useMemo(() => new Map(visiblePages.map((page) => [page.id, page])), [visiblePages]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, PageDto[]>();
    for (const page of visiblePages) {
      const key = page.parentPageId ?? null;
      const children = map.get(key) ?? [];
      children.push(page);
      map.set(key, children);
    }
    for (const children of map.values()) {
      children.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    }
    return map;
  }, [visiblePages]);

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!trimmedSearch) return [];
    return visiblePages
      .map((page) => {
        const path = pagePath(page.id).join(" / ");
        const body = searchIndex[page.id] ?? "";
        const haystack = `${path} ${page.title} ${body}`.toLowerCase();
        if (!haystack.includes(trimmedSearch)) return null;
        return { page, path, body };
      })
      .filter((result): result is { page: PageDto; path: string; body: string } => Boolean(result))
      .slice(0, 40);
  }, [trimmedSearch, visiblePages, searchIndex]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setCollapsed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
  }, [collapsed, storageKey]);

  useEffect(() => {
    let cancelled = false;
    void localDb.localDocuments.toArray().then((documents) => {
      if (cancelled) return;
      setSearchIndex(Object.fromEntries(documents.map((document) => [document.pageId, stripHtml(document.html)])));
    });
    return () => {
      cancelled = true;
    };
  }, [pages.length, workspaceId]);

  function pagePath(pageId: string): string[] {
    const path: string[] = [];
    const seen = new Set<string>();
    let current = pageById.get(pageId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.title);
      current = current.parentPageId ? pageById.get(current.parentPageId) : undefined;
    }
    return path;
  }

  function hasChildren(pageId: string): boolean {
    return Boolean(childrenByParent.get(pageId)?.length);
  }

  function toggleCollapsed(pageId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  function expandAncestors(pageId: string) {
    const next = new Set(collapsed);
    let current = pageById.get(pageId);
    const seen = new Set<string>();
    while (current?.parentPageId && !seen.has(current.parentPageId)) {
      seen.add(current.parentPageId);
      next.delete(current.parentPageId);
      current = pageById.get(current.parentPageId);
    }
    setCollapsed(next);
  }

  function selectPage(pageId: string) {
    blurActiveTextInput();
    setEditingPageId(null);
    expandAncestors(pageId);
    onSelect(pageId);
  }

  async function createPage(parentPageId: string | null = null) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sortOrder = Date.now();
    await localDb.localPages.put({
      id,
      workspaceId,
      parentPageId,
      title: "Untitled",
      sortOrder,
      updatedAt: now,
      syncStatus: "pending"
    });
    await queueMetadataOperation({
      id: crypto.randomUUID(),
      workspaceId,
      type: "create_page",
      payload: { id, title: "Untitled", parentPageId, sortOrder }
    });
    if (parentPageId) {
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(parentPageId);
        return next;
      });
    }
    blurActiveTextInput();
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
    const children = childrenByParent.get(pageId) ?? [];
    return children.flatMap((child) => [child.id, ...descendantIds(child.id)]);
  }

  function requestDelete(page: PageDto) {
    if (hasChildren(page.id)) {
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
    return (childrenByParent.get(parentPageId) ?? []).map((page) => {
      const childCount = childrenByParent.get(page.id)?.length ?? 0;
      const isCollapsed = collapsed.has(page.id);
      return (
        <div key={page.id}>
          <div className={`tree-row ${activePageId === page.id ? "active" : ""}`} style={{ paddingLeft: 6 + depth * 14 }}>
            <button
              className="tree-toggle"
              type="button"
              aria-label={childCount > 0 ? `${isCollapsed ? "Expand" : "Collapse"} ${page.title}` : "No subpages"}
              disabled={childCount === 0}
              onClick={() => toggleCollapsed(page.id)}
            >
              {childCount > 0 ? (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : <span className="tree-toggle-spacer" />}
            </button>
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
              <button className="page-title-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectPage(page.id)}>{page.icon ?? ""}{page.title}</button>
            )}
            {editingPageId === page.id ? (
              <button type="button" title="Save" onClick={() => void saveRename(page.id)}><Check size={14} /></button>
            ) : (
              <button type="button" title="Rename" onClick={() => startRename(page)}><Pencil size={14} /></button>
            )}
            <button type="button" title="Create subpage" onClick={() => void createPage(page.id)}><FilePlus2 size={14} /></button>
            <button type="button" title="Archive" onClick={() => requestDelete(page)}><Archive size={14} /></button>
            {editingPageId === page.id ? <button type="button" title="Cancel" onClick={() => setEditingPageId(null)}><X size={14} /></button> : null}
          </div>
          {childCount > 0 && !isCollapsed ? renderBranch(page.id, depth + 1) : null}
        </div>
      );
    });
  }

  function renderSearchResults() {
    if (!trimmedSearch) return null;
    return (
      <div className="sidebar-search-results">
        <p className="sidebar-search-count">{searchResults.length} result{searchResults.length === 1 ? "" : "s"}</p>
        {searchResults.map(({ page, path, body }) => (
          <button className="sidebar-search-result" type="button" key={page.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectPage(page.id)}>
            <strong>{page.title}</strong>
            <span>{path}</span>
            {body ? <small>{body.slice(0, 96)}</small> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <button className="mobile-menu" type="button" title="Pages" onClick={onToggle}><Menu size={18} /></button>
      {open ? <button className="sidebar-backdrop" type="button" aria-label="Close pages" onClick={onToggle} /> : null}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-header">
          <strong>Pages</strong>
          <button type="button" title="Create page" onClick={() => void createPage(null)}><Plus size={16} /></button>
        </div>
        <label className="sidebar-search">
          <Search size={14} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search pages" />
          {searchQuery ? <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")}><X size={14} /></button> : null}
        </label>
        <nav>{trimmedSearch ? renderSearchResults() : renderBranch(null)}</nav>
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
            <h2 id="delete-dialog-title">Archive page?</h2>
            <p>
              <strong>{pendingDeletePage.title}</strong> has subpages. Choose what should happen to them.
            </p>
            <div className="delete-dialog-actions">
              <button type="button" autoFocus onClick={() => void archivePageOnly(pendingDeletePage)}>Archive page only</button>
              <button type="button" className="danger-action" onClick={() => void archivePages([pendingDeletePage.id, ...descendantIds(pendingDeletePage.id)])}>Archive page and subpages</button>
              <button type="button" onClick={() => setPendingDeletePage(null)}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
