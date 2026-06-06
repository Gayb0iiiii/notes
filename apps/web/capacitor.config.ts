import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.privateworkplace.notes",
  appName: "Private Notes",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
