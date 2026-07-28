// Minimal hash-based router. No routing library — StudyLoop has exactly three
// screens, and `location.hash` gives free back/forward + refresh persistence.

export type Route = { view: "library" } | { view: "settings" } | { view: "study"; projectId: string };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "settings") return { view: "settings" };
  if (parts[0] === "study" && parts[1]) return { view: "study", projectId: decodeURIComponent(parts[1]) };
  return { view: "library" };
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case "settings":
      return "#/settings";
    case "study":
      return `#/study/${encodeURIComponent(route.projectId)}`;
    case "library":
    default:
      return "#/library";
  }
}
