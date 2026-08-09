# Roadmap: StudyLoop

## Overview

StudyLoop's engine is built (all 11 prior build phases merged) but the 2026-08-08 real-lecture proof came back CONDITIONAL: a real user hits two flow-level gaps before ever reaching the modes, the analysis output carries fidelity blemishes, and the review pipeline still has an un-attested pearl channel that violates the LOCKED pedagogy ADR. This milestone converts CONDITIONAL PASS into full PASS: repair the ingestion flow (the youtubei.js caption-fallback MAJOR), harden analysis fidelity, close the attestation gate and make compile honest, then re-run the proof end-to-end on a real nursing lecture. Only after the proof holds — and real-use extraction accuracy is demonstrated — does the accuracy-gated P2 depth tier (library prerequisite graph, lesson composer, Threads) unlock as its own phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Ingestion Pipeline Repair** - Caption fallback runs in the normal flow; image-only slide PDFs warn instead of failing silently
- [ ] **Phase 2: Analysis Fidelity Hardening** - Chunk-overlap dedup, enrichment marked or suppressed, overlay-field discipline
- [ ] **Phase 3: Attestation Gate & Compile Honesty** - Un-attested pearl review channel closed per LOCKED ADR; compile distinguishes Dismissed; anchors clickable
- [ ] **Phase 4: Real-Lecture Proof Re-Run** - Full end-to-end PASS on a real nursing lecture with zero manual workarounds
- [ ] **Phase 5: Depth Tier (Accuracy-Gated)** - Library prerequisite graph, multi-video lesson composer, home-grid Threads

## Phase Details

### Phase 1: Ingestion Pipeline Repair

**Goal**: A learner pasting a YouTube URL gets a transcript-bearing project in the normal flow, and slide-deck gaps are visible, never silent
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02
**Success Criteria** (what must be TRUE):

  1. Pasting a YouTube URL on a network where Innertube resolves metadata but returns no captions still yields a project with a transcript — the yt-dlp caption fallback runs whenever captions are null, not only when the whole resolve fails, with no manual workaround
  2. Total youtubei.js failure still degrades per the out-of-box contract: resolve falls back to the yt-dlp path, and yt-dlp being absent does not block project creation (`ytdlpMissing: true`)
  3. Attaching an image-only (no text layer) slide PDF produces a visible warning driven by `emptyPageCount` — the learner knows the slides channel is empty before analysis runs
  4. Existing text-layer PDF and captioned-YouTube flows are unchanged (regression tests cover both branches of the fallback)

**Plans:** 3 plans

Plans:

- [x] 01-01-PLAN.md — PIPE-01: route-level regression coverage for the yt-dlp caption fallback (wave 1)
- [ ] 01-02-PLAN.md — PIPE-02: emptyPageCount from the PDF extractor through the upload response (wave 1)
- [ ] 01-03-PLAN.md — PIPE-02: mirrored web type and the learner-visible empty-deck warning (wave 2)

### Phase 2: Analysis Fidelity Hardening

**Goal**: Analysis output on a real lecture contains no duplicate units, no unmarked ungrounded claims, and no junk overlay fields
**Depends on**: Phase 1
**Requirements**: ANLZ-01, ANLZ-02, ANLZ-03
**Success Criteria** (what must be TRUE):

  1. Re-analyzing the proof lecture yields no near-duplicate units — the merge pass dedups anchor-time-aware, so chunk-overlap re-emissions of the same fact under different labels collapse (the twin tidal-volume DOSAGE cards at t=449 case)
  2. Any unit/pearl content not grounded verbatim in the transcript or slides is visibly marked as enrichment or suppressed — nothing ungrounded presents as lecture-derived at an anchor timestamp
  3. Stored analysis.json contains no overlay values in fields the active lens instructs to leave empty — no lone `[""]` entries survive
  4. The clinical safety tier still holds under the new merge logic: DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION items never auto-merge and render verbatim quotes with exact values

