import { useState } from "react";
import { getServerUrl, notesApi, setServerUrl } from "../lib/api";
import { bootstrapOfflineDemo, isDemoLogin } from "../lib/demo";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrlDraft] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="login-screen">
      <form
        className="login-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setServerUrl(serverUrl);
          try {
            await notesApi.login(username, password);
            onLogin();
          } catch {
            if (isDemoLogin(username, password)) {
              await bootstrapOfflineDemo();
              onLogin();
              return;
            }
            setError("Login failed");
          }
        }}
      >
        <h1>Private Notes</h1>
        <label>
          Server URL
          <input
            value={serverUrl}
            onChange={(event) => setServerUrlDraft(event.target.value)}
            inputMode="url"
            placeholder="https://notes.example.com"
            autoComplete="url"
          />
        </label>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit">Sign in</button>
        <button
          type="button"
          className="secondary-login"
          onClick={async () => {
            await bootstrapOfflineDemo();
            onLogin();
          }}
        >
          Start offline
        </button>
      </form>
    </main>
  );
}
