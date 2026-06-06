import type { PageDto, SyncStatus } from "@notes/shared";
import { create } from "zustand";

interface AppState {
  workspaceId: string | null;
  pages: PageDto[];
  activePageId: string | null;
  syncStatus: SyncStatus;
  sidebarOpen: boolean;
  setWorkspaceId: (workspaceId: string | null) => void;
  setPages: (pages: PageDto[]) => void;
  setActivePageId: (pageId: string | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  workspaceId: null,
  pages: [],
  activePageId: null,
  syncStatus: navigator.onLine ? "synced" : "offline",
  sidebarOpen: false,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setPages: (pages) => set({ pages }),
  setActivePageId: (activePageId) => set({ activePageId }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen })
}));
