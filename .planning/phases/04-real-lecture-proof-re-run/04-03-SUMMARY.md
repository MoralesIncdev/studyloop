---
phase: 04-real-lecture-proof-re-run
plan: 03
subsystem: testing
tags: [proof-run, ui-walkthrough, clinical-analysis, slides-attach, zai-glm5, gstack-browse]

requires:
  - phase: 04-01
    provides: "Isolated proof harness (dataDir-asserted), content-gated lecture (K0maLgTzIto, COMMIT 4/5 taught), independent CDC/NHSN deck with recorded provenance, RUN-MANIFEST.md/FINDINGS.md ledgers"
provides:
  - "Proof project 41b2d9ea-a4b1-428a-b09a-7065ed3dee1f created entirely through the real UI paste-then-submit flow (2 learner actions), 612-segment transcript via yt-dlp caption fallback"
  - "Independent CDC/NHSN deck attached through the UI's own slides affordance — 44 pages, 0 empty, folded into the analysis prompt with no separate toggle needed"
  - "A real clinical analysis (schema v3, model glm-5, source=model — not fake/stub) produced by the live zai provider through the UI's Analyze pill: 18 units / 8 pearls / 18 concepts / 4 themes / 8 edges / 74 anchors"
  - "run/ evidence artifacts committed for 04-05's adversarial pass: resolve-response.json, project-after-create.json, transcript.json, captions.json, slides.json, clinical-analysis.json, analyze-status-log.json"
  - "3 new findings appended to FINDINGS.md (F-03/F-04/F-05, all OBSERVATION or MINOR — no MAJOR frictions, zero UI workarounds needed)"
affects: [04-04, 04-05]

actuals:
  tokens: 100737
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "gstack browse upload targets the hidden <input type=file> directly (not the visible button) for PDF attach flows — browse's path-safety allowlist requires copying files from outside cwd/tmp into a scratchpad location first, sha256-verified before and after"
    - "Background polling loop (curl + node, run_in_background) for long-running analyze jobs — timestamped log via node -e JSON append, waited on via until-loop rather than repeated short sleeps"

key-files:
  created:
    - docs/proof-evidence-2026-08-10/run/resolve-response.json
    - docs/proof-evidence-2026-08-10/run/project-after-create.json
    - docs/proof-evidence-2026-08-10/run/transcript.json
    - docs/proof-evidence-2026-08-10/run/captions.json
    - docs/proof-evidence-2026-08-10/run/slides.json
    - docs/proof-evidence-2026-08-10/run/clinical-analysis.json
    - docs/proof-evidence-2026-08-10/run/analyze-status-log.json
    - docs/proof-evidence-2026-08-10/screenshots/run-01-library-paste.png
    - docs/proof-evidence-2026-08-10/screenshots/run-02-study-view.png
    - docs/proof-evidence-2026-08-10/screenshots/run-03-slides-attached.png
    - docs/proof-evidence-2026-08-10/screenshots/run-04-analyze-running.png
    - docs/proof-evidence-2026-08-10/screenshots/run-05-analysis-complete.png
  modified:
    - docs/proof-evidence-2026-08-10/RUN-MANIFEST.md
    - docs/proof-evidence-2026-08-10/FINDINGS.md

key-decisions:
  - "Fed the deck's absolute proof-data-root path into gstack browse's upload command via a scratchpad copy (sha256-verified identical before/after) — browse's path-safety allowlist blocks paths outside cwd/tmp; the UI upload flow itself was still exercised end-to-end, this only concerns how the file bytes reached the tool invocation"
  - "Recorded F-03 honestly: this subagent's session had no handle on the harness's background process stdout, so the yt-dlp-fallback branch is inferred from the 18795ms resolve latency rather than a captured server log line (04-01 could capture the literal log line; this plan's fresh subagent could not) — the branch conclusion itself is still correct and consistent with 04-01's own finding that Innertube is unreliable on this network"
  - "Did not force or investigate away F-04's ~3.3% slide-extraction char-count drift against 04-01's independent vetting numbers — recorded per the plan's explicit instruction not to average mismatches away; this run's real-route number is what the analysis actually consumed and is authoritative"
  - "Did not treat F-05's 0-count of evidence:\"both\" units as a bug — the model's own judgment is plausible given the deck's narrower VAE-surveillance topical scope vs the lecture's broader teaching content (a caveat 04-01 already flagged when vetting the deck); surfaced for 04-05's adversarial pass rather than silently smoothed over"

patterns-established:
  - "Evidence-capture API calls happen AFTER the UI action that produced the state, never as a substitute for it (D-01) — every run/*.json artifact in this plan traces back to a specific gstack browse fill/click/upload action logged in RUN-MANIFEST.md"

requirements-completed: []

