---
phase: 02-analysis-fidelity-hardening
plan: 03
subsystem: analysis
tags: [zod, analysis-v3, structured-output, react, provenance, groundedness, compile]

requires:
  - phase: 02-analysis-fidelity-hardening
    provides: "plan 02-01's ANLZ-02 tracer (locked enrichment field shape, enrichmentNoticeText helper, unit-side badge/notice pattern)"
provides:
  - "enrichment: z.boolean().optional() on PearlSchema (inherited by ChunkPearlV3Schema/MergeV3ResultSchema)"
  - "the self-reported pearl flag threaded through the chunk call, the merge-dedupe OR (both real prompts and FakeAnalysisClient), and runAnalysisJobV3's finalPearls rebuild"
  - "web Pearl type mirror + enrichmentNoticeText reuse on PearlsSection (.pearlEnrichmentTag)"
  - "compiled-document enrichment marking in renderAnalysisPearls + renderAnalysisUnitsV3 (attested branch), via a server-side ENRICHMENT_NOTE mirror of the web copy string"
affects: [02-04-real-lecture-proof, phase-3-gate-01-un-attested-pearl-channel]

actuals:
  tokens: 6182
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Self-reported groundedness flag repeated on a second entity (pearls), OR-propagated across the merge-dedupe pass exactly like V3-D D2 threshold and plan 02-01's unit-side merge — never averaged/majority-voted away"
    - "Wire-level required + final-schema optional split for a boolean field, mirroring evidence/threshold/enrichment(unit) at analysis.ts"
    - "Server/web copy-string mirror: compileRenderer.ts re-declares the exact notice text rather than importing across the workspace boundary, matching the codebase's existing plain-interface-mirror convention; guarded by a character-identical test/verification"

key-files:
  created: []
  modified:
    - server/src/lib/analysis.ts
    - server/test/analysisV3.test.ts
    - web/src/lib/types.ts
    - web/src/concepts/AnalysisSections.tsx
    - web/src/concepts/AnalysisSections.module.css
    - server/src/lib/compileRenderer.ts
    - server/test/compile.test.ts

key-decisions:
  - "enrichment: z.boolean().optional() on PearlSchema (not .default(false)), same locked shape as 02-01's unit field — PearlSchema is also v2's ChunkPearlSchema shared by ~61 existing pearl literals, so optional keeps the diff to intentional sites"
  - "CHUNK_V3_JSON_SCHEMA's pearls block gains enrichment in both properties and required; MERGE_V3_JSON_SCHEMA gets it for free via its existing pearls-object alias — only the merge PROMPTs needed an explicit edit"
  - "FakeAnalysisClient.runMergeV3's dedupe now ORs the enrichment flag onto whichever pearl wins the earlier-timestamp survivor slot, so the deterministic fake-mode path proves the same never-lose-a-signal rule the real merge prompt is told to follow, rather than accidentally passing"
  - "The pearl tag in PearlsSection is a single lowercase word (\"context\") with the full locked notice as title + aria-label — a quiet qualifier, not an alarm, per the plan's interaction spec; no second copy string was introduced anywhere in web/src"
  - "compileRenderer.ts's ENRICHMENT_NOTE is a deliberate re-declaration (not a cross-workspace import) of web/src/lib/enrichment.ts's locked string — same convention the codebase already uses for every other server/web shared shape; verified character-identical"
  - "REQUIREMENTS.md's ANLZ-02 checkbox can now flip to Complete: this plan is the second (and last) declarer per the 02-01 shared-ID gate note, and this plan's SUMMARY now exists"

requirements-completed: [ANLZ-02]

