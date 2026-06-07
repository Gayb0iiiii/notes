import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import "./styles/app.css";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
