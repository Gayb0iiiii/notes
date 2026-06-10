import { useEffect, useState } from "react";
import type { PageDto } from "@notes/shared";
import { isApiError, notesApi } from "../lib/api";
import { recordDiagnosticEvent } from "../lib/diagnostics";

export function Backlinks({ pageId, onSelect }: { pageId: string; onSelect: (pageId: string) => void }) {
  const [backlinks, setBacklinks] = useState<PageDto[]>([]);

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;

    void notesApi
      .backlinks(pageId)
      .then((result) => {
        if (!cancelled) setBacklinks(result.backlinks);
      })
      .catch((error) => {
        if (isApiError(error) && error.details.status === 404) {
          recordDiagnosticEvent("info", "backlinks", "Backlinks skipped until page metadata syncs", { pageId });
        } else {
          recordDiagnosticEvent("warn", "backlinks", "Backlinks failed", error);
        }
        if (!cancelled) setBacklinks([]);
      });

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (backlinks.length === 0) return null;
  return (
    <aside className="backlinks">
      <strong>Backlinks</strong>
      {backlinks.map((page) => (
        <button key={page.id} onClick={() => onSelect(page.id)}>{page.title}</button>
      ))}
    </aside>
  );
}
