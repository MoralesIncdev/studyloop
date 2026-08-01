# StudyLoop — External Review Prompt

*Hand this document to any LLM you want a fresh perspective from. It describes the app at a high level on purpose — the reviewer is invited to think freely, not to audit line-by-line. Repo: github.com/MoralesIncdev/studyloop (local checkout: `~/studyloop`).*

---

## The prompt

You are reviewing **StudyLoop**, a local-first, general-purpose learning environment built around one job: **extracting the core concepts from video sources and turning them into knowledge the learner actually owns.** Read this brief, then respond with your honest assessment and creative direction. You are not being asked to validate what exists — you are being asked what you would do with it.

### Why the app exists

Enormous amounts of real teaching now live in long-form video — courses, lectures, instructionals, recorded seminars — and video is the worst-indexed, least-reviewable medium we learn from. Watching is passive; almost nothing survives to the next session, and nothing is searchable, testable, or connectable afterward. StudyLoop's core bet is that a video player can be a **study instrument**: the unit of progress is not "minutes watched" but concepts extracted, claimed, and retained.

**This is a general learning app, not a niche tool.** The builder is currently studying Brazilian Jiu-Jitsu with it (hundreds of hours of instructionals — a physical-skill domain), and is about to point it at **nursing school coursework** (a declarative, clinical, exam-driven domain). Those two corpora are deliberately opposite in character: one is motor patterns, positions, and feel; the other is terminology, mechanisms, dosages, protocols, and high-stakes recall under test conditions. Any design that only works for one of them is wrong. Treat "does this survive the jump between domains?" as a standing question throughout your review.

### The learning model (binding pedagogy)

- **Extraction first**: AI analysis reads the transcript and footage and *proposes* the concept structure of a video — key ideas, procedures, distinctions, drills/applications, notable moments. This proposal layer is the heart of the app.
- **Generate-first**: the learner attempts before the answer is revealed. Self-test answers are sealed (literally blurred) until an attempt is made.
- **Attestation**: nothing counts as known until the learner **attests** a proposed concept — restates it in their own words. The AI is a proposer, never an oracle; the learner's restatement is the record.
- **Anchored knowledge**: every note, concept, and capture is anchored to a timestamp. Knowledge stays connected to the moment it was taught and is exportable as portable bundles.
- **Compounding across sources**: the same concept appearing in multiple videos (or lectures across a semester) merges into one identity; the app surfaces "echoes" ("you attested this same idea in Lecture 3 at 41:12") and continuation threads between sources.
- **Universal spine, domain lenses**: the core loop (extract → attempt → attest → review → connect) is domain-agnostic; domains supply lenses — what a "concept" looks like, what a "drill" means, what mastery evidence is. A BJJ drill and an NCLEX-style question are the same slot wearing different lenses.
- **Attention, not importance**: the timeline heatmap shows where *this learner* actually spent time, not what an algorithm thinks matters.
- **Hard anti-goals**: no streaks, no XP, no guilt mechanics, no engagement optimization. Real counts only ("2/6 attested, 3 notes"). Enforced in code, non-negotiable.

### What the app is today (v1 console, shipped)

- **The console**: opening a video lands you in a full-viewport cinematic stage — video edge-to-edge, no app chrome. Study tools live as floating panes *over* the footage: concept card, quick note, self-test, drill/application card, cross-source echo, knowledge-map constellation, suggested cue. Panes are draggable, resizable, bare (glowing text over footage) or glass, and can be "parked" onto their timestamp on the timeline, where they wait as a pulsing tick until summoned.
- **A minimal timeline** carrying the knowledge state: hairline rail, tick vocabulary (jade = attested, amber = proposed, white = mined captures), concept-scoped looping (click a tick, that span loops), wheel-zoom for multi-hour videos, condensed playback (skip stretches with no concepts).
- **Three modalities**: Watch (baseline), Generate (footage dims, self-test takes center stage), Review (decay-colored heatmap, drill cards, chapter rail).
- **Edge cabinets**: concepts list, capture history, and session controls (a "scaffold" slider that literally blurs AI text as the learner internalizes, a modality switch) slide in from screen edges.
- **The exhale**: when a video ends, a quiet summary — what you attested, what's still pending, where the thread continues next.
- **Engine**: React/TS + Fastify, file-based (no DB), local video files + YouTube, multi-provider LLM analysis (Anthropic/OpenAI/Google/Kimi/GLM/DeepSeek), transcript-synced everything, spaced-repetition review mode, shareable `.studyloop.json` bundles.

