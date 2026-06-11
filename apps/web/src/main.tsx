import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App } from "./App";
import { installDiagnostics } from "./lib/diagnostics";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import "./styles/app.css";
import "./styles/settings.css";
import "./styles/admin-mobile.css";
import "./styles/knowledge-base.css";
import "./styles/page-history.css";
import "./styles/importer.css";
import "./styles/native-safe-area.css";

installDiagnostics();

const platform = Capacitor.getPlatform();
document.documentElement.dataset.platform = platform;

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.native = "true";

  // Initialise the keyboard plugin on native platforms.
  // `resizeOnFullScreen` keeps the layout correct when the keyboard is shown
  // during a full-screen modal or inside the TipTap editor.
  // The `resize: "contentHeight"` option is set in capacitor.config.ts.
  void import("@capacitor/keyboard").then(({ Keyboard }) => {
    void Keyboard.setScroll({ isDisabled: false });
    void Keyboard.setAccessoryBarVisible({ isVisible: true });
  });
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
