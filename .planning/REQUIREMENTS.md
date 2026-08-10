# Requirements: StudyLoop

**Defined:** 2026-08-09 (bootstrapped from doc ingest: SPEC.md, docs/PRD.md, docs/PEDAGOGY.md LOCKED ADR, docs/FEATURE-REVIEW.md, docs/REAL-LECTURE-PROOF-2026-08-08.md)
**Core Value:** A real lecture goes end-to-end with zero hallucinated claims and zero un-attested AI content in the review queue.

## v1 Requirements

Active scope for Milestone 1 (Student-Ready Real-Lecture Proof + accuracy-gated Depth Tier). These are the deltas over the shipped baseline (see § Baseline below). Each maps to exactly one roadmap phase.

### Ingestion Pipeline (PIPE)

- [x] **PIPE-01**: YouTube resolve runs the yt-dlp caption fallback whenever Innertube returns null captions — not only when the whole resolve fails — so the normal paste-a-URL flow produces a transcript-bearing project with no manual workaround. (Proof Bug 1, MAJOR; fixes `server/src/routes/youtube.ts:45-55` short-circuit; fulfills SPEC V2 out-of-box degradation contract and REQ-source-ingestion-youtube's time-to-loop acceptance.) (Provenance: the route-side code fix landed on `main` in commit `4f7ff0e` (2026-08-08, PR #10), before this requirements file was authored on 2026-08-09; Phase 1's actual delta against PIPE-01 is regression coverage — `server/test/youtube.test.ts` — not a behavior change.)
- [x] **PIPE-02**: Slide-PDF ingestion reports pages with no extractable text (`emptyPageCount`) and the app visibly warns on image-only decks instead of silently attaching an empty slides channel. Nothing fails silently. (Proof Bug 2; `server/src/lib/slides.ts` is pdf-parse text-layer-only; upholds REQ-slide-pdfs and REQ-graceful-binary-degradation.)

### Analysis Fidelity (ANLZ)

- [ ] **ANLZ-01**: The merge pass dedups anchor-time-aware, not by label fingerprint alone — chunk-overlap re-emissions of the same fact under different labels no longer survive as near-duplicate units (e.g. the two identical tidal-volume DOSAGE cards at t=449). (Proof Bug 3; `mergeUnitsByFingerprint` in `server/src/lib/analysis.ts`.)
- [x] **ANLZ-02**: Ungrounded-but-correct enrichment (definitions/terms the lecture only name-drops) is marked as enrichment or suppressed — no claim absent from the transcript/slides evidence presents as lecture-derived at an anchor timestamp. (Proof Bug 6.)
- [ ] **ANLZ-03**: Overlay fields a lens instructs to leave empty stay empty in stored analysis.json — empty-string entries (including lone `[""]`) are filtered at generation/validation, not only at merge. (Proof Bug 5; `analysis.ts:155-158`.)

### Attestation Gate (GATE)

- [ ] **GATE-01**: Pearl-derived review cards are gated on attestation/learner touch — un-attested pearls never enter the review queue, closing the F11/V3-B pearl channel per LOCKED ADR-PED-02/07. Existing `review.json` state migrates safely (un-attested pearl cards dropped or suspended without corrupting scheduling for legitimate cards).
- [ ] **GATE-02**: SPEC.md's F11 and V3-B sections are updated to close the un-attested pearl channel, so the build contract matches the LOCKED ADR (per INGEST-CONFLICTS auto-resolution: "SPEC.md should be updated").

### Compile Honesty (COMP)

- [ ] **COMP-01**: The compiled document lists dismissed units under a distinct "Dismissed" section — never mixed into "Not yet reviewed". (Proof Bug 4; `compileRenderer.ts:91-110` partitions solely by `isUnitFeedable()`; resolves the SPEC ambiguity flagged in INGEST-CONFLICTS.)
- [ ] **COMP-02**: Pearl/concept anchor timestamps in the compiled document render as clickable timestamp links, matching user-note `^t:` token behavior. (Proof Bug 7, nice-to-have.)

### Real-Lecture Proof (PROOF)

- [ ] **PROOF-01**: A real nursing lecture passes the end-to-end proof with zero manual workarounds: URL paste → transcript in normal flow → clinical lens auto-selected → slides channel → document mode → attestation → compile. Clinical + slides + document each PASS with zero hallucinated claims, all anchor quotes verbatim-verified, and safety values exact. Setup is no longer CONDITIONAL. Review queue after the run contains only attested/learner-touched cards.
- [ ] **PROOF-02**: The previously-unproven session-content rendering paths — notes, captures, watchedUpTo, lessonSummary — are exercised during the proof run and verified in the compiled export.

### Depth Tier (DPTH) — accuracy-gated

- [ ] **DPTH-01**: Library-wide prerequisite graph across videos (transitive closure with cycle detection); auto-inferred edges are confidence-marked and editable, never locked (ADR-PED-04); no visible graph-editor UI (ADR-PED-11).
- [ ] **DPTH-02**: Multi-video lesson composer — learner can sequence attested concepts across projects into a single prerequisite-ordered lesson path.
- [ ] **DPTH-03**: Home-grid Threads — cross-series mini-curricula grouped by shared attested concepts, built only on the existing merge queue with proven extraction accuracy (bad groupings destroy trust).

## Baseline (shipped — verified by CI and the 2026-08-08 proof)

The 26 product requirements ingested from docs/PRD.md are implemented on main (~1160 unit tests + 2 e2e). They are listed here as the guarded baseline, not active work; the proof re-run (Phase 4) re-exercises the proof-relevant subset. Regressions against any of these are bugs, not scope.

