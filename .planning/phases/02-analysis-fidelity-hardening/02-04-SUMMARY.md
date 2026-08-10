---
phase: 02-analysis-fidelity-hardening
plan: 04
subsystem: analysis
tags: [dedupe, safety-tier, overlay-scrub, regression-tests, human-verify]

requires:
  - phase: 02-analysis-fidelity-hardening
    provides: "02-01/02-03's enrichment plumbing and 02-02's PRIORITIZATION safety-tier addition — this plan audits the already-shipped ANLZ-01/ANLZ-03 dedupe and scrub passes those plans build on top of"
provides:
  - "D-01 value-preservation regression cases for dedupeNearDuplicateUnits (verbatim quote/anchor union, max confidence, independent longest summary/body winners, same-timestamp survivor pin)"
  - "D-01/D-02 four-type sweep proving distinct safety-tier facts never merge and identical twins still collapse, for DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION"
  - "ANLZ-03 empty-string/whitespace/all-empty edge coverage for mergeOverlayFields (via mergeUnitsByFingerprint) and scrubOverlayToLens, including a merge-then-scrub composition case mirroring runAnalysisJobV3's production path"
affects: [phase-4-real-lecture-proof]

actuals:
  tokens: 2632
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Audit-and-pin: extend regression coverage on already-shipped, correct production code with a git-diff-quiet gate on the production file, rather than re-deriving the implementation"
    - "Data-driven it.each sweep over the four safety-tier type names, so a fifth type is a one-line addition rather than four copy-pasted test blocks"

key-files:
  created: []
  modified:
    - server/test/analysisV3.test.ts

key-decisions:
  - "Task 1's D-01 value-preservation fixtures give both units a SHARED anchor timestamp to trigger the collapse (dedupeNearDuplicateUnits' match predicate requires at least one shared t) while each side also carries a unique timestamp, so the anchor-union assertion proves 3 distinct timestamps survive rather than accidentally testing 'two units that never collapsed'"
  - "Task 2's no-overlay scrubOverlayToLens case asserts scrubbed[0] === input (same object reference) because the function's early return (`if (!u.overlay) return u;`) means a unit with no overlay key never gets an `overlay` key introduced — confirmed via `'overlay' in scrubbed[0]` === false, not merely `.overlay === undefined`"
  - "Task 2's composition case builds a raw ChunkUnitRaw literal with both an off-lens array key (entities, which IS a real OVERLAY_ARRAY_KEYS member but not one of clinical.json's six declared keys) and an in-array empty string, so the single test proves both the merge-stage empty-string filter AND the scrub-stage undeclared-key removal in one call chain mirroring the actual runAnalysisJobV3 sequence"

requirements-completed: [ANLZ-01, ANLZ-03]

