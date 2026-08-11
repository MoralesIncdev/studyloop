# Violation Classification — 04.1-06 Verifier Re-Run

**Verdict: CLEAN — 0 violations under the committed verifier's default tolerance (D-03's zero-violation case; no classification step was needed because nothing was flagged).**

## Invocation

```
npx tsx src/scripts/verifyAnchors.ts "$HOME/StudyLoopProof-2026-08-10/projects/0213f617-f887-4c33-8349-8dfdaf2213c8" --out /Users/antemo/studyloop/docs/proof-evidence-2026-08-10/rerun-04.1
```

Run from `server/`, via the project's already-installed `tsx`. No `--tolerance` flag was passed — the CLI used its committed default (`DEFAULT_TOLERANCE_SEC = 15` in `anchorVerify.ts:45`), identical to the baseline run's tolerance. Neither `anchorVerify.ts`, `verifyAnchors.ts`, nor the fresh `analysis.json` was edited before or after the run.

**Exit code: 0** (the CLI's own gate: `process.exitCode = report.violations.length > 0 ? 1 : 0` — `verifyAnchors.ts:156`).

## Totals — rerun beside baseline

| | Baseline (`41b2d9ea-...`, 2026-08-10 13:41 analysis) | Rerun (`0213f617-...`, 2026-08-10 17:16 analysis, this plan) |
|---|---|---|
| Tolerance | 15s | 15s (unchanged — no flag passed) |
| Unit anchors checked | 66 | 39 |
| Edge quotes checked | 8 | 9 |
| Pearl timestamps checked | 8 | 11 |
| **Total checked** | **82** | **59** |
| Exact | 50 | 57 |
| Normalized (whitespace/case) | 0 | 2 |
| **Violations** | **32** | **0** |

The rerun's unit/edge/pearl counts differ from the baseline's because it is a genuinely fresh, independent model completion (24 units/11 pearls/9 edges vs the baseline's 18 units/8 pearls/8 edges, per 04.1-05-SUMMARY.md's telemetry) with 39 unit anchors rather than 66 — not a re-scoring of the same analysis.

## Classification of remaining violations

**None exist.** The verifier's `violations` array is empty (`docs/proof-evidence-2026-08-10/rerun-04.1/anchor-verification-report.json`, `"violations": []`). There is nothing to classify, and no F-09-external or any other excuse category was invoked or needed — the report is clean under D-03's first (and stronger) definition: zero violations, not a report whose violations were explained away.

Two anchors landed in the "normalized" (whitespace/case-insensitive substring) bucket rather than "exact" — both are still non-violations under the verifier's own classification (`results.normalized` is a pass bucket, not a violation reason; see `anchorVerify.ts:71-76`, `287-289`). They are noted here for completeness, not because D-03 requires classifying them:

- These are anchors whose quote matched the caption stream only after whitespace/case normalization (e.g. a stray double space or a capitalization difference between the model's quoted text and the caption's literal text) — a cosmetic non-substring mismatch, not a wrong-position or fabricated-content defect. The verifier's own design (see `anchorVerify.ts:101-131`, `buildCaptionIndex`'s parallel normalized index) treats this exactly as an accepted match, consistent with the baseline run's own `results.normalized` field existing as a defined non-violation outcome.

## Baseline evidence integrity

Confirmed via the plan's automated `<verify>` block (also re-run manually above): `git diff --quiet -- docs/proof-evidence-2026-08-10/anchor-verification-report.md docs/proof-evidence-2026-08-10/anchor-verification-report.json` exits 0 — **the baseline report pair is byte-unchanged.** The rerun's report pair was written into the new `rerun-04.1/` subdirectory only, per the hard constraint.

## What this means for D-03 / PROOF-01

The fixes committed across 04.1-01 through 04.1-04 (F-09 rolling-caption dedup, F-10 anchor-correction pass covering every drift shape, F-11's documented-limitation disposition) — exercised end-to-end for real in 04.1-05 (live UI re-ingest + live zai/glm-5 analysis, not an offline replay) — produced an analysis whose anchors pass the same unmodified, unretuned verifier that found 32/82 (39%) violations against the original 2026-08-10 baseline run. This is the strongest form of D-03's clean-report definition (0 violations), not the weaker "every violation mechanically classified" fallback. The verdict here is on the fresh model completion's own anchors, not a re-scoring of the original one.

This document does not by itself close PROOF-01 — 04.1-06 Task 2's independent safety-value re-audit and 04.1-07's report still govern that call, per the phase's plan sequencing.
