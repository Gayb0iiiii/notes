import { useEffect, useState } from "react";
import type { PageDto } from "@notes/shared";
import { notesApi } from "../lib/api";

export function Backlinks({ pageId, onSelect }: { pageId: string; onSelect: (pageId: string) => void }) {
  const [backlinks, setBacklinks] = useState<PageDto[]>([]);

  useEffect(() => {
    if (!navigator.onLine) return;
    void notesApi.backlinks(pageId).then((result) => setBacklinks(result.backlinks)).catch(() => setBacklinks([]));
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
