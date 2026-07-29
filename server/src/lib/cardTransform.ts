// V3-B B4 "Card transformation" (SPEC): when analysis v3 + an API key are
// available, weak bubble-card text gets an LLM-generated cloze/question
// front (quote = source, user note = hint); pearl cards always become
// question-form fronts with corrective backs (answer + one-line why + the
// clip link the card already carries). Result is cached in review.json per
// card id (`transformed:{front,back,why}` — see lib/review.ts/routes/review.ts)
// so it's computed at most once per card. Same injectable-adapter pattern as
// lib/analysis.ts (fake/real client, resolve*/​__set*ForTests).
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANALYSIS_MAX_TOKENS, type AnalysisOutcome } from "./analysis.js";

/** SPEC B4: "<40 chars or no '?' etc. heuristic". Deviation from literal wording: implemented as an OR of three cheap fragment signals (empty, short, no terminal punctuation) rather than a single length check — a one-word bubble like "Interesting" is 11 chars (obviously weak) but "Watch the hip angle here, not the shoulder" is 43 chars and reads as a complete thought; length alone would mis-classify both. */
export function isWeakBubbleText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 40) return true;
  return !/[?.!]/.test(trimmed);
}

export const CardTransformResultSchema = z.object({
  front: z.string(),
  back: z.string(),
  why: z.string(),
});
export type CardTransformResult = z.infer<typeof CardTransformResultSchema>;

const CARD_TRANSFORM_JSON_SCHEMA = {
  type: "object",
  properties: {
    front: { type: "string" },
    back: { type: "string" },
    why: { type: "string" },
  },
  required: ["front", "back", "why"],
  additionalProperties: false,
} as const;

export interface CardTransformInput {
  /** The card's source text — a bubble's note, or a pearl's insight. */
  quote: string;
  /** Extra context: the bubble's own text (already the quote for bubbles, so empty there) or a pearl's label. */
  note: string;
  kind: "bubble" | "pearl";
}

const CARD_TRANSFORM_SYSTEM_PROMPT = `You turn a learner's study-session note or a pearl of insight into a spaced-repetition review card. Given the source text, produce:
- "front": a cloze or short-answer question that tests recall of the specific point — never a vague "what was your note here?"
- "back": the answer, stated plainly.
- "why": one sentence explaining why the answer is correct or why it matters — corrective feedback, not a restatement of the answer.
Keep all three fields short (front/why under 160 characters, back under 240). Base the card only on the given text — never invent facts not present in it.`;

function buildCardTransformUserPrompt(input: CardTransformInput): string {
  const parts = [`Kind: ${input.kind}`, `Source text: ${input.quote}`];
  if (input.note.trim()) parts.push(`Learner's note/label: ${input.note}`);
  return parts.join("\n");
}

export interface CardTransformLLMClient {
  transform(input: CardTransformInput, model: string): Promise<AnalysisOutcome<CardTransformResult>>;
}

export class AnthropicCardTransformClient implements CardTransformLLMClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async transform(input: CardTransformInput, model: string): Promise<AnalysisOutcome<CardTransformResult>> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: Math.min(1024, ANALYSIS_MAX_TOKENS),
        system: CARD_TRANSFORM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildCardTransformUserPrompt(input) }],
        output_config: { format: { type: "json_schema", schema: CARD_TRANSFORM_JSON_SCHEMA } },
      });
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (response.stop_reason === "refusal") {
      return { kind: "skipped", reason: "refusal", detail: "Claude declined this card transformation" };
    }
    if (response.stop_reason === "max_tokens") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit max_tokens before finishing this card" };
    }
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text" && typeof b.text === "string");
    if (!textBlock?.text) return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
    const parsed = CardTransformResultSchema.safeParse(raw);
    if (!parsed.success) return { kind: "skipped", reason: "parse_error", detail: parsed.error.message };
    return { kind: "ok", data: parsed.data };
  }
}

/** Deterministic — no network call, mirrors FakeAnalysisClient's role for STUDYLOOP_FAKE_ANALYSIS=1 / tests. */
export class FakeCardTransformClient implements CardTransformLLMClient {
  async transform(input: CardTransformInput, _model?: string): Promise<AnalysisOutcome<CardTransformResult>> {
    const source = input.quote.trim() || input.note.trim() || "this point";
    return {
      kind: "ok",
      data: {
        front: input.kind === "pearl" ? `Why does this matter: "${source.slice(0, 80)}"?` : `Fill in the blank: ${source.slice(0, 80)} — ___`,
        back: input.note.trim() || source,
        why: "This connects directly back to the source material at this moment in the video.",
      },
    };
  }
}

let injectedCardTransformClientForTests: CardTransformLLMClient | null = null;

/** Test-only: force `resolveCardTransformClient` to return a fake/spy implementation. */
export function __setCardTransformClientForTests(client: CardTransformLLMClient | null): void {
  injectedCardTransformClientForTests = client;
}

/**
 * Resolves the card-transform client. Unlike lib/analysis.ts's
 * resolveAnalysisClient, `apiKey === null` outside fake/test mode returns
 * `null` (not a thrown error) — card transformation is an enhancement, not a
 * gate the caller must pass before proceeding (SPEC: "fallback = current
 * format" when unavailable, never a blocked review session).
 */
