export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticEvent {
  id: string;
  ts: string;
  level: DiagnosticLevel;
  area: string;
  message: string;
  data?: unknown;
}

const diagnosticStorageKey = "notes.diagnostics";
const maxEvents = 120;
let installed = false;

function safeParseEvents(value: string | null): DiagnosticEvent[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(-maxEvents) : [];
  } catch {
    return [];
  }
}

function readEvents(): DiagnosticEvent[] {
  try {
    return safeParseEvents(window.localStorage.getItem(diagnosticStorageKey));
  } catch {
    return [];
  }
}

function writeEvents(events: DiagnosticEvent[]): void {
  try {
    window.localStorage.setItem(diagnosticStorageKey, JSON.stringify(events.slice(-maxEvents)));
  } catch {
    // Diagnostics must never break the app.
  }
}

function safeMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compactData(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === "string" && item.length > 600) return `${item.slice(0, 600)}…`;
      return item;
    }));
  } catch {
    return safeMessage(value);
  }
}

export function recordDiagnosticEvent(level: DiagnosticLevel, area: string, message: string, data?: unknown): void {
  const event: DiagnosticEvent = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    level,
    area,
    message,
    data: compactData(data)
  };
  writeEvents([...readEvents(), event]);
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return readEvents();
}

export function clearDiagnosticEvents(): void {
  writeEvents([]);
}

export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    recordDiagnosticEvent("error", "window", event.message || "Unhandled window error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordDiagnosticEvent("error", "promise", "Unhandled promise rejection", event.reason);
  });
}

export function buildDiagnosticReport(extra: Record<string, unknown> = {}): string {
  const report = {
    generatedAt: new Date().toISOString(),
    app: "Yeet Notes",
    location: window.location.href,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    ...extra,
    events: getDiagnosticEvents()
  };
  return JSON.stringify(report, null, 2);
}
