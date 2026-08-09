# StudyLoop

## What This Is

StudyLoop turns passive video watching into active study. A learner pastes a YouTube URL or opens a local lecture video; the app pulls the transcript, decomposes it through a domain lens into typed knowledge units with verbatim evidence anchors, and walks the learner through a generate → reveal → test → review loop where only material they have personally attested ever enters their spaced-review queue. Local-first: Fastify/TypeScript server (:4600) + Vite/React web (:4601), file-based storage (no DB), BYO LLM keys.

This is a mature brownfield codebase (all 11 build phases merged; ~1160 server+web tests + 2 Playwright e2e). GSD planning is being bootstrapped from a doc ingest (SPEC.md, docs/PRD.md, docs/PEDAGOGY.md LOCKED ADR, docs/FEATURE-REVIEW.md, docs/REAL-LECTURE-PROOF-2026-08-08.md).

## Core Value

A real lecture goes end-to-end — ingest → analysis → attestation → review → compile — with zero hallucinated claims and zero un-attested AI content in the review queue. If everything else fails, the attestation gate and evidence fidelity must hold.

## Business Context

- **Customer**: Solo learners studying long-form video (first real user: a nursing student)
- **Revenue model**: None currently — open-source engine; domain corpora stay private
- **Success metric**: A real nursing lecture (e.g. MedCram) passes the end-to-end proof — clinical + slides + document lenses produce zero hallucinated claims, youtubei.js caption-fallback works in the normal flow, and review cards derive only from attested/learner-touched material
- **Strategy notes**: docs/PRD.md (product), SPEC.md (build contract), docs/PEDAGOGY.md (binding pedagogy ADR)

## Requirements

### Validated

Shipped and proven by CI plus the 2026-08-08 real-lecture proof (CONDITIONAL PASS). Full list with IDs in .planning/REQUIREMENTS.md § Baseline:

- ✓ Local + YouTube source ingestion, slide-PDF second evidence channel, graceful binary degradation
- ✓ Study console (v6-mock contract), document mode, state-aware surfaces, ticker demotion
- ✓ Typed analysis v3 (router + lenses + spine units + edges), lens registry + autogen, clinical safety tier, terminology glossary
- ✓ Attestation flow, hidden SRS review, lapse degradation, compile + share bundles, Concept Continuity discovery
- ✓ Local-first no-DB storage, zero-setup dev, secrets redaction, CI quality gate, design contract

### Active

Current milestone: turn the CONDITIONAL PASS into a full PASS, then unlock the accuracy-gated depth tier. Full definitions in .planning/REQUIREMENTS.md:

- [ ] PIPE-01 · PIPE-02 — ingestion pipeline repair (caption-fallback MAJOR, empty-PDF signal)
- [ ] ANLZ-01 · ANLZ-02 · ANLZ-03 — analysis fidelity (overlap dedup, ungrounded enrichment, overlay discipline)
- [ ] GATE-01 · GATE-02 — close the un-attested pearl review channel per LOCKED ADR; sync SPEC.md
- [ ] COMP-01 · COMP-02 — compile honesty (Dismissed vs Not-yet-reviewed; clickable anchors)
- [ ] PROOF-01 · PROOF-02 — re-run the real-lecture proof to a full PASS with session-content paths exercised
- [ ] DPTH-01 · DPTH-02 · DPTH-03 — depth tier (library prerequisite graph, lesson composer, Threads), accuracy-gated

### Out of Scope

- Cloud sync, accounts, mobile app — file-bundle export is the sharing model this horizon (PRD §8)
- Engagement mechanics: streaks-as-motivation, XP, leaderboards, infinite feed — LOCKED ADR-PED-07/11
- Visible knowledge-graph/concept-map editor UI — LOCKED ADR-PED-11 (graph stays behind the scenes)
- Exposed SRS mechanics (decks, ease factors, scheduling UI) — LOCKED ADR-PED-11
- YouTube engagement algorithm owning any "next" surface — LOCKED ADR-PED-08/11
- Auto-complete flashcards untouched by the learner — LOCKED ADR-PED-02/11
- Mandatory friction — every generation prompt is skippable; nudge with visible blanks, never block — LOCKED ADR-PED-01/11
- Domain content (BJJ/nursing corpora) in the public repo — engine is open source, corpora are not (PRD §8)
- "Learn X" typed goal objects (V3-C P2) — gated on typed-analysis accuracy; path-vaporware risk flagged
- Note-taking-app drift — capture features without a path to test/review are rejected (PRD §8)

