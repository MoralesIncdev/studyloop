# Decisions (from ADRs)

> Synthesized by gsd-doc-synthesizer, 2026-08-09 (re-run after cycle resolution — the
> PEDAGOGY <-> FEATURE-REVIEW cross-ref cycle was pruned via manifest; PEDAGOGY is upstream).
> One ADR in set: docs/PEDAGOGY.md ("StudyLoop Pedagogy Framework", binding, adjudicated
> 2026-07-28 from five council sessions + patched seats). `locked: true` — these decisions
> cannot be auto-overridden by any lower-precedence source.

## ADR-PED-01: Prime directive — generate → reveal → test → review
- source: docs/PEDAGOGY.md (§1)
- status: locked (Accepted)
- decision: The central interaction rule for every concept: (1) Generate — learner is invited to produce their own answer first (blank-first, always skippable; friction invited, never forced). (2) Reveal — the AI summary/model answer is collapsed behind a reveal action and renders as feedback on the learner's attempt, not as the lesson. (3) Test — every pearl/concept can become a self-test item WITH corrective feedback (answer + one-sentence "why" + source-clip link); never ship a card without the back. (4) Review — hidden SRS resurfaces attested material; lapses degrade gracefully back to the source (text card → 10s clip → full player seek).
- scope: study loop, analysis reveal, review cards, all features

## ADR-PED-02: Attestation gate — only attested material enters review
- source: docs/PEDAGOGY.md (§1, Attestation)
- status: locked (Accepted)
- decision: Extracted concepts are proposals until the learner attests them (verify, correct, complete, or answer a slot). Only attested/learner-touched material becomes review cards. This preserves the generation effect, builds provenance (the "user-attested graph" is the moat), and keeps hallucinations out of the review queue.
- scope: attestation, review queue, provenance, hallucination containment

## ADR-PED-03: Expertise-reversal rule
- source: docs/PEDAGOGY.md (§1)
- status: locked (Accepted)
- decision: Novices get a concise worked example first, then reconstruct it; advanced learners generate first with the summary as feedback. v1 implementation: per-project "I'm new to this subject" toggle flips the default order; no adaptive modeling yet.
- scope: novice mode, generation ordering

