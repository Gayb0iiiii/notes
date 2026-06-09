import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.yeetserver.note-taker",
  appName: "Yeet Notes",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
