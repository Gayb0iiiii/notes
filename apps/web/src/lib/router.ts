/**
 * Minimal hash router.
 *
 * Routes:
 *   #/page/<pageId>          — open a specific page
 *   #/admin                  — admin panel
 *   #/history/<pageId>       — page history
 *   (empty / anything else)  — notes root (first visible page)
 *
 * Usage:
 *   import { getRoute, pushRoute, onRouteChange } from "./router";
 */

export type Route =
  | { view: "notes"; pageId: string | null }
  | { view: "admin" }
  | { view: "history"; pageId: string };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "admin") return { view: "admin" };
  if (segments[0] === "history" && segments[1]) return { view: "history", pageId: segments[1] };
  if (segments[0] === "page" && segments[1]) return { view: "notes", pageId: segments[1] };
  return { view: "notes", pageId: null };
}

export function getRoute(): Route {
  return parseHash(window.location.hash);
}

export function pushRoute(route: Route): void {
  let hash: string;
  if (route.view === "admin") hash = "#/admin";
  else if (route.view === "history") hash = `#/history/${route.pageId}`;
  else if (route.pageId) hash = `#/page/${route.pageId}`;
  else hash = "#/";

  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

export function replaceRoute(route: Route): void {
  let hash: string;
  if (route.view === "admin") hash = "#/admin";
  else if (route.view === "history") hash = `#/history/${route.pageId}`;
  else if (route.pageId) hash = `#/page/${route.pageId}`;
  else hash = "#/";

  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(null, "", url.toString());
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const listener = () => handler(parseHash(window.location.hash));
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
