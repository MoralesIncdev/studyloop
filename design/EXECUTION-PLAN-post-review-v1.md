# Execution Plan — Post-Review v1 (console v1 adjudication)

*Adjudicated from four external reviews: Codex (in `docs/LLM-REVIEW-PROMPT.md`), Kimi, GLM, DeepSeek-v4-pro (in `design/critique-*.md`). Written 2026-08-01. Orchestrator: Claude (Fable). Executors: Sonnet coder subagents. If the orchestrator drops (rate limit), **Kimi picks up from the first phase not marked DONE below** — each phase spec is self-contained.*

## Standing rules (from unanimous review consensus)

- **Console freeze**: no new pane-engine cosmetics until this plan lands. Constellation map is a deletion candidate at month two — do not invest in it.
- **Verification per phase**: `npm run typecheck && npm run test` must pass before a phase is marked DONE. Phase 1 adds `npm run e2e` to that gate for UI-touching phases.
- **Branch**: all work on `post-review/execution-v1`, one commit per phase, PR at the end.
- **Pedagogy is binding**: no streaks/XP/guilt surfaces. Real counts only. AI proposes, learner attests.

## Phase status

| # | Phase | Status |
|---|-------|--------|
| 1 | Playwright smoke harness | DONE (`npm run e2e`; ports 4610/4611; zero testids — pre-existing selectors only; known issue: PlayerChrome bottom scrim can swallow pane clicks in bottom ~20%, tracked separately) |
| 2 | Terminology layer v1 | DONE (667 server tests green; double-click a transcript word to correct; glossary inert until Phase 5) |
| 3 | Integrity fixes (streak / heatmap / claimed-vs-restated) | TODO |
| 4 | Cluster unit type | DONE (server: 696 tests green, `CLUSTER` unit type + `members` in analysis.ts/review.ts fan-out; web: ConceptPane/TestPane render members, ReviewView handles `clusterMember` cards; 308 web tests green) |
| 5 | Clinical domain lens | TODO |
| 6 | Slide-text channel (PDF slice) | TODO |
| 7 | Cheap retention wins (front door + export) | DONE (720 server tests; front-door redirect once/session with ?noredirect escape; GET /api/review/export.csv Anki-importable) |
| 8 | Document mode (stretch — likely Kimi) | TODO |
| 9 | Lens autogeneration for unknown subjects | TODO |

---

## Phase 1 — Playwright smoke harness

**Why (Kimi, Codex, DeepSeek):** two shipped event-layer bugs made every pane un-clickable and survived four slices of "verified" work because verification was typecheck + unit tests. Unit tests can't see a z-index.

**What:** Playwright installed at repo root (`e2e/` dir, `playwright.config.ts`), a `npm run e2e` script, CI-friendly (webServer config boots dev servers). One smoke spec against a seeded fixture project:
- open library, open a project, land on study page
- video element present; timeline rail present
- open a pane from chrome; drag it 100px; assert it moved
- click every pane chrome tool button; assert each fires (no micro-drag swallowing)
- resize a pane both axes; assert persisted size after reload
- park a pane; assert tick appears
- switch modality Watch → Review and back

**Fixture:** use the existing dev/test fixture path if one exists (grep `fixtures` in server tests); otherwise create a minimal file-based project under a temp dataDir with a tiny mp4 + captions.json + analysis.json.

**Files:** new `e2e/`, `playwright.config.ts`, root `package.json` script. No app-code changes except (if strictly needed) `data-testid` attributes.

**Verify:** `npm run e2e` green locally, plus typecheck/test.

---

## Phase 2 — Terminology layer v1