export function resolveCardTransformClient(apiKey: string | null): CardTransformLLMClient | null {
  if (injectedCardTransformClientForTests) return injectedCardTransformClientForTests;
  if (process.env.STUDYLOOP_FAKE_ANALYSIS === "1") return new FakeCardTransformClient();
  if (!apiKey) return null;
  return new AnthropicCardTransformClient(apiKey);
}

// --- Cache-fill orchestration (moved out of routes/review.ts so the caching
// policy itself — what's skipped, what's fetched, when the cache object is
// left untouched — is directly unit-testable against an injected fake
// client, per this codebase's "routes stay thin, lib/ holds the logic +
// tests" convention). ---------------------------------------------------

/** Minimal shape this module needs from a review card — kept structural (not importing lib/review.ts's ReviewCard) to avoid a review.ts <-> cardTransform.ts import cycle. */
export interface TransformableCard {
  id: string;
}

/**
 * V3-B review fix #2 "Review transformations survive edits to their source
 * card": a cached transform's cache key was `card.id` alone — editing a
 * bubble's text (or, in principle, a pearl's label/insight) left the stale
 * cloze/question front attached forever, since the id never changes.
 * `sourceHash` hashes exactly the text the transform was generated from
 * (the CardTransformInput's quote + note — for a bubble card, `quote` IS
 * the bubble's own text per routes/review.ts's transformCandidates
 * construction, so an edit changes the hash) so a mismatch is detectable
 * without re-deriving the whole input.
 */
export function hashCardTransformInput(input: CardTransformInput): string {
  return createHash("sha256").update(`${input.kind}\n${input.quote}\n${input.note}`).digest("hex").slice(0, 16);
}

/** The shape actually persisted in review.json's `transformed` map — a CardTransformResult plus the source-content hash it was generated from. `sourceHash` is optional only so a pre-migration review.json (written before this fix) still parses; fillTransformCache treats a missing hash as invalid, per the fix's "dropped on first load" migration. */
export type CachedCardTransform = CardTransformResult & { sourceHash?: string };

/**
 * V3-B B4: fills in a `{[cardId]: CachedCardTransform}` cache for any of
 * `cards` that are eligible (present in `transformCandidates`) and not
 * already validly cached — bounded to the given card set (never every
 * historical card) so a session's latency cost stays proportional to what's
 * actually being reviewed.
 *
 * V3-B review fix #2: before fetching anything, every existing cache entry
 * whose id is still a transform candidate this call is checked against its
 * candidate's current `hashCardTransformInput` — a mismatch (source text
 * edited) OR a missing `sourceHash` (pre-migration entry) invalidates it,
 * dropping it from the cache so it's lazily retransformed below (or simply
 * omitted if no client is available — SPEC "fallback = current format").
 * Entries whose id ISN'T a transform candidate this call (card no longer
 * weak, or belongs to a project with no v3 analysis this call) are left
 * untouched — nothing to validate against.
 *
 * No-ops entirely (returns `cached` unchanged, same reference) when nothing
 * was invalidated AND no client resolves / nothing needed fetching.
 */
export async function fillTransformCache<TCard extends TransformableCard>(
  cached: Readonly<Record<string, CachedCardTransform>>,
  cards: readonly TCard[],
  transformCandidates: ReadonlyMap<string, CardTransformInput>,
  client: CardTransformLLMClient | null,
  model: string
): Promise<Record<string, CachedCardTransform>> {
  let next: Record<string, CachedCardTransform> = {};
  let changed = false;
  for (const [id, entry] of Object.entries(cached)) {
    const candidate = transformCandidates.get(id);
    if (!candidate) {
      next[id] = entry;
      continue;
    }
    if (entry.sourceHash !== undefined && entry.sourceHash === hashCardTransformInput(candidate)) {
      next[id] = entry;
      continue;
    }
    changed = true; // dropped: missing sourceHash (pre-migration) or stale content
  }

  if (!client) return changed ? next : cached;

  for (const card of cards) {
    if (next[card.id]) continue;
    const candidate = transformCandidates.get(card.id);
    if (!candidate) continue;
    // eslint-disable-next-line no-await-in-loop -- bounded to the caller's due-card set; sequential mirrors lib/analysis.ts's own per-chunk loop
    const outcome = await client.transform(candidate, model);
    if (outcome.kind === "ok") {
      next[card.id] = { ...outcome.data, sourceHash: hashCardTransformInput(candidate) };
      changed = true;
    }
  }
  return changed ? next : cached;
}

/** Attaches each card's cached transform (if any) as a `transformed` field (front/back/why only — sourceHash is internal cache bookkeeping, never sent to the client), leaving cards without one untouched. */
export function attachTransforms<TCard extends TransformableCard>(
  cards: readonly TCard[],
  cache: Readonly<Record<string, CachedCardTransform>> | undefined
): (TCard & { transformed?: CardTransformResult })[] {
  if (!cache) return [...cards];
  return cards.map((c) => {
    const entry = cache[c.id];
    return entry ? { ...c, transformed: { front: entry.front, back: entry.back, why: entry.why } } : c;
  });
}
