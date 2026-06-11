import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.yeetserver.note-taker",
  appName: "Yeet Notes",
  webDir: "dist",
  // No `server` block — assets are bundled into the binary.
  // Run `pnpm app:ios:copy` to copy the built dist into the iOS project.
  plugins: {
    Keyboard: {
      // Shrink the webview content area when the keyboard appears so the
      // editor is never obscured. Works correctly with `height: 100dvh`.
      resize: "contentHeight",
      resizeOnFullScreen: true
    }
  }
};

export default config;
