# Synthesis Summary — StudyLoop doc ingest (2026-08-09, mode: new)

> Entry point for gsd-roadmapper. Produced by gsd-doc-synthesizer from 5 classifications
> in .planning/intel/classifications/.

## Doc counts by type

- ADR: 1 — docs/PEDAGOGY.md (locked, high confidence) — WITHHELD (cycle blocker)
- SPEC: 2 — SPEC.md (high confidence, synthesized); docs/FEATURE-REVIEW.md (medium confidence) — WITHHELD (cycle blocker)
- PRD: 1 — docs/PRD.md (high confidence, synthesized)
- DOC: 1 — docs/REAL-LECTURE-PROOF-2026-08-08.md (medium confidence, synthesized)
- UNKNOWN: 0

Synthesized: 3 of 5. Withheld: 2 (the cyclic set {docs/PEDAGOGY.md, docs/FEATURE-REVIEW.md}).

## Cycle detection

Directed cross-ref graph over the ingest set has one cycle:
docs/PEDAGOGY.md -> docs/FEATURE-REVIEW.md -> docs/PEDAGOGY.md.
Both docs excluded from synthesis per rule; recorded as the sole BLOCKER.
SPEC.md, docs/PRD.md, docs/REAL-LECTURE-PROOF-2026-08-08.md are acyclic (refs into the
cycle are one-directional) and were synthesized. Max depth well under the 50 cap.

## Decisions locked

- 0 extracted. The only locked ADR (docs/PEDAGOGY.md) is withheld by the cycle blocker.
  See decisions.md for the placeholder entry.

## Requirements extracted

- 26 requirements from docs/PRD.md:
  REQ-generate-before-reveal, REQ-attestation-gates-review, REQ-test-with-feedback,
  REQ-lapse-degradation, REQ-signal-integrity, REQ-expertise-reversal,
  REQ-source-ingestion-local, REQ-source-ingestion-youtube, REQ-slide-pdfs,
  REQ-graceful-binary-degradation, REQ-study-console, REQ-analysis-lens-routing,
  REQ-lens-registry-autogen, REQ-clinical-safety-tier, REQ-terminology-glossary,
  REQ-multi-provider-llm, REQ-hidden-srs-review, REQ-document-mode,
  REQ-concept-continuity-discovery, REQ-compile-share, REQ-local-first-no-db,
  REQ-zero-setup-dev, REQ-secrets-redaction, REQ-quality-gate-ci, REQ-design-contract,
  REQ-non-goals

## Constraints extracted

- 17 constraints from SPEC.md. Type breakdown: api-contract 3, schema 7, nfr 4, protocol 5
  (repo layout, config contract, port policy, project data model, v1 API surface, security
  invariants, concept-doc profiles, frontend behavior contracts, out-of-box, V2 UI, V2
  innertube layer, analysis v2, share bundle, F11 review/SRS, V3-A, V3-B, V3-C, V3-D,
  quality bar — see constraints.md; some entries span two categories, counted once each).

## Context topics

- 4 topics from docs/REAL-LECTURE-PROOF-2026-08-08.md: milestone proof outcome (CONDITIONAL
  PASS), 7 bugs (1 MAJOR: youtube.ts caption-fallback short-circuit), fidelity findings,
  pre-student-release fix list.

## Conflicts

- 1 blocker, 0 competing-variants, 1 auto-resolved (+3 informational notes; INFO total 4).
- BLOCKER: cross-ref cycle PEDAGOGY.md <-> FEATURE-REVIEW.md (withholds the locked ADR
  and the v3 roadmap SPEC from intel).
- Auto-resolved: SPEC > PRD on the Analyze LLM-provider surface (SPEC's Anthropic-only
  key gate wins by precedence; DOC evidence corroborates the PRD side — flagged for
  possible user override).
- Detail: .planning/INGEST-CONFLICTS.md

## Files

- .planning/intel/decisions.md (empty — placeholder, cycle blocker)
- .planning/intel/requirements.md
- .planning/intel/constraints.md
- .planning/intel/context.md
- .planning/INGEST-CONFLICTS.md

## Status

BLOCKED — 1 blocker must be resolved (resolve the PEDAGOGY <-> FEATURE-REVIEW cross-ref
cycle via --manifest, then re-run ingest) before routing to gsd-roadmapper. The withheld
docs contain the binding pedagogy laws and the v3 build-phase roadmap; roadmapping without
them would plan against an incomplete contract.
