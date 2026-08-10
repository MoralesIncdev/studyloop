---
phase: 04-real-lecture-proof-re-run
plan: 04
subsystem: testing
tags: [proof-run, ui-walkthrough, attestation, notes, captures, concept-doc, compile-export, gstack-browse]

requires:
  - phase: 04-03
    provides: "Proof project 41b2d9ea-a4b1-428a-b09a-7065ed3dee1f with a completed real clinical analysis (18 units/8 pearls/18 concepts/4 themes/8 edges) and the running isolated harness (ports 4620/4621)"
provides:
  - "Full attestation lifecycle exercised through the real card UI: 8/18 units attested (6 type-take-then-reveal-then-attest, 1 skip-path, 1 attested-then-edited), 1 dismissed, 1 dismissed-then-undone, 9 untouched"
  - "All four PROOF-02 session-content paths populated through their own UI affordance: notes with real seek tokens, mined captures (2 captioned + 1 deliberately uncaptioned), concept doc attached with a genuine 2/4 partial coverage split, watchedUpTo advanced by real player seeks"
  - "Compiled study document produced through the UI's own compile flow (synthesis card + caption step), byte-identical to the on-disk export, with every session-content section rendering real content and zero empty-state placeholders"
  - "3 new findings (F-06/F-07/F-08) recorded honestly: browse-tooling ref ambiguity against duplicated DOM, a concept-doc-attach Settings prerequisite gap, and mine-this-moment's async landing delay"
affects: [04-05]

actuals:
  tokens: 15600
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "When gstack browse's positional @ref targeting becomes unreliable against a component intentionally rendered from multiple call sites (this app's UnitProposalCard renders 3x — Study Path rail, RightRail Concepts card, AI-breakdown section), target by stable label text via a small js/eval helper (querySelector by exact textContent match, closest('[data-status]'), first DOM match) instead of @refs — still real DOM click()/native-setter input events, never an API substitute for the UI action"
    - "Synthetic pointer-drag events (pointerdown/mousedown/pointermove/pointerup/mouseup with computed clientX) reliably drive this app's custom seek slider for controlled, repeatable playback-position seeks in a headless proof run, without needing real-time video playback to elapse"
    - "Server-side path guards (isPathAllowedCanonical, exact-match against config.conceptDocs) require the concept-doc's absolute path to be added via Settings before the study view's own attach control will accept it — a two-screen UI prerequisite, not a bypassable restriction"

key-files:
  created:
    - docs/proof-evidence-2026-08-10/run/attestations.json
    - docs/proof-evidence-2026-08-10/run/notes.md
    - docs/proof-evidence-2026-08-10/run/bubbles.json
    - docs/proof-evidence-2026-08-10/run/project-before-compile.json
    - docs/proof-evidence-2026-08-10/run/compile-response.json
    - docs/proof-evidence-2026-08-10/run/compiled-study-doc.md
    - docs/proof-evidence-2026-08-10/screenshots/run-06-unit-card-generate.png
    - docs/proof-evidence-2026-08-10/screenshots/run-07-unit-card-attested.png
    - docs/proof-evidence-2026-08-10/screenshots/run-08-safety-tier-card.png
    - docs/proof-evidence-2026-08-10/screenshots/run-09-notes-pane.png
    - docs/proof-evidence-2026-08-10/screenshots/run-10-capture-rail.png
    - docs/proof-evidence-2026-08-10/screenshots/run-11-concepts-covered.png
    - docs/proof-evidence-2026-08-10/screenshots/run-12-compile-synthesis.png
    - docs/proof-evidence-2026-08-10/screenshots/run-13-compiled-document.png
  modified:
    - docs/proof-evidence-2026-08-10/RUN-MANIFEST.md
    - docs/proof-evidence-2026-08-10/FINDINGS.md

