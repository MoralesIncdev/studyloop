// V3-B B4 "Card transformation" (SPEC): when analysis v3 + an API key are
// available, weak bubble-card text gets an LLM-generated cloze/question
// front (quote = source, user note = hint); pearl cards always become
// question-form fronts with corrective backs (answer + one-line why + the
// clip link the card already carries). Result is cached in review.json per
// card id (`transformed:{front,back,why}` — see lib/review.ts/routes/review.ts)
// so it's computed at most once per card. Same injectable-adapter pattern as
// lib/analysis.ts (fake/real client, resolve*/​__set*ForTests).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANALYSIS_MAX_TOKENS, type AnalysisOutcome } from "./analysis.js";
import type { Domain } from "./models.js";

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
  /** V3-D D4 "domain-routed" card transformation — the owning project's domain (undefined for a v2 analysis, a project with no domain yet, or "generic"), shapes the question STYLE below. */
  domain?: Domain;
}

const CARD_TRANSFORM_SYSTEM_PROMPT = `You turn a learner's study-session note or a pearl of insight into a spaced-repetition review card. Given the source text, produce:
- "front": a cloze or short-answer question that tests recall of the specific point — never a vague "what was your note here?"
- "back": the answer, stated plainly.
- "why": one sentence explaining why the answer is correct or why it matters — corrective feedback, not a restatement of the answer.
Keep all three fields short (front/why under 160 characters, back under 240). Base the card only on the given text — never invent facts not present in it.`;

/**
 * V3-D D4 "Card transformation becomes domain-routed: the transformation
 * prompt uses the project domain to shape question style (mechanistic why /
 * sourcing / scenario application / notation)." Appended to the shared
 * system prompt above — same "one shared JSON schema, only the text
 * changes" pattern as lib/analysis.ts's DOMAIN_MODULES.
 */
const CARD_TRANSFORM_DOMAIN_MODULES: Record<Domain, string> = {
  biology: 'Question style: mechanistic why. Prefer a "front" that asks HOW or WHY the mechanism works, not just what it is.',
  history:
    'Question style: sourcing. Prefer a "front" that asks who claims this and on what basis, or what kind of source/perspective it reflects.',
  music: 'Question style: notation. Prefer a "front" that asks the learner to map the idea to notation, key, or how it would sound.',
  physical_skill:
    'Question style: scenario application. Prefer a "front" phrased as a live scenario ("you\'re in X, opponent does Y — what next?") rather than an abstract definition.',
  generic: "No specific domain lens applies — use your best general judgment for question style.",
};

function buildCardTransformSystemPrompt(domain?: Domain): string {
  if (!domain) return CARD_TRANSFORM_SYSTEM_PROMPT;
  return `${CARD_TRANSFORM_SYSTEM_PROMPT}\n\n${CARD_TRANSFORM_DOMAIN_MODULES[domain]}`;
}

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
        system: buildCardTransformSystemPrompt(input.domain),
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

/**
 * V3-D D4: deterministic domain-shaped question stem for the fake client —
 * mirrors CARD_TRANSFORM_DOMAIN_MODULES' style guidance (mechanistic-why /
 * sourcing / notation / scenario-application) without a network call, so
 * "domain question routing" is exercisable/testable in fake mode. `pearl`
 * gets a direct question; `bubble` keeps its cloze/fill-in-the-blank shape
 * but with a domain-flavored lead-in.
 */
function domainFront(domain: Domain | undefined, kind: CardTransformInput["kind"], source: string): string {
  const s = source.slice(0, 80);
  if (kind === "bubble") {
    switch (domain) {
      case "biology":
        return `Mechanism check — fill in the blank: ${s} — ___`;
      case "history":
        return `Sourcing check — fill in the blank: ${s} — ___`;
      case "music":
        return `Notation check — fill in the blank: ${s} — ___`;
      case "physical_skill":
        return `Scenario check — fill in the blank: ${s} — ___`;
      default:
        return `Fill in the blank: ${s} — ___`;
    }
  }
  switch (domain) {
    case "biology":
      return `Why does this happen: "${s}"?`;
    case "history":
      return `Who claims this, and on what basis: "${s}"?`;
    case "music":
      return `How would you notate: "${s}"?`;
    case "physical_skill":
      return `You're mid-technique — what's next after: "${s}"?`;
    default:
      return `Why does this matter: "${s}"?`;
  }
}

/** Deterministic — no network call, mirrors FakeAnalysisClient's role for STUDYLOOP_FAKE_ANALYSIS=1 / tests. */
export class FakeCardTransformClient implements CardTransformLLMClient {
  async transform(input: CardTransformInput, _model?: string): Promise<AnalysisOutcome<CardTransformResult>> {
    const source = input.quote.trim() || input.note.trim() || "this point";
    return {
      kind: "ok",
      data: {
        front: domainFront(input.domain, input.kind, source),
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
 * V3-B B4: fills in a `{[cardId]: CardTransformResult}` cache for any of
 * `cards` that are eligible (present in `transformCandidates`) and not
 * already cached — bounded to the given card set (never every historical
 * card) so a session's latency cost stays proportional to what's actually
 * being reviewed. No-ops entirely (returns `cached` unchanged, same
 * reference) when no client resolves (no key, not fake mode) — SPEC
 * "fallback = current format" means an unavailable transformer is never a
 * review-blocking error — or when nothing needed fetching.
 */
export async function fillTransformCache<TCard extends TransformableCard>(
  cached: Readonly<Record<string, CardTransformResult>>,
  cards: readonly TCard[],
  transformCandidates: ReadonlyMap<string, CardTransformInput>,
  client: CardTransformLLMClient | null,
  model: string
): Promise<Record<string, CardTransformResult>> {
  if (!client) return cached;

  let next = cached;
  let changed = false;
  for (const card of cards) {
    if (next[card.id]) continue;
    const candidate = transformCandidates.get(card.id);
    if (!candidate) continue;
    // eslint-disable-next-line no-await-in-loop -- bounded to the caller's due-card set; sequential mirrors lib/analysis.ts's own per-chunk loop
    const outcome = await client.transform(candidate, model);
    if (outcome.kind === "ok") {
      next = { ...next, [card.id]: outcome.data };
      changed = true;
    }
  }
  return changed ? next : cached;
}

/** Attaches each card's cached transform (if any) as a `transformed` field, leaving cards without one untouched. */
export function attachTransforms<TCard extends TransformableCard>(
  cards: readonly TCard[],
  cache: Readonly<Record<string, CardTransformResult>> | undefined
): (TCard & { transformed?: CardTransformResult })[] {
  if (!cache) return [...cards];
  return cards.map((c) => (cache[c.id] ? { ...c, transformed: cache[c.id] } : c));
}

/**
 * V3-D D4 "improve this card": unconditionally overwrites one card's cache
 * entry — the explicit-regeneration counterpart to fillTransformCache's
 * "skip if already cached" policy. Kept as its own tiny pure function (not
 * inlined in the route) so the "cache overwrite is a plain object merge,
 * nothing fancier" behavior stays directly unit-testable.
 */
export function withTransformResult(
  cached: Readonly<Record<string, CardTransformResult>>,
  cardId: string,
  result: CardTransformResult
): Record<string, CardTransformResult> {
  return { ...cached, [cardId]: result };
}
