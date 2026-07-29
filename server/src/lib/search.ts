// GET /api/search backing logic (SPEC "Fast YouTube layer"). Split out of
// routes/search.ts the same way every other route's guard/logic lives in lib/
// (paths.ts, reveal.ts, libraryScanCache.ts) — keeps the route a thin
// validate-then-call shell and makes the matching/merge logic unit-testable
// without a Fastify instance.
import { z } from "zod";
import type { LibraryItem } from "./scan.js";
import { searchYoutube, type RelatedVideo } from "./innertube.js";

// V3-C C2 "Search intent toggles" (SPEC/PEDAGOGY.md §6): reshapes the
// YouTube half of a search query per an optional `intent` toggle — "the
// learner knows what to search" is a broken assumption for Overview/Deep
// dive/Troubleshooting, so this nudges the query toward each without adding
// a new search UI concept. Only the YouTube half is reshaped — the library
// half (searchLibraryItems below) is a plain local substring match against
// real titles/instructors, where appending these words would only ever
// reduce matches, never help.
export const SearchIntentSchema = z.enum(["overview", "deep_dive", "troubleshooting"]);
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

// SPEC.md's literal wording (`"<q> introduction|explained"`, etc.) uses "|"
// as spec-doc shorthand for "one of these", not a literal character to send
// to YouTube (which has no boolean-OR query syntax) — reshaping instead
// appends every alternative as plain space-separated terms, which broadens
// relevance without needing real OR support.
const INTENT_QUERY_SUFFIX: Record<SearchIntent, string> = {
  overview: "introduction explained",
  deep_dive: "in depth lecture masterclass",
  troubleshooting: "mistakes common problems fixing",
};

/** Reshapes `q` for the given intent (SPEC C2); returns `q` unchanged when `intent` is null/undefined. */
export function reshapeQueryForIntent(q: string, intent: SearchIntent | null | undefined): string {
  if (!intent) return q;
  return `${q} ${INTENT_QUERY_SUFFIX[intent]}`;
}

export const SearchQuerySchema = z.object({ q: z.string().min(1).max(100), intent: SearchIntentSchema.optional() });

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
  intent?: SearchIntent | null,
  youtubeLimit = 12
): Promise<SearchResult> {
  const [library, youtube] = await Promise.all([
    Promise.resolve(searchLibraryItems(items, query)),
    searchYoutube(reshapeQueryForIntent(query, intent), youtubeLimit),
  ]);
  return { library, youtube };
}