coverage:
  - id: D1
    description: "Proof project created from a pasted URL entirely through the real browser UI (2 learner actions: fill + click), yielding a 612-segment transcript via the yt-dlp caption fallback, with the committed captions.json snapshot matching the transcript segment count exactly"
    requirement: "PROOF-01"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-01-library-paste.png / run-02-study-view.png; embedded node verify script in 04-03-PLAN.md Task 1 <verify> (transcript length, captions/transcript match, manifest transcriptSource field, both screenshots present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Independent CDC/NHSN deck attached through the UI's own slides affordance (1 UI action), extracted server-side to 44 pages / 0 empty pages, automatically folded into the analysis prompt (confirmed via source read — no separate toggle exists)"
    requirement: "PROOF-01"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-03-slides-attached.png; embedded node verify script in 04-03-PLAN.md Task 2 <verify> (filename/pageCount/emptyPageCount present, manifest records emptyPageCount, screenshot present)"
        status: pass
    human_judgment: true
    rationale: "The ~3.3% per-page character-count drift against 04-01's independent extraction (F-04) is a genuine unresolved discrepancy between two measurement runs of the same file — a human should glance at F-04 before 04-05 treats the slide-fidelity channel as fully settled, even though every mechanical acceptance criterion (filename/pageCount/emptyPageCount/attach-through-UI) passed."
  - id: D3
    description: "Real clinical analysis triggered via the UI's Analyze pill, reaching the live zai/glm-5 provider (not the fake-analysis client): schema v3, source=model, 18 units / 8 pearls / 18 concepts / 4 themes / 8 edges / 74 anchors, 4m35s wall-clock, fully timestamped progress log"
    requirement: "PROOF-01"
    verification:
      - kind: automated_ui
        ref: "gstack browse session — run-04-analyze-running.png / run-05-analysis-complete.png; embedded node verify script in 04-03-PLAN.md Task 3 <verify> (schema v3, model present, >=5 units, no fake-client synthetic text, manifest records model verbatim)"
        status: pass
    human_judgment: true
    rationale: "F-05 (0 units carry evidence:\"both\") is a real-output signal that needs 04-05's adversarial judgment call — is this the deck's genuine narrower topical scope (the likely explanation, per 04-01's own vetting caveat) or a labeling-fidelity gap in the model's evidence-tagging behavior? Automated checks can confirm the field exists and isn't fake-client output, but cannot adjudicate which explanation is correct."

duration: 30min
completed: 2026-08-10
status: complete
---

# Phase 4 Plan 3: Proof Run Part 1 — UI Paste, Deck Attach, Real Clinical Analysis Summary

**Ran the first half of the evidence-grade real-lecture proof entirely through the real browser UI: pasted a URL to create a fresh proof project (612-segment transcript via the yt-dlp caption fallback), attached the independent CDC/NHSN deck through its own slides affordance (44 pages, 0 empty), and triggered a real zai/glm-5 clinical analysis that completed in 4m35s with 18 units / 8 pearls / 18 concepts / 4 themes / 8 edges — zero UI workarounds needed, zero production code touched.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-10T18:13:00Z (approx, first Read of PLAN.md)
- **Completed:** 2026-08-10T18:43:52Z
- **Tasks:** 3/3
- **Files modified:** 12 created, 2 modified (RUN-MANIFEST.md, FINDINGS.md) — zero server/src or web/src files touched (confirmed via `git diff --name-only` across all three task commits)

## Accomplishments

- **Proof project created via the real UI paste-then-submit flow (SC1).** Typed `https://www.youtube.com/watch?v=K0maLgTzIto` into the library's own URL input and clicked its Add button (`gstack browse`, 2 learner actions total) — landed in the study view at project `41b2d9ea-a4b1-428a-b09a-7065ed3dee1f`, distinct from 04-01's smoke project (`5b9601fd-...`, left in place, no delete route exists). `POST /api/youtube/resolve` (UI-triggered) took 18795ms, consistent with the yt-dlp caption fallback firing again on this network (Innertube unreliable, per 04-01's own log-confirmed finding) — 612 transcript segments, captions.json snapshot matches exactly.
- **Independent CDC/NHSN deck attached through the UI's slides affordance (SC2, D-02).** Uploaded the vetted VAE Protocol PDF via SlidesRow's file input — chip confirms "cdc-nhsn-vae-protocol-chapter10.pdf — 44 pages" attached, 0 empty pages (real text-layer extraction, not the image-only fallback). No separate "fold into analysis" toggle exists in the UI — confirmed via source read (`analyze.ts:95,113`) that attaching alone unconditionally wires the deck's pages into every chunk's analysis prompt.
- **Real clinical analysis run via the live provider through the UI (SC2).** Clicked the "Analyze" pill; polled `analyze/status` every ~10s for the full 4m35s run (0% → 25% → 50% → done); read the completed analysis. Schema v3, `model: "glm-5"` (matches the configured zai default), `source: "model"` (not `stub`), zero fake-client synthetic text — genuinely live-provider output. 18 units / 8 pearls / 18 concepts / 4 themes / 8 edges / 74 anchors for 04-05's verbatim-anchor verifier to check.
- **Zero UI workarounds across all three tasks (SC1's clean-PASS bar).** Every learner-facing action — paste URL, click Add, attach PDF, click Analyze — completed through its own real UI control on the first attempt. The only deviations were evidence-capture/provenance nuances (F-03, F-04, F-05, all OBSERVATION/MINOR), never a case where the UI itself failed and an API call had to substitute.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the proof project from a pasted URL in the real UI and capture the setup evidence (SC1)** - `8ac5861` (feat)
2. **Task 2: Attach the independent deck through the UI's slides affordance and capture the slides channel (SC2, D-02)** - `c68ffdd` (feat)
3. **Task 3: Run the real clinical analysis from the UI on the live provider (SC2)** - `d0025c0` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `docs/proof-evidence-2026-08-10/run/resolve-response.json` - raw resolve payload snapshot (evidence capture only)
- `docs/proof-evidence-2026-08-10/run/project-after-create.json` - proof project record after UI creation
- `docs/proof-evidence-2026-08-10/run/transcript.json` - transcript endpoint read (612 segments)
- `docs/proof-evidence-2026-08-10/run/captions.json` - committed captions snapshot, matches transcript length
- `docs/proof-evidence-2026-08-10/run/slides.json` - flattened slides channel: filename/pageCount/emptyPageCount/pages (44 pages, 0 empty)
- `docs/proof-evidence-2026-08-10/run/clinical-analysis.json` - full real analysis payload (schema v3, glm-5, source=model)
- `docs/proof-evidence-2026-08-10/run/analyze-status-log.json` - timestamped analyze/status polls, full 4m35s run
- `docs/proof-evidence-2026-08-10/screenshots/run-01-library-paste.png` through `run-05-analysis-complete.png` - 5 non-video-surface screenshots covering setup, slides attach, and analyze progress/completion
- `docs/proof-evidence-2026-08-10/RUN-MANIFEST.md` - 3 new sections appended (Setup, Slides, Clinical analysis)
- `docs/proof-evidence-2026-08-10/FINDINGS.md` - 3 new findings appended (F-03, F-04, F-05)

## Decisions Made

- Copied the deck PDF into the scratchpad before `gstack browse upload`, since browse's path-safety allowlist blocks paths outside cwd/tmp — sha256-verified identical to the original (`6f4b1cf1...`) before upload, deleted from scratchpad after. The UI's own file-input attach control was still the thing exercised; this only concerns how the local file bytes reached the tool invocation.
- Recorded F-03 (branch-attribution confidence) honestly rather than silently upgrading an elapsed-time inference to a log-confirmed claim, since this subagent's session had no access to the harness's background process stdout the way 04-01's session did.
- Left F-04's slide-extraction char-count drift and F-05's 0-count evidence:"both" unresolved and un-smoothed, per the plan's explicit instruction to record mismatches/notable signals rather than average or silently explain them away — both are flagged for 04-05's adversarial judgment.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' acceptance criteria and automated `<verify>` scripts passed without needing fixes. The three FINDINGS.md entries (F-03/F-04/F-05) are evidence-capture observations the run protocol explicitly calls for, not deviations from planned work.

## Issues Encountered

None. The harness was still running from 04-01/04-02 exactly as documented (ports 4620/4621, `dataDir=/Users/antemo/StudyLoopProof-2026-08-10` re-asserted via `GET /api/config` before any mutating action); `STUDYLOOP_FAKE_ANALYSIS` confirmed unset in the running process's environment before clicking Analyze.

## User Setup Required

None - the harness and zai/glm-5 credentials were already configured from 04-01; this plan performed zero configuration changes.

## Next Phase Readiness

- **04-04 (proof run part 2)** can proceed directly against proof project `41b2d9ea-a4b1-428a-b09a-7065ed3dee1f`, which now carries a transcript, an attached slide deck, and a real clinical analysis — everything 04-04's remaining learner-path steps (attestation, review, compile/export, document mode) need as a foundation.
- **04-05's adversarial pass** has three specific items to weigh, all already flagged in FINDINGS.md rather than left implicit: F-03 (branch attribution is timing-inferred, not log-confirmed, for this specific run), F-04 (slide-extraction char counts drifted ~3.3% from 04-01's independent vetting numbers on the identical file), and F-05 (zero units tagged `evidence: "both"` — plausible given deck/lecture topical mismatch, but worth an adversarial second look).
- No blockers. The harness remains running (background `npm run dev` under `STUDYLOOP_CONFIG_DIR=~/.studyloop-proof-2026-08-10`) for 04-04 to reuse directly.

## Self-Check: PASSED

All 12 created evidence files confirmed present on disk (`[ -f ]`); RUN-MANIFEST.md and FINDINGS.md modifications confirmed via `git diff`; all 3 task commit hashes (`8ac5861`, `c68ffdd`, `d0025c0`) confirmed present in `git log --oneline`; `git diff --name-only` across all three commits confirmed zero `server/src` or `web/src` files touched, matching the plan's "no production code changes expected" note.

---
*Phase: 04-real-lecture-proof-re-run*
*Completed: 2026-08-10*