### The current reality

One serious user (the builder), one live domain (BJJ), one committed next domain (nursing school), open-source, no user base, no telemetry, no revenue model. A prior advisory review concluded retention (active recall + spaced repetition) is the strongest-evidence feature family, and flagged terminology accuracy in ASR transcripts as a kill-shot risk for search in technical domains — a risk that gets sharper with medical vocabulary.

### What we want from you

Respond however you think is most useful, but cover at least:

1. **Your read**: what is this app *actually* for, in your own words? Where is the thesis strong, and where is it self-deception?
2. **The domain jump**: what breaks first when the corpus shifts from a physical skill to nursing coursework? Think concretely — lecture slides on screen vs. bodies on a mat, exam alignment, clinical procedures, drug names ASR will mangle, hundreds of short concepts per lecture instead of a few deep ones per instructional. What must the "domain lens" abstraction actually contain for the jump to work?
3. **The failure mode**: where does the loop most likely break for a real learner over 90 days of daily use? What gets abandoned first?
4. **Creative direction** — the part we care most about. Propose 3–5 concrete moves. They can be features, deletions, restructurings, new surfaces (mobile, audio, exam-prep, lecture-capture ingestion), new interaction models, product/positioning shifts, or "stop building X entirely." Radical proposals are welcome; do not limit yourself to polishing what exists. For each: what it is, why it matters, and what the smallest real first slice would be.
5. **One question** you would force the builder to answer before writing any more code.

Do not pad. Disagreement with the current design is more valuable than praise of it.

---

*End of prompt. Reviewer responses can be dropped in `design/` as `critique-<model>-console-v1.md` for adjudication.*

---

## Reviewer contribution — Codex

### Overall assessment

StudyLoop's engineering is substantially stronger than its product validation. The repository has a broad automated test suite, clean type-checking, and a successful production build. The central risk is not careless implementation; it is that the product thesis and this review brief overstate what the current system has demonstrated.

StudyLoop is currently best understood as a human-in-the-loop knowledge extraction and review layer for timestamped media. It is not yet a validated general-purpose learning environment. Development should temporarily favor corpus evaluation, reliability, and longitudinal user testing over additional console panes.

### Primary implementation gaps

#### 1. The analysis pipeline is transcript-only, not multimodal

The brief says AI analysis reads the transcript and footage. The current analysis route requires a transcript and sends transcript chunks into the extraction pipeline; it does not use video frames, slide OCR, diagrams, or other visual evidence.

This is a critical limitation in both target domains. BJJ instruction often depends on grips, posture, spatial relationships, and movement that are not verbalized. Nursing lectures frequently place drug names, tables, ranges, diagrams, and exam cues on slides without reading them aloud.

The smallest useful addition is selective visual ingestion: detect slide or scene changes, sample those frames, run OCR or vision extraction, and attach the resulting evidence to the same timestamp model. Continuous frame processing is unnecessary.

#### 2. The domain-lens abstraction is too coarse for nursing

The implemented domain choices are biology, history, music, physical skill, and generic. Nursing cannot be treated as biology with different wording. It combines mechanisms, medications, procedures, dosages, routes, timing, adverse effects, contraindications, laboratory thresholds, clinical prioritization, policy-dependent protocols, and exam reasoning.

A domain lens should define more than a prompt module. It needs:

1. A knowledge-unit schema.
2. Evidence and provenance requirements.
3. Question-generation strategies.
4. Acceptable mastery evidence.
5. Safety and uncertainty rules.
6. Density and prioritization rules.
7. Source-authority and versioning requirements.

Medication doses, thresholds, contraindications, and procedures should never become clean-looking facts without visible source evidence and learner confirmation.

#### 3. Several binding claims do not match current behavior

- **Attestation:** the brief says attestation requires the learner to restate a concept. The interface permits Skip, novice mode reveals the answer immediately, and a concept can become attested and reviewable without a learner-authored restatement.
- **Attention:** the heatmap is built from bubbles and AI-generated pearls, not dwell time, pauses, replaying, attempts, or other measures of where the learner actually spent time. It is a mark-density visualization, not an attention measurement.
- **No streaks:** the brief calls streaks a hard anti-goal, while the review state still stores and surfaces a streak summary.
- **Knowledge map:** the constellation uses a decorative layout and connects chronological neighbors. Those lines can appear semantic without representing the extracted prerequisite or procedural edges.

