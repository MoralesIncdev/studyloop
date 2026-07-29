// V3-A A2 "Notation elaborative ghost prompts": the note textarea's
// placeholder rotates through an elaboration pool, one chosen per modal-open
// (not cycling while typing) — PEDAGOGY §1 generate-first: the blank field
// invites the learner's own words before anything else on screen.
//
// V3-D D1 "domain slot types": `promptPoolFor(domain)` — the v3-B hook —
// now actually branches per project domain. Pool style per PEDAGOGY §2/SPEC
// D1: history -> source-question ("who claims this and why?"), music ->
// notation-map, physical_skill -> execute-step ("you're in X, opponent does
// Y — next?"), biology -> mechanism-why. Both Study Path's generation slots
// (concepts/UnitProposalCard.tsx) and the notation modal (notes/NotationModal.tsx,
// via state/store.ts openNotation) consume this same pool/pick pair — one
// hook, two surfaces, per SPEC.

const GENERIC_PROMPTS: readonly string[] = [
  "Why does this matter?",
  "The mechanism here is…",
  "This contrasts with…",
  "Where would this apply?",
  "What would break this?",
];

const BIOLOGY_PROMPTS: readonly string[] = [
  "Why does this mechanism work the way it does?",
  "What triggers this, and what does it feed back into?",
  "What level of organization is this happening at?",
  "What would happen if this component were missing?",
  "How does this connect to the larger system?",
];

const HISTORY_PROMPTS: readonly string[] = [
  "Who claims this, and on what basis?",
  "What's the primary source here — and who's missing from it?",
  "Proximate cause or structural cause?",
  "Whose perspective does this account reflect?",
  "What would a corroborating (or contradicting) source say?",
];

const MUSIC_PROMPTS: readonly string[] = [
  "Map this to notation — what would the score show here?",
  "What key/mode is this in, and how do you know?",
  "How would you sing or play this back?",
  "What makes this passage an example of the idea?",
  "What's the ear-training cue to listen for?",
];

const PHYSICAL_SKILL_PROMPTS: readonly string[] = [
  "You're in this position, opponent does X — what's next?",
  "What's the trigger that starts this step?",
  "Where does this commonly break down?",
  "What drill isolates just this piece?",
  "What's the failure mode if you rush this?",
];

const DOMAIN_POOLS: Record<string, readonly string[]> = {
  biology: BIOLOGY_PROMPTS,
  history: HISTORY_PROMPTS,
  music: MUSIC_PROMPTS,
  physical_skill: PHYSICAL_SKILL_PROMPTS,
};

/** V3-D D1: returns the domain-routed pool when `domain` names one of the four lenses; the shared generic pool otherwise (undefined/null/"generic"/anything unrecognized). */
export function promptPoolFor(domain?: string | null): readonly string[] {
  if (!domain) return GENERIC_PROMPTS;
  return DOMAIN_POOLS[domain] ?? GENERIC_PROMPTS;
}

/** Picks one prompt at random from `pool` — called once per modal-open. */
export function pickPrompt(pool: readonly string[]): string {
  if (pool.length === 0) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}