| Ingested requirement | Status | Notes |
|---|---|---|
| REQ-generate-before-reveal | Shipped | V3-A/B; reveal gated behind generation input or explicit skip |
| REQ-attestation-gates-review | Shipped with gap | Pearl channel violates it → GATE-01 closes; re-verified in PROOF-01 |
| REQ-test-with-feedback | Shipped | Cards never ship without corrective backs |
| REQ-lapse-degradation | Shipped | Again ×2 → 10s clip; ×3 → open-in-player |
| REQ-signal-integrity | Shipped | Attention heatmap, streak as footnote |
| REQ-expertise-reversal | Shipped | Per-project novice toggle |
| REQ-source-ingestion-local | Shipped | Library scan + transcript matching |
| REQ-source-ingestion-youtube | Shipped with gap | Bug 1 MAJOR breaks normal-flow captions → PIPE-01 |
| REQ-slide-pdfs | Shipped with gap | Image-only PDFs silently empty → PIPE-02 |
| REQ-graceful-binary-degradation | Shipped with gap | youtubei.js degradation contract unmet → PIPE-01 |
| REQ-study-console | Shipped | v6-mock contract |
| REQ-analysis-lens-routing | Shipped with gap | Dedup/enrichment/overlay fidelity → ANLZ-01..03 |
| REQ-lens-registry-autogen | Shipped | Autogen create-only, never fails a run |
| REQ-clinical-safety-tier | Shipped | Proof: safety values exact, verbatim quotes; re-verified in PROOF-01 |
| REQ-terminology-glossary | Shipped | Per-project term rewrite |
| REQ-multi-provider-llm | Shipped | Proof ran glm-5; SPEC-vs-PRD auto-resolution flagged ⚠️ in PROJECT.md — no code change planned |
| REQ-hidden-srs-review | Shipped with gap | Un-attested pearl channel → GATE-01 |
| REQ-document-mode | Shipped | Proof PASS 9/10; re-verified in PROOF-01 |
| REQ-concept-continuity-discovery | Shipped | Weighted scorer with "why" labels |
| REQ-compile-share | Shipped with gap | Dismissed partition + anchor links → COMP-01/02; session paths → PROOF-02 |
| REQ-local-first-no-db | Shipped | File-based, atomic writes, per-project mutex |
| REQ-zero-setup-dev | Shipped | npm install && npm run dev; :4600/:4601 |
| REQ-secrets-redaction | Shipped | `*ApiKeySet` redaction |
| REQ-quality-gate-ci | Standing | Cross-cutting gate on every phase in this roadmap |
| REQ-design-contract | Standing | design/DESIGN.md binding on all UI work |
| REQ-non-goals | Standing | Enforced via Out of Scope below |

## v2 Requirements

Deferred beyond this roadmap. Tracked but not planned.

### Discovery & Composition

- **DISC-01**: "Learn X" typed goal object (typed goal → sequenced results) — gated on typed-analysis accuracy; path-vaporware risk flagged by RedTeam (FEATURE-REVIEW V3-C P2)
- **NOTE-01**: Optional note structures (Cornell, claim-evidence, mechanism chain) — offered, never forced (FEATURE-REVIEW V3-B P2)

### Resilience (from codebase concerns — promote when prioritized)

- **RSLN-01**: Project data backup/export-to-zip
- **RSLN-02**: Attestation mutations with rollback (replace optimistic-no-rollback pattern)
- **RSLN-03**: Cross-project global concept search

## Out of Scope

Explicitly excluded. See PROJECT.md for full rationale; LOCKED items cannot be re-added without amending docs/PEDAGOGY.md.

| Feature | Reason |
|---------|--------|
| Cloud sync / accounts / mobile app | Local-first horizon; sharing is file-bundle export (PRD §8) |
| XP, leaderboards, streaks-as-motivation, infinite feed | LOCKED ADR-PED-07/11 gamification boundary |
| Visible knowledge-graph / concept-map editor | LOCKED ADR-PED-11 — the graph stays behind the scenes |
| Exposed SRS mechanics (decks, ease factors, scheduling UI) | LOCKED ADR-PED-11 — council mandate |
| YouTube engagement algorithm on any "next" surface | LOCKED ADR-PED-08/11 |
| Auto-complete flashcards untouched by the learner | LOCKED ADR-PED-02/11 |
| Mandatory friction / blocking generation prompts | LOCKED ADR-PED-01/11 — nudge with visible blanks, never block |
| Domain corpora (BJJ/nursing) in the public repo | Engine open source, content private (PRD §8) |
| Capture features with no path to test/review | Not a note-taking app (PRD §8) |

## Traceability

Active v1 requirements → roadmap phases. Baseline requirements are guarded by CI + the Phase 4 proof re-run, not phase-mapped.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 | Complete |
| PIPE-02 | Phase 1 | Complete |
| ANLZ-01 | Phase 2 | Pending |
| ANLZ-02 | Phase 2 | Complete |
| ANLZ-03 | Phase 2 | Pending |
| GATE-01 | Phase 3 | Pending |
| GATE-02 | Phase 3 | Pending |
| COMP-01 | Phase 3 | Pending |
| COMP-02 | Phase 3 | Pending |
| PROOF-01 | Phase 4 | Pending |
| PROOF-02 | Phase 4 | Pending |
| DPTH-01 | Phase 5 | Pending |
| DPTH-02 | Phase 5 | Pending |
| DPTH-03 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-09*
*Last updated: 2026-08-09 after doc-ingest project initialization*