## Context

- **Proof outcome (2026-08-08):** CONDITIONAL PASS on MedCram "Mechanical Ventilation Explained Clearly" (i6hmGVBbIJk). Clinical analysis 9/10 (16 units / 11 pearls / 16 concepts / 3 themes, all 33 anchor quotes verbatim-verified, safety values exact, zero hallucinated clinical claims), slides 9/10, document mode + compile 9/10. The "conditional" came from flow-level gaps: setup worked only via a manual yt-dlp workaround (Bug 1 MAJOR) and image-only PDFs silently produce empty text (Bug 2).
- **Bug fix list (severity-ordered, from the proof):** Bug 1 caption fallback (blocking), Bug 3 chunk-overlap dedup, Bug 2 emptyPageCount signal, Bug 6 ungrounded enrichment, Bug 4 dismissed-vs-unreviewed in compile, Bug 5 overlay-field discipline, Bug 7 clickable timestamps (nice-to-have).
- **Fix sites (from codebase map):** `server/src/routes/youtube.ts:45-55` (short-circuit before yt-dlp fallback), `server/src/lib/slides.ts` (pdf-parse text-layer-only), `server/src/lib/analysis.ts` (label-fingerprint-only dedup; empty-string filtering only at merge; 1968 lines — extract before deep surgery), `server/src/lib/compileRenderer.ts:91-110` (partition solely by isUnitFeedable), review pipeline (F11/V3-B pearl cards).
- **Codebase health flags (see .planning/codebase/CONCERNS.md):** 2743-line Zustand store, attestation mutations optimistic without rollback, silent poll catch-alls, minimal e2e coverage (1 smoke spec). Not milestone scope, but plans touching these areas must not worsen them.
- **Slides-proof caveat:** the 2026-08-08 slides PASS was partially circular (deck text layer manufactured from the transcript); the re-run should use a genuinely independent deck where possible.
- **Demo prep:** pick a lecture whose title matches its content (the MedCram part only name-drops PEEP/FiO2/SIMV) or attach the follow-up part.

## Constraints

- **Runtime**: Local-first — Fastify 4/TypeScript/ESM server :4600, Vite/React 18 web :4601 with /api proxy; `STUDYLOOP_PORT` the only port knob (generic `PORT` ignored); HOST default 127.0.0.1, loopback-only (no auth exists); CORS localhost-only — SPEC.md Config
- **Storage**: File-based, no database anywhere; atomic write (temp + rename) + per-project mutex; every project a git-committable folder of JSON/markdown/JPEG — PRD §7, SPEC.md Data model
- **Secrets**: API keys in `~/.studyloop/config.json` only, redacted to `*ApiKeySet` over the wire; never in repo or localStorage — PRD §7
- **Security invariants**: Zod on every route; realpath-canonical path guards (never lexical-only); UUID-shaped project ids at every boundary — SPEC.md
- **Quality bar**: Every PR CI-green (typecheck + full suite); phase-specific new unit tests; no emojis; DESIGN.md interaction matrix on new interactive elements; reduced-motion honored; live verification on the real corpus with committed screenshots — SPEC.md Quality bar, REQ-quality-gate-ci
- **Design contract**: `design/DESIGN.md` binding — SVG icon system (zero emojis), oklch tokens, 5-stop surface system — REQ-design-contract
- **Dependency risk**: youtubei.js is reverse-engineered and community-maintained — the yt-dlp fallback chain is the resilience story, which is why Bug 1 is MAJOR — codebase/CONCERNS.md

## Key Decisions

<decisions>

The following are LOCKED (docs/PEDAGOGY.md, binding ADR, adjudicated 2026-07-28). They cannot be auto-overridden by any lower-precedence source; changing any of them requires explicit user action on the ADR itself.

