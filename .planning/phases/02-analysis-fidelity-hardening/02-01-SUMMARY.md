---
phase: 02-analysis-fidelity-hardening
plan: 01
subsystem: analysis
tags: [zod, analysis-v3, structured-output, react, provenance, groundedness]

requires:
  - phase: 01-ingestion-pipeline-repair
    provides: caption-fallback + empty-page signal groundwork the v3 pipeline builds on
provides:
  - "enrichment: z.boolean().optional() on ChunkUnitRawSchema and AnalysisUnitSchema (server/src/lib/analysis.ts)"
  - "the self-reported flag threaded through both merge passes (mergeUnitsByFingerprint OR, dedupeNearDuplicateUnits OR-onto-survivor)"
  - "web AnalysisUnit type mirror + enrichmentNoticeText pure helper (web/src/lib/enrichment.ts)"
  - "enrichment badge + locked-copy notice on UnitProposalCard"
affects: [02-03-pearls-and-compile, 02-04-real-lecture-proof]

actuals:
  tokens: 6494
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Self-reported groundedness flag, OR-propagated across both merge passes (never averaged/majority-voted away) — same pattern as V3-D D2 threshold"
    - "Wire-level required + final-schema optional split for a boolean field, mirroring evidence/threshold at analysis.ts"
    - "Pure, dependency-free copy-function contract for web card copy (enrichment.ts mirrors the slidesWarning.ts precedent) so web/src/concepts/ logic stays node-testable without a component-test harness"

key-files:
  created:
    - web/src/lib/enrichment.ts
    - web/src/lib/enrichment.test.ts
  modified:
    - server/src/lib/analysis.ts
    - server/test/analysisV3.test.ts
    - web/src/lib/types.ts
    - web/src/concepts/UnitProposalCard.tsx
    - web/src/concepts/UnitProposalCard.module.css

key-decisions:
  - "enrichment: z.boolean().optional() (not .default(false)) on both ChunkUnitRawSchema and AnalysisUnitSchema, per 02-CONTEXT.md's locked interface_context — keeps the diff to intentional sites instead of forcing enrichment: into ~43 existing object literals"
  - "Wire schema (CHUNK_V3_JSON_SCHEMA) keeps enrichment required in properties+required, matching the existing threshold/evidence convention for structured-output json_schema mode"
  - "Merge output emits true | undefined, never false, in both mergeUnitsByFingerprint and dedupeNearDuplicateUnits — 'don't persist a value nobody actually emitted', same rule mergeEvidence/mergeOverlayFields already follow"
  - "D-01 preserved: dedupeNearDuplicateUnits' match predicate (matchIdx findIndex body) is byte-identical to before this plan — enrichment is passenger data on the collapse, verified via git diff and a dedicated test"
  - "FakeAnalysisClient flags every 4th chunk's primary unit (index 0 always flagged) — deterministic, no randomness, exercises both the true and undefined branches in a short fake-mode transcript"
  - "REQUIREMENTS.md ANLZ-02 checkbox left Pending — 02-03-PLAN.md also declares ANLZ-02 and has not yet produced a SUMMARY (shared-ID gate, #2388); flipping it now would be premature"

requirements-completed: [ANLZ-02]

coverage:
  - id: D1
    description: "A unit flagged true by the chunk model survives mergeUnitsByFingerprint and dedupeNearDuplicateUnits and reaches the persisted analysis document runAnalysisJobV3 returns, proven end-to-end against FakeAnalysisClient with no live API call"
    requirement: "ANLZ-02"
    verification:
      - kind: unit
        ref: "server/test/analysisV3.test.ts#mergeUnitsByFingerprint — ANLZ-02 enrichment merging"
        status: pass
      - kind: unit
        ref: "server/test/analysisV3.test.ts#dedupeNearDuplicateUnits (ANLZ-02 enrichment propagation cases)"
        status: pass
      - kind: integration
        ref: "server/test/analysisV3.test.ts#runAnalysisJobV3 (fake client end-to-end) > ANLZ-02: a fake-mode-flagged unit's enrichment flag reaches the returned analysis and round-trips through AnalysisSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "A learner viewing a flagged unit card sees an enrichment badge (autoAwesome icon) plus the exact locked notice copy ('Not stated in this lecture — added for context'), zero emoji glyphs; an unflagged card shows neither"
    requirement: "ANLZ-02"
    verification:
      - kind: unit
        ref: "web/src/lib/enrichment.test.ts#enrichmentNoticeText (ANLZ-02)"
        status: pass
    human_judgment: true
    rationale: "The pure helper's copy/null-branching is unit-tested and passing, but visual placement, badge legibility, and the --accent-blue vs --accent-amber distinction on the live card are a rendering/UX judgment no unit test asserts — web/src/concepts/ has no component-test harness (01-03 precedent). Final visual judgment lands at plan 02-04's human-verify checkpoint per the plan's assumption A3."

duration: 35min
completed: 2026-08-10
status: complete
---

# Phase 2 Plan 1: ANLZ-02 Enrichment Tracer Summary

**Self-reported `enrichment` boolean threaded end-to-end from the chunk LLM's structured output through both v3 merge passes into the persisted analysis document, mirrored onto the web `AnalysisUnit` type, and surfaced as a blue badge + locked-copy notice on `UnitProposalCard`.**

