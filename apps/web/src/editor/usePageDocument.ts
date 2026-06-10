import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { useEffect, useMemo, useState } from "react";
import { collabUrl } from "../lib/api";
import { recordDiagnosticEvent } from "../lib/diagnostics";
import { demoWorkspaceId } from "../lib/demo";

export function usePageDocument(workspaceId: string | null, pageId: string | null) {
  const [connected, setConnected] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const ydoc = useMemo(() => (pageId ? new Y.Doc() : null), [pageId]);

  useEffect(() => {
    if (!workspaceId || !pageId || !ydoc) return;
    setLocalReady(false);
    const persistence = new IndexeddbPersistence(`page:${pageId}`, ydoc);
    persistence.once("synced", () => {
      setLocalReady(true);
      recordDiagnosticEvent("info", "editor", "Local page document ready", { workspaceId, pageId });
    });

    const shouldConnectRealtime = navigator.onLine && workspaceId !== demoWorkspaceId;
    const url = collabUrl();
    const provider = shouldConnectRealtime
      ? new HocuspocusProvider({
          url,
          name: `workspace:${workspaceId}:page:${pageId}`,
          document: ydoc
        })
      : null;

    if (provider) {
      recordDiagnosticEvent("info", "collab", "Realtime provider created", { url, workspaceId, pageId });
      provider.on("connect", () => {
        setConnected(true);
        recordDiagnosticEvent("info", "collab", "Realtime connected", { workspaceId, pageId });
      });
      provider.on("disconnect", (payload) => {
        setConnected(false);
        recordDiagnosticEvent("warn", "collab", "Realtime disconnected", { workspaceId, pageId, payload });
      });
      provider.on("status", (payload) => {
        recordDiagnosticEvent("info", "collab", "Realtime status", { workspaceId, pageId, payload });
      });
      provider.on("authenticationFailed", (payload) => {
        setConnected(false);
        recordDiagnosticEvent("error", "collab", "Realtime authentication failed", { workspaceId, pageId, payload });
      });
    } else {
      recordDiagnosticEvent("info", "collab", "Realtime disabled for local/demo/offline document", { workspaceId, pageId, online: navigator.onLine });
    }

    return () => {
      void persistence.destroy();
      provider?.destroy();
      ydoc.destroy();
      setConnected(false);
      setLocalReady(false);
    };
  }, [workspaceId, pageId, ydoc]);

  return { ydoc, connected, localReady };
}