| ID | Decision (locked) |
|----|-------------------|
| ADR-PED-01 | Prime directive: generate → reveal → test → review. Learner attempts first (skippable, never forced); AI output is collapsed feedback on the attempt, never the lesson; every test item ships with its corrective back; hidden SRS resurfaces attested material with graceful lapse degradation (text card → 10s clip → player seek). |
| ADR-PED-02 | Attestation gate: extracted concepts are proposals; only attested/learner-touched material becomes review cards. No un-attested AI content in review. Ever. |
| ADR-PED-03 | Expertise reversal: per-project "I'm new to this subject" toggle flips novices to worked-example-first; advanced learners generate first. No adaptive modeling in v1. |
| ADR-PED-04 | Decomposition: universal spine (CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY + typed edges, evidence quotes, timestamps, confidence); domain lenses are prompt modules, not engines; ONE router call per project; auto-inferred prerequisite edges always editable and confidence-marked, never locked. |
| ADR-PED-05 | Recomposition: the lesson is a path, not a document — linear prerequisite-ordered Study Path in a rail tab; NO visible node-graph editor; generation slots as inline cards at media cues; compile is co-authored with learner synthesis on top and visible blanks where generation was skipped. |
| ADR-PED-06 | Cognitive-load laws: playing = video + CC only; paused = full study surface; ticker demoted to chips/markers; CC and transcript never both fully visible. |
| ADR-PED-07 | Retention laws: cards only from attested/learner-generated material; weak bubbles LLM-transformed into cloze/why forms; lapse-to-context pipeline (×2 → 10s clip, ×3 → open-in-player); implicit interleaving default; no XP/leaderboards/volume rewards; streak is a footnote; the celebrated number is "concepts locked in". |
| ADR-PED-08 | Discovery is learning-weighted, never engagement-shaped: Concept Continuity score = 0.15·related + 0.30·conceptSearch + 0.30·teacherValidation + 0.25·gapFill (config-tunable); every recommendation displays its "why"; search gains intent toggles. |
| ADR-PED-09 | Heatmap semantics: the strip is "Attention", not importance; user and overlay layers render separately (smooth within, never across); peaks click-to-inspect; expert pins never averaged into the crowd curve. |
| ADR-PED-10 | Honest claims: active recall, spaced review, structured self-explanation — strong evidence for retention and near transfer. Never claim optimal AI learning paths, mastery from one lesson, or skill transfer from watching. |
| ADR-PED-11 | Standing anti-features: no visible graph editor; no exposed SRS mechanics/XP/leaderboards; no YouTube engagement algorithm on any "next" surface; no auto-complete flashcards untouched by the learner; no mandatory friction. |

Ingest conflict resolutions (from .planning/INGEST-CONFLICTS.md, honored as project decisions):

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LOCKED ADR > SPEC on review-card sourcing: pearl-derived review cards must be gated on attestation/learner touch; the F11/V3-B un-attested pearl channel closes and SPEC.md gets updated to match | ADR-PED-02/07 are locked; PRD §8 corroborates ("No un-attested AI content in review. Ever.") | — Pending (Phase 3) |
| SPEC > PRD on the Analyze LLM-provider surface (SPEC's Anthropic-only key gate wins by doc precedence) — with a stale-SPEC transparency note: the real proof ran on model glm-5, corroborating the PRD's multi-provider StructuredLLMCaller as shipped reality | Doc-precedence auto-resolution; no code change planned either direction — shipped multi-provider behavior is not to be ripped out on the strength of a stale SPEC line | ⚠️ Revisit — user should either update SPEC.md to the multi-provider surface or explicitly confirm Anthropic-only |
| P2 depth tier (library prerequisite graph, lesson composer, home-grid Threads) is its own accuracy-gated later phase | FEATURE-REVIEW places it in V3-D, SPEC defers to "V3-E"; both apply the identical gate (proven real-use extraction accuracy) — phase-label refinement, not a contradiction | — Pending (Phase 5 gate) |
| Dismissed units get their own compile section, distinct from "Not yet reviewed" | Proof Bug 4 exposed SPEC ambiguity; the distinction is more honest and consistent with attestation semantics | — Pending (Phase 3) |

</decisions>

## Open Questions

- SPEC.md LLM-provider section: honor-as-written (Anthropic-only gate) vs update to the shipped multi-provider StructuredLLMCaller — flagged ⚠️ above; needs Ryan's call. No roadmap phase depends on the answer.
- Re-run lecture choice: same MedCram part (known baseline, title-content mismatch) vs a title-matching lecture (cleaner demo, new baseline). Phase 4 planning should decide.

---
*Last updated: 2026-08-09 after doc-ingest project initialization*