key-decisions:
  - "Added the concept doc's absolute path to the isolated proof harness's Settings > 'Concept documents' field before the ConceptsDock's own attach control would accept it — confirmed the Data directory field still read the correct isolated proof root (/Users/antemo/StudyLoopProof-2026-08-10) both before and after saving, so this was a config addition within the same isolated harness, not a break in isolation"
  - "Capped every controlled player seek (notes, captures, and the final watchedUpTo value) at or below 339s — strictly between the concept doc's 2nd anchor (184s) and 3rd anchor (385s) — so Concepts Covered would show a genuine 2/4 partial split rather than an accidental full-or-zero coverage that couldn't distinguish a working filter from a broken one"
  - "Recorded F-06 (browse ref ambiguity) as a tooling-only observation rather than an app defect: every intended state change was cross-checked against the persisted attestations.json/bubbles.json/project record before being treated as done, and the one accidental local-only reveal (never persisted) still counts correctly as 'untouched' under the server's own attestation-feedability rules"
  - "Deleted one duplicate mined capture through the capture rail's own real Delete-capture UI control (confirm dialog auto-accepted) rather than via an API call, keeping every state change in this plan attributable to a genuine UI action"

patterns-established:
  - "Partial-coverage proof pattern: when a plan needs to demonstrate a filter distinguishes 'some vs all' rather than 'none vs all', explicitly bound every state-advancing action (seeks, in this case) to land strictly between two known thresholds, and verify via a screenshot of the exact counter/UI surface the renderer itself uses (ConceptsDock's 'Covered N / M' line), not just the raw underlying value"

requirements-completed: [PROOF-01, PROOF-02]

coverage:
  - id: D1
    description: "Full attestation lifecycle (generate/reveal, skip, attest, edit, dismiss, undo-dismiss) exercised through the real UnitProposalCard UI on 8 of 18 units, leaving all four attestation states represented for the compile partition"
    requirement: "PROOF-02"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-06/07/08 screenshots; embedded node verify script in 04-04-PLAN.md Task 1 <verify> (attested>=6, withTake>=6, dismissed>=1, untouched>=4) — actual: attested=8 withTake=7 dismissed=1 untouched=9"
        status: pass
    human_judgment: false
  - id: D2
    description: "All four PROOF-02 session-content paths (notes with seek tokens, mined captures, concept-doc-gated watchedUpTo, lesson synthesis) populated through their own UI affordance, with a genuine 2/4 partial concept-coverage split"
    requirement: "PROOF-02"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-09/10/11 screenshots; embedded node verify script in 04-04-PLAN.md Task 2 <verify> (notes>=120ch, tokens>=3, captures>=3, captioned>=2, watchedUpTo>0, conceptDoc attached, capture spread>=60s) — all passed"
        status: pass
    human_judgment: true
    rationale: "F-07 (concept-doc attach requiring an undiscovered prior Settings step) is a genuine UX/onboarding friction point a human should weigh when judging whether PROOF-02's session-content paths are truly self-service from the study view alone, even though every mechanical acceptance criterion passed once the Settings step was found."
  - id: D3
    description: "Compiled study document produced through the UI's compile flow (synthesis + caption steps), rendering every session-content section with real content and zero empty-state placeholders, byte-identical to the on-disk export file"
    requirement: "PROOF-02"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-12/13 screenshots; embedded node verify script in 04-04-PLAN.md Task 3 <verify> (all 5 sections present, no empty-state placeholders, Dismissed+Not-yet-reviewed both present, seek links present, markdown===API response) — all passed; diff confirms export file byte-identical"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-10
status: complete
---

# Phase 4 Plan 4: Proof Run Part 2 — Attestation Lifecycle, Session Content, Compile + Export Summary

**Ran the second half of the evidence-grade real-lecture proof entirely through the real browser UI: exercised all four attestation states across 8 of 18 units (including edit and undo-dismiss), populated all four previously-unproven PROOF-02 session-content paths (notes, captures, concept-doc-gated watchedUpTo, lesson synthesis), and compiled + exported a study document that renders every session-content section with real content — byte-identical to the on-disk export, with a genuine 2/4 partial concept-coverage split proving the watchedUpTo filter actually works.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-10T18:35:00Z (approx, first Read of PLAN.md)
- **Completed:** 2026-08-10T19:19:00Z
- **Tasks:** 3/3
- **Files modified:** 14 created, 2 modified (RUN-MANIFEST.md, FINDINGS.md) — zero `server/src` or `web/src` files touched (confirmed via `git diff --name-only` across all three task commits)

