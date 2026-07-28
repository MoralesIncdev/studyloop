// GET /api/search backing logic (SPEC "Fast YouTube layer"). Split out of
// routes/search.ts the same way every other route's guard/logic lives in lib/
// (paths.ts, reveal.ts, libraryScanCache.ts) — keeps the route a thin
// validate-then-call shell and makes the matching/merge logic unit-testable
// without a Fastify instance.
import { z } from "zod";
import type { LibraryItem } from "./scan.js";
import { searchYoutube, type RelatedVideo } from "./innertube.js";

export const SearchQuerySchema = z.object({ q: z.string().min(1).max(100) });

/** Case-insensitive substring match over title/instructor/series — no fuzzy scoring, just a plain filter. */
export function searchLibraryItems(items: readonly LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      (item.instructor?.toLowerCase().includes(q) ?? false) ||
      (item.series?.toLowerCase().includes(q) ?? false)
  );
}

export interface SearchResult {
  library: LibraryItem[];
  youtube: RelatedVideo[];
}

/**
 * Library matching is synchronous/local and always returns something (or
 * `[]`); the youtube half goes through Innertube search, which already
 * degrades to `[]` on any failure (see lib/innertube.ts) — so a search never
 * fails outright, it just may come back with an empty youtube section.
 */
export async function performSearch(
  items: readonly LibraryItem[],
  query: string,
  youtubeLimit = 12
): Promise<SearchResult> {
  const [library, youtube] = await Promise.all([
    Promise.resolve(searchLibraryItems(items, query)),
    searchYoutube(query, youtubeLimit),
  ]);
  return { library, youtube };
}
