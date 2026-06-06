import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { useEffect, useMemo, useState } from "react";
import { demoWorkspaceId } from "../lib/demo";

export function usePageDocument(workspaceId: string | null, pageId: string | null) {
  const [connected, setConnected] = useState(false);
  const ydoc = useMemo(() => (pageId ? new Y.Doc() : null), [pageId]);

  useEffect(() => {
    if (!workspaceId || !pageId || !ydoc) return;
    const persistence = new IndexeddbPersistence(`page:${pageId}`, ydoc);
    const shouldConnectRealtime = navigator.onLine && workspaceId !== demoWorkspaceId;
    const provider = shouldConnectRealtime
      ? new HocuspocusProvider({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/collab`,
          name: `workspace:${workspaceId}:page:${pageId}`,
          document: ydoc
        })
      : null;

    provider?.on("connect", () => setConnected(true));
    provider?.on("disconnect", () => setConnected(false));

    return () => {
      void persistence.destroy();
      provider?.destroy();
      ydoc.destroy();
      setConnected(false);
    };
  }, [workspaceId, pageId, ydoc]);

  return { ydoc, connected };
}
