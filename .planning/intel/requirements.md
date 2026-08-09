# Requirements (from PRDs)

> Synthesized by gsd-doc-synthesizer, 2026-08-09 (re-run after cycle resolution). One PRD
> in set: docs/PRD.md (StudyLoop — Product Requirements Document, status "Living document",
> 2026-08-01). PRD §4 principles cite docs/PEDAGOGY.md as their origin; the locked ADR is
> now synthesized (see decisions.md) and the PRD principle text below was verified
> consistent with it — no competing variants.

## REQ-generate-before-reveal
- source: docs/PRD.md (§4.1)
- description: Learner is invited to produce their own answer before any AI answer renders. AI output is feedback on an attempt, never the lesson. Blank-first, always skippable — friction invited, never forced.
- acceptance: (absent in source — principle enforced in code, feature review rejects violations)
- scope: study loop, analysis reveal, test panes

## REQ-attestation-gates-review
- source: docs/PRD.md (§4.2, §8)
- description: AI-extracted concepts are proposals. Only material the learner has attested (verified, corrected, completed, or answered) becomes a review card. Hard invariant restated in non-goals: "No un-attested AI content in review. Ever."
- acceptance: Unattested units never appear in the review queue; attested cards feed SRS and compile concept sections.
- scope: attestation, review queue, hallucination containment

## REQ-test-with-feedback
- source: docs/PRD.md (§4.3)
- description: Every self-test item ships with its back: answer + one-sentence "why" + a source-clip link. Retrieval without corrective feedback reinforces errors.
- acceptance: (absent in source)
- scope: review cards, test items

## REQ-lapse-degradation
- source: docs/PRD.md (§4.4, §9)
- description: A lapsed review falls back toward the source: text card → 10-second clip → full player seek.
- acceptance: Review lapses degrade to clip/seek rather than being skipped (§9 retention proxy).
- scope: review system, lapse handling

## REQ-signal-integrity
- source: docs/PRD.md (§4.5)
- description: No streak mechanics as motivation (footnote only). Heatmap labeled "attention/capture density", never "importance". Restated vs. claimed knowledge split, not conflated.
- acceptance: (absent in source)
- scope: retention mechanics, heatmap, metrics honesty

## REQ-expertise-reversal
- source: docs/PRD.md (§4.6)
- description: Per-project "I'm new to this subject" toggle flips novices to worked-example-first; advanced learners generate first.
- acceptance: (absent in source)
- scope: novice mode, generation slots

## REQ-source-ingestion-local
- source: docs/PRD.md (§6.1)
- description: Local video library scan (folders in config), transcript matching (studyloop JSON, whisper JSON, .srt/.vtt), concept-document profiles.
- acceptance: (absent in source)
- scope: source ingestion, local library

## REQ-source-ingestion-youtube
- source: docs/PRD.md (§6.1, §9)
- description: YouTube paste-a-URL start with metadata + captions via youtubei.js / yt-dlp; captions become the transcript.
- acceptance: Time-to-loop metric — YouTube URL → first attested card without touching Settings (§9).
- scope: source ingestion, YouTube

## REQ-slide-pdfs
- source: docs/PRD.md (§6.1)
- description: Slide PDFs as a second evidence channel, with `transcript | slides | both` provenance on every unit.
- acceptance: (absent in source; §9 real-corpus proof exercises it)
- scope: slides, evidence provenance

## REQ-graceful-binary-degradation
- source: docs/PRD.md (§6.1)
- description: Optional binaries degrade gracefully: no ffmpeg → screenshot controls disable with an explanatory tooltip; nothing fails silently.
- acceptance: (absent in source)
- scope: ffmpeg, yt-dlp, degradation

## REQ-study-console
- source: docs/PRD.md (§6.2)
- description: Study page IS the console (v6-mock contract): full-bleed 100dvh stage, chrome ghosts in on hover, hairline seek rail with unified tick vocabulary (concept/amber/provisional/mined); draggable/resizable glass panes with per-project persisted layout and edit mode; mode keys O/E/M/X/C/L, arrow concept ticks, scroll-to-zoom timeline; Concepts/Captures/Session cabinets; sealed TestPane (blur-to-reveal only through attestation flow).
- acceptance: (absent in source)
- scope: study console UI

## REQ-analysis-lens-routing
- source: docs/PRD.md (§5.4, §6.3)
- description: One action decomposes the source into typed knowledge units (CLAIM · MECHANISM · PROCEDURE · EXAMPLE · BOUNDARY, with evidence quotes, timestamps, confidence) through a domain lens — a JSON prompt module, not a separate engine. One router call classifies domain → lens selection (editable, visible).
- acceptance: (absent in source)
- scope: analysis engine, domain lenses

## REQ-lens-registry-autogen
- source: docs/PRD.md (§6.3, §9)
- description: Lens registry: `server/lenses/*.json` + user lenses in `<dataDir>/lenses/` (user wins). Lens autogen for unknown subjects is create-only, one attempt per run, structurally barred from touching safety tiers, and falls back to generic without failing the analysis.
- acceptance: Lens autogen never fails an analysis run (§9 engine health).
- scope: lens registry, autogen