coverage:
  - id: D1
    description: "A pearl flagged true by the chunk model survives FakeAnalysisClient's merge dedupe (both as the timestamp-winning survivor and via the OR-onto-survivor path when a flagged duplicate loses on timestamp) and reaches the persisted analysis document runAnalysisJobV3 returns, proven end-to-end with no live API call"
    requirement: "ANLZ-02"
    verification:
      - kind: unit
        ref: "server/test/analysisV3.test.ts#FakeAnalysisClient.runMergeV3 — ANLZ-02 pearl enrichment merge-dedupe"
        status: pass
      - kind: integration
        ref: "server/test/analysisV3.test.ts#runAnalysisJobV3 (fake client end-to-end) > ANLZ-02: a fake-mode-flagged pearl's enrichment flag reaches the returned analysis and round-trips through AnalysisSchema, with unitId resolution unaffected"
        status: pass
    human_judgment: false
  - id: D2
    description: "A learner viewing a flagged pearl in the study console's Pearls list sees a quiet 'context' tag with the exact locked notice copy as its title/aria-label; an unflagged pearl shows neither"
    requirement: "ANLZ-02"
    verification:
      - kind: unit
        ref: "web/src/lib/enrichment.test.ts#enrichmentNoticeText (ANLZ-02, reused unchanged by this plan's second caller)"
        status: pass
    human_judgment: true
    rationale: "The pure helper's behavior is unit-tested, but visual placement, tag legibility, and whether the quiet single-word marker actually reads as a caveat (vs. noise) on the live Pearls list is a rendering/UX judgment no unit test asserts — web/src/concepts/ has no component-test harness (01-03/02-01 precedent). Visual judgment lands at plan 02-04's human-verify checkpoint."
  - id: D3
    description: "The compiled study document marks flagged pearls (italic note after the insight) and flagged attested units (own italic line under the heading, above the summary); unflagged content, the notYet/dismissed titles-only lists, and the golden-file fixture render byte-identically to before"
    requirement: "ANLZ-02"
    verification:
      - kind: unit
        ref: "server/test/compile.test.ts#renderCompiledDocument — V2-C analysis sections > ANLZ-02: a flagged pearl's bullet carries the enrichment note; an unflagged pearl's does not"
        status: pass
      - kind: unit
        ref: "server/test/compile.test.ts#renderCompiledDocument — V3-B B2 attested vs 'Not yet reviewed' units > ANLZ-02 (flagged block, unflagged-byte-identical negative case, and flagged-but-unattested-stays-marker-free)"
        status: pass
      - kind: unit
        ref: "server/test/compile.test.ts#renderCompiledDocument (golden file) > matches the golden compiled markdown for a fixed set of inputs"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-08-10
status: complete
---

# Phase 2 Plan 3: ANLZ-02 Pearl + Compiled-Document Enrichment Summary

**Repeats plan 02-01's ANLZ-02 tracer on the pearl channel (both LLM calls, merge-dedupe OR, finalPearls rebuild, fake-client emission) and extends enrichment marking into the compiled study document for both units and pearls, closing ROADMAP SC2's "no ungrounded content presents as lecture-derived" on the export surface.**

## Performance

- **Duration:** 30 min
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `enrichment: z.boolean().optional()` added to `PearlSchema` (inherited by `ChunkPearlV3Schema`, `ChunkV3ResultSchema.pearls`, `MergeV3ResultSchema.pearls`); wire mirror added to `CHUNK_V3_JSON_SCHEMA`'s pearls `properties`+`required` (aliased into `MERGE_V3_JSON_SCHEMA` for free)
- Three prompt edits: the chunk pearls bullet now defines the flag, `buildMergeV3UserPrompt` and `MERGE_V3_SYSTEM_PROMPT` both state the copy-through-and-OR merge rule explicitly
- `runAnalysisJobV3`'s `finalPearls` field-by-field rebuild now carries the flag (`undefined`, never `false`, when the merge omitted it) — the exact silent-drop site the plan flagged as highest risk
- `FakeAnalysisClient` flags every 4th chunk's primary pearl (same deterministic cadence as the primary unit), and its `runMergeV3` dedupe ORs the flag onto whichever pearl wins the earlier-timestamp survivor slot, so a flagged duplicate is never lost purely to timestamp ordering — proven directly against `runMergeV3` and end-to-end through `runAnalysisJobV3`
- `web/src/lib/types.ts`'s `Pearl` interface mirrors the server field; `PearlsSection` computes `enrichmentNoticeText` once per row and renders a quiet single-word `.pearlEnrichmentTag` ("context") before the existing in-review tag, with the full locked notice as `title`+`aria-label` — the shared helper's second caller, no new copy string
- `compileRenderer.ts` gains a re-declared `ENRICHMENT_NOTE` const (character-identical to the web copy, verified) used by both `renderAnalysisPearls` (italic suffix on a flagged bullet) and `renderAnalysisUnitsV3`'s attested branch (its own italic line between heading and summary) — the `notYet`/`dismissed` titles-only lists and unflagged content render byte-identically to before, and the golden-file fixture is untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: The enrichment flag travels the pearl channel through both LLM calls** - `e8a1d8d` (feat)
2. **Task 2: A flagged pearl carries its caveat in the study console** - `d37bf95` (feat)
3. **Task 3: The compiled study document tells the truth about enrichment** - `fb52a03` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `server/src/lib/analysis.ts` - `enrichment` on `PearlSchema`, wire mirror, three prompt edits, `finalPearls` mapping, `FakeAnalysisClient` deterministic emission + merge-dedupe OR
- `server/test/analysisV3.test.ts` - `FakeAnalysisClient.runMergeV3` dedupe-OR describe block (3 cases) + one end-to-end `runAnalysisJobV3` pearl-enrichment case
- `web/src/lib/types.ts` - `enrichment?: boolean` added to `Pearl` (hand-maintained server-schema mirror)
- `web/src/concepts/AnalysisSections.tsx` - `PearlsSection` computes and renders the enrichment tag, reusing `enrichmentNoticeText`
- `web/src/concepts/AnalysisSections.module.css` - `.pearlEnrichmentTag` using `--accent-blue`
- `server/src/lib/compileRenderer.ts` - `ENRICHMENT_NOTE` const, marking in `renderAnalysisPearls` + `renderAnalysisUnitsV3` (attested branch only)
- `server/test/compile.test.ts` - flagged/unflagged pearl bullet case, flagged/unflagged-byte-identical attested-unit case, flagged-but-unattested-stays-marker-free "Not yet reviewed" case

