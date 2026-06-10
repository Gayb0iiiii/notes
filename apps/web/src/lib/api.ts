import type { MetadataOperation } from "@notes/shared";
import { recordDiagnosticEvent } from "./diagnostics";

const serverUrlKey = "notes.serverUrl";
const nativeDefaultServerUrl = "https://notes.yeetserver.net";

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "editor";
  createdAt: string;
  lastLoginAt: string | null;
}

function isNativeWebView(): boolean {
  return window.location.protocol === "capacitor:" || window.location.protocol === "ionic:";
}

export function getServerUrl(): string {
  const stored = window.localStorage.getItem(serverUrlKey);
  if (stored) return stored;
  return isNativeWebView() ? nativeDefaultServerUrl : "";
}

export function setServerUrl(value: string): void {
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized) {
    new URL(normalized);
    window.localStorage.setItem(serverUrlKey, normalized);
    return;
  }
  window.localStorage.removeItem(serverUrlKey);
}

export function apiUrl(path: string): string {
  const baseUrl = getServerUrl();
  if (!baseUrl) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function collabUrl(): string {
  const baseUrl = getServerUrl();
  const source = baseUrl ? new URL(baseUrl) : window.location;
  const protocol = source.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${source.host}/collab`;
}

function responseContentType(response: Response): string {
  return response.headers.get("content-type") ?? "";
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  if (responseContentType(response).includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return response.text() as Promise<T>;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const url = apiUrl(path);

  try {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      signal: init.signal ?? controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      const message = `${response.status} ${body || response.statusText}`;
      recordDiagnosticEvent("warn", "api", message, { path, url, status: response.status, body });
      throw new Error(message);
    }
    return readResponse<T>(response);
  } catch (error) {
    recordDiagnosticEvent("error", "api", error instanceof Error ? error.message : "API request failed", { path, url, error });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const notesApi = {
  me: () => api<{ user: { userId: string; displayName: string }; memberships: Array<{ workspaceId: string; role: string }> }>("/api/auth/me"),
  login: (username: string, password: string) => api<{ user: unknown }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  users: () => api<AdminUser[]>("/api/users"),
  createUser: (input: { workspaceId: string; username: string; password: string; displayName: string; role: "owner" | "editor" }) =>
    api<{ user: AdminUser }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (userId: string, input: { workspaceId: string; displayName?: string; role?: "owner" | "editor"; password?: string }) =>
    api<{ ok: true }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteUser: (userId: string, workspaceId: string) =>
    api<{ ok: true }>(`/api/users/${userId}`, { method: "DELETE", body: JSON.stringify({ workspaceId }) }),
  workspaces: () => api<{ id: string; name: string; ownerUserId: string; role: string }[]>("/api/workspaces"),
  pages: (workspaceId: string) => api<{ pages: import("@notes/shared").PageDto[] }>(`/api/workspaces/${workspaceId}/pages`),
  syncMetadata: (operations: MetadataOperation[]) => api<{ results: unknown[] }>("/api/sync/metadata", { method: "POST", body: JSON.stringify({ operations }) }),
  uploadUrl: (input: { workspaceId: string; filename: string; mimeType: string; sizeBytes: number }) =>
    api<{ assetId: string; uploadUrl: string; storageKey: string }>("/api/assets/upload-url", { method: "POST", body: JSON.stringify(input) }),
  completeAsset: (assetId: string) => api<{ asset: unknown }>("/api/assets/complete", { method: "POST", body: JSON.stringify({ assetId }) }),
  asset: (assetId: string) => api<{ asset: unknown; url: string }>(`/api/assets/${assetId}`),
  backlinks: (pageId: string) => api<{ backlinks: import("@notes/shared").PageDto[] }>(`/api/pages/${pageId}/backlinks`),
  reindexLinks: (pageId: string, targetPageIds: string[]) => api<{ ok: true }>(`/api/pages/${pageId}/reindex-links`, { method: "POST", body: JSON.stringify({ targetPageIds }) })
};
