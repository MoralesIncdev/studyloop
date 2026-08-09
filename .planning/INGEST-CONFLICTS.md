# Ingest Conflict Report — StudyLoop (2026-08-09, mode: new, re-run after cycle resolution)

## Conflict Detection Report

### BLOCKERS (0)

(none — the prior run's sole BLOCKER, the docs/PEDAGOGY.md <-> docs/FEATURE-REVIEW.md
cross-ref cycle, was resolved by pruning the FEATURE-REVIEW back-reference in its
classification via manifest; see its `cycle_resolution` field. Graph is now acyclic;
all 5 docs synthesized.)

### WARNINGS (0)

(none — single PRD in set, no competing acceptance variants; single LOCKED ADR, no
LOCKED-vs-LOCKED contradiction; mode is new, no existing-context checks apply)

### INFO (7)

[INFO] Cycle resolved: PEDAGOGY <-> FEATURE-REVIEW cross-ref pruned via manifest
  Note: docs/FEATURE-REVIEW.md's classification carries `cycle_resolution` (2026-08-09) pruning its back-ref to docs/PEDAGOGY.md; the mutual reference is acknowledged with PEDAGOGY (LOCKED ADR) as upstream. The previously withheld pair is now fully synthesized: 11 locked decisions in intel/decisions.md (ADR-PED-01..11) and 7 FEATURE-REVIEW constraint entries (v3 roadmap + per-feature verdicts) in intel/constraints.md.

[INFO] Auto-resolved: LOCKED ADR > SPEC on review-card sourcing (F11 pearl cards)
  Note: SPEC.md F11 derives review cards from analysis pearls ("Pearl card... Only from source: 'model' analyses") and V3-B B4 retains the channel ("Pearl cards become question-form fronts"); docs/PEDAGOGY.md (LOCKED) §1 mandates "Only attested/learner-touched material becomes review cards" and §5 "Cards derive only from attested/learner-generated material" — corroborated by docs/PRD.md §8 "No un-attested AI content in review. Ever." Precedence: LOCKED ADR wins over non-locked SPEC. Resolution recorded in intel/constraints.md (F11 + V3-B NOTEs): pearl-derived review cards must be gated on attestation/learner touch; both texts preserved. SPEC.md should be updated to close the un-attested pearl channel.

[INFO] Auto-resolved: SPEC > PRD on the LLM-provider surface for Analyze
  Note: SPEC.md (V2 Analysis engine + Config) gates Analyze on `anthropicApiKey` only, Anthropic via @anthropic-ai/sdk, default model claude-opus-5; docs/PRD.md §6.3 requires multi-provider support (Anthropic/OpenAI/Google/xAI/DeepSeek/Kimi/GLM) behind one StructuredLLMCaller with `*ApiKeySet` redaction. Precedence SPEC > PRD resolves in SPEC's favor; both texts preserved (constraints.md / requirements.md REQ-multi-provider-llm) with cross-notes. Transparency: docs/REAL-LECTURE-PROOF-2026-08-08.md shows the real analysis ran on model glm-5, corroborating the PRD side — the SPEC appears stale here; user may wish to override the auto-resolution by updating SPEC.md.

[INFO] Pass-4 sweep complete (SPEC/PRD vs LOCKED ADR) — one contradiction, rest consistent
  Note: with docs/PEDAGOGY.md now in scope, the deferred SPEC-contradicts-locked-ADR check was run for SPEC.md, docs/FEATURE-REVIEW.md, and docs/PRD.md. Findings: (1) the F11/V3-B pearl-card channel is the only live contradiction (auto-resolved above); (2) SPEC.md's v1/v2 sections describe pre-pedagogy behavior (ungated concept reveal, engagement-shaped Up-next) that SPEC's own V3-A/B/C sections supersede — phased remediation, not a live contract conflict; (3) docs/FEATURE-REVIEW.md is adjudicated against PEDAGOGY.md by construction and matches it section-for-section (weights 0.15/0.30/0.30/0.25, anti-features, lapse pipeline, attention semantics); (4) docs/PRD.md §4 principles restate the ADR faithfully — no contradiction.

[INFO] Phase-label divergence: FEATURE-REVIEW V3-D P2 tier vs SPEC.md "V3-E"
  Note: docs/FEATURE-REVIEW.md places the P2 depth tier (library-level prerequisite graph, multi-video lesson composer, home-grid Threads) inside phase V3-D; SPEC.md (V3-D, 2026-07-29) defers that same tier to "V3-E pending real-use extraction accuracy." Both sources apply the identical gate (proven extraction accuracy) — treated as an equal-precedence refinement, not a contradiction; both texts preserved in constraints.md. Roadmapper should treat the P2 tier as a separate, accuracy-gated phase.

[INFO] DOC evidence: SPEC's youtubei.js-degradation contract not met by implementation
  Note: SPEC.md (V2 out-of-box) requires "youtubei.js failures degrade: resolve falls back to yt-dlp path"; docs/REAL-LECTURE-PROOF-2026-08-08.md Bug 1 (MAJOR) shows the fallback never runs when Innertube returns metadata-but-no-captions (routes/youtube.ts:45-55), producing transcript-less projects in the normal flow. This is implementation-vs-spec evidence, not a doc-vs-doc contract conflict; captured in context.md.

[INFO] DOC flags SPEC ambiguity: dismissed vs not-yet-reviewed in compile
  Note: docs/REAL-LECTURE-PROOF-2026-08-08.md Bug 4 observes SPEC.md V3-B ("Unattested render in compile under 'Not yet reviewed' as titles only") is ambiguous about dismissed units, which currently file under "Not yet reviewed" alongside untouched units. A dismissed-vs-unreviewed distinction is suggested; no contract contradiction, ambiguity only.
