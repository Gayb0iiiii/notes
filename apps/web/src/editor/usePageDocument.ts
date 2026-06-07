import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { useEffect, useMemo, useState } from "react";
import { collabUrl } from "../lib/api";
import { demoWorkspaceId } from "../lib/demo";

export function usePageDocument(workspaceId: string | null, pageId: string | null) {
  const [connected, setConnected] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const ydoc = useMemo(() => (pageId ? new Y.Doc() : null), [pageId]);

  useEffect(() => {
    if (!workspaceId || !pageId || !ydoc) return;
    setLocalReady(false);
    const persistence = new IndexeddbPersistence(`page:${pageId}`, ydoc);
    persistence.once("synced", () => setLocalReady(true));
    const shouldConnectRealtime = navigator.onLine && workspaceId !== demoWorkspaceId;
    const provider = shouldConnectRealtime
      ? new HocuspocusProvider({
          url: collabUrl(),
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
      setLocalReady(false);
    };
  }, [workspaceId, pageId, ydoc]);

  return { ydoc, connected, localReady };
}
