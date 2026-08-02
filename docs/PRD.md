# StudyLoop — Product Requirements Document

**Status:** Living document · **Owner:** Ryan Morales · **Last updated:** 2026-08-01
**Repo:** github.com/MoralesIncdev/studyloop (MIT, public)
**Binding companions:** `docs/PEDAGOGY.md` (learning-science contract), `docs/FEATURE-REVIEW.md` (per-feature verdicts), `design/DESIGN.md` (visual contract), `design/EXECUTION-PLAN-post-review-v1.md` (current execution wave)

---

## 1. One-liner

StudyLoop is a local-first study engine for long-form video and documents. It turns
passive watching into an evidence-based learning loop — **generate → reveal → test →
review** — where the learner produces answers before the app shows its own, attests
every AI-extracted concept before it can be reviewed, and keeps everything in plain
files they own.

## 2. Problem

Long-form educational video (instructionals, lectures, tutorials) is the richest
learning medium and the worst-instrumented one:

- **Watching feels like learning but isn't.** Passive consumption produces
  familiarity, not retention. Existing players optimize for watch time, not recall.
- **Capture tools stop at capture.** Notes apps and clip tools accumulate material
  that is never tested or resurfaced. The council verdict that governs this product:
  *retention over capture* — active recall and spaced repetition are the
  strongest-evidence features; capture alone is a dead end.
- **AI summaries make it worse by default.** Handing the learner a summary removes
  the generation effect (producing an answer yourself is what builds memory). AI
  extraction also hallucinates; unverified extractions must never enter a review queue.
- **Cloud study tools own your data.** Serious learners with large corpora (a
  multi-volume instructional set, a semester of lectures) need files they can read,
  back up, and version — not an account.

## 3. Who it's for

| User | Corpus | What they need |
|---|---|---|
| **Primary (proven):** self-directed skill learner | BJJ instructional volumes (local files, timecoded transcripts, 1,000+ lesson JSONs) | Drill loops, concept-anchored review, mat-side recall |
| **Second lens (built, unproven):** nursing / clinical student | Recorded lectures + slide PDFs | Clinical safety framing (dosages, contraindications, lab values), NCLEX-style dispatch, document-first study |
| **General:** anyone studying long-form video | YouTube URLs or local video, with or without transcripts | Zero-setup start; the same loop works domain-agnostically via lenses |

Single-operator, single-machine today. Open-source strategy per council: **open the
engine, not the BJJ app** — the product is domain-agnostic; domain content stays local.

## 4. Product principles (binding — from PEDAGOGY.md)

These are enforced in code, not just intent. A feature that violates one is rejected
in review regardless of polish.

1. **Generate before reveal.** The learner is invited to produce their own answer
   before any AI answer renders. AI output is *feedback on an attempt*, never the
   lesson. Blank-first, always skippable — friction invited, never forced.
2. **Attestation gates review.** AI-extracted concepts are *proposals*. Only material
   the learner has attested (verified, corrected, completed, or answered) becomes a
   review card. This preserves the generation effect and keeps hallucinations out of
   the review queue. The user-attested knowledge graph is the moat.
3. **No test without feedback.** Every self-test item ships with its back: answer +
   one-sentence "why" + a source-clip link. Retrieval without corrective feedback
   reinforces errors.
4. **Graceful lapse degradation.** A lapsed review falls back toward the source:
   text card → 10-second clip → full player seek.
5. **Integrity of signals.** No streak mechanics as motivation (footnote only). The
   heatmap is labeled *attention/capture density*, never "importance." Restated vs.
   claimed knowledge are split, not conflated.
6. **Expertise reversal.** A per-project "I'm new to this subject" toggle flips
   novices to worked-example-first; advanced learners generate first.

## 5. The core loop (user journey)

1. **Add source** — paste a YouTube URL (zero config) or point Settings at library
   folders of local video, optional transcript folders, optional concept documents,
   optional slide PDFs.
2. **Study in the console** — full-bleed video stage with a synced transcript, glass
   panes that float over footage (concept, drill, note, test, map panes), edge
   cabinets (Concepts / Captures / Session), keyboard-first controls, tick-anchored
   concept loops for drilling, condensed playback that skips concept-free stretches.
