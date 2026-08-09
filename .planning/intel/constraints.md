# Constraints (from SPECs)

> Synthesized by gsd-doc-synthesizer, 2026-08-09 (re-run after cycle resolution).
> SPECs in set: SPEC.md ("StudyLoop — Technical Spec (v1)" + appended V2 / F11 / V3-A /
> V3-B / V3-C / V3-D sections; self-describes as "The build contract. Agents implement
> against this; deviations require updating this file.") and docs/FEATURE-REVIEW.md
> ("Per-Feature Review & v3 Roadmap", adjudicated 2026-07-28 against docs/PEDAGOGY.md).

## Repo layout & runtime topology
- source: SPEC.md (Repo layout)
- type: schema
- content: npm workspaces ["server", "web"]. server/ = Fastify 4, TypeScript, ESM, port 4600 (routes: library, video, transcript, projects, capture, concepts, compile, youtube; lib: scan, transcripts, concepts, frames, store). web/ = Vite + React 18 + TS, dev port 4601 with /api proxy → 4600. Root scripts: dev, build, start.

## Config contract — ~/.studyloop/config.json
- source: SPEC.md (Config)
- type: schema
- content: Auto-created on first run: `{dataDir: "~/StudyLoopData", libraryRoots: [], transcriptRoots: [], conceptDocs: [], anthropicApiKey: null}`. Default dataDir is ~/StudyLoopData (NOT ~/StudyLoop — case-insensitive APFS collision with a repo cloned at ~/studyloop); an existing config's dataDir is never rewritten. Missing/unmounted roots skipped with a warning, never a crash. GET/PUT /api/config edit it; `anthropicApiKey` is write-only from the browser — GET substitutes `anthropicApiKeySet: boolean`, PUT responses redacted the same way. `~` is expanded server-side in dataDir, all root lists, AND every incoming path-bearing request param compared against roots.

## Port & bind policy
- source: SPEC.md (Config)
- type: nfr
- content: `STUDYLOOP_PORT` env var controls server port (default 4600); Vite dev proxy reads the same var. Generic `PORT` is deliberately ignored by both. `HOST` default 127.0.0.1 (loopback-only — no auth exists; broader bind is explicit opt-in). CORS allows only localhost/127.0.0.1/[::1] origins (any port).

## Project data model — <dataDir>/projects/<id>/
- source: SPEC.md (Data model)
- type: schema
- content: project.json {id, title, source {type local|youtube, path?|videoId?, url?}, transcript {type file|none, path?}, conceptDoc {path?, profile?}, createdAt, updatedAt, lastPosition, watchedUpTo}; notes.md (with ^t:123.4 timestamp tokens); bubbles.json; captions.json (YouTube captions, whisper-style, written once at creation); shots/ (shot-<t-ms>.jpg); exports/. Atomic persistence (write temp + rename), no database anywhere. All read-modify-write ops per project go through an in-process per-project mutex. `lastPosition` = current playback (resume); `watchedUpTo` = furthest position ever, monotonically non-decreasing (drives compile "covered"; migrated on read from lastPosition; server enforces max as backstop; client PATCHes every 10s, serialized).

## Server API surface (v1)
- source: SPEC.md (Server API)
- type: api-contract
- content: GET /api/library (cached scan; in-flight dedupe; per-transcript (path,mtime,size) re-read gating) + POST /api/library/rescan (forced). GET /api/video/stream?path= (HTTP 206 range; realpath-canonical root check or 403; suffix ranges; 416 malformed; multi-range → full 200 per RFC 7233). GET /api/transcript?path=&projectId= (loaders: BJJ-corpus JSON, whisper JSON, .srt, .vtt; project-relative path allowed ONLY when it exactly matches the project's declared transcript.path). POST /api/projects (realpath guards; youtube URL validation; captions → captions.json). GET/PATCH projects (PATCH revalidates path-bearing fields). GET/PUT notes; bubbles CRUD; POST shots (ffmpeg frame grab; yt-dlp stream URL for YouTube; 60s spawn timeout; stderr capped; {shot:null,error} on failure). GET concepts (re-parsed fresh every request, GET never persists). POST compile (exports/study-<date>.md; ONLY user captures + covered concepts — never full transcript or all cards). POST /api/youtube/resolve (https + allowlisted YT hosts only; 30s spawn timeout, 10MB stdout cap; yt-dlp absent does NOT block project creation — ytdlpMissing:true). GET /api/media/:projectId/shots/<file>. POST reveal (macOS-only open -R, realpath-guarded to exports/). GET /api/health {ok, ffmpeg, ytdlp} (5-min availability cache).

## Security invariants
- source: SPEC.md (Server API, Quality bar)
- type: nfr
- content: Zod input validation on every route. Path-traversal guard on all file params via realpath-canonical root checks (never lexical prefix alone — symlinks can't escape roots). Project ids constrained to UUID shape at every route boundary; store.ts independently re-guards projectDir()/readProject() against traversal and id/content mismatch (defense in depth). TypeScript strict; no `any` in exported signatures.

## Concept-doc profiles
- source: SPEC.md (Concept-doc profiles)
- type: protocol
- content: (1) `bjj-curriculum`: split on ##/### headings; anchors from `Seated|Supine Vol N ... @ mm:ss` citations plus bare `@ mm:ss`; volume-scoped citations apply only to matching project video (else kept with t:null, never auto-surfaced); bare clusters apply to every project. (2) `headings`: each ## section is a card; anchors = `@ mm:ss` or `[mm:ss]` tokens. Auto-detect: bjj-curriculum only when ≥1 genuine Vol-citation exists; fall back to headings if <2 anchored cards.

## Frontend behavior contracts
- source: SPEC.md (Frontend behavior contracts)
- type: protocol
- content: Sync engine = rAF-throttled ~4Hz currentTime → zustand; binary-search selectors (activeSegment with 0.5s grace, activeConcepts [anchor, anchor+90s], passedConcepts against max(watchedUpTo, currentTime)). TranscriptPane virtualized (search results too); 5s scroll hold-off. Player interface {play, pause, seek, getCurrentTime, getDuration, setRate, getAvailableRates?, on} implemented by LocalVideoPlayer + YouTubePlayer; setRate syncs store to the ACTUAL applied rate; IFrame script load bounded 15s with real retry. Session loads tagged with request ids (stale responses discarded); leaving Study flushes pending notes save then final {lastPosition, watchedUpTo} PATCH, reads before any state clears. Hotkeys: space/J/L/←→/K/,/./A/B/Shift+A/N/S (+C for CC in V2), disabled while typing; N and S respect the ffmpeg health gate. Notation flow: pause → async shot POST → modal → Save waits on in-flight capture (15s then "Save without frame"). Notes autosave debounce 800ms with buffer + timer in the store so flushNotes() never drops edits. Compile button flushes notes + progress PATCH first; skippable caption pass for uncaptioned shots; preview modal with Reveal in Finder + Copy markdown.

## Out-of-box requirements
- source: SPEC.md (Out-of-box requirements, V2 out-of-box)
- type: nfr
- content: `npm install && npm run dev` starts both servers, prints one URL; no global installs except optional ffmpeg/yt-dlp. Empty config → friendly setup card or paste-a-URL start. ffmpeg missing → screenshots disabled with visible hint, all else works. All errors surface as toasts, never blank screens. V2 additions: youtubei.js failures degrade (resolve falls back to yt-dlp path, search shows library-only, up-next cabinet hides); no Anthropic key → app fully usable, only Analyze gated with a clear hint; local-video projects get identical UI minus YouTube-only sections (rail sections collapse, no dead space).
- NOTE: docs/REAL-LECTURE-PROOF-2026-08-08.md Bug 1 (MAJOR) shows the youtubei.js→yt-dlp caption fallback is not met by the implementation (routes/youtube.ts:45-55 short-circuits on metadata-but-no-captions). Implementation-vs-spec evidence — see [INFO] in .planning/INGEST-CONFLICTS.md.

## V2 — YouTube-native UI contract
- source: SPEC.md (V2, 2026-07-28)
- type: protocol
- content: Supersedes the v1 UI/Layout paragraph. Deliberately replicates the YouTube watch page: TopBar (logo, centered search, settings avatar), 16:9 player left with CC overlay + hover chrome + red progress bar + heatmap strip, RightRail ~402px (Transcript panel, Concepts list, Up-next cabinet). YouTube dark theme metrics: Roboto stack, 12px card radii, #0f0f0f bg / #272727 chips / #f1f1f1 text / #aaa secondary, 18px-radius pills, 168×94 thumbnails. Library becomes YT-style home grid. Player chrome right cluster: Note · Shot · Analyze · CC · speed/loop · fullscreen; `C` toggles CC (persisted per project).

## V2 — Fast YouTube layer (innertube)
- source: SPEC.md (V2 Fast YouTube layer)
- type: api-contract
- content: `innertube.ts` via youtubei.js (no API key) replaces yt-dlp for metadata/captions/related/search; yt-dlp remains ONLY for frame-grab stream URLs. POST /api/youtube/resolve answers from Innertube (target <2s warm): title, author, durationSeconds, captions, related[]; related cached in project.json, refreshable via POST /api/youtube/related {videoId, projectId}. GET /api/search?q= → {library, youtube} (youtube section omitted on Innertube failure).

## Analysis engine v2 contract
- source: SPEC.md (V2 Analysis engine)
- type: api-contract
- content: POST /api/projects/:id/analyze — requires transcript + `anthropicApiKey` in config (else pill opens Settings with hint). Chunks transcript ~8-min windows / 1-min overlap; Claude via @anthropic-ai/sdk (config `analysisModel`, default `claude-opus-5`; structured outputs via messages.parse + zodOutputFormat; omit thinking; per-chunk refusal handled); merge pass → analysis.json v2 {generatedAt, model, version:2, pearls[{t,label≤60c,insight,importance 1|2|3}], concepts[{id,title,summary,anchors,body}], themes[{title,body}]}. Progress via GET .../analyze/status (idle|running{pct}|done|error). Idempotent-cached; re-run only on explicit Re-analyze with confirm. Compile v2 adds Pearls + Concept breakdown sections; never blocks without analysis.
- NOTE: the Anthropic-only key gate contradicts docs/PRD.md §6.3 multi-provider StructuredLLMCaller; auto-resolved SPEC > PRD by precedence — see [INFO] in .planning/INGEST-CONFLICTS.md (DOC evidence suggests the PRD side reflects shipped reality; user may override).
- NOTE: v2's ungated concept rendering (summaries shown freely) predates the locked ADR; SPEC's own V3-B section (attestation + reveal-gating) supersedes it going forward — see [INFO] in .planning/INGEST-CONFLICTS.md.

## Heatmap + shareable analysis bundle
- source: SPEC.md (V2 Heatmap + shareable analysis)
- type: schema
- content: GET /api/projects/:id/heatmap → 200-bucket density array (bubbles weight 1, pearls weight=importance, imported overlays ×0.5; Gaussian-smoothed server-side). POST export-analysis → `exports/<title>.studyloop.json` self-contained bundle: source ref (videoId/url or filename+duration hash — never video bytes), author handle (config shareHandle, default "anonymous"), notes md, bubbles (shots as base64 thumbnails ≤480px), pearls, concepts, themes, createdAt. Import validated (zod, version gate, source-match warning) → `<project>/overlays/<handle>-<hash>.studyloop.json`. The bundle format IS the wire format — keep versioned and stable.

## F11 — Review mode (hidden SRS)
- source: SPEC.md (F11, 2026-07-28)
- type: schema
- content: SRS mechanics HIDDEN (no decks/ease factors/scheduling UI — council mandate). Cards derived (never duplicated) from artifacts across ALL projects: bubble cards and pearl cards (model analyses only); stable ids `bubble:<projectId>:<bubbleId>`, `pearl:<projectId>:<t>`; deleted artifacts drop cards silently. `<dataDir>/review.json` {version:1, cards:{[id]:{due, interval, lapses, reps, lastGrade, introducedAt}}, streak?:{count,lastDay}} via atomic write + global mutex. New cards due immediately, 20 new/day cap. Grades: Again → interval 0 + lapse; Got it → ladder [1,3,7,14,30,60] days. GET /api/review/queue and POST /api/review/grade (both return streak field; counts.new = never-graded subset). Corrupt review.json → rebuild empty. Review clip loop is a standalone ReviewClipPlayer <video> (never touches the study session's zustand controller). Non-goals: no per-project decks, no stats page, no configurable ladder, no import of others' cards.
- NOTE: pearl-card sourcing ("analysis pearls... only from source: model analyses") contradicts LOCKED ADR docs/PEDAGOGY.md §1/§5 ("only attested/learner-touched material becomes review cards"). Auto-resolved: LOCKED ADR wins — pearl-derived cards must be gated on attestation/learner touch. Both texts preserved; see [INFO] in .planning/INGEST-CONFLICTS.md.

## V3-A — Generate-first loop
- source: SPEC.md (V3-A, 2026-07-28)
- type: protocol
- content: A1 state-aware surface purge: `playbackFocus` (true after 1.5s continuous playback, false on pause); playing collapses transcript card, dims dock to 45%, suppresses concept ticker; user override `focusOverride` wins until next pause→play; CC renders only during focus or when transcript collapsed (never two full text streams). A2 elaborative ghost prompts: rotating placeholder pool chosen per modal-open; `promptPoolFor(domain)` hook; reference block (quote+screenshot) demoted below the note field. A3 compile synthesis checkpoint: first step "In your own words…" textarea, never blocks; `lessonSummary` on project model + share bundle (bundle version stays 1); compiled markdown first section `## In my own words` or literal placeholder `*[Write your summary to complete this lesson]*`. A4 concept ticker demoted to a chip strip below the player (max 2 + "+N"); ticker-mute toggle now controls the strip.

## V3-B — Typed analysis + attestation + Study Path
- source: SPEC.md (V3-B, 2026-07-28)
- type: schema
- content: analysis.json version:3. One ROUTER call classifies domain (biology|history|music|physical_skill|generic), stored on project, editable, PATCHable. Typed units {id, type CLAIM|MECHANISM|PROCEDURE|EXAMPLE|BOUNDARY, label, summary, body, anchors[{t,quote}], confidence} + edges {source, target, type REQUIRES|PART_OF|EXAMPLE_OF|PROCEDURE_STEP, quote, confidence}; merge dedups by label-fingerprint, averages confidence, keeps all anchors; pearls/themes remain (pearls gain optional `unitId?`). v2 files remain readable (version gate; no attestation for legacy). B2: units render as PROPOSALS, body collapsed behind reveal gated by a generation input (or explicit skip); novice mode flips order. Attest/Edit (userBody separate, original immutable)/Dismiss in `<project>/attestations.json` {[unitId]:{status attested|dismissed, userTake?, userBody?, at}}. Only attested units (or with userTake) feed review cards + compile concept sections; unattested render in compile under "Not yet reviewed" as titles only. B3 Study Path rail: topological order over REQUIRES/PROCEDURE_STEP (time-order fallback; <0.6-confidence edges ignored). B4: LLM card transformation cached in review.json per card; pearl cards become question-form fronts with corrective backs; attested units become generation cards (front = "your take" prompt, back = unit summary + own take); lapse-to-context (Again ×2 → 10s clip, ×3 → open-in-player); summary headline "Concepts locked in: N" with streak as footnote.
- NOTE: B4 retains the un-attested pearl-card review channel from F11 — same LOCKED-ADR override applies (see F11 NOTE above and [INFO] in .planning/INGEST-CONFLICTS.md).

## V3-C — Discovery & apprenticeship
- source: SPEC.md (V3-C, 2026-07-28)
- type: protocol
- content: C1 Concept Continuity scorer `lib/continuity.ts`: score = 0.15*related + 0.30*conceptSearch + 0.30*teacherValidation + 0.25*gapFill (weights in config `continuityWeights`, hot-reloadable; conceptSearch max 3 Innertube queries cached 15min; teacherScores.json per-channel cache). GET /api/projects/:id/continuity → ranked candidates with reasons[]. C2 search intent toggles (Overview/Deep dive/Troubleshooting reshape the YT query; off by default, sticky per session). C3 post-compile "What's next" top-3. C4 overlay diff-on-import `lib/overlayDiff.ts` (pure set-difference, ±15s tolerance, importance-sorted, read-only). C5 heatmap renamed "Attention"; per-layer {own, overlays} arrays; legend line "Attention = where marks concentrate, not importance." C6 bundle gains optional lessonSummary + per-concept rationale. V3-C must NOT touch analysis internals or review scheduling.

## V3-D — Depth
- source: SPEC.md (V3-D, 2026-07-29)
- type: schema
- content: D1 optional per-domain `overlay` object on units (biology/history/music/physical_skill field sets); zod optional everywhere; rendered in a collapsed "Advanced" fold. Domain-aware generation slots via extended promptPoolFor(domain). D2 `threshold: true` unit flag: key-icon badge, Study Path REINFORCE step 2 positions later, review seeds threshold cards due first among new. D3 concept merge queue `<dataDir>/conceptRegistry.json`: exact fingerprint → auto-merge; similarity ≥0.85 token Jaccard (no embeddings) → candidate queue; NEVER auto-merge BOUNDARY or threshold units; GET /api/registry/merge-candidates + POST resolve {merge|link|ignore}. D4 domain-routed card transformation; regeneration only on explicit "improve this card". P2 tier (library-wide prerequisite graph, lesson composer, home-grid Threads) deferred to V3-E pending real-use extraction accuracy.
- NOTE: docs/FEATURE-REVIEW.md places the P2 tier inside V3-D; SPEC.md defers it to "V3-E". Same gating rationale (proven extraction accuracy) — treated as a phase-label refinement, not a contradiction; see [INFO] in .planning/INGEST-CONFLICTS.md.

## Quality bar & testing
- source: SPEC.md (Quality bar, phase acceptance sections)
- type: nfr
- content: Vitest unit tests for transcript loaders, concept parsers, time utils, compile renderer (golden file), library scan cache, transcript-ref mtime/size cache (no E2E in v1). Every V3 phase requires: typecheck + full suite green, phase-specific new unit tests, no emojis, DESIGN.md interaction matrix (hover/active/focus-visible/disabled) on all new interactive elements, reduced-motion honored, browser verification on the real corpus with committed screenshots. V3-D baseline cited: 686 tests.

## v3 Roadmap — build order (four phases)
- source: docs/FEATURE-REVIEW.md (v3 Roadmap table)
- type: protocol
- content: Priorities are learning-leverage-per-build-effort. V3-A "Generate-first loop" = state-aware purge · notation ghost prompts · compile synthesis checkpoint · ticker demotion (why first: highest leverage per effort, almost all UI, makes the app ask something of the learner). V3-B "Typed analysis + Study Path" = analysis v3 schema (router + typed spine + edges) · attestation + reveal-gating · Study Path rail with generation slots · card transformation · lapse-to-context · mastery-over-streaks (why: the engine change everything else feeds on). V3-C "Discovery & apprenticeship" = Concept Continuity weighted rail · intent toggles · post-compile What's-next · overlay diff-on-import · attention heatmap layers · bundle narrative fields (why: converts navigation and sharing from engagement-shaped to learning-shaped). V3-D "Depth" = domain overlays + domain slots · threshold tagging · merge queue · Threads · domain-aware questions · library graph + lesson composer (why: compounding features gated on v3 accuracy). Standing anti-features and honest-claims language govern all phases (PEDAGOGY §8–9).

## Per-feature verdicts — Discover & Navigate
- source: docs/FEATURE-REVIEW.md (Discover & Navigate)
- type: protocol
- content: Up-next rail: FATAL FLAW as shipped (YouTube engagement recommendations ≠ learning path) → [V3-C P0] Concept Continuity rail with weighted scorer (PEDAGOGY §6), each suggestion labeled with its "why"; [V3-C P1] teacher-validation cache per channel. Search: right surface, wrong intent → [V3-C P1] intent toggles Overview/Deep dive/Troubleshooting (query reshaping, zero new UI concepts); [V3-C P2] "Learn X" goal object (typed goal → sequenced results), gated on typed-analysis accuracy (path-vaporware risk flagged by RedTeam). Home grid: fine as v2 → [V3-D P2] Threads (cross-series mini-curricula grouped by shared attested concepts) only after merge queue exists and extraction accuracy is proven (bad groupings destroy trust). Post-compile dead end: wasted golden moment → [V3-C P1] "What's next" panel from the Concept Continuity scorer.

## Per-feature verdicts — Study Loop
- source: docs/FEATURE-REVIEW.md (Study Loop)
- type: protocol
- content: Player+transcript+CC: split-attention nightmare during playback (Mayer, STRONG evidence) → [V3-A P0] state-aware surface purge (playing = video + CC only, transcript/notes fade; paused = full study surface; CC and transcript never both fully visible). Transcript-quality assumption (jargon mis-transcription) noted as future work. Concept ticker: auto-popping cards over video = extraneous load → [V3-A P1] ticker demotion (progress-bar chips + rail highlight; card on demand; kill slide-over during playback). Notation modal: blank textarea intimidating, auto-capture risks stealing generation → [V3-A P0] elaborative ghost prompts rotating in the note field, domain-lens-varied; captured quote/shot visually demoted to "reference material"; [V3-B P2] optional note structures (Cornell, claim-evidence, mechanism chain) offered, never forced.

## Per-feature verdicts — Analysis Engine
- source: docs/FEATURE-REVIEW.md (Analysis Engine)
- type: protocol
- content: v2 extracts generically and hands answers over freely — both wrong per PEDAGOGY §1–2 → [V3-B P0] analysis v3 typed extraction (router call → editable domain chip; typed spine units + edges with evidence quotes + confidence; schema v3 per KGA model: nodes/edges/anchors/provenance/slots); [V3-B P0] attestation loop (proposals with attest/edit/dismiss; only attested material feeds review + compile headline sections; reveal-gating behind learner's own attempt; novice toggle flips to worked-example-first); [V3-B P0] Study Path rail tab (linear prerequisite-ordered walk, generation slots as inline cards at media cues, no graph UI); [V3-D P1] domain overlay fields + domain-specific slot types + threshold-concept tagging; [V3-D P1] concept merge queue (conceptRegistry.json + fingerprint match; "combine?" rail badge; never auto-merge BOUNDARY/threshold/safety nodes); [V3-D P2] library-level prerequisite graph + multi-video lesson composer (transitive closure, cycle detection).

## Per-feature verdicts — Retention
- source: docs/FEATURE-REVIEW.md (Retention)
- type: protocol
- content: Architecture right; card quality is the whole game; streak mis-rewards; lapses dead-end → [V3-B P0] lapse-to-context pipeline (Again ×2 → inline 10s clip; ×3 → open-in-player seek + pause queue; surface only on lapsed cards); [V3-B P1] card transformation (LLM converts weak bubbles into cloze/targeted questions — quote = source, user note = hint; pearls become why/application questions with corrective backs; cards without feedback backs are NEVER generated); [V3-B P1] mastery over streaks (streak → footnote; celebrate "concepts locked in" graduated past 30d; no XP/leaderboards ever); [kept] implicit interleaving across projects (verified already global); [V3-D P2] domain-aware question generation (mechanistic why for biology, sourcing for history, scenario application for skills).

## Per-feature verdicts — Synthesis & Contribution
- source: docs/FEATURE-REVIEW.md (Synthesis & Contribution)
- type: protocol
- content: Compile: aggregation posing as synthesis, biggest wasted activation moment → [V3-A P0] synthesis checkpoint ("In your own words, what was this lesson about?" — skippable; skipping renders visible `[Write your summary to complete this lesson]` placeholder at top; `lesson_summary` field on project + bundle); [V3-B P1] generation slots render into the compiled doc (answered inline, blanks visible where skipped). Share bundles/overlays: sound wire format, missing narrative payload and delta → [V3-C P0] overlay diff-on-import ("From ⟨handle⟩'s analysis — N moments you haven't marked" rail section; set difference ±15s, importance-sorted, click-to-seek — the gap is the lesson); [V3-C P1] bundle carries `lesson_summary` + per-concept `rationale`, author framing rendered as collapsible intro card on import; JSON-file sharing = power-user path, link-based sharing waits for the community service. Heatmap: semantics actively misleading → [V3-C P1] rename "Attention", layered rendering (own vs overlay, smoothed within layer only), click-to-inspect popover with author + text; expert-handle pins never averaged into the crowd curve.
