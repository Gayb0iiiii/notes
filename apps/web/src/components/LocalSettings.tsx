import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiUrl, getServerUrl, notesApi, setServerUrl } from "../lib/api";
import { buildDiagnosticReport, clearDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent } from "../lib/diagnostics";
import { localDb } from "../lib/localDb";

interface LocalSettingsProps {
  open: boolean;
  onClose: () => void;
  onRequireLogin: () => void;
}

function serverLabel(value: string): string {
  return value || "Same origin / bundled app default";
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function LocalSettings({ open, onClose, onRequireLogin }: LocalSettingsProps) {
  const [serverUrl, setServerUrlDraft] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [diagnosticVersion, setDiagnosticVersion] = useState(0);
  const diagnostics = useMemo(() => getDiagnosticEvents(), [diagnosticVersion]);

  useEffect(() => {
    if (open) {
      setServerUrlDraft(getServerUrl());
      setError(null);
      setStatus(null);
      setDiagnosticVersion((version) => version + 1);
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
    try {
      setServerUrl(serverUrl);
      recordDiagnosticEvent("info", "settings", "Server URL saved", { serverUrl });
      closeToLogin();
    } catch {
      setError("Server URL is invalid. Use a full URL like https://notes.yeetserver.net");
    }
  }

  async function testConnection() {
    setBusy(true);
    setError(null);
    setStatus("Testing server...");
    try {
      const healthResponse = await fetch(apiUrl("/health"), { credentials: "include" });
      const healthBody = await healthResponse.text();
      if (!healthResponse.ok) throw new Error(`Health check failed: ${healthResponse.status} ${healthBody}`);

      try {
        await notesApi.me();
        setStatus("Server reachable and session is valid.");
        recordDiagnosticEvent("info", "settings", "Server test passed with valid session");
      } catch (authError) {
        setStatus("Server reachable. Login/session is not valid yet.");
        recordDiagnosticEvent("warn", "settings", "Server reachable but auth check failed", authError);
      }
    } catch (connectionError) {
      const message = connectionError instanceof Error ? connectionError.message : "Connection test failed";
      setError(message);
      setStatus(null);
      recordDiagnosticEvent("error", "settings", "Server test failed", connectionError);
    } finally {
      setBusy(false);
      setDiagnosticVersion((version) => version + 1);
    }
  }

  async function copyDiagnostics() {
    setBusy(true);
    setError(null);
    try {
      await copyText(buildDiagnosticReport({ serverUrl: getServerUrl() }));
      setStatus("Diagnostics copied. Paste them into ChatGPT if sync still fails.");
    } catch {
      setError("Could not copy diagnostics. Try long-press selecting the text after testing connection.");
    } finally {
      setBusy(false);
      setDiagnosticVersion((version) => version + 1);
    }
  }

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await notesApi.logout();
    } catch (logoutError) {
      recordDiagnosticEvent("warn", "settings", "Server logout failed; local logout continued", logoutError);
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
      clearDiagnosticEvents();
      closeToLogin();
    } catch (cacheError) {
      setError("Could not clear local cache. Close and reopen the app, then try again.");
      recordDiagnosticEvent("error", "settings", "Local cache clear failed", cacheError);
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
          <button className="settings-primary" type="submit" disabled={busy}>
            Save server and go to login
          </button>
        </form>

        <div className="settings-section settings-actions">
          <button type="button" onClick={testConnection} disabled={busy}>
            Test server connection
          </button>
          <button type="button" onClick={copyDiagnostics} disabled={busy}>
            Copy diagnostics for ChatGPT
          </button>
          <button type="button" onClick={logout} disabled={busy}>
            Logout on this device
          </button>
          <button className="settings-danger" type="button" onClick={clearLocalCache} disabled={busy}>
            Clear local offline cache
          </button>
        </div>

        <div className="settings-section">
          <p className="settings-muted">Diagnostics stored on this device: {diagnostics.length}</p>
          {diagnostics.slice(-4).map((event) => (
            <pre className="settings-log" key={event.id}>{event.ts} [{event.level}] {event.area}: {event.message}</pre>
          ))}
        </div>

        {status ? <p className="settings-status">{status}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </section>
    </div>
  );
}