## Decisions Made

- Field shape and copy text were LOCKED in `02-CONTEXT.md`'s `interface_context` and by plan 02-01's landed precedent before this plan started — no new shape decisions were made during execution, only repetition of the locked pattern onto a second entity (pearls) and a third surface (compiled document). See `key-decisions` in frontmatter for the specific rules applied.
- `REQUIREMENTS.md`'s `ANLZ-02` checkbox flips to Complete with this plan: 02-01-SUMMARY.md documented the shared-ID gate (#2388) deferral, and this plan is the second and final declarer.

## Deviations from Plan

None - plan executed exactly as written. All three tasks followed 02-CONTEXT.md's locked interface_context and 02-03-PLAN.md's `<action>` steps verbatim, including the interface_context's advance line-number map (verified against current file state before editing); no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None. GitNexus `impact` checks on `PearlSchema`, `runAnalysisJobV3`, `renderAnalysisPearls`, and `renderAnalysisUnitsV3` all returned LOW risk (0-1 direct callers) before editing, consistent with the plan's own impact analysis.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The enrichment path is now proven end-to-end across all three ROADMAP SC2 surfaces named across plans 02-01/02-03: unit schema → wire mirror → prompts → both merge passes (units AND pearls) → fake-client emission → web mirrors → UI badge/tag (unit card AND pearls list) → compiled-document marking (units AND pearls).
- `ANLZ-02` requirement is Complete in `REQUIREMENTS.md` as of this plan.
- No blockers for 02-04 (real-lecture proof) — the compiled-document marking closes the "clickable timestamp link presents ungrounded content as lecture-derived" gap the plan's objective called out as the export-surface risk.
- Phase 3's un-attested pearl review channel closure (LOCKED ADR-PED-02/07) is unaffected by this plan — enrichment marking and attestation gating are orthogonal concerns.

## Self-Check: PASSED

All modified files verified present on disk with expected content; all three task commits (`e8a1d8d`, `d37bf95`, `fb52a03`) verified present in `git log`. Full acceptance-criteria re-run: `npm run test -w server` 1000/1000 pass (baseline 996 after Task 1 + 4 new in Task 3), `npm run test -w server -- analysisV3` 104/104, `npm run test -w server -- compile` 21/21 (golden-file case included), `npm run test -w web` 357/357 (`enrichment.test.ts` unchanged, 4/4), `npm run typecheck` (both workspaces) exits 0, `npm run build -w web` exits 0. `grep -c 'enrichment' server/src/lib/analysis.ts` = 30 (≥12 required). `grep -c 'ENRICHMENT' server/src/lib/compileRenderer.ts` = 4 (≥3 required). The web and server copy strings are verified character-identical via a Node one-liner diff. `git diff` confirms no changes to `MERGE_JSON_SCHEMA`/`MERGE_SYSTEM_PROMPT`/`ChunkResultSchema`/`runAnalysisJob` (v2 path) and no changes to `compileRenderer.ts`'s `notYet`/`dismissed` list construction.

---
*Phase: 02-analysis-fidelity-hardening*
*Completed: 2026-08-10*
