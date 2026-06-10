import { useMemo, useState } from "react";
import { getServerUrl, notesApi, setServerUrl, userFacingApiMessage } from "../lib/api";
import { bootstrapOfflineDemo } from "../lib/demo";
import { recordDiagnosticEvent } from "../lib/diagnostics";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrlDraft] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready to sign in.");
  const [busy, setBusy] = useState(false);
  const canSubmit = useMemo(() => username.trim().length > 0 && password.length > 0 && !busy, [username, password, busy]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      setStatus("Checking server URL...");
      setServerUrl(serverUrl);

      setStatus("Contacting server...");
      await notesApi.login(username.trim(), password);
      recordDiagnosticEvent("info", "auth", "Login request accepted", { username: username.trim(), serverUrl });

      setStatus("Checking saved session...");
      await notesApi.me();

      setStatus("Loading workspace...");
      onLogin();
    } catch (loginError) {
      const message = userFacingApiMessage(loginError);
      recordDiagnosticEvent("warn", "auth", "Login flow failed", loginError);
      setError(message);
      setStatus("Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) void signIn();
        }}
      >
        <div className="login-heading">
          <p className="login-eyebrow">Private workspace</p>
          <h1>Yeet Notes</h1>
        </div>

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
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" disabled={busy} />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" disabled={busy} />
        </label>

        <div className="login-status" aria-live="polite" data-busy={busy ? "true" : "false"}>
          <span className="login-spinner" aria-hidden="true" />
          <span>{status}</span>
        </div>

        {error ? <p className="error-text" role="alert">{error}</p> : null}

        <button type="submit" disabled={!canSubmit}>{busy ? "Working..." : "Sign in"}</button>
        <button
          type="button"
          className="secondary-login"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setStatus("Starting offline demo...");
            try {
              await bootstrapOfflineDemo();
              recordDiagnosticEvent("info", "auth", "Started offline demo");
              onLogin();
            } finally {
              setBusy(false);
            }
          }}
        >
          Start offline demo
        </button>
      </form>
    </main>
  );
}
