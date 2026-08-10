---
phase: 3
slug: attestation-gate-compile-honesty
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract. This phase is verification-plus-documentation: 3 of 4 requirements shipped pre-phase (`813dc21` gate + continuous migration; `468e0b8` Dismissed section + clickable anchors), all already unit-tested.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.0 (server) |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `npm run test -w server -- review` / `-- compile` |
| **Full suite command** | `npm test` |
| **Baseline** | 1019 server + 357 web green (post-Phase-2) — must not regress |

## Sampling Rate

- **Per task commit:** targeted runs (`-- review`, `-- compile`)
- **Phase gate:** full suite + typecheck both workspaces. NOTE: real user review data exists (12+ cards due) — migration behavior is validated on fixtures ONLY; never mutate `~/StudyLoop` data.

## Requirements → Test Map

| Req ID | Behavior | Test | Exists? |
|--------|----------|------|---------|
| GATE-01 | `deriveLiveCards()` gates pearls on attestation/learner-touch | `server/test/review.test.ts` (shipped w/ 813dc21) | ✅ extend only if gaps found |
| GATE-01 (gap) | Gate holds END-TO-END through the real Fastify route `GET /api/review/queue` | NEW route-level `app.inject` test (zero exist today — grep-verified) | ❌ Wave 0 — the phase's one net-new test |
| GATE-01 migration | Legacy un-attested `pearl:` cards: `reps>0` retained-but-suspended, `reps===0` dropped; attested cards' scheduling untouched | covered in review.test.ts orphan-drop cases | ✅ audit; extend fixture edge cases if thin |
| GATE-02 | SPEC.md F11 (~467-476) + V3-B B4 (~659-673) no longer specify the un-attested channel; deviation-note format per F11's existing precedent (lines 489-501) | doc assertion: `grep` SPEC.md for the excised contract phrases returns 0; deviation note present | ❌ Wave 0 (doc task w/ grep acceptance) |
| COMP-01 | Compiled doc has distinct `### Dismissed` section | `server/test/compile.test.ts` (shipped w/ 468e0b8) | ✅ audit |
| COMP-02 | Anchors render `[mm:ss](#t=N)` clickable links matching `renderNotesTokens` `^t:` | `server/test/compile.test.ts` | ✅ audit |

## Wave 0 Gaps

- [ ] `server/test/reviewRoutes.test.ts` (or extend review.test.ts) — first route-level `app.inject` test for `/api/review/queue`: un-attested pearl absent, attested pearl present, legacy suspended pearl absent-but-state-preserved (Phase-1 youtube.test.ts is the repo's only route-test precedent — follow it)
- [ ] SPEC.md excision task needs no test scaffolding — grep-based acceptance criteria
- [ ] No new fixtures beyond synthetic review.json objects in-test; NEVER touch real `~/StudyLoop` data