**Plans**: TBD

### Phase 3: Attestation Gate & Compile Honesty

**Goal**: The review queue contains only attested/learner-touched material, and the compiled document reports attestation states truthfully
**Depends on**: Phase 2
**Requirements**: GATE-01, GATE-02, COMP-01, COMP-02
**Success Criteria** (what must be TRUE):

  1. No un-attested pearl-derived card ever appears in the review queue — pearls enter review only after the learner has attested or touched the source material (LOCKED ADR-PED-02/07; closes the F11/V3-B channel)
  2. Existing review.json state migrates safely: un-attested pearl cards are dropped or suspended without corrupting scheduling for legitimately attested cards
  3. SPEC.md's F11 and V3-B sections no longer specify the un-attested pearl channel — the build contract matches the LOCKED ADR
  4. The compiled document lists dismissed units under a distinct "Dismissed" section, separate from "Not yet reviewed"
  5. Pearl/concept anchor timestamps in the compiled document are clickable links, matching user-note `^t:` token behavior

**Plans**: TBD

### Phase 4: Real-Lecture Proof Re-Run

**Goal**: The developer success metric holds — a real nursing lecture passes the full end-to-end proof, not conditionally
**Depends on**: Phase 3
**Requirements**: PROOF-01, PROOF-02
**Success Criteria** (what must be TRUE):

  1. A real nursing lecture (title-matching content, or MedCram with its follow-up part) runs URL paste → transcript → clinical analysis → slides → document mode → attestation → compile with zero manual workarounds — Setup is a clean PASS, not CONDITIONAL
  2. Clinical + slides + document modes each PASS with zero hallucinated claims: all anchor quotes verbatim-verified against the caption stream, safety values exact, slide provenance demonstrably firing on a genuinely independent deck
  3. After the run, the review queue contains only attested/learner-touched cards — verified against attestations.json
  4. The previously-unproven session-content rendering paths (notes, captures, watchedUpTo, lessonSummary) are exercised during the run and verified in the compiled export
  5. The proof is written up as a dated report (like REAL-LECTURE-PROOF-2026-08-08.md) with adversarial verification, and CI is green

**Plans**: TBD

### Phase 5: Depth Tier (Accuracy-Gated)

**Goal**: Compounding cross-library features unlock — learners can see prerequisite paths across videos, compose multi-video lessons, and browse concept-grouped Threads
**Depends on**: Phase 4, plus documented real-use extraction-accuracy evidence (the entry gate — per SPEC V3-D deferral and FEATURE-REVIEW's identical condition; do not start this phase on the proof run alone)
**Requirements**: DPTH-01, DPTH-02, DPTH-03
**Success Criteria** (what must be TRUE):

  1. The phase begins only after extraction accuracy is demonstrated in real use beyond the proof run, and that evidence is recorded (the gate is checked, not assumed)
  2. Learner can follow a library-wide prerequisite path across videos — transitive closure with cycle detection; auto-inferred edges are confidence-marked and editable, never locked; no visible graph-editor UI appears anywhere (ADR-PED-04/11)
  3. Learner can compose a multi-video lesson that sequences attested concepts across projects into one prerequisite-ordered path
  4. The home grid shows Threads — cross-series mini-curricula grouped by shared attested concepts, built on the existing merge queue; groupings reflect attested material only
  5. Discovery surfaces remain learning-weighted with visible "why" labels — no engagement-shaped ranking creeps in (ADR-PED-08)

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Ingestion Pipeline Repair | 0/3 | Not started | - |
| 2. Analysis Fidelity Hardening | 0/TBD | Not started | - |
| 3. Attestation Gate & Compile Honesty | 0/TBD | Not started | - |
| 4. Real-Lecture Proof Re-Run | 0/TBD | Not started | - |
| 5. Depth Tier (Accuracy-Gated) | 0/TBD | Not started | - |
