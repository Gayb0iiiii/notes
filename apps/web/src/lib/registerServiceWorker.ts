export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then(() => {
      window.dispatchEvent(new CustomEvent("notes:offline-ready"));
    });
  });
}
