import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles/app.css";

registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent("notes:offline-ready"));
  }
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
