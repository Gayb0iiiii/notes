import Cloud from "lucide-react/dist/esm/icons/cloud.js";
import DatabaseBackup from "lucide-react/dist/esm/icons/database-backup.js";
import FileArchive from "lucide-react/dist/esm/icons/file-archive.js";
import KeyRound from "lucide-react/dist/esm/icons/key-round.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import Upload from "lucide-react/dist/esm/icons/upload.js";
import UserPlus from "lucide-react/dist/esm/icons/user-plus.js";
import XCircle from "lucide-react/dist/esm/icons/x-circle.js";
import type { NotionImportPreview } from "@notes/shared";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { AdminUser } from "../lib/api";
import { notesApi } from "../lib/api";

interface AdminPanelProps {
  workspaceId: string;
}

const initialForm = {
  username: "",
  displayName: "",
  password: "",
  role: "editor" as "owner" | "editor"
};

function formatLastLogin(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function AdminPanel({ workspaceId }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState(initialForm);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<NotionImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await notesApi.users());
    } catch {
      setError("Only workspace owners can manage users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await notesApi.createUser({ workspaceId, ...form });
      setForm(initialForm);
      await loadUsers();
    } catch {
      setError("Could not create user. Password must be at least 10 characters and username must be unique.");
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(user: AdminUser, updates: Partial<Pick<AdminUser, "displayName" | "role">>) {
    setSaving(true);
    setError(null);
    try {
      await notesApi.updateUser(user.id, { workspaceId, ...updates });
      await loadUsers();
    } catch {
      setError("Could not update user.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`Remove ${user.displayName} from this workspace?`)) return;
    setSaving(true);
    setError(null);
    try {
      await notesApi.deleteUser(user.id, workspaceId);
      await loadUsers();
    } catch {
      setError("Could not remove user.");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(user: AdminUser) {
    const password = passwordDrafts[user.id]?.trim();
    if (!password) return;
    setSaving(true);
    setError(null);
    try {
      await notesApi.updateUser(user.id, { workspaceId, password });
      setPasswordDrafts((current) => ({ ...current, [user.id]: "" }));
    } catch {
      setError("Could not reset password. New passwords must be at least 10 characters.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await notesApi.uploadNotionImport(workspaceId, importFile);
      setImportPreview(result.preview);
    } catch {
      setImportError("Could not scan that Notion export. Use the HTML export zip with subpages and files included.");
    } finally {
      setImportBusy(false);
    }
  }

  async function cancelImport() {
    if (!importPreview) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await notesApi.cancelNotionImport(importPreview.importId);
      setImportPreview(result.preview);
    } catch {
      setImportError("Could not cancel this import job.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-header">
        <div>
          <span className="breadcrumb">Workspace Admin</span>
          <h2>Users, Imports, and Backups</h2>
        </div>
        <button className="admin-refresh" type="button" onClick={() => void loadUsers()} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-grid">
        <section className="admin-section admin-users-section">
          <div className="admin-section-title">
            <ShieldCheck size={18} />
            <h3>Workspace Users</h3>
          </div>
          {loading ? (
            <p className="admin-muted">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="admin-muted">No users found.</p>
          ) : (
            <div className="admin-user-list" aria-label="Workspace users">
              {users.map((user) => (
                <article className="admin-user-card" key={user.id}>
                  <div className="admin-user-card-header">
                    <div>
                      <strong>{user.displayName || user.username}</strong>
                      <p className="admin-muted">@{user.username}</p>
                    </div>
                    <button className="admin-remove-user" type="button" onClick={() => void removeUser(user)} disabled={saving}>
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>

                  <div className="admin-form admin-user-fields">
                    <label>
                      Display name
                      <input
                        aria-label={`Display name for ${user.username}`}
                        value={user.displayName}
                        onChange={(event) => {
                          const displayName = event.target.value;
                          setUsers((current) => current.map((candidate) => (candidate.id === user.id ? { ...candidate, displayName } : candidate)));
                        }}
                        onBlur={(event) => {
                          const displayName = event.target.value.trim();
                          if (displayName && displayName !== user.displayName) void updateUser(user, { displayName });
                        }}
                      />
                    </label>

                    <label>
                      Role
                      <select
                        aria-label={`Role for ${user.username}`}
                        value={user.role}
                        disabled={saving}
                        onChange={(event) => void updateUser(user, { role: event.target.value as "owner" | "editor" })}
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                      </select>
                    </label>

                    <p className="admin-muted">Last login: {formatLastLogin(user.lastLoginAt)}</p>

                    <label>
                      Reset password
                      <div className="password-reset">
                        <input
                          aria-label={`New password for ${user.username}`}
                          type="password"
                          minLength={10}
                          placeholder="New password"
                          value={passwordDrafts[user.id] ?? ""}
                          onChange={(event) => setPasswordDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                        />
                        <button type="button" title="Set password" aria-label={`Set password for ${user.username}`} onClick={() => void resetPassword(user)} disabled={saving || !passwordDrafts[user.id]}>
                          <KeyRound size={15} />
                        </button>
                      </div>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <UserPlus size={18} />
            <h3>Add User</h3>
          </div>
          <form className="admin-form" onSubmit={(event) => void createUser(event)}>
            <label>
              Display name
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
            </label>
            <label>
              Username
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoCapitalize="none" autoComplete="username" required />
            </label>
            <label>
              Temporary password
              <input
                value={form.password}
                minLength={10}
                type="password"
                autoComplete="new-password"
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "owner" | "editor" })}>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button type="submit" disabled={saving}>
              <UserPlus size={16} />
              Add user
            </button>
          </form>
        </section>

        <section className="admin-section import-section">
          <div className="admin-section-title">
            <FileArchive size={18} />
            <h3>Notion Import</h3>
          </div>
          <form className="admin-form import-form" onSubmit={(event) => void uploadImport(event)}>
            <label>
              HTML export zip
              <input type="file" accept=".zip,application/zip" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" disabled={importBusy || !importFile}>
              <Upload size={16} />
              {importBusy ? "Scanning..." : "Scan export"}
            </button>
          </form>
          <p className="admin-muted">This only creates a safe preview. It does not create pages or import content yet.</p>
          {importError ? <p className="admin-error">{importError}</p> : null}
          {importPreview ? (
            <div className="import-preview">
              <div className="import-status-row">
                <strong>{importPreview.originalFilename ?? "Notion export"}</strong>
                <span data-status={importPreview.status}>{importPreview.status.replace(/_/g, " ")}</span>
              </div>
              <div className="import-counts">
                <span><strong>{importPreview.counts.pageCount}</strong> pages</span>
                <span><strong>{importPreview.counts.assetCount}</strong> assets</span>
                <span><strong>{importPreview.counts.databaseCount}</strong> CSV databases</span>
                <span><strong>{formatBytes(importPreview.counts.totalSizeBytes)}</strong> extracted</span>
              </div>
              {importPreview.issues.length > 0 ? (
                <ul className="import-issues">
                  {importPreview.issues.slice(0, 4).map((issue) => (
                    <li key={`${issue.code}:${issue.sourcePath ?? "job"}`} data-severity={issue.severity}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
              {importPreview.pages.length > 0 ? (
                <div className="import-sample">
                  <strong>Page preview</strong>
                  {importPreview.pages.slice(0, 8).map((page) => (
                    <span key={page.sourcePath}>{page.title}</span>
                  ))}
                </div>
              ) : null}
              {importPreview.status !== "cancelled" ? (
                <button className="admin-secondary" type="button" onClick={() => void cancelImport()} disabled={importBusy}>
                  <XCircle size={16} />
                  Cancel job
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="admin-section backup-section">
          <div className="admin-section-title">
            <DatabaseBackup size={18} />
            <h3>Backups</h3>
          </div>
          <p className="admin-muted">
            Backups include PostgreSQL data, MinIO assets, compose config, and a secure copy of `.env` when present.
          </p>
          <div className="backup-options">
            <div>
              <Cloud size={18} />
              <strong>iCloud Drive folder</strong>
              <code>BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Notes Backups" scripts/backup.sh</code>
            </div>
            <div>
              <Cloud size={18} />
              <strong>S3-compatible target</strong>
              <code>S3_BACKUP_URI="s3://my-notes-backups" scripts/backup.sh</code>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
