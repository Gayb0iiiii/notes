import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { PageDto } from "@notes/shared";
import { Login } from "./components/Login";
import { Sidebar } from "./components/Sidebar";
import { SyncStatus } from "./components/SyncStatus";
import { Backlinks } from "./components/Backlinks";
import { AdminPanel } from "./components/AdminPanel";
import { LocalSettings } from "./components/LocalSettings";
import { notesApi } from "./lib/api";
import { bootstrapOfflineWorkspace } from "./lib/demo";
import { localDb } from "./lib/localDb";
import { cachePages, flushMetadataOutbox, pendingMetadataOperationCount } from "./lib/syncEngine";
import { useAppStore } from "./store/appStore";

const NotesEditor = lazy(() => import("./editor/NotesEditor").then((module) => ({ default: module.NotesEditor })));

export function App() {
  const { workspaceId, pages, activePageId, syncStatus, sidebarOpen, setWorkspaceId, setPages, setActivePageId, setSyncStatus, setSidebarOpen } = useAppStore();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<"notes" | "admin">("notes");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visiblePages = useMemo(() => pages.filter((page) => !page.archivedAt && !page.deletedAt), [pages]);
  const activePage = useMemo(() => visiblePages.find((page) => page.id === activePageId) ?? visiblePages[0] ?? null, [activePageId, visiblePages]);

  async function loadLocalPages(id: string): Promise<PageDto[]> {
    const localPages = await localDb.localPages.where({ workspaceId: id }).toArray();
    const nextPages = localPages
      .map((page) => ({
        id: page.id,
        workspaceId: page.workspaceId,
        parentPageId: page.parentPageId,
        title: page.title,
        icon: page.icon ?? null,
        sortOrder: page.sortOrder,
        createdBy: "",
        updatedBy: "",
        createdAt: page.updatedAt,
        updatedAt: page.updatedAt,
        archivedAt: page.archivedAt ?? null,
        deletedAt: page.deletedAt ?? null
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const visibleNextPages = nextPages.filter((page) => !page.archivedAt && !page.deletedAt);
    setPages(nextPages);
    if (!visibleNextPages.some((page) => page.id === activePageId)) {
      setActivePageId((visibleNextPages[0] ?? null)?.id ?? null);
    }
    return nextPages;
  }

  async function localWorkspaceId(): Promise<string | null> {
    return workspaceId ?? (await localDb.localPages.orderBy("workspaceId").first())?.workspaceId ?? null;
  }

  async function openLocalWorkspace(id: string, status: "offline" | "sync_error" | "saving_locally") {
    setWorkspaceId(id);
    await loadLocalPages(id);
    setAuthenticated(true);
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    const queued = await pendingMetadataOperationCount(id);
    setSyncStatus(queued > 0 ? "saving_locally" : status);
  }

  function resetToLogin() {
    setAuthenticated(false);
    setWorkspaceId(null);
    setPages([]);
    setActivePageId(null);
    setSyncStatus(navigator.onLine ? "synced" : "offline");
    setActiveView("notes");
    setSidebarOpen(false);
  }

  async function boot() {
    const cachedWorkspaceId = await localWorkspaceId();
    if (cachedWorkspaceId) {
      await openLocalWorkspace(cachedWorkspaceId, navigator.onLine ? "sync_error" : "offline");
    } else if (!navigator.onLine) {
      await openLocalWorkspace(await bootstrapOfflineWorkspace(), "offline");
      return;
    }

    try {
      const workspaces = await notesApi.workspaces();
      const workspace = workspaces[0];
      if (!workspace) throw new Error("No workspace");
      setWorkspaceId(workspace.id);
      await loadLocalPages(workspace.id);
      const remote = await notesApi.pages(workspace.id);
      await cachePages(workspace.id, remote.pages);
      setPages(remote.pages);
      const visibleRemotePages = remote.pages.filter((page) => !page.archivedAt && !page.deletedAt);
      if (!visibleRemotePages.some((page) => page.id === activePageId)) {
        setActivePageId((visibleRemotePages[0] ?? null)?.id ?? null);
      }
      setAuthenticated(true);
      setSyncStatus("synced");
    } catch {
      if (!cachedWorkspaceId) setAuthenticated(false);
    }
  }

  useEffect(() => {
    void boot();
    const online = () => {
      setSyncStatus("syncing");
      if (workspaceId) void flushMetadataOutbox(workspaceId).finally(() => void boot());
    };
    const offline = () => setSyncStatus("offline");
    const refreshOutboxStatus = () => {
      if (!workspaceId) return;
      void pendingMetadataOperationCount(workspaceId).then((queued) => {
        if (!navigator.onLine) setSyncStatus("offline");
        else if (queued > 0) setSyncStatus("saving_locally");
      });
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("notes:offline-ready", refreshOutboxStatus);
    window.addEventListener("notes:outbox-changed", refreshOutboxStatus);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("notes:offline-ready", refreshOutboxStatus);
      window.removeEventListener("notes:outbox-changed", refreshOutboxStatus);
    };
  }, [workspaceId]);

  if (authenticated === null) return <main className="loading-screen">Loading local workspace...</main>;
  if (!authenticated) return <Login onLogin={() => void boot()} />;
  if (!workspaceId) return <main className="loading-screen">No workspace available</main>;

  return (
    <div className="app-shell">
      <Sidebar
        workspaceId={workspaceId}
        pages={pages}
        activePageId={activePage?.id ?? null}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelect={(pageId) => {
          setActivePageId(pageId);
        }}
        onLocalChange={() => void loadLocalPages(workspaceId)}
      />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Private Notes</span>
            <h1>{activeView === "admin" ? "Admin" : activePage?.title ?? "Untitled"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="view-toggle" type="button" onClick={() => setActiveView(activeView === "admin" ? "notes" : "admin")}>
              {activeView === "admin" ? "Notes" : "Admin"}
            </button>
            <button className="view-toggle" type="button" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
            <SyncStatus status={syncStatus} />
          </div>
        </header>
        {activeView === "admin" ? (
          <AdminPanel workspaceId={workspaceId} />
        ) : activePage ? (
          <>
            <Suspense fallback={<div className="editor-empty">Loading local editor...</div>}>
              <NotesEditor workspaceId={workspaceId} page={activePage} pages={pages} />
            </Suspense>
            <Backlinks pageId={activePage.id} onSelect={setActivePageId} />
          </>
        ) : (
          <section className="empty-state">Create a page to start writing.</section>
        )}
      </main>
      <LocalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} onRequireLogin={resetToLogin} />
    </div>
  );
}
