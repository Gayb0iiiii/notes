import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.yeetserver.notes",
  appName: "Yeet Notes",
  webDir: "dist",
  server: {
    hostname: "notes.yeetserver.net",
    iosScheme: "https",
    androidScheme: "https"
  }
};

export default config;
