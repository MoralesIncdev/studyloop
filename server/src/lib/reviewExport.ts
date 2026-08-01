// Phase 7 "CSV export" (SPEC move 4, EXECUTION-PLAN-post-review-v1.md):
// GET /api/review/export.csv exports one row per due-or-tracked review card
// (front/back/tags/due), Anki-importable. Kept pure/dependency-free (no fs)
// so it's directly unit-testable — matches this codebase's "routes stay
// thin, lib holds the logic + tests" convention (see lib/review.ts,
// lib/heatmap.ts). routes/reviewExport.ts does the I/O (reading projects/
// bubbles/analysis/attestations off disk, calling lib/review.ts's exported
// deriveLiveCards/buildReviewQueue read-only) and calls into here for the
// actual CSV shape.
import type { ReviewCard, ReviewState } from "./review.js";
import { buildReviewQueue } from "./review.js";

export interface ReviewExportRow {
  front: string;
  back: string;
  tags: string;
  due: string;
}

/**
 * Card-kind-specific front/back text, mirroring web/src/review/ReviewView.tsx's
 * CardFront/CardBack rendering (same "transformed front/back preferred, else
 * fall back to the raw source text" priority) so the export reads like what
 * the learner actually studies in the app, not a re-derivation of it.
 */
export function cardFrontBack(card: ReviewCard): { front: string; back: string } {
  if (card.kind === "unit") {
    return {
      front: `${card.label}\nIn your own words — what's the key idea here?`,
      back: card.userTake ? `${card.summary}\n\nYour take: ${card.userTake}` : card.summary,
    };
  }
  if (card.kind === "clusterMember") {
    return { front: card.label, back: card.body };
  }
  if (card.kind === "pearl") {
    return {
      front: card.transformed?.front ?? card.label,
      back: card.transformed?.back ?? card.insight,
    };
  }
  // bubble
  return {
    front: card.transformed?.front ?? "What was your note here?",
    back: card.transformed?.back ?? card.text,
  };
}

/** SPEC "unitType" tag: only unit/clusterMember cards carry a unit type at all — a cluster member's parent unit is always a CLUSTER (deriveLiveCards fans a CLUSTER unit's members out, but never carries the literal type onto ReviewClusterMemberCard, so it's re-supplied here). Bubble/pearl cards have no unit type; empty string (not "bubble"/"pearl") so it drops out of the tags string entirely rather than implying a unit type that doesn't exist. */
function unitTypeOf(card: ReviewCard): string {
  if (card.kind === "unit") return card.unitType;
  if (card.kind === "clusterMember") return "CLUSTER";
  return "";
}

/** Anki tags are plain space-separated tokens — spaces in a project title would silently split into multiple tags on import, so they're folded to underscores. Prefixed (`project:`/`domain:`/`unitType:`) so the three SPEC-named facets stay distinguishable and independently searchable once imported, instead of three bare words a learner can't tell apart. */
function slugTag(value: string): string {
  return value.trim().replace(/\s+/g, "_");
}

function buildTags(card: ReviewCard, domain: string): string {
  const tokens = [`project:${slugTag(card.projectTitle)}`];
  if (domain) tokens.push(`domain:${slugTag(domain)}`);
  const unitType = unitTypeOf(card);
  if (unitType) tokens.push(`unitType:${unitType}`);
  return tokens.join(" ");
}

export function toExportRow(card: ReviewCard, due: string, domain: string): ReviewExportRow {
  const { front, back } = cardFrontBack(card);
  return { front, back, tags: buildTags(card, domain), due };
}

export const REVIEW_EXPORT_HEADER = ["front", "back", "tags", "due"] as const;

/** RFC 4180 quoting: a field is wrapped in quotes (with embedded quotes doubled) only when it contains a comma, quote, or line break — untouched otherwise, so simple fields stay readable in a raw diff. CRLF row endings (Anki/Excel-friendly). */
export function csvEscapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvLine(fields: readonly string[]): string {
  return fields.map(csvEscapeField).join(",") + "\r\n";
}

/** Pure CSV serialization — header row always present, even for an empty `rows` (SPEC test: "empty-queue yields header-only"). */
export function serializeReviewExportCsv(rows: readonly ReviewExportRow[]): string {
  let out = toCsvLine(REVIEW_EXPORT_HEADER);
  for (const row of rows) {
    out += toCsvLine([row.front, row.back, row.tags, row.due]);
  }
  return out;
}

/**
 * Builds the full export CSV from live cards + the persisted review state,
 * exactly like GET /api/review/queue derives its queue (via
 * lib/review.ts's exported buildReviewQueue) — except with the daily
 * new-card cap effectively disabled (a cap far beyond any real deck size,
 * not `liveCards.length` — a V3-B review-fix#7 "kept" orphan pearl entry can
 * sit in `priorState.cards` without being in `liveCards` at all, so counting
 * remaining cap off live-card count alone could still starve a genuinely new
 * card of a cap slot), so "due-or-tracked" here means every live card gets a
 * row: already-tracked cards keep their real persisted due date, and any
 * live card not yet introduced is treated as a fresh card due now
 * (buildReviewQueue's normal "new card" behavior), same as it would be the
 * moment it's first studied. Never persisted back to review.json by the
 * caller — this is a read-only export, not a study session, so it must not
 * consume/inflate the real daily new-card cap or otherwise mutate schedule
 * state.
 */
export function buildReviewExportRows(
  liveCards: readonly ReviewCard[],
  priorState: ReviewState,
  domains: ReadonlyMap<string, string>,
  nowMs: number
): ReviewExportRow[] {
  const queue = buildReviewQueue(liveCards, priorState, nowMs, Number.MAX_SAFE_INTEGER);
  const rows: ReviewExportRow[] = [];
  for (const card of liveCards) {
    const cardState = queue.state.cards[card.id];
    if (!cardState) continue; // shouldn't happen with dailyCap === liveCards.length, but stay defensive
    rows.push(toExportRow(card, cardState.due, domains.get(card.projectId) ?? ""));
  }
  return rows;
}

export function buildReviewExportCsv(
  liveCards: readonly ReviewCard[],
  priorState: ReviewState,
  domains: ReadonlyMap<string, string>,
  nowMs: number
): string {
  return serializeReviewExportCsv(buildReviewExportRows(liveCards, priorState, domains, nowMs));
}