These discrepancies should be resolved in the product or rewritten in the brief. Pedagogical claims must describe actual behavior.

#### 4. The terminology-correction layer is missing

Technical ASR accuracy is correctly identified as a kill-shot risk, but the implementation does not yet provide a complete response. StudyLoop needs:

- Domain vocabulary injection before transcription.
- ASR confidence display.
- A correct-once, propagate-everywhere terminology workflow.
- A per-course terminology and abbreviation dictionary.
- Comparison between captions, slide OCR, and user corrections.
- Versioned downstream invalidation when transcript text changes.

Correcting a drug name or technical term should invalidate or re-evaluate affected concepts, questions, searches, and merge candidates. Cross-source identity based on string fingerprints and token similarity is a conservative starting point, but it will not reliably handle synonyms, abbreviations, or ASR distortions.

#### 5. Long-running analysis is not sufficiently durable

Transcript chunks are analyzed sequentially and accumulated in memory until the final merge. Job state is also process-local. An application restart loses progress, and a late merge failure can waste successful chunk work and API cost.

Analysis should have an on-disk run manifest containing:

- Transcript and visual-input hashes.
- Prompt, schema, and domain-lens versions.
- Provider and model identifiers.
- Completed chunk outputs.
- Failed chunks and retry counts.
- Token and estimated cost records.
- Cancellation and resume state.
- Final merge version.

Every successful chunk should be checkpointed immediately so analysis can resume rather than restart.

#### 6. The test suite validates code more than learning quality

The automated suite is a genuine strength, but it primarily validates pure functions, schemas, storage behavior, and deterministic fake-provider flows. The project still lacks a real-corpus LLM evaluation harness, browser-level end-to-end coverage, accessibility checks, visual regression coverage, and performance testing on multi-hour sources.

Create a small gold corpus containing at least three representative BJJ videos and three representative nursing lectures, with corrected transcripts and human-reviewed annotations. Measure:

- Terminology error rate.
- Concept precision and recall.
- Timestamp error.
- Unsupported-claim rate.
- Duplicate and merge error.
- Generated-question quality.
- Learner edit and dismissal rate.
- Time required to clear proposed concepts.
- Seven- and thirty-day retrieval performance.

Without this benchmark, model and prompt changes cannot be compared reliably.

### Most likely 90-day failure

The learner will probably abandon attestation before abandoning playback. A dense nursing lecture may generate dozens or hundreds of proposed units. Floating panes, generation prompts, corrections, merge decisions, review cards, and notes can turn knowledge ownership into an expanding clerical backlog. Once the learner stops clearing that backlog, the integrity of review and cross-source connections deteriorates.

Separate the experience into two loops:

- **Watch:** quiet playback, minimal capture, and no constant concept interruption.
- **Triage:** after a chapter or session, review a bounded set of proposals, correct important terms, combine duplicates, attempt high-value items, and attest selectively.

The system should prioritize and cap proposals rather than asking the learner to process everything it extracts.

### Recommended execution order

1. Freeze additional console-surface expansion temporarily.
2. Build the BJJ and nursing gold-corpus evaluation harness.
3. Add transcript correction, visual/slide extraction, and downstream invalidation.
4. Define and implement a real nursing lens with clinical safety constraints.
5. Make analysis checkpointed, resumable, cancellable, and reproducible.
6. Add a bounded post-video triage workflow.
7. Add browser E2E, accessibility, visual-regression, and long-video performance tests.
8. Run a longitudinal pilot with several learners using an opt-in, locally exportable research log rather than engagement-oriented telemetry.

### Documentation recommendation

This prompt should separate product statements into three explicit categories:

- **Implemented and verified**
- **Implemented but unvalidated**
- **Binding future direction**

Those categories are currently blended, which encourages reviewers to critique the vision while missing consequential implementation gaps.

### Question to answer before more feature development

> What measurable evidence, after 30 days, would demonstrate that StudyLoop improves retained knowledge enough to justify the learner's added extraction, correction, and attestation workload?