## REQ-clinical-safety-tier
- source: docs/PRD.md (§5.5, §6.3)
- description: Clinical lens ships a code-level safety tier: DOSAGE / CONTRAINDICATION / LAB_VALUE / PRIORITIZATION never auto-merge and render verbatim quotes outside the reveal gate. Clinical-lens safety items are never auto-merged in attestation and always show verbatim quotes.
- acceptance: (absent in source; exercised by the nursing-lecture acceptance test §9)
- scope: clinical lens, safety

## REQ-terminology-glossary
- source: docs/PRD.md (§6.3)
- description: Terminology layer: read-time term rewrite with a per-project glossary (PATCH `/api/projects/:id/terms`), because ASR errors on domain terms are a kill-shot for search and cards.
- acceptance: (absent in source)
- scope: terminology, ASR correction

## REQ-multi-provider-llm
- source: docs/PRD.md (§6.3, §9)
- description: Multi-provider LLM support behind one `StructuredLLMCaller` surface (Anthropic native structured output; OpenAI / Google / xAI / DeepSeek / Kimi / GLM via JSON mode + schema-in-prompt; zod validation always the gate). Reasoning models get a 32k token ceiling and streaming. Stub source renders dev-only.
- acceptance: Analysis succeeds across ≥2 LLM providers (§9 engine health).
- scope: LLM providers, analysis engine
- NOTE: contradicts SPEC.md's Anthropic-only `anthropicApiKey` Analyze gate; auto-resolved SPEC > PRD per precedence — see [INFO] entry in .planning/INGEST-CONFLICTS.md before treating either as final.

## REQ-hidden-srs-review
- source: docs/PRD.md (§5.6, §6.4)
- description: Hidden SRS over attested cards; cluster attestation (attest once → member cards); review front-door redirect; Anki CSV export for learners who live elsewhere.
- acceptance: Attested cards survive first review (loop-completion metric, §9).
- scope: review, spaced repetition, export

## REQ-document-mode
- source: docs/PRD.md (§6.4)
- description: Document mode: transcript-ordered read-and-claim surface with video picture-in-picture and anchor-seek; per-project Console/Document toggle (clinical defaults to document, everything else to console).
- acceptance: (absent in source; exercised by the nursing-lecture acceptance test §9)
- scope: document mode

## REQ-concept-continuity-discovery
- source: docs/PRD.md (§6.5)
- description: Weighted Concept Continuity: "watch next" ranked by concept overlap with what the learner has attested — explicitly replacing YouTube's engagement-driven up-next.
- acceptance: (absent in source)
- scope: discovery

## REQ-compile-share
- source: docs/PRD.md (§5.7)
- description: One button compiles notes + captures + covered concepts into a markdown study document; shareable `.studyloop.json` bundles carry overlays between machines.
- acceptance: (absent in source)
- scope: compile, sharing

## REQ-local-first-no-db
- source: docs/PRD.md (§7)
- description: Local-first, file-based, no DB. Every project is a folder of JSON / markdown / JPEG the user can read and `git commit`. No account, no cloud dependency for the core loop; the only network calls are YouTube resolution and the user's chosen LLM provider.
- acceptance: (absent in source)
- scope: architecture, data ownership

## REQ-zero-setup-dev
- source: docs/PRD.md (§7)
- description: `npm install && npm run dev` is all it takes. Fastify server :4600, Vite web :4601; `npm start` serves built app on one port. `STUDYLOOP_PORT` is the only env knob; `STUDYLOOP_CONFIG_DIR` (absolute) for tests.
- acceptance: (absent in source)
- scope: developer experience, deployment

## REQ-secrets-redaction
- source: docs/PRD.md (§7)
- description: API keys live in `~/.studyloop/config.json`, redacted to `*ApiKeySet` over the wire; no keys in the repo (verified by full-history scrub before publishing).
- acceptance: (absent in source)
- scope: secrets

## REQ-quality-gate-ci
- source: docs/PRD.md (§7)
- description: Every PR lands CI-green — currently 827 server / 331 web / 2 Playwright e2e tests — and console features are live-verified against the real corpus before merge.
- acceptance: CI green + live corpus verification per PR.
- scope: quality gate

## REQ-design-contract
- source: docs/PRD.md (§7)
- description: `design/DESIGN.md` is binding — SVG icon system (zero emojis), oklch token palette, 5-stop surface system.
- acceptance: (absent in source)
- scope: design system

## REQ-non-goals
- source: docs/PRD.md (§8)
- description: No engagement mechanics (no streaks-as-motivation, gamified importance signals, infinite feed). No cloud sync / accounts / mobile app in the current horizon; sharing is file-bundle export. Not a note-taking app — capture features without a path to test/review are rejected. Domain content (BJJ/nursing corpora) stays out of the public repo; the engine is open source.
- acceptance: (absent in source — negative requirements)
- scope: non-goals, open-source boundary