**Why (all four, unanimous #1):** no terminology correction exists anywhere; ASR-mangled drug names poison extraction, search, merge, echo. Kill-shot for nursing.

**What:**
1. Per-project `terms.json` (`{ "garbled string": "correct term", ... }` + metadata: source, createdAt). Schema in models.ts, storage alongside captions in the project dir (follow `store.ts` conventions).
2. **Load-time rewrite pass**: when a transcript is resolved (`server/src/lib/transcriptResolve.ts` / `transcripts.ts`), apply the terms map (case-insensitive, word-boundary, longest-match-first). The raw transcript file is never mutated — corrections apply at read time and are diff-logged into the project (`termCorrections` log with counts + timestamps).
3. **Correction API**: `PATCH /api/projects/:id/terms` to add/edit/remove a mapping. Follow existing route conventions in `server/src/routes/`.
4. **Downstream invalidation**: when a term mapping is added/changed, mark the project's analysis stale (a `staleReason: "terms-changed"` flag on analysis.json or project meta — smallest honest slice; do NOT auto-re-run analysis, surface a "transcript corrected since last analysis — re-analyze" banner state via existing project meta endpoint).
5. **Seed glossary**: `server/src/lib/glossary/nursing.json` — ~200 common nursing terms (top drugs generic+brand, lab tests, routes/abbreviations) with common ASR-mangle variants as regex-ish alternatives. Applied as *defaults* when project domain is `clinical` (Phase 5) — until then, loadable but inert. Keep it data, not code.
6. **UI affordance (small)**: in the transcript view, clicking a word offers "correct this term…" → posts to the API. Minimal styling, follow existing transcript component patterns.

**Files:** `server/src/lib/terms.ts` (new), `transcriptResolve.ts`, `store.ts`, new route, models.ts additions, one web component touch. Tests for the rewrite pass (longest-match, word boundary, idempotence) and invalidation flag.

**Verify:** typecheck + unit tests incl. new terms tests.

---

## Phase 3 — Integrity fixes

**Why (Codex, DeepSeek, GLM):** brief claims vs code. Resolve in code where cheap, honestly, without breaking SPEC.

**What:**
1. **Streak demotion enforced**: `review.ts` keeps streak data (SPEC says footnote) but audit every web surface: streak must appear nowhere except the session-end footnote line. Remove any headline/summary usage. If it's already footnote-only, document that in the code comment and move on.
2. **Heatmap honesty**: the timeline heatmap is mark-density (bubbles + pearls), not attention. Rename user-facing copy from attention-language to marks-language ("your marks", "capture density") wherever the web UI says "attention". Do not build dwell tracking now.
3. **Claimed vs restated**: `isUnitFeedable` stays as-is (SPEC B2). But "n/m attested" surfaces must distinguish: `restated` (status attested AND non-empty userTake) vs `claimed` (status attested, no userTake). Add a second real count where the progress line renders: "4 restated · 2 claimed". attestation.ts already has the counting helper pattern (`attestedCount` at ~line 82) — add `restatedCount`. Wire into exhale summary + cabinet counts if present.

**Verify:** typecheck + tests; e2e still green.

---

## Phase 4 — Cluster unit type

**Why (GLM move 3; answers unanimous attestation-fatigue finding):** at nursing density (~30–50 atoms/lecture) one-restatement-per-atom kills the loop. Clusters: attest once, fan out to N review cards.

**What:**
1. models.ts: `UnitTypeSchema` gains `CLUSTER`; a cluster unit carries `members: [{label, body, anchorSec}]` (atomic facts) plus its own label/summary.
2. analysis.ts chunk prompt: when ≥3 closely-related atomic facts share a parent concept (e.g. "side effects of metoprolol"), the model may emit one CLUSTER with members instead of N CLAIMs. Add to the shared schema instructions + each DOMAIN_MODULE only if needed (prefer shared).
3. Attestation: one attestation entry covers the cluster (existing flow untouched — unit id is the cluster).
4. Review fan-out: `review.ts` card building — a feedable CLUSTER derives one review card per member (cloze-style: member label as prompt, body as answer), capped sanely (≤12/cluster). Card ids stable (`${unitId}::m${i}`).
5. Web: concept card pane renders members as a list; self-test for a cluster seals member bodies until attempt (existing blur mechanic).

**Files:** models.ts, analysis.ts, review.ts, attestation untouched, one web pane component. Tests: schema round-trip, fan-out determinism, cap.

**Verify:** typecheck + tests + e2e.

---

## Phase 5 — Lens registry + clinical as first data-driven lens

**Why (all four; DeepSeek's spec adopted, plus Ryan's directive 2026-08-01):** nursing routes to `biology`/`generic` today, AND the app must facilitate *any* YouTube subject — not just the builder's two. So: dissolve the hardcoded enum/DOMAIN_MODULES into a data-driven lens registry, with clinical as the first (and proving) lens file. AMENDED — supersedes the original hardcoded-clinical spec.

**What:**
1. **Lens registry**: lenses become data files in `server/lenses/*.json` (repo-shipped) merged with a user dir (`<dataDir>/lenses/*.json`, user wins on id collision). LensSchema in models.ts: `{ id, label, routerDescription, unitTypeEmphasis, overlayFields: [{key, label, hint}], questionStyle, glossaryRef?, masteryNotes?, safetyTier?: string[] }`. Loader in a new `server/src/lib/lenses.ts`, loaded at startup, hot-reload not required.
2. **Migrate the existing five**: DomainSchema becomes a validated string (validated against the loaded registry at the boundaries, not a z.enum — keep a legacy enum check only where old stored projects need to parse). The five current DOMAIN_MODULES prompt texts move verbatim into five lens files. Router prompt is assembled from the registry's routerDescriptions. Stored projects with old enum values must keep working (ids identical).
3. **Clinical lens file**: routerDescription for lecture/clinical content; unit-type emphasis; overlay fields `drugClass`, `genericName`, `brandName`, `route`, `normalRange`, `nclexCategory`; questionStyle "nclex"; glossaryRef "nursing" (Phase 2's glossary); safetyTier: ["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"].
4. models.ts: UnitTypeSchema gains `DOSAGE`, `CONTRAINDICATION`, `LAB_VALUE`, `PRIORITIZATION` (spine-level — usable by any lens). Overlay fields on units become a generic `overlay: Record<string,string>` validated loosely (lens declares which keys it emits; prompt tells the model).
5. **Safety tier (code, not data)**: unit types listed in a lens's `safetyTier` render with their verbatim transcript quote *always visible* (never paraphrase-only) and are excluded from auto-merge in the concept registry (extend the existing BOUNDARY never-auto-merge rule). This is the one lens capability that stays a code path — lenses *reference* it, they can't redefine it.
6. cardTransform.ts (or wherever self-test/question generation lives): questionStyle dispatch — "nclex" produces scenario stem + 4 options + rationale for PRIORITIZATION/synthesis, generated only from attested material; DOSAGE/LAB_VALUE cards require exact-value answers ("verbatim matters" framing). Default questionStyle keeps current behavior for the migrated five.
7. Phase 2's nursing glossary activates via the clinical lens's glossaryRef.

**Files:** models.ts, new lenses.ts + server/lenses/*.json, analysis.ts (DOMAIN_MODULES deleted in favor of registry), conceptRegistry lib, cardTransform, minor web rendering for overlay fields + safety-quote display. Tests: lens loading/merge precedence, legacy project id compat, never-auto-merge extension, question-mode dispatch.

**Verify:** typecheck + tests + e2e.

---

## Phase 6 — Slide-text channel, smallest slice (PDF)

**Why (all four):** nursing content lives on slides; engine is transcript-only. Full frame/OCR pipeline is later; PDF-paste is the proven-value slice (DeepSeek move 3 smallest slice).

**What:**
1. `POST /api/projects/:id/slides` — upload a PDF (multipart, size-capped). Extract per-page text server-side (`pdf-parse` or similar lightweight dep — no native binaries).
2. Store as `slides.json`: `[{page, text}]` in the project dir.
3. analysis.ts: when slides.json exists, append a supplementary context block to each chunk prompt: "Slide deck text (pages n–m likely relevant)" — naive mapping: distribute pages proportionally across chunks by index; exact sync is future work. Mark units whose evidence came from slides (`evidence: "slides"` optional field) so provenance is honest.
4. Web: a small "Attach slides (PDF)" affordance on the project page; show page count when attached; analysis-stale flag (reuse Phase 2's mechanism, `staleReason: "slides-attached"`).

**Files:** new route, store.ts, analysis.ts, models.ts (slides + evidence field), small web touch. Tests: extraction adapter mocked, prompt assembly includes slide block, stale flag.

**Verify:** typecheck + tests.

---

## Phase 7 — Cheap retention wins

**Why (Kimi moves 3 & 4):** retention loop lives a route away; learner-owns-knowledge argues for export.

**What:**
1. **Front door**: on app load, if review queue has due items, land on Review (with a one-line "n due" note and an obvious way back to library). Respect a `?noredirect` escape and don't redirect more than once per session (sessionStorage guard).
2. **CSV export**: `GET /api/review/export.csv` — front/back/tags(project, domain, unitType)/due — Anki-importable CSV. Button in Review view. (.apkg is future work; CSV imports fine.)

**Files:** web router entry, one route, Review view button. Tests: CSV shape.

**Verify:** typecheck + tests + e2e.

---

## Phase 8 — Document mode (STRETCH — likely Kimi's phase)

**Why (GLM move 2):** dense declarative domains need a transcript-anchored document surface — prenotes the learner *claims* (attests inline), video demoted to side panel. Read-and-claim, not read-and-annotate.

**What (spec only, build when 1–7 landed):** a `document` render of the same units for `clinical` projects: scrollable transcript-ordered list of proposed/attested units (clusters collapsed), inline attest controls reusing existing attestation flow, video as PiP/side panel seeking to anchors on click. Domain-driven default surface: clinical → document, physical_skill → console. Route-level switch, no pane-engine changes.

---

## Phase 9 — Lens autogeneration for unknown subjects

**Why (Ryan's directive 2026-08-01):** the app must handle any subject on YouTube on first contact, not just subjects someone wrote a lens for. `generic` ("leave every overlay field empty") is not a lens.

**What (build after Phase 5's registry exists):**
1. Router change: instead of forcing a fixed-list classification, the router may answer "none of the loaded lenses fit; subject is X" (X = a short free-text subject label).
2. On that answer, one LLM call against a **lens meta-schema** generates a new lens file: routerDescription, unitTypeEmphasis over the spine (CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY/CLUSTER + the Phase 5 additions where sensible), overlayFields (≤6, subject-appropriate), questionStyle (choose from the implemented dispatch set — generated lenses cannot invent new code paths, and cannot set safetyTier), optional starter glossary of ~30 subject terms with ASR-mangle variants.
3. The generated lens is validated against LensSchema, written to `<dataDir>/lenses/<id>.json`, marked `origin: "generated"`, and used for the current analysis run. It is a normal file thereafter: reused by the router for future videos, hand-editable, deletable.
4. UI: project meta shows which lens was used; a generated lens gets a one-line "auto-created lens for <subject> — review it" note (link to the file path is enough for v1).
5. Guardrails: generation happens at most once per analyze run; on validation failure fall back to `generic` and log; never overwrite an existing lens file.

**Files:** lenses.ts (generation + meta-schema prompt), analysis.ts router, models.ts (origin field), tiny web touch. Tests: meta-schema validation, fallback path, no-overwrite, router round-trip with a synthetic generated lens.

**Verify:** typecheck + tests + e2e.

---

## Deliberately NOT in this plan (decided, with reasons)

- **Gold-corpus eval harness (Codex)**: right call, but needs Ryan to pick/annotate corpus videos — blocked on human input, tracked separately.
- **Attestation timer test (DeepSeek's question)**: human experiment, not code. Ryan: one real nursing lecture + a timer, before Phase 8 gets built.
- **Lecture live-capture, mobile/PWA, SQLite index, resumable analysis manifest**: real, but below the line for this pass. SQLite (GLM move 5) becomes urgent when conceptRegistry.json growth hurts — revisit at semester start.
- **Constellation deletion**: decision deferred to month-two checkpoint per Kimi.
