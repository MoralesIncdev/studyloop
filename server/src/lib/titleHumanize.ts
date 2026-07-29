// codex P1-2 "title humanization": local video filenames are frequently
// PascalCase/camelCase/underscore-joined with no spaces at all (real example
// from this machine's library: "OpenGuardSeatedVolume1",
// "HighPercentageGiPassesbyGordonRyan1") — rendering them verbatim as
// product titles is one of the clearest non-premium tells against a
// first-party YouTube bar. Pure function, no I/O, so it's fully unit
// testable independent of scan.ts's filesystem walk.
//
// Deliberately does NOT attempt real English word-segmentation (splitting
// "Passesby" into "Passes by") — that requires a dictionary and gets wrong
// answers confidently on domain jargon/names. Boundary-based splitting
// (separators, camelCase, letter/digit) plus a small known-acronym allowlist
// covers the common cases without inventing false splits.

// Deliberately excludes short common words that could be typed in "acronym
// case" incidentally — e.g. "GI" (the martial-arts uniform is conventionally
// written "Gi", not "GI"; a real word, not an abbreviation here).
/** Case-insensitively matched; canonical (display) casing is the value. */
const KNOWN_ACRONYMS = ["BJJ", "MMA", "UFC", "ADCC", "IBJJF", "FAQ"];

const ACRONYM_BY_UPPER = new Map(KNOWN_ACRONYMS.map((a) => [a.toUpperCase(), a]));

/** Splits camelCase/PascalCase and letter/digit runs, replaces separator punctuation with spaces. Does not otherwise change casing. */
function splitWordBoundaries(input: string): string {
  let s = input;
  // Separators (dash/underscore/dot runs) -> a single space.
  s = s.replace(/[._-]+/g, " ");
  // Acronym-then-word boundary first, so a trailing capitalized word after a
  // run of capitals doesn't get chopped into single letters by the next
  // rule: "XMLParser" -> "XML Parser", "IBJJFCurriculum" -> "IBJJF Curriculum".
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  // lowercase/digit -> uppercase: "openGuard" -> "open Guard".
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  // Authorship "by" glued to the preceding word when the next word is
  // capitalized: "Passesby Gordon" -> "Passes by Gordon". Filename patterns
  // like "<Title>by<Author>" are common in instructional libraries; the 3+
  // char prefix guard keeps short real words ("Baby", "Ruby") intact.
  s = s.replace(/\b([A-Za-z][a-z]{2,}?)by (?=[A-Z])/g, "$1 by ");
  // letter <-> digit boundaries, either direction: "Volume1" -> "Volume 1", "4Kvideo" -> "4 Kvideo".
  s = s.replace(/([A-Za-z])([0-9])/g, "$1 $2");
  s = s.replace(/([0-9])([A-Za-z])/g, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Per-word normalization after boundary splitting: a known acronym
 * (case-insensitively matched) becomes its canonical uppercase form;
 * anything else gets its first character capitalized (idempotent for
 * already-capitalized words from a PascalCase source filename — this only
 * fixes the all-lowercase case, e.g. an underscore/kebab-case filename, it
 * never re-cases the rest of a word).
 */
function normalizeWords(words: string[]): string[] {
  return words.map((word, index) => {
    if (!word) return word;
    const bare = word.replace(/[^A-Za-z0-9&]/g, "");
    const acronym = ACRONYM_BY_UPPER.get(bare.toUpperCase());
    if (acronym) return acronym;
    // Title-case convention: the authorship preposition stays lowercase
    // mid-title ("Sweep the World by Bernardo Faria"), never at position 0.
    if (index > 0 && bare.toLowerCase() === "by") return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** True if `remainder` is nothing but a volume/part index — never strips a real distinguishing subtitle. */
const TRAILING_INDEX_RE = /^(?:(?:vol(?:ume)?|part|pt)\.?\s*)?#?\d+$/i;

/**
 * Humanizes a raw filename-derived title for display. When `seriesTitle` is
 * given and the humanized title is literally "<humanized series name> <index>"
 * (a folder/series whose video files just repeat the series name plus a
 * volume number), the redundant series-name prefix is stripped, leaving just
 * the index — the series is already shown as the surrounding group header,
 * so repeating it verbatim on every card under it is noise. Never strips
 * anything beyond a bare trailing index; a real subtitle is always kept.
 */
export function humanizeVideoTitle(rawTitle: string, seriesTitle?: string | null): string {
  const trimmed = rawTitle.trim();
  if (!trimmed) return trimmed;

  const words = normalizeWords(splitWordBoundaries(trimmed).split(" ").filter(Boolean));
  const humanized = words.join(" ");
  if (!humanized) return trimmed;

  if (!seriesTitle) return humanized;
  const humanizedSeries = humanizeVideoTitle(seriesTitle);
  if (!humanizedSeries) return humanized;

  const lowerTitle = humanized.toLowerCase();
  const lowerSeries = humanizedSeries.toLowerCase();
  if (lowerTitle === lowerSeries) return humanized; // whole title IS the series name — nothing to strip
  if (lowerTitle.startsWith(lowerSeries)) {
    const remainder = humanized.slice(humanizedSeries.length).trim();
    if (TRAILING_INDEX_RE.test(remainder)) return remainder;
  }
  return humanized;
}
