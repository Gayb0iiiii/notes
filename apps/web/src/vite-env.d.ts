/// <reference types="vite/client" />

declare module "lucide-react/dist/esm/icons/*.js" {
  import type { ComponentType, SVGProps } from "react";

  const Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
  export default Icon;
}

declare module "virtual:pwa-register" {
  export function registerSW(options?: { immediate?: boolean; onOfflineReady?: () => void }): () => void;
}
/// <reference types="vite-plugin-pwa/client" />