coverage:
  - id: D1
    description: "D-01 value-preservation: a safety-tier fact re-emitted across chunk overlap collapses losslessly — anchors unioned by timestamp (never averaged/truncated), quotes stay verbatim, longer summary/body wins independently, confidence takes the max"
    requirement: "ANLZ-01"
    verification:
      - kind: unit
        ref: "server/test/analysisV3.test.ts#dedupeNearDuplicateUnits > D-01: value-preservation on collapse — the merge is a union, never an average or truncation"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-01/D-02 four-type sweep: two DISTINCT safety-tier facts sharing an anchor timestamp never collapse (empty alias map), for all four safety-tier types including PRIORITIZATION; an identical twin pair of any of the four still collapses to one — the tier does not exempt itself from same-fact collapse"
    requirement: "ANLZ-01"
    verification:
      - kind: unit
        ref: "server/test/analysisV3.test.ts#dedupeNearDuplicateUnits > D-01/D-02: the four safety-tier types collapse identical twins and never merge distinct facts (it.each over DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ANLZ-03: no overlay value survives into a merged unit for a field the active lens did not declare, and no empty-string entry — including a lone empty-string array element, a whitespace-only scalar, and an all-empty group — survives at either the merge or the scrub stage"
    requirement: "ANLZ-03"
    verification:
      - kind: unit
        ref: "server/test/analysisV3.test.ts#mergeUnitsByFingerprint — V3-D D1 overlay merging (ANLZ-03 cases)"
        status: pass
      - kind: unit
        ref: "server/test/analysisV3.test.ts#scrubOverlayToLens (ANLZ-03 cases)"
        status: pass
      - kind: unit
        ref: "server/test/analysisV3.test.ts#scrubOverlayToLens > ANLZ-03: the merge-then-scrub composition mirrors runAnalysisJobV3's production path — no empty-string entry and no undeclared key survives to a serialized unit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Not one line of server/src/lib/analysis.ts changed by the two automated audit tasks — the shipped dedupeNearDuplicateUnits and scrubOverlayToLens behavior is proven correct by test, not modified"
    requirement: "ANLZ-01"
    verification:
      - kind: other
        ref: "git diff --quiet server/src/lib/analysis.ts (run after each of Task 1 and Task 2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A human confirms the enrichment badge/notice is visible on a flagged unit card, a tag is visible on a flagged pearl row, an italic note is present in the compiled export for both, a PRIORITIZATION unit renders its verbatim quote, no emoji glyphs appear, and unflagged content is unchanged across all three surfaces"
    requirement: "ANLZ-03"
    verification:
      - kind: manual_procedural
        ref: "Ryan, 2026-08-10 — throwaway project (Wim Deputter library video + its real .en.srt), STUDYLOOP_FAKE_ANALYSIS=1, fully cleaned up afterward. Unit card: badge + notice exactly 'Not stated in this lecture — added for context', informational blue rgb(62,166,255) not amber; unflagged units show neither. Pearls list: flagged pearl carries the .pearlEnrichmentTag 'context' tag; unflagged rows unchanged. Compiled document: flagged pearl bullet carries the italic '(Not stated in this lecture — added for context)' note; the flagged unit was unattested so it correctly rendered title-only under 'Not yet reviewed' per pedagogy rules (attestation gating, not enrichment marking, controls that list); unflagged content unchanged. PRIORITIZATION: hand-edited a throwaway unit's type to PRIORITIZATION — the .quote verbatim transcript block rendered unconditionally, same treatment as DOSAGE, zero component changes. Zero emoji glyphs in any new mark."
        status: pass
      - kind: unit
        ref: "npm test (root) — 1019 server / 357 web, re-confirmed green post-approval"
        status: pass
      - kind: other
        ref: "npm run typecheck (both workspaces) — exits 0, re-confirmed post-approval"
        status: pass
    human_judgment: true
    rationale: "web/src/concepts/ has no component-test harness in this codebase (01-03/02-01/02-02/02-03 precedent) — placement, legibility, and the correct-absence case on unflagged content are rendering/UX judgments no unit test asserts. Ryan performed the checkpoint on 2026-08-10 and approved; evidence recorded above."

duration: 30min
completed: 2026-08-10
status: complete
---

# Phase 2 Plan 4: D-01 Audit + ANLZ-03 Overlay-Discipline Regression Coverage Summary

**Closed the audit half of Phase 2 with regression tests pinning the already-shipped `dedupeNearDuplicateUnits` (D-01 value-preservation + four-type distinct-facts-never-merge sweep) and `scrubOverlayToLens`/`mergeOverlayFields` (ANLZ-03 empty-string/undeclared-key discipline, including a merge-then-scrub composition case) — zero production code changed — and closed with Ryan's human-verify confirmation that the enrichment marks (unit badge, pearl tag, compiled-export note) and PRIORITIZATION's verbatim-quote rendering are all actually visible.**

## Performance

- **Duration:** 30 min
- **Tasks:** 3 of 3 completed
- **Files modified:** 1 (+ REQUIREMENTS.md)

## Accomplishments

