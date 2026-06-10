import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installDiagnostics } from "./lib/diagnostics";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import "./styles/app.css";
import "./styles/settings.css";
import "./styles/admin-mobile.css";
import "./styles/knowledge-base.css";
import "./styles/native-safe-area.css";

installDiagnostics();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