## Accomplishments

- **Full attestation lifecycle proven on real analysis data (SC2, SC3).** 8 of 18 units attested: 6 through the intended take → reveal → attest path (each with a genuine learner restatement), 1 through the skip → reveal → attest path (proving the skippable-generation guarantee, no take required), 1 attested and then revised via Edit/Save (`userBody` now differs from the AI's original body). 1 unit dismissed and left dismissed; 1 dismissed then undone via the Undo dismiss control, proving the round-trip back to a true "untouched" state (the DELETE endpoint removes the attestations.json entry entirely). 9 units left completely untouched. Both DOSAGE (safety-tier) units' verbatim quote blocks are screenshotted and render unconditionally regardless of attestation state, as designed.
- **All four PROOF-02 session-content paths populated for real, closing the 2026-08-08 proof's biggest gap.** Notes: 3 substantive notes (861 chars) with 3 real `^t:` seek tokens inserted via the pane's own "@ timestamp" control at genuinely different, pointer-driven player positions. Captures: 3 mined captures ("M" hotkey) spread over 300s, 2 recaptioned with learner commentary through the capture rail's inline edit, 1 deliberately left with empty text so the compile flow's caption step had something to prompt for. Concept doc: attached (4 anchored cards) with watchedUpTo advanced to 339.25s — strictly between anchors 2 and 3 — producing a genuine "Covered 2 / 4" split rather than an all-or-nothing result that couldn't distinguish a working filter from a broken one.
- **Compile and export exercised every session-content rendering path with real content (SC4).** The lesson summary was typed into the compile flow's synthesis card and saved; the caption step captioned the one deliberately-uncaptioned capture. The compiled document's five sections (In my own words, Notes, Captures, Concepts Covered, Concept breakdown) all render real content — zero empty-state placeholders — and both attestation partitions (Not yet reviewed ×9, Dismissed ×1) render correctly against attestations.json. The on-disk export file is byte-identical to the compile API response.
- **Every friction point recorded honestly, none smoothed over.** F-06 (browse-tooling @ref ambiguity against this app's intentionally-duplicated `UnitProposalCard` DOM — a tooling artifact, not an app bug, recovered via stable label-text JS targeting with zero API workarounds). F-07 (the study view's concept-doc attach 403s until the doc's absolute path is first added in Settings — the security guard works as designed, but the two-screen prerequisite isn't signposted, a genuine UX gap for 04-05 to weigh). F-08 (mine-this-moment's async chain lands after a short delay; a diagnostic-induced duplicate capture was cleaned up via the UI's own real Delete-capture control).

## Task Commits

Each task was committed atomically:

1. **Task 1: Exercise the full attestation lifecycle in document mode (SC2, SC3 inputs)** - `a6b7752` (feat)
2. **Task 2: Populate all four session-content paths through their own UI affordances (PROOF-02)** - `383eb88` (feat)
3. **Task 3: Compile and export through the UI, and verify the document renders every session-content section (SC4)** - `1d00ede` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `docs/proof-evidence-2026-08-10/run/attestations.json` - final attestation state for all 8 attested + 1 dismissed unit
- `docs/proof-evidence-2026-08-10/run/notes.md` - 3 notes with real `^t:` seek tokens
- `docs/proof-evidence-2026-08-10/run/bubbles.json` - 3 mined captures, 2 captioned, 1 uncaptioned
- `docs/proof-evidence-2026-08-10/run/project-before-compile.json` - project record confirming watchedUpTo=339.25 and conceptDoc attached, read before compiling
- `docs/proof-evidence-2026-08-10/run/compile-response.json` - the compile route's full response payload (evidence-capture re-read, idempotent)
- `docs/proof-evidence-2026-08-10/run/compiled-study-doc.md` - the compiled markdown, byte-identical to the on-disk export
- `docs/proof-evidence-2026-08-10/screenshots/run-06-unit-card-generate.png` through `run-13-compiled-document.png` - 8 non-video-surface screenshots covering the attestation lifecycle, safety-tier quote, notes pane, capture rail, partial concept coverage, compile synthesis, and the compiled document panel
- `docs/proof-evidence-2026-08-10/RUN-MANIFEST.md` - 3 new sections appended (attestation lifecycle, session-content paths, compile+export)
- `docs/proof-evidence-2026-08-10/FINDINGS.md` - 3 new findings appended (F-06, F-07, F-08)

## Decisions Made

- Added the concept doc's absolute path to the proof harness's Settings > "Concept documents" field before ConceptsDock's own attach control would accept it (server enforces an exact-match allowlist, `config.conceptDocs` was empty from 04-01's setup) — confirmed the Data directory field still read the correct isolated proof root both before and after saving, so this stayed within the isolated harness.
- Capped every controlled player seek at or below 339s (strictly between the concept doc's 2nd and 3rd anchors) so Concepts Covered would show a genuine partial split, not an accidental full-or-zero result.
- Recorded F-06 as a tooling-only observation, not an app defect, since every intended state change was cross-checked against the persisted server-side records before being treated as done.
- Cleaned up one duplicate mined capture (created by a diagnostic re-dispatch during evidence-capture debugging) through the capture rail's own real Delete-capture control rather than an API call.

## Deviations from Plan

None — plan executed exactly as written, including its own contingency language ("if any of the four cannot be populated through the UI at all, that is a finding against PROOF-02"). The concept-doc attach did require an extra genuine UI step (Settings) beyond the study view alone, and that friction is recorded honestly as F-07 rather than silently worked around — but it was still fully resolved through the UI, so PROOF-02's "populated through its own UI affordance" bar is met.

## Issues Encountered

- **gstack browse @ref targeting became unreliable against this app's intentionally-duplicated `UnitProposalCard` DOM** (rendered from 3 separate call sites simultaneously per the codebase's own design). Several `click`/`fill` calls against `@e`-numbered refs timed out or landed on the wrong duplicate instance. Resolved by switching to a small `js`/`eval` helper that locates each card by its stable label text and dispatches real DOM events directly — never substituting an API call for a UI action. Recorded as F-06 (OBSERVATION, tooling-only).
- **The seek slider needed synthetic pointer-drag events** (real-time playback at 1x speed was far too slow to reach the target positions within a reasonable session). Dispatched `pointerdown`/`mousedown`/`pointermove`/`mouseup` events at a computed `clientX` proportional to the target time — this is still driving the exact same slider element a human drag would, just via synthetic events rather than a physical mouse drag (browse's `click`/`drag` primitives don't expose sub-pixel proportional positioning for custom ARIA sliders).
- **Concept-doc attach 403'd** on the first attempt (empty `config.conceptDocs` allowlist from 04-01's setup). Resolved via a second genuine UI step (Settings). Recorded as F-07 (MINOR).

