import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { useEffect, useMemo, useState } from "react";
import { collabUrl, nativeSessionCookie } from "../lib/api";
import { recordDiagnosticEvent } from "../lib/diagnostics";
import { demoWorkspaceId } from "../lib/demo";

export function usePageDocument(workspaceId: string | null, pageId: string | null) {
  const [connected, setConnected] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const ydoc = useMemo(() => (pageId ? new Y.Doc() : null), [pageId]);

  useEffect(() => {
    if (!workspaceId || !pageId || !ydoc) return;
    setLocalReady(false);
    setProvider(null);
    const persistence = new IndexeddbPersistence(`page:${pageId}`, ydoc);
    persistence.once("synced", () => {
      setLocalReady(true);
      recordDiagnosticEvent("info", "editor", "Local page document ready", { workspaceId, pageId });
    });

    const shouldConnectRealtime = navigator.onLine && workspaceId !== demoWorkspaceId;
    const url = collabUrl();
    const token = nativeSessionCookie();
    const realtimeProvider = shouldConnectRealtime
      ? new HocuspocusProvider({
          url,
          name: `workspace:${workspaceId}:page:${pageId}`,
          document: ydoc,
          token: token ?? undefined
        })
      : null;

    setProvider(realtimeProvider);

    if (realtimeProvider) {
      recordDiagnosticEvent("info", "collab", "Realtime provider created", { url, workspaceId, pageId, hasToken: Boolean(token) });
      realtimeProvider.on("connect", () => {
        setConnected(true);
        recordDiagnosticEvent("info", "collab", "Realtime connected", { workspaceId, pageId });
      });
      realtimeProvider.on("disconnect", (payload) => {
        setConnected(false);
        recordDiagnosticEvent("warn", "collab", "Realtime disconnected", { workspaceId, pageId, payload });
      });
      realtimeProvider.on("status", (payload) => {
        recordDiagnosticEvent("info", "collab", "Realtime status", { workspaceId, pageId, payload });
      });
      realtimeProvider.on("authenticationFailed", (payload) => {
        setConnected(false);
        recordDiagnosticEvent("error", "collab", "Realtime authentication failed", { workspaceId, pageId, payload });
      });
    } else {
      recordDiagnosticEvent("info", "collab", "Realtime disabled for local/demo/offline document", { workspaceId, pageId, online: navigator.onLine });
    }

    return () => {
      setProvider(null);
      void persistence.destroy();
      realtimeProvider?.destroy();
      ydoc.destroy();
      setConnected(false);
      setLocalReady(false);
    };
  }, [workspaceId, pageId, ydoc]);

  return { ydoc, provider, connected, localReady };
}
