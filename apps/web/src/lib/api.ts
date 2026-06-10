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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      path: string;
      url: string;
      status?: number;
      statusText?: string;
      body?: string;
      code?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function userFacingApiMessage(error: unknown): string {
  if (!isApiError(error)) return error instanceof Error ? error.message : "Something went wrong.";

  if (error.details.code === "invalid_credentials" || error.details.status === 401) {
    return "Wrong username or password, or your session expired.";
  }

  if (error.details.status === 403) return "Your account does not have permission to do that.";
  if (error.details.status === 404) return "The server route was not found. The server may not be updated.";
  if (error.details.status && error.details.status >= 500) return "The server hit an internal error. Check the API logs.";
  if (error.message === "request_timeout") return "The server did not respond in time.";
  if (error.message === "network_error") return "The app could not reach the server. Check the URL, HTTPS, Cloudflare tunnel, and server status.";

  return error.message;
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
    const parsed = new URL(normalized);
    if (!parsed.protocol.startsWith("http")) throw new Error("Server URL must start with http:// or https://");
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

function parseErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; code?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.code === "string") return parsed.code;
  } catch {
    // Body was not JSON.
  }
  return undefined;
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
  const timeout = window.setTimeout(() => controller.abort("request_timeout"), 12000);
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
      const error = new ApiError(`${response.status} ${body || response.statusText}`, {
        path,
        url,
        status: response.status,
        statusText: response.statusText,
        body,
        code: parseErrorCode(body)
      });
      recordDiagnosticEvent("warn", "api", error.message, error.details);
      throw error;
    }
    return readResponse<T>(response);
  } catch (error) {
    if (isApiError(error)) {
      recordDiagnosticEvent("error", "api", error.message, { ...error.details, error });
      throw error;
    }

    const message = error instanceof DOMException && error.name === "AbortError" ? "request_timeout" : "network_error";
    const apiError = new ApiError(message, { path, url, cause: error });
    recordDiagnosticEvent("error", "api", apiError.message, { ...apiError.details, error });
    throw apiError;
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
