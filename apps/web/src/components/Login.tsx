import { useState } from "react";
import { getServerUrl, notesApi, setServerUrl } from "../lib/api";
import { bootstrapOfflineDemo } from "../lib/demo";
import { recordDiagnosticEvent } from "../lib/diagnostics";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrlDraft] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="login-screen">
      <form
        className="login-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            setServerUrl(serverUrl);
            await notesApi.login(username.trim(), password);
            recordDiagnosticEvent("info", "auth", "Login succeeded", { username: username.trim(), serverUrl });
            onLogin();
          } catch (loginError) {
            recordDiagnosticEvent("warn", "auth", "Login failed", loginError);
            const message = loginError instanceof Error ? loginError.message : "Login failed";
            if (message.includes("invalid_credentials") || message.includes("401")) {
              setError("Login failed: wrong username or password.");
            } else {
              setError(`Login failed: ${message}`);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Yeet Notes</h1>
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
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={busy} />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" disabled={busy} />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        <button
          type="button"
          className="secondary-login"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
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