- `dedupeNearDuplicateUnits` gained a `D-01: value-preservation on collapse` describe block: verbatim-quote/anchor-union preservation across 3 distinct timestamps triggered off one shared anchor, max-not-mean confidence, independently-won longer summary/body split across the two units in a pair, and an explicit pin of the shipped same-timestamp-survivor-wins behavior
- `dedupeNearDuplicateUnits` gained a data-driven `it.each` sweep over `["DOSAGE", "CONTRAINDICATION", "LAB_VALUE", "PRIORITIZATION"]` proving (a) two distinct facts of that type sharing an anchor timestamp with non-subset labels stay as two units with an empty alias map, using realistic clinical label pairs (different drugs, dosage-vs-lab-range) so the test documents WHY the pair must stay apart, and (b) an identical twin pair of that type still collapses to one
- `mergeUnitsByFingerprint`'s overlay-merging block gained four ANLZ-03 cases: a lone empty-string array element collapses the key to absent, a mixed empty/non-empty array keeps only non-empty entries in order, a whitespace-only scalar is dropped (not trimmed-and-kept), and a group whose every overlay value is empty yields `overlay === undefined` (never `{}`)
- `scrubOverlayToLens` gained an EMPTY declared-key-set case (every unit's overlay collapses to undefined — the zero-`overlayFields`-lens scenario) and a no-overlay-at-all case asserting the function's early-return path leaves the input object reference untouched with no `overlay` key introduced
- A new composition case builds a raw unit through `mergeUnitsByFingerprint` then `scrubOverlayToLens` with the clinical lens's six keys, exactly mirroring `runAnalysisJobV3`'s production sequence (`analysis.ts:1979-1984`), and asserts on the **serialized** result per ROADMAP SC3's literal wording: no `""` substring anywhere in the JSON, only declared keys present
- Both tasks verified `git diff --quiet server/src/lib/analysis.ts` after committing — zero production code touched
- Confirmed the dev servers (server :4600, web :4601) are already running and responding (200) ahead of Task 3's checkpoint, satisfying the plan's automation-before-verification step 1

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin D-01's merge semantics — twins collapse, distinct facts never do, values never blur** - `4984b11` (test)
2. **Task 2: Pin overlay-field discipline — no undeclared keys, no empty strings, no lone empty array entry** - `e9c5ad3` (test)
3. **Task 3: Confirm the enrichment marks and the PRIORITIZATION verbatim quote are actually visible** - human-verify checkpoint, no code commit (Ryan approved 2026-08-10 on a throwaway project; see D5 coverage entry for evidence)

**Plan metadata:** `23ba0eb` (docs: halt at checkpoint), this commit (docs: finalize post-approval)

## Files Created/Modified

- `server/test/analysisV3.test.ts` - D-01 value-preservation block + four-type sweep inside `describe("dedupeNearDuplicateUnits")`; ANLZ-03 empty-string/whitespace/all-empty cases inside the overlay-merging block; zero-declared-keys + no-overlay + merge-then-scrub composition cases inside `describe("scrubOverlayToLens")`

## Decisions Made

See `key-decisions` in frontmatter. No shape or implementation decisions were made — this plan is audit-only per 02-CONTEXT.md's D-01/D-02 rulings (LOCKED before this plan started); the judgment calls were entirely in fixture construction (how to trigger the collapse predicate correctly, how to prove the early-return reference-identity behavior, how to exercise both empty-string filtering and undeclared-key removal in one composition case).

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2. One in-flight fixture correction during Task 1 (the first attempt at the anchor-union test gave the two units disjoint anchor timestamps, so `dedupeNearDuplicateUnits`' match predicate — which requires at least one SHARED anchor `t` — never triggered the collapse; caught immediately by the failing test run and fixed before commit, not a deviation from the plan's `<action>` instructions).

## Issues Encountered

None blocking. The one test-authoring correction above was caught by the test itself failing on first run (`expected length 1 but got 2`), fixed, and re-verified — exactly the fast feedback loop TDD-style test authoring is supposed to provide.

## User Setup Required

None - no external service configuration required. Task 3's throwaway-project verification (STUDYLOOP_FAKE_ANALYSIS=1 analyze run + hand-edited analysis.json) was performed and fully cleaned up by the orchestrator/Ryan; no artifact from it remains on disk.

## Next Phase Readiness

- ROADMAP SC1, SC3, and SC4 (both halves — distinct-facts-never-merge for all four safety-tier types AND PRIORITIZATION verbatim-quote rendering) are now proven: SC1/SC3/SC4's merge guarantees by regression test, SC4's rendering half and SC2's visibility half by Ryan's human-verify confirmation
- `ANLZ-01` and `ANLZ-03` flip to Complete in `.planning/REQUIREMENTS.md` (checklist + Traceability table) — both were this plan's sole declaring plan (ANLZ-01's shared-ID gate with 02-02 is also resolved: 02-02 landed the config/predicate side, this plan lands the merge-audit side)
- Phase 2 (Analysis Fidelity Hardening)'s four requirements — ANLZ-01, ANLZ-02, ANLZ-03, and the enrichment/PRIORITIZATION work across 02-01/02-02/02-03/02-04 — are now all Complete
- No blockers for Phase 3 (Attestation Gate / GATE-01/GATE-02/COMP-01/COMP-02) or Phase 4 (real-lecture proof)

## Self-Check: PASSED

All three task-level commits (`4984b11`, `e9c5ad3`) and both metadata commits (`23ba0eb` halt, this commit finalize) verified present in `git log --oneline`. `server/test/analysisV3.test.ts` verified present on disk with all new describe blocks. `.planning/REQUIREMENTS.md` verified: ANLZ-01 and ANLZ-03 checkboxes `[x]`, Traceability table rows both `Complete`. Full re-run: `npm run test -w server -- analysisV3 -t "dedupeNearDuplicateUnits"` 19/19 pass, `npm run test -w server -- analysisV3 -t "overlay"` 16/16 pass, `npm run test -w server -- analysisV3 -t "scrubOverlayToLens"` 4/4 pass, `git diff --quiet server/src/lib/analysis.ts` exits 0 after both automated tasks, `npm test` (root) 1019/1019 server (1000 baseline + 19 new) / 357/357 web (no regression), `npm run typecheck` (both workspaces) exits 0.

---
*Phase: 02-analysis-fidelity-hardening*
*Completed: 2026-08-10*
