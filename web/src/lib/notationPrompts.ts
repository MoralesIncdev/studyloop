// V3-A A2 "Notation elaborative ghost prompts": the note textarea's
// placeholder rotates through an elaboration pool, one chosen per modal-open
// (not cycling while typing) — PEDAGOGY §1 generate-first: the blank field
// invites the learner's own words before anything else on screen.
//
// `promptPoolFor(domain)` is the v3-B hook: once projects carry an editable
// domain tag, a domain-specific pool overrides this generic one. Only the
// generic pool ships today.

const GENERIC_PROMPTS: readonly string[] = [
  "Why does this matter?",
  "The mechanism here is…",
  "This contrasts with…",
  "Where would this apply?",
  "What would break this?",
];

/** v3-B hook: domain-specific pools will override this — generic only for now. */
export function promptPoolFor(_domain?: string | null): readonly string[] {
  return GENERIC_PROMPTS;
}

/** Picks one prompt at random from `pool` — called once per modal-open. */
export function pickPrompt(pool: readonly string[]): string {
  if (pool.length === 0) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}