3. **Capture as you go** — time-anchored notes with auto-captured frames, one-key
   mining, a persistent per-project notebook, suggested cues from existing lesson data.
4. **Analyze** — one action decomposes the source into typed knowledge units
   (CLAIM · MECHANISM · PROCEDURE · EXAMPLE · BOUNDARY, with evidence quotes,
   timestamps, confidence) through a **domain lens** — a JSON prompt module, not a
   separate engine (physical-skill, clinical, history, …; auto-generated for unknown
   subjects).
5. **Attest** — review each proposed unit (or cluster of 2–12 related units) on a
   prenote surface: confirm, fix, or answer a slot. Clinical-lens safety items are
   never auto-merged and always show verbatim quotes.
6. **Review** — the SRS (spaced-repetition system) resurfaces attested cards on the
   review front-door; Anki CSV export exists for learners who live elsewhere.
7. **Compile / share** — one button compiles notes + captures + covered concepts into
   a markdown study document; shareable `.studyloop.json` bundles carry overlays
   between machines.

## 6. Functional requirements

### 6.1 Source ingestion
- Local video library scan (folders in config), transcript matching (studyloop JSON,
  whisper JSON, .srt/.vtt), concept-document profiles.
- YouTube: paste-a-URL start with metadata + captions via youtubei.js / yt-dlp;
  captions become the transcript.
- Slide PDFs as a second evidence channel (`transcript | slides | both` provenance
  on every unit).
- Optional binaries degrade gracefully: no ffmpeg → screenshot controls disable with
  an explanatory tooltip; nothing fails silently.

### 6.2 Study console (the v6-mock contract — study page IS the console)
- Full-bleed 100dvh stage; chrome ghosts in on hover; hairline seek rail with a
  unified tick vocabulary (concept / amber / provisional / mined).
- Panes: bare-or-glass, draggable, resizable with magnetism, per-project persisted
  layout, edit mode (E) with grid + snap, drag-to-park a concept to its seek-bar tick.
- Modes & keys: O overlay, E edit, M zero-dialog mine, X condensed playback,
  C captions, L A-B loop cycle, ←/→ concept ticks, scroll-to-zoom timeline.
- Cabinets: Concepts (live-highlight), Captures, Session (Watch/Generate/Review
  switch, scaffold-blur and pressure sliders).
- Sealed TestPane: blur-to-reveal only through the attestation flow.

### 6.3 Analysis engine
- One router call classifies domain → lens selection (editable, visible).
- Lens registry: `server/lenses/*.json` + user lenses in `<dataDir>/lenses/` (user
  wins). Lens autogen for unknown subjects is create-only, one attempt per run,
  structurally barred from touching safety tiers, and falls back to generic without
  failing the analysis.
- Clinical lens ships with a code-level safety tier: DOSAGE / CONTRAINDICATION /
  LAB_VALUE / PRIORITIZATION never auto-merge and render verbatim quotes outside the
  reveal gate.
- Terminology layer: read-time term rewrite with a per-project glossary
  (PATCH `/api/projects/:id/terms`), because ASR (speech-to-text) errors on domain
  terms are a kill-shot for search and cards.
- Multi-provider LLM support behind one `StructuredLLMCaller` surface
  (Anthropic native structured output; OpenAI / Google / xAI / DeepSeek / Kimi / GLM
  via JSON mode + schema-in-prompt; zod validation is always the gate). Reasoning
  models get a 32k token ceiling and streaming. Stub source renders dev-only.

### 6.4 Review & retention
- Hidden SRS over attested cards; cluster attestation (attest once → member cards).
- Review front-door redirect; Anki CSV export.
- Document mode: transcript-ordered read-and-claim surface with video
  picture-in-picture and anchor-seek; per-project Console/Document toggle
  (clinical defaults to document, everything else to console).

### 6.5 Discovery
- Weighted Concept Continuity: "watch next" ranked by concept overlap with what the
  learner has attested — explicitly replacing YouTube's engagement-driven up-next.

