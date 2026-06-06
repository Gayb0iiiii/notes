import Cloud from "lucide-react/dist/esm/icons/cloud.js";
import DatabaseBackup from "lucide-react/dist/esm/icons/database-backup.js";
import KeyRound from "lucide-react/dist/esm/icons/key-round.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import UserPlus from "lucide-react/dist/esm/icons/user-plus.js";
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

export function AdminPanel({ workspaceId }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState(initialForm);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
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

  return (
    <section className="admin-panel">
      <div className="admin-header">
        <div>
          <span className="breadcrumb">Workspace Admin</span>
          <h2>Users and Backups</h2>
        </div>
        <button className="admin-refresh" type="button" onClick={() => void loadUsers()} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-grid">
        <section className="admin-section">
          <div className="admin-section-title">
            <ShieldCheck size={18} />
            <h3>Workspace Users</h3>
          </div>
          {loading ? (
            <p className="admin-muted">Loading users...</p>
          ) : (
            <div className="user-table" role="table" aria-label="Workspace users">
              <div className="user-row user-row-head" role="row">
                <span>Name</span>
                <span>Username</span>
                <span>Role</span>
                <span>Last login</span>
                <span>Password</span>
                <span />
              </div>
              {users.map((user) => (
                <div className="user-row" role="row" key={user.id}>
                  <input
                    aria-label={`Display name for ${user.username}`}
                    value={user.displayName}
                    onChange={(event) => {
                      const displayName = event.target.value;
                      setUsers((current) => current.map((candidate) => (candidate.id === user.id ? { ...candidate, displayName } : candidate)));
                    }}
                    onBlur={(event) => {
                      const displayName = event.target.value.trim();
                      if (displayName) void updateUser(user, { displayName });
                    }}
                  />
                  <span>{user.username}</span>
                  <select
                    aria-label={`Role for ${user.username}`}
                    value={user.role}
                    disabled={saving}
                    onChange={(event) => void updateUser(user, { role: event.target.value as "owner" | "editor" })}
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                  </select>
                  <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</span>
                  <div className="password-reset">
                    <input
                      aria-label={`New password for ${user.username}`}
                      type="password"
                      minLength={10}
                      placeholder="New password"
                      value={passwordDrafts[user.id] ?? ""}
                      onChange={(event) => setPasswordDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                    />
                    <button type="button" title="Set password" onClick={() => void resetPassword(user)} disabled={saving || !passwordDrafts[user.id]}>
                      <KeyRound size={15} />
                    </button>
                  </div>
                  <button className="icon-danger" type="button" title="Remove user" onClick={() => void removeUser(user)} disabled={saving}>
                    <Trash2 size={15} />
                  </button>
                </div>
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
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
            </label>
            <label>
              Temporary password
              <input
                value={form.password}
                minLength={10}
                type="password"
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
