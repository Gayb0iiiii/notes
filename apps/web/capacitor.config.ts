import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.yeetserver.notes",
  appName: "Yeet Notes",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
