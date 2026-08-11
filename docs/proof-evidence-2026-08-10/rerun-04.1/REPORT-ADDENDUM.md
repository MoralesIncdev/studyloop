# Report Addendum — Phase 04.1 Anchor-Fidelity Repair Re-Run (2026-08-10)

This addendum extends `docs/REAL-LECTURE-PROOF-2026-08-10.md` by pointer, not by edit. The dated report's own verdict table, fidelity scores, and conclusions are untouched — this document supersedes select findings the way an addendum should: both readings stay available, and a reader can compare before/after side by side.

## Re-run conditions

- **Harness:** the same isolated proof harness (ports 4620/4621, `STUDYLOOP_CONFIG_DIR=~/.studyloop-proof-2026-08-10`, `dataDir=~/StudyLoopProof-2026-08-10`), restarted clean by 04.1-05 after the phase's fixes (04.1-01 through 04.1-04) landed, confirmed running code at or after the phase's last pre-rerun commit (`912d4b5`).
- **Lecture:** the same MedCram lecture ("Mechanical Ventilation Explained Clearly ... 2 of 5", `K0maLgTzIto`), re-ingested through the real UI (paste-then-submit, 2 actions, no workaround) into a fresh project `0213f617-f887-4c33-8349-8dfdaf2213c8`. The 2026-08-10 baseline project (`41b2d9ea-a4b1-428a-b09a-7065ed3dee1f`) and its `captions.json`/`analysis.json` are untouched throughout — confirmed byte-unchanged (git diff / mtime checks) at every subsequent 04.1 plan.
- **Deck:** the same CDC/NHSN Chapter 10 VAE Protocol PDF re-attached (44 pages, 0 empty, matches the baseline's deck).
- **Provider/model:** zai / `glm-5` (provider default), same as the baseline run.

## Transcript outcome (F-09)

| | Baseline (`41b2d9ea-...`) | Re-run (`0213f617-...`) |
|---|---|---|
| Segments | 612 | 316 |
| Adjacent duplicate texts | present (rolling reset/grow pattern) | 0 |

Transcript-pane screenshot: `docs/proof-evidence-2026-08-10/screenshots/rerun-01-transcript-clean.png` — no visible stutter or repeated phrase.

## Analysis outcome

| | Baseline | Re-run |
|---|---|---|
| Units | 18 | 24 |
| Pearls | 8 | 11 |
| Edges | 8 | 9 |
| Unit anchors (verifier-checked) | 66 | 39 |
| Source | model | model |

Anchor-correction telemetry captured live from the harness log during the re-run's own analysis: `[analysis] anchor-correction: units=1 safetyTier=0 pearls=0 unresolved=0` (`docs/proof-evidence-2026-08-10/RUN-MANIFEST.md`, "Phase 04.1 re-run" section; full context in `04.1-05-SUMMARY.md`).

## Verifier verdict (D-03's oracle, 04.1-06)

Committed, unmodified `server/src/scripts/verifyAnchors.ts`, default 15s tolerance, no `--tolerance` flag, zero edits to `anchorVerify.ts`/`verifyAnchors.ts`/`anchorVerify.test.ts`:

| | Baseline | Re-run |
|---|---|---|
| Checked | 82 | 59 |
| Exact | 50 | 57 |
| Normalized | 0 | 2 |
| **Violations** | **32** | **0** |

Full detail: `docs/proof-evidence-2026-08-10/rerun-04.1/violation-classification.md`, `anchor-verification-report.{md,json}`.

## Safety-value re-audit (04.1-06)

Both DOSAGE units this run produced carry exact numeric values **and** correctly-positioned anchors (baseline: exact values, but 40s and 160s drift respectively — the baseline's worst single-anchor case). A 13/24-unit (54%) stratified sample of non-safety units, all 11 pearls, and all 9 edges found zero hallucinated, distorted, or clinically-wrong claims. Full detail: `docs/proof-evidence-2026-08-10/rerun-04.1/safety-value-audit.md`.

## What this re-run displaces, and what it does not — per dated-report mode

### Setup — DISPLACED

The dated report's Setup verdict (CONDITIONAL, 7/10) rested specifically on F-09's caption duplication being visible in the transcript pane. This re-run addresses that directly with observed evidence: a fresh ingest of the identical lecture through the fixed pipeline produces 316 segments (vs 612), 0 adjacent duplicate texts, and a screenshot showing a clean, stutter-free pane. The specific cause of Setup's CONDITIONAL no longer applies to a fresh ingest of this lecture.

### Clinical analysis — DISPLACED

The dated report's Clinical verdict (CONDITIONAL, 6/10) rested on F-10's anchor drift (32/82 violations, up to 282s drift, both DOSAGE units affected). The re-run's fresh model completion, judged by the same unmodified verifier at the same tolerance, produced 0/59 violations, and the independent safety audit found both DOSAGE units now correctly anchored where the baseline's were not. The anchor-drift cause of Clinical's CONDITIONAL does not reproduce in this fresh completion.

### Slides — NOT DISPLACED

The dated report's Slides verdict (CONDITIONAL, 8/10) rested on 0/18 units carrying `evidence: "both"` (F-05) — a labelling question about whether the model tags a unit as slide-influenced, not an anchor-accuracy or hallucination question. This phase touched neither the evidence-tagging prompt language nor any dedup semantics related to it — D-01's fix scope was F-09/F-10/F-11 only. Whatever this run's own units' `evidence` field distribution turned out to be is not evidence this phase produced or verified for that purpose. Stated plainly, per the plan's own instruction not to let a general pipeline improvement imply a specific one it did not touch: **Slides' verdict in the dated report stands, unaddressed by this phase.**

### Document mode + compile — PARTIALLY DISPLACED, not independently re-verified this phase

The dated report's Document-mode verdict (CONDITIONAL, 7/10) rested on the compiled document's clickable anchor links inheriting F-10's wrong anchors (6 of 8 attested units, 37s-160s off) — a downstream consequence of Clinical's own defect, not a separate compile-logic bug. Since F-10 is now displaced for anchors generated by the fixed pipeline, a compiled document built from a freshly-generated analysis would inherit correct anchors instead of drifted ones. But this phase performed no fresh attestation/compile cycle on the re-run project — 04.1-05/06/07 did not attest the 24-unit re-run analysis or compile a new study document from it. The improvement is established at the anchor-accuracy layer only (verifier + safety audit against the raw `analysis.json`), not independently re-walked through a fresh compile/export. The original dated report's own compiled document — built from the baseline's drifted analysis — is, and remains, exactly as it was; this addendum does not and cannot retroactively correct a document already rendered from the baseline's own drifted anchors.

## Baseline evidence integrity

The 2026-08-10 baseline project's `captions.json`/`analysis.json` and the dated report's own verdict table were never edited by this phase — confirmed via `git diff --quiet` at 04.1-05's and 04.1-06's own verify gates, and via this plan's own append-only diff check on the dated report (`docs/REAL-LECTURE-PROOF-2026-08-10.md`).

## Pointer

- Full dated report this addendum extends: `docs/REAL-LECTURE-PROOF-2026-08-10.md`
- FINDINGS.md resolution entries this addendum summarizes: `docs/proof-evidence-2026-08-10/FINDINGS.md` F-09, F-10, F-11
- PROOF-01's final recorded state, clause by clause: `.planning/REQUIREMENTS.md`