## 7. Non-functional requirements

- **Local-first, file-based, no DB.** Every project is a folder of JSON / markdown /
  JPEG the user can read and `git commit`. No account, no cloud dependency for the
  core loop; the only network calls are YouTube resolution and the user's chosen
  LLM provider.
- **`npm install && npm run dev` is all it takes.** Fastify server :4600, Vite web
  :4601; `npm start` serves the built app on one port. `STUDYLOOP_PORT` is the only
  env knob; `STUDYLOOP_CONFIG_DIR` (absolute) for tests.
- **Secrets:** API keys live in `~/.studyloop/config.json`, redacted to `*ApiKeySet`
  over the wire; no keys in the repo (verified by full-history scrub before
  publishing).
- **Quality gate:** every PR lands CI-green — currently 827 server / 331 web / 2
  Playwright e2e tests — and console features are live-verified against the real
  corpus before merge.
- **Design contract:** `design/DESIGN.md` is binding — SVG icon system (zero emojis),
  oklch token palette, 5-stop surface system.

## 8. Non-goals

- **No engagement mechanics.** No streaks-as-motivation, no gamified importance
  signals, no infinite feed.
- **No cloud sync / accounts / mobile app** in the current horizon. Sharing is
  file-bundle export.
- **No un-attested AI content in review.** Ever. This is a hard invariant, not a
  roadmap item.
- **Not a note-taking app.** Capture exists to feed the retention loop; features that
  grow capture without a path to test/review are rejected (FEATURE-REVIEW.md).
- **Domain content stays out of the public repo** — the engine is open source, the
  BJJ/nursing corpora are local data.

## 9. Success metrics

Instrumentation is local-only; these are operator-observable, not telemetry.

- **Loop completion:** % of analyzed units that reach attestation, and attested
  cards that survive first review. (An analysis nobody attests is shelf-ware.)
- **Real-corpus proof:** clinical lens + slides + document mode produce a usable
  study set from one actual nursing lecture (the current acceptance test).
- **Retention proxy:** review lapses degrade to clip/seek rather than being skipped;
  restated-vs-claimed ratio trends toward restated.
- **Time-to-loop for a new source:** YouTube URL → first attested card without
  touching Settings.
- **Engine health:** analysis succeeds across ≥2 LLM providers; lens autogen never
  fails an analysis run.

## 10. Current state & roadmap

**Shipped:** v1 core loop → v2 YouTube-native UI + analysis engine → v3 A–D
(generate-first, typed analysis + Study Path, Concept Continuity, domain overlays) →
F11 SRS review → console arc (9 slices, PRs #1–#5) → console shell v1 (PR #6) →
post-review wave: all 9 phases done across PR #7 (lens registry, clinical lens,
clusters, terminology, slides, e2e, integrity, Anki export) and stacked PR #8
(document mode, lens autogen).

**Blocked on Ryan:** merge PR #7 then PR #8; gold-corpus picks; one-lecture
attestation timer test; add an API key in Settings for real Analyze on this machine.

**Next after merge:** prove the clinical lens + slides + document mode on a real
nursing lecture (the acceptance test in §9).

**Gated / dormant:** V3-E (library graph, lesson composer, Threads) gated on
real-use accuracy; echo pane + cross-video features wake up once merge-queue
resolutions exist; exhale ledger compounds once attestations accumulate.

**Backlog:** F8 suggested notes, F9 auto-chapters, community service, per-chunk
analysis result caching (protects paid-quota retries), fix PlayerChrome bottom scrim
swallowing pane clicks (known bug, tracked).

## 11. Open questions

1. **Second-domain generalization:** does the lens system hold for nursing without
   per-domain code, or does clinical need engine-level features? (Answered by the
   nursing-lecture proof.)
2. **Community layer:** what does "open the engine" look like as a contribution
   surface — shared lenses? shared glossaries? (Council flagged, unscoped.)
3. **Audio-first drill deck:** mat-side review must work without a screen (council
   requirement for the physical-skill lens); no design exists yet.
4. **Accuracy threshold for discovery:** what attestation-accuracy bar unlocks
   V3-E's library graph?