## Performance

- **Duration:** 35 min
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `enrichment: z.boolean().optional()` added to `ChunkUnitRawSchema` and `AnalysisUnitSchema`, plus the mandatory hand-written `CHUNK_V3_JSON_SCHEMA` wire mirror (`properties` + `required`) — the documented under-scoping trap this plan explicitly guards against
- `buildChunkV3SystemPrompt` extended with the enrichment clause and a grounding-paragraph escape hatch, so the model has an explicit outlet instead of silently over-explaining
- Both merge passes propagate the flag by OR, never by average/majority-vote: `mergeUnitsByFingerprint` ORs across the fingerprint group; `dedupeNearDuplicateUnits` ORs survivor+absorbed onto the kept unit, with the collapse's match predicate itself provably untouched (D-01)
- `FakeAnalysisClient.runChunkV3` deterministically flags every 4th chunk (no randomness), and an end-to-end `runAnalysisJobV3` test proves the flag reaches the returned `Analysis` document and round-trips through `AnalysisSchema.parse`
- `web/src/lib/enrichment.ts` (new): pure `enrichmentNoticeText` helper, zero React/store/DOM imports, locked copy, mirroring the Phase-1 `slidesWarning` precedent so `web/src/concepts/` logic stays node-testable
- `UnitProposalCard.tsx`/`.module.css`: an `autoAwesome`-icon badge and an `--accent-blue` notice paragraph, each an independent top-level conditional, computed once into a local const — the `isSafetyTierUnitType` verbatim-quote block is provably unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: One enrichment-flagged unit survives the whole server pipeline into the persisted analysis** - `d39e70f` (feat)
2. **Task 2: The flag becomes a visible mark on the learner's unit card** - `33b245c` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `server/src/lib/analysis.ts` - `enrichment` field on both unit schemas, wire mirror, prompt clause, both merge-pass rules, deterministic FakeAnalysisClient emission
- `server/test/analysisV3.test.ts` - merge-pass group behavior tests, dedupe survivor-propagation tests (including the D-01 "collapse decision unaffected" case), one end-to-end fake-client case
- `web/src/lib/types.ts` - `enrichment?: boolean` added to `AnalysisUnit` (hand-maintained server-schema mirror)
- `web/src/lib/enrichment.ts` (new) - pure `enrichmentNoticeText` helper
- `web/src/lib/enrichment.test.ts` (new) - behavior + zero-emoji-glyph coverage
- `web/src/concepts/UnitProposalCard.tsx` - badge + notice, both independent conditionals
- `web/src/concepts/UnitProposalCard.module.css` - `.enrichmentBadge`/`.enrichmentNotice` using `--accent-blue`

## Decisions Made

- Field shape and copy text were LOCKED in `02-CONTEXT.md`'s `interface_context` before this plan started — no shape decisions were made during execution, only implementation of the locked contract. See `key-decisions` in frontmatter for the specific rules applied (never-average-away OR propagation, wire-required/schema-optional split, D-01 preservation).
- `REQUIREMENTS.md`'s `ANLZ-02` checkbox intentionally left `Pending`: `02-03-PLAN.md` also declares `ANLZ-02` (the pearls/compiled-export surface, per the plan's own objective note "every remaining ANLZ-02 surface... copies this exact path") and has not yet run. Marking it Complete now would be premature under the shared-ID gate (#2388) — it flips only once both declaring plans have a SUMMARY.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed 02-CONTEXT.md's locked interface_context and 02-01-PLAN.md's `<action>` steps verbatim; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None.

## Tracer Feedback Gate

Task 1 (`type="tracer"`) was committed, then its automated `<verify>` (`npm run test -w server -- analysisV3 && npm run typecheck -w server && test $(grep -c 'enrichment' server/src/lib/analysis.ts) -ge 6`) was re-run and passed before Task 2 (the card-surfacing expansion) began. No architectural dead end was found — the tracer proved the full path cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The enrichment path (schema → wire mirror → prompt → both merges → fake-client emission → web mirror → UI badge) is proven end-to-end and available as the template for 02-03's pearl/compiled-export surfaces.
- `ANLZ-02` requirement stays `Pending` in `REQUIREMENTS.md` until 02-03 also lands a SUMMARY (shared-ID gate).
- No blockers for 02-02 or 02-03.

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`d39e70f`, `33b245c`) verified present in git log. Full acceptance criteria re-run: `npm run test -w server` 988/988 pass (baseline 980 + 8 new), `npm run test -w web` 356/356 pass (baseline 352 + 4 new), `npm run typecheck` (both workspaces) exits 0, `npm run build -w web` exits 0. `grep -n 'enrichment' server/src/lib/analysis.ts` hits all six required sites. `git diff` confirms `dedupeNearDuplicateUnits`'s match predicate and `isSafetyTierUnitType` block are byte-identical to before this plan; no edits to `runAnalysisJob`/`ChunkResultSchema`/`MergeResultSchema`/`CHUNK_JSON_SCHEMA`.

---
*Phase: 02-analysis-fidelity-hardening*
*Completed: 2026-08-10*
