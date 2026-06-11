import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.js";
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js";
import History from "lucide-react/dist/esm/icons/history.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import { useEffect, useState } from "react";
import type { PageHistoryResponse } from "../lib/api";
import { notesApi } from "../lib/api";

interface PageHistorySummaryProps {
  pageId: string;
  onOpen: () => void;
}

interface PageHistoryPanelProps {
  pageId: string;
  pageTitle: string;
  onBack: () => void;
}

function formatEditedAt(value: string): string {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatFullEditedAt(value: string): string {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function revisionWord(count: number): string {
  return count === 1 ? "revision" : "revisions";
}

export function PageHistorySummary({ pageId, onOpen }: PageHistorySummaryProps) {
  const [history, setHistory] = useState<PageHistoryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    void notesApi
      .pageHistory(pageId)
      .then((response) => {
        if (!cancelled) setHistory(response);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const lastEdited = history?.lastEdited;

  return (
    <button className="page-history-summary" type="button" onClick={onOpen}>
      <Clock3 size={14} />
      {lastEdited ? (
        <span>
          Last edited by <strong>{lastEdited.editor.displayName}</strong> at {formatEditedAt(lastEdited.editedAt)}
        </span>
      ) : (
        <span>Open page history</span>
      )}
    </button>
  );
}

export function PageHistoryPanel({ pageId, pageTitle, onBack }: PageHistoryPanelProps) {
  const [history, setHistory] = useState<PageHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      setHistory(await notesApi.pageHistory(pageId));
    } catch {
      setError("Could not load page history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [pageId]);

  const revisions = history?.revisions ?? [];

  return (
    <section className="page-history-panel">
      <div className="page-history-topbar">
        <button className="history-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to page
        </button>
        <button className="history-refresh" type="button" onClick={() => void loadHistory()} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="history-heading">
        <div>
          <span className="breadcrumb">Page History</span>
          <h2>{pageTitle}</h2>
        </div>
        <div className="history-revision-count">
          <History size={16} />
          {revisions.length} {revisionWord(revisions.length)}
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="admin-muted">Loading history...</p> : null}

      {!loading && revisions.length === 0 ? (
        <div className="history-empty">
          <History size={22} />
          <strong>No editor history yet</strong>
          <p>Once someone edits this page, their changes will show here.</p>
        </div>
      ) : null}

      <div className="history-list">
        {revisions.map((revision) => (
          <article className="history-card" key={revision.id}>
            <div className="history-card-main">
              <strong>{revision.editor.displayName}</strong>
              <span>edited this page</span>
              <time dateTime={revision.editedAt}>{formatFullEditedAt(revision.editedAt)}</time>
            </div>
            <div className="history-diff-stats" aria-label="Revision change size">
              <span className="diff-add">+{revision.additions}</span>
              <span className="diff-delete">-{revision.deletions}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
