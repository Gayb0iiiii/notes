import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { getServerUrl, notesApi, setServerUrl } from "../lib/api";
import { localDb } from "../lib/localDb";

interface LocalSettingsProps {
  open: boolean;
  onClose: () => void;
  onRequireLogin: () => void;
}

function serverLabel(value: string): string {
  return value || "Same origin / bundled app default";
}

export function LocalSettings({ open, onClose, onRequireLogin }: LocalSettingsProps) {
  const [serverUrl, setServerUrlDraft] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setServerUrlDraft(getServerUrl());
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  function closeToLogin() {
    onClose();
    onRequireLogin();
  }

  function saveServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setServerUrl(serverUrl);
    closeToLogin();
  }

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await notesApi.logout();
    } catch {
      // Local logout should still work when the server is offline or the session is already invalid.
    } finally {
      setBusy(false);
      closeToLogin();
    }
  }

  async function clearLocalCache() {
    const confirmed = window.confirm(
      "Clear all local offline notes, queued edits, cached documents, and cached images on this device? This does not delete server data."
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await localDb.delete();
      await localDb.open();
      closeToLogin();
    } catch {
      setError("Could not clear local cache. Close and reopen the app, then try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="local-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <p className="settings-eyebrow">Local app settings</p>
            <h2 id="local-settings-title">Connection</h2>
          </div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <form className="settings-section" onSubmit={saveServer}>
          <label>
            Server URL
            <input
              value={serverUrl}
              onChange={(event) => setServerUrlDraft(event.target.value)}
              inputMode="url"
              placeholder="https://notes.example.com"
              autoComplete="url"
              disabled={busy}
            />
          </label>
          <p className="settings-muted">Current target: {serverLabel(getServerUrl())}</p>
          <p className="settings-muted">Saving this sends you back to login so the app reconnects cleanly.</p>
          <button className="settings-primary" type="submit" disabled={busy}>
            Save server and go to login
          </button>
        </form>

        <div className="settings-section settings-actions">
          <button type="button" onClick={logout} disabled={busy}>
            Logout on this device
          </button>
          <button className="settings-danger" type="button" onClick={clearLocalCache} disabled={busy}>
            Clear local offline cache
          </button>
        </div>

        {error ? <p className="settings-error">{error}</p> : null}
      </section>
    </div>
  );
}
