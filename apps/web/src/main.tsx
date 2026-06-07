import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App } from "./App";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import "./styles/app.css";
import "./styles/native-safe-area.css";

const platform = Capacitor.getPlatform();
document.documentElement.dataset.platform = platform;

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.native = "true";
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
