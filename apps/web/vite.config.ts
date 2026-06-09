import { defineConfig, type Plugin } from "vite";
import path from "node:path";

const allowedHosts = ["notes.yeetserver.net"];

function pwaRegisterStub(): Plugin {
  return {
    name: "pwa-register-stub",
    resolveId(id) {
      if (id === "virtual:pwa-register") return id;
      return undefined;
    },
    load(id) {
      if (id !== "virtual:pwa-register") return undefined;
      return "export function registerSW(options = {}) { setTimeout(() => options.onOfflineReady?.(), 0); return () => undefined; }";
    }
  };
}

export default defineConfig(({ command }) => ({
  optimizeDeps: {
    noDiscovery: true,
    include: ["dexie", "react", "react/jsx-dev-runtime", "react/jsx-runtime", "react-dom/client"]
  },
  resolve: {
    alias: command === "serve" ? [{ find: /^react-dom$/, replacement: path.resolve(__dirname, "src/lib/reactDomDevShim.ts") }] : []
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("yjs") || id.includes("y-indexeddb") || id.includes("@hocuspocus")) return "collaboration";
          if (id.includes("dexie") || id.includes("zustand")) return "local-data";
          if (id.includes("react") || id.includes("react-dom")) return "react-vendor";
          return "vendor";
        }
      }
    }
  },
  plugins: [
    pwaRegisterStub()
  ],
  preview: {
    allowedHosts,
    host: "0.0.0.0",
    port: 5173
  },
  server: {
    allowedHosts,
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/collab": {
        target: "ws://localhost:4001",
        ws: true
      }
    }
  }
}));