## ADR-PED-04: Decomposition — universal spine + domain lenses (one router call)
- source: docs/PEDAGOGY.md (§2)
- status: locked (Accepted)
- decision: Typed knowledge units CLAIM · MECHANISM · PROCEDURE · EXAMPLE · BOUNDARY with edges REQUIRES · PART_OF · EXAMPLE_OF · PROCEDURE_STEP · CAUSES · CONTRADICTS · SAME_AS; every node/edge carries evidence quotes, timestamps, and confidence. Domain lenses are prompt modules + optional overlay fields, NOT separate engines (biology/mechanism, history/claim+causes+sourcing, music/schema, physical-skill/procedure, generic fallback). ONE cheap router call per project classifies the domain into an editable, visible-but-subtle, user-confirmable tag; extraction stays one call per chunk with the domain module swapped in. "Defer domains entirely" is rejected (cost lands on the user's own key in a local-first app); its attestation core is adopted wholesale. Evidence-grade honesty: domain schemas are STRONG for biology mechanisms and historical-thinking heuristics, WEAK for music-from-transcript and video→motor-skill transfer (flagged limitations). Auto-inferred prerequisite edges are always editable and confidence-marked (dashed = low confidence), never locked.
- scope: analysis engine, knowledge decomposition, domain lenses, router, prerequisite edges

## ADR-PED-05: Recomposition — the lesson is a path, not a document
- source: docs/PEDAGOGY.md (§3)
- status: locked (Accepted)
- decision: Study Path = a linear, prerequisite-ordered walk of the video's concepts in a rail tab (topological sort over REQUIRES/PROCEDURE_STEP edges, temporal fallback). NO visible node-graph/concept-map editor — the graph stays behind the scenes. Each non-trivial step carries one generation slot (predict/explain/compare/boundary-test; lenses add domain slot types) presented as chunk-level inline cards at their media cue, never a wall-of-text doc. The compile artifact is co-authored: learner synthesis paragraph on top ("Explain in your own words"), then notes/captures, then attested concepts with slot answers, then AI material clearly labeled as reference; intentional blanks render where generation was skipped — visible unfinishedness is the nudge. Contribution model: answers attach to nodes; learners can promote notes to nodes and edit concept bodies (user layer over immutable extraction); synthesis + rationales travel with shared bundles (the "why this person organized it this way" is the apprenticeship payload).
- scope: study path, generation slots, compile, sharing/contribution

## ADR-PED-06: Cognitive-load laws (study loop)
- source: docs/PEDAGOGY.md (§4)
- status: locked (Accepted)
- decision: State-aware surfaces — playing = video + CC only (transcript/notes fade); paused = full study surface (the pause is the study moment). Ticker demotion — concept cards never slide over the video during playback; concepts signal as chips/markers at the progress bar and light the rail; full card on demand. Signaling over decoration — marker color/shape may encode unit type with at most a one-line legend; test before keeping. Two redundant text streams (CC + transcript) never show simultaneously.
- scope: player surface, concept ticker, CC/transcript

## ADR-PED-07: Retention laws
- source: docs/PEDAGOGY.md (§5)
- status: locked (Accepted)
- decision: Cards derive only from attested/learner-generated material; weak bubbles are LLM-transformed into cloze/why-questions (user note = hint, quote = cloze source) — never shipped as vague "what was your note?" when a better form exists. Lapse-to-context pipeline: fail ×2 in-session → inline 10s clip; fail ×3 → "Open in player" seeds the exact timestamp and pauses the queue. Implicit interleaving across projects/subjects stays default (zero UI). Gamification boundary: no XP, no leaderboards, no volume rewards; streak demoted from headline to footnote; the celebrated number is "concepts locked in" (cards graduated past the 30-day interval).
- scope: review cards, lapses, interleaving, gamification boundary

## ADR-PED-08: Discovery — learning-weighted, never engagement-shaped
- source: docs/PEDAGOGY.md (§6)
- status: locked (Accepted)
- decision: YouTube's related list is one cheap signal, not the ranking. Concept Continuity score = w_r·related + w_c·conceptSearch + w_t·teacherValidation + w_g·gapFill (related = low-weight baseline; conceptSearch = Innertube ranking for the video's extracted next-concepts; teacherValidation = channel recurring across ≥k independent concept-query results, per-channel cached; gapFill = covers "don't get it yet"/missing prerequisites, strongest once the graph exists). Weights start hand-tuned 0.15/0.30/0.30/0.25, tunable in config; every recommendation displays its "why". Search gains intent toggles (Overview / Deep dive / Troubleshooting). Post-compile screen offers "What's next" from the same scorer.
- scope: discovery, up-next, search, post-compile

## ADR-PED-09: Heatmap semantics — attention, not importance
- source: docs/PEDAGOGY.md (§7)
- status: locked (Accepted)
- decision: Aggregated marks measure attention (peaks may be confusion, not value; crowd washes out experts). Rename the strip "Attention"; render user layer and overlay layer separately (smooth within, never across); peaks are click-to-inspect (popover lists composing marks with author and text). Expert (followed-handle) pins are never averaged into the crowd curve.
- scope: heatmap, overlays, signal honesty

## ADR-PED-10: Honest claims — ship these words, not more
- source: docs/PEDAGOGY.md (§8)
- status: locked (Accepted)
- decision: Claim only: StudyLoop turns passive watching into active recall, spaced review, and structured self-explanation — practices with strong evidence for retention and near transfer; AI output is a starting point attested by the learner before entering their review queue; for performance domains it supports observation, decomposition, and mental rehearsal — real transfer requires physical practice and coaching. Never claim: optimal AI learning paths, mastery from one lesson, or skill transfer from watching.
- scope: product claims, marketing copy, onboarding language

## ADR-PED-11: Standing anti-features
- source: docs/PEDAGOGY.md (§9)
- status: locked (Accepted)
- decision: (1) No visible knowledge-graph/concept-map editor UI. (2) No exposed SRS mechanics, decks, ease factors, XP, leaderboards. (3) No YouTube engagement algorithm owning any "next" surface. (4) No auto-complete flashcards untouched by the learner. (5) No mandatory friction — every generation prompt is skippable; the app nudges with visible blanks, never blocks.
- scope: anti-features, all surfaces