## User Setup Required

None — the harness, credentials, and concept doc were already in place from 04-01/04-03; this plan performed one settings addition (concept-doc allowlist entry) within the already-isolated proof harness, no new external configuration.

## Next Phase Readiness

- **04-05 (adversarial pass)** has a complete, evidence-backed attestation spread, all four session-content paths, and a fully rendered compiled document to audit — plus 3 fresh findings (F-06/F-07/F-08) already flagged rather than left implicit, joining F-01 through F-05 from 04-01/04-03.
- 04-05 should specifically weigh F-07 (concept-doc attach discoverability) when judging whether PROOF-02's UI self-service bar is fully met, and can cross-check the compiled document's Concept breakdown section against attestations.json's exact unit-id list recorded in RUN-MANIFEST.md for an independent queue/compile-partition audit.
- No blockers. The harness remains running for 04-05 to reuse directly (dataDir isolation re-confirmed via `GET /api/config` at the start of this plan).

## Self-Check: PASSED

All 14 created evidence files confirmed present on disk; RUN-MANIFEST.md and FINDINGS.md modifications confirmed via `git diff`; all 3 task commit hashes (`a6b7752`, `383eb88`, `1d00ede`) confirmed present in `git log --oneline`; `git diff --name-only` across all three commits confirmed zero `server/src` or `web/src` files touched; `diff` confirmed the compiled markdown is byte-identical to the on-disk export file.

---
*Phase: 04-real-lecture-proof-re-run*
*Completed: 2026-08-10*
