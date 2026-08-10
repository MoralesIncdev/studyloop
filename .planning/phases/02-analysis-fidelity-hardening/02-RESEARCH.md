# Phase 2: Analysis Fidelity Hardening - Research

**Researched:** 2026-08-09
**Domain:** In-process deterministic merge/dedup logic + LLM-output grounding discipline (TypeScript, server/src/lib/analysis.ts)
**Confidence:** HIGH

## Summary

**The single most important finding of this research: most of Phase 2's stated scope is already implemented and shipped on `main`.** Commit `468e0b8` ("Quality fixes from the real-lecture proof verifiers", 2026-08-08 19:01:40, same day as the proof, one day before `.planning/` was bootstrapped) already added `dedupeNearDuplicateUnits` (ANLZ-01), `scrubOverlayToLens` + empty-string array filtering (ANLZ-03), and a prompt-level instruction against ungrounded enrichment (a partial, unverified attempt at ANLZ-02). It also fixed COMP-01 (Dismissed section) and COMP-02 (clickable timestamps) in `compileRenderer.ts` — both currently scoped to Phase 3. This mirrors the exact provenance pattern already documented for PIPE-01 in REQUIREMENTS.md: the code fix landed before the requirements file was authored, so the requirements/roadmap text is one day stale against the actual repo state. `[VERIFIED: server/src/lib/analysis.ts:1608-1769,1923-1932 read directly; git show 468e0b8]`

This changes Phase 2's real shape. **ANLZ-01 and ANLZ-03 are implementation-complete** — the remaining work is (a) verifying the existing fix actually satisfies the phase's specific success criteria (especially SC4, the safety-tier interaction, which is NOT yet explicitly guarded in the new code path — see Common Pitfalls) and (b) whatever gaps a fresh audit surfaces. **ANLZ-02 (ungrounded enrichment marking/suppression) is the one requirement with no code-level mechanism at all** — only a prompt instruction exists, and the codebase's own commit message for the overlay fix explicitly notes "the prompt's 'leave the rest empty' instruction alone didn't hold," which is the same failure mode Bug 6 exhibits for enrichment. ANLZ-02 is genuinely new work and is where planning effort should concentrate.

**Primary recommendation:** Do NOT re-architect `dedupeNearDuplicateUnits`/`scrubOverlayToLens` from scratch — audit them against the phase's 4 success criteria, close the SC4 safety-tier gap, and extend the existing merge-pass test suite. Build ANLZ-02 as a new self-reported `enrichment` signal on the unit schema, following the exact same pattern the codebase already uses for `evidence` and `threshold` (self-report at chunk level -> merge-pass aggregation -> UI marking), not as a new NLP/grounding-verification subsystem — the codebase's own architecture ("no embeddings," "deterministic in-code merge, not a semantic LLM merge, where a fingerprint can do it") argues against building a verifier.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANLZ-01 | Merge pass dedups anchor-time-aware, not by label fingerprint alone — chunk-overlap re-emissions collapse (twin tidal-volume DOSAGE cards, t=449) | `dedupeNearDuplicateUnits` already implemented and wired (`analysis.ts:1694-1729`, `1923-1924`) with existing fixture test coverage; research identifies the remaining work as SC4 safety-tier interaction verification (Pitfall 2), not new merge logic |
| ANLZ-02 | Ungrounded-but-correct enrichment marked as enrichment or suppressed — nothing ungrounded presents as lecture-derived at an anchor timestamp | No code mechanism exists yet (only an unenforced prompt instruction); research provides a recommended architecture (self-report field + OR-merge + UI badge, modeled on the existing `evidence`/`threshold` pattern) and flags this as the phase's real net-new scope |
| ANLZ-03 | Overlay fields a lens instructs to leave empty stay empty in stored analysis.json — no lone `[""]` entries survive | `scrubOverlayToLens` + empty-string array filtering already implemented and wired (`analysis.ts:1503-1537`, `1927-1928`) with existing fixture test coverage; research identifies remaining work as test extension only |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chunk-overlap unit dedup (ANLZ-01) | API/Backend (`server/src/lib/analysis.ts`) | — | Pure deterministic merge logic, runs inside `runAnalysisJobV3`; no UI involvement |
| Overlay-field discipline (ANLZ-03) | API/Backend (`server/src/lib/analysis.ts`) | — | Server-side scrub against lens-declared keys; already enforced before persistence |
| Ungrounded-enrichment marking/suppression (ANLZ-02) | API/Backend (schema + chunk prompt + merge) | Browser/Client (UI badge to make the mark visible) | The signal must be captured at generation time (LLM call) and persisted in analysis.json; "visibly marked" requires a client-side rendering change too — this is the one ANLZ item that is NOT backend-only |
| Clinical safety-tier invariant (SC4) | API/Backend (`server/src/lib/conceptRegistry.ts`, already implemented) + `server/src/lib/analysis.ts` (new gap) | Browser/Client (`web/src/lib/safetyTier.ts`, `UnitProposalCard.tsx`, already implemented) | Cross-project never-auto-merge and verbatim-quote UI already exist; the NEW intra-analysis dedup pass (`dedupeNearDuplicateUnits`) does not yet reference this set at all — see Common Pitfalls |

## Standard Stack

No new external packages are required for this phase. All work is internal application logic (TypeScript, existing Zod schemas, existing Vitest suite) inside a codebase that already has the relevant dependencies installed and pinned.

### Core (existing, no version changes needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.23.8 `[VERIFIED: server/package.json:22]` | Schema validation for `AnalysisUnitSchema`/`UnitOverlaySchema`/etc. | Already the schema layer for every touched type; codebase is deliberately pinned to v3-classic (see file-header note in analysis.ts) — do not introduce v4 syntax |
| @anthropic-ai/sdk | ^0.115.0 `[VERIFIED: server/package.json:15]` | LLM client interface shape (`AnalysisLLMClientV3`) | Existing structured-output plumbing; Phase 2 does not touch the SDK call itself, only prompt text and post-response merge logic |
| vitest | ^1.6.0 `[VERIFIED: server/package.json:29]` | Test runner | Existing suite; `server/test/analysisV3.test.ts` already has fixture patterns to extend |

### Package Legitimacy Audit

Not applicable — this phase introduces zero new third-party packages. `npm install` is not part of any Phase 2 plan.

## Where the Three Proof Bugs Actually Live (with exact seams)

All three bugs live inside `server/src/lib/analysis.ts` (1968 lines) and are reached only through `runAnalysisJobV3` (the only analysis entry point routes actually call — `runAnalysisJob`, the v2/pearls-only path, has no caller in `server/src/routes/analyze.ts` `[VERIFIED: server/src/routes/analyze.ts:11 — imports only runAnalysisJobV3, no runAnalysisJob]`). Do not extract chunking/merge into new files as a prerequisite for this phase — STATE.md's blocker note about the 1968-line size predates discovery that the specific functions needed are already small, already exported, and already independently testable in place. A pure-refactor extraction is not required to satisfy ANLZ-01/02/03 and would inflate this phase's diff for no functional gain; treat it as optional cleanup, not a dependency.

### ANLZ-01 — chunk-overlap dedup (Bug 3, twin DOSAGE cards)

**Status: implemented, `[VERIFIED: server/src/lib/analysis.ts:1694-1729]`.**

- `mergeUnitsByFingerprint` (`analysis.ts:1608-1662`) is the ORIGINAL label-fingerprint-only merge SPEC describes — unchanged, still the first pass.
- `dedupeNearDuplicateUnits` (`analysis.ts:1694-1729`) is the NEW second pass added by commit `468e0b8`. It collapses a pair of already-fingerprint-merged units only when **all three** hold: same final `type`, at least one shared anchor timestamp, and one unit's id-token set is a **proper subset** of the other's (`isProperSubset`, token-split on `-`). This is deliberately conservative — the commit's own test proves the adjacent MECHANISM pair from the real proof (`patient-triggering-via-negative-pressure` / `ac-mode-trigger-and-volume-delivery`) shares an anchor but is correctly NOT collapsed because neither token set is a subset of the other.
- Wired into `runAnalysisJobV3` at `analysis.ts:1923-1924`: `mergeUnitsByFingerprint` → `dedupeNearDuplicateUnits` → (scrub) → edges remapped through `remapEdgeAliases` (`analysis.ts:1732-1746`) using the alias map so edges/pearl `unitId`s never dangle after a collapse.
- Test coverage exists: `server/test/analysisV3.test.ts` (lines added by `468e0b8`) has 3 `describe` blocks (`dedupeNearDuplicateUnits`, `remapEdgeAliases`, `scrubOverlayToLens`) with fixtures reproducing the exact real-lecture pair, including a synthetic unit literally typed `DOSAGE` at the observed anchor `t=449`. `[VERIFIED: git show 468e0b8 -- server/test/analysisV3.test.ts]`

### ANLZ-03 — overlay-field discipline (Bug 5, lone `[""]` entries)

**Status: implemented, `[VERIFIED: server/src/lib/analysis.ts:1503-1537]`.**

- `mergeOverlayFields` (`analysis.ts:1503-1518`) already filters empty-string entries out of array-typed overlay fields (`.filter((v) => v.trim() !== "")`) and scalar fields already used `Boolean(v?.trim())` before the fix — this closes the literal `[""]` leak.
- `scrubOverlayToLens` (`analysis.ts:1528-1537`, new export) is the server-side enforcement of "only fill fields the active lens declared" — it strips any overlay key not present in `analysisLens.overlayFields` before persistence, collapsing an emptied overlay back to `undefined` (never persists `{}`).
- Wired at `analysis.ts:1927-1928`: `resolveLensOrGeneric(dataDir, domain)` resolves the SAME lens the chunk prompts used, then `scrubOverlayToLens(dedupedUnits, new Set(analysisLens.overlayFields.map(f => f.key)))`.
- Test coverage exists: `scrubOverlayToLens` describe block asserts stray `triggers`/`keyContext`/`entities` fields are stripped for the clinical lens's declared key set, and that an emptied overlay collapses to `undefined`.

### ANLZ-02 — ungrounded enrichment (Bug 6)

**Status: NOT implemented at the code level — genuinely new work.** `[VERIFIED: no `enrichment`/`grounded` field exists anywhere in AnalysisUnitSchema, UnitOverlaySchema, ChunkUnitRawSchema, or ChunkPearlV3Schema — grep across server/src/lib/*.ts confirms zero matches for grounded/enrichment/ungrounded outside comments]`

The only mitigation that exists is a prompt-text instruction added in the SAME commit as the ANLZ-01/03 fixes, inside `buildChunkV3SystemPrompt` (`analysis.ts:905`):

> "Every summary, body, and CLUSTER member body must be grounded in what THIS segment's transcript (or the supplied slide text) actually says — never import definitions, expansions, or facts from your own outside knowledge, even when you are confident they are correct. If the speaker only name-drops a term without explaining it, record that it was mentioned rather than supplying the missing explanation yourself."

There is no code path that verifies this instruction held, no schema field to record a "this content is enrichment, not lecture-derived" signal, and no UI element that would render such a signal even if it existed. The `evidence` field (`UnitEvidenceSchema`: `transcript`/`slides`/`both`) is the closest existing analog — it is a self-reported provenance signal, merged across chunk groups (`mergeEvidence`, `analysis.ts:1599-1606`), with a read-through default helper (`effectiveEvidence`, `analysis.ts:268-270`) — but note it is **never rendered in the web UI at all** `[VERIFIED: grep -rn "evidence" web/src/concepts/*.tsx web/src/study/*.tsx returns zero rendering call sites; only the type declaration at web/src/lib/types.ts:459]`. Reusing this exact pattern for enrichment is architecturally consistent but means Phase 2 would also be building the FIRST provenance badge the app has ever shipped — plan the UI work as net-new, not "add a badge next to the existing one."

**Recommended architecture (see Don't Hand-Roll):** add a self-reported field to the wire and final unit schemas (e.g. `enrichment: z.boolean().optional()` or extend `UnitEvidenceSchema` with a fourth value), instruct the chunk prompt to set it per-unit when the unit's content goes beyond what the anchored quote/slide text supports, aggregate at merge time with an OR-across-group rule (same as `threshold`, `analysis.ts:1656`: "never average away a signal — true if ANY unit in the group was flagged"), and render it as a visible badge/label in `UnitProposalCard.tsx` and in `compileRenderer.ts`'s unit rendering. This does NOT solve "does the LLM reliably self-report" (same open risk the overlay-field prompt instruction had), but it is the only mechanism consistent with this codebase's stated philosophy of preferring deterministic server-side checks over trusting prompts — pair it with something the SERVER can verify to raise confidence, e.g. flagging when the unit's anchors are the sparse-count case (a unit that cites only one very-short anchor quote but has a much longer body is a plausible enrichment heuristic worth exploring, though this needs its own design pass, not a copy-paste of the overlay-scrub pattern).

## Common Pitfalls

### Pitfall 1: Treating "the fix already exists" as "the phase is done"

**What goes wrong:** Planning a phase to build `dedupeNearDuplicateUnits`/`scrubOverlayToLens` from scratch, duplicating already-shipped, already-tested code, or worse, planning to REPLACE it and accidentally regressing the 92 passing tests in `analysisV3.test.ts`.
**Why it happens:** REQUIREMENTS.md, STATE.md, and ROADMAP.md were all authored 2026-08-09, one day after commit `468e0b8` landed (2026-08-08 19:01), and none of them were cross-checked against current `analysis.ts` content the way PIPE-01's provenance note was.
**How to avoid:** Plan Phase 2 as (1) an audit task confirming ANLZ-01/03 satisfy the phase's literal success criteria against the ACTUAL current code (not the bug report, which describes the PRE-fix state), (2) a net-new ANLZ-02 implementation task, (3) a safety-tier regression task (Pitfall 2 below), (4) test-coverage extension, not creation, for ANLZ-01/03.
**Warning signs:** A plan task titled "implement chunk-overlap-aware dedup" or "add scrubOverlayToLens" — these already exist; the task should be "verify X against SC-N" or "extend tests for X."

### Pitfall 2: SC4's safety-tier "never auto-merge" is NOT yet enforced in the new dedup pass

**What goes wrong:** Shipping Phase 2 believing SC4 ("DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION items never auto-merge") holds, when `dedupeNearDuplicateUnits` currently has ZERO awareness of unit type beyond requiring the pair to share the same type — it will happily collapse two DOSAGE units, and the codebase's own committed test proves this is intentional: the `dedupeNearDuplicateUnits` "collapses same-type units..." test fixture is explicitly typed `DOSAGE` (via the `finalUnit()` helper's default `type: "DOSAGE"`), modeling the exact real tidal-volume pair from the proof. `[VERIFIED: git show 468e0b8 -- server/test/analysisV3.test.ts — finalUnit() default type: "DOSAGE"]`
**Why it happens:** There are TWO separate "never auto-merge" mechanisms in this codebase and they answer different questions. `conceptRegistry.ts`'s `evaluateNewUnit` (`conceptRegistry.ts:152`, already implemented, already wired via `routes/analyze.ts:148-156`) blocks BOUNDARY/threshold/safetyTier units from auto-merging ACROSS PROJECTS (the cross-video concept registry, SPEC D3). `dedupeNearDuplicateUnits` is a DIFFERENT pass, WITHIN one analysis run, collapsing what is provably a re-emission of the SAME fact (same anchor timestamp + subset-token label match) — this is exactly what fixed Bug 3, and Bug 3's own duplicate pair WAS two DOSAGE units.
**How to avoid:** This is a genuine ambiguity requiring an explicit planning decision (flag it in discuss-phase or via `checkpoint:human-verify` if discuss-phase was skipped), not a silent implementation choice:
  - **Interpretation A (recommended, consistent with what already shipped and what fixed the real bug):** SC4 refers to the pre-existing `conceptRegistry.ts` cross-project invariant plus the UI's unconditional verbatim-quote display — both already implemented and unaffected by `dedupeNearDuplicateUnits`. Phase 2's job for SC4 is a REGRESSION test proving the registry's `safetyUnitTypes` guard and the UI's `isSafetyTierUnitType` verbatim-quote rendering both still function correctly on units that have passed through `dedupeNearDuplicateUnits` — not to prevent the intra-analysis collapse itself, since that collapse never rounds/paraphrases the safety-critical VALUE (it unions distinct anchors/quotes rather than averaging them, and picks the longer of the two summaries — see `analysis.ts:1714-1726`).
  - **Interpretation B (literal reading):** `dedupeNearDuplicateUnits` must exclude `BOUNDARY`/`threshold`/`safetyTier` types entirely, mirroring `conceptRegistry.ts`'s guard exactly — which would mean the ORIGINAL Bug 3 fix (the literal reason this pass was built) stops firing for DOSAGE units, reintroducing the twin-card bug for exactly the safety-critical case a nursing student would most need de-duplicated.
  These two readings are in direct tension and cannot both be satisfied literally. Surface this to the user/discuss-phase before planning locks in a merge-pass behavior change.
**Warning signs:** A plan task that adds a `safetyUnitTypes` exclusion to `dedupeNearDuplicateUnits` without first re-confirming whether Bug 3's actual duplicate pair (DOSAGE type) is intentionally exempted from re-collapsing.

### Pitfall 3: PRIORITIZATION is not actually in the safety tier set anywhere in the codebase

**What goes wrong:** Building SC4 verification/tests around all four types (DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION) as if they're symmetric, when the codebase consistently treats only three as safety-tier.
**Why it happens:** ROADMAP.md's SC4 text lists all four spine-level clinical unit types together. But `server/lenses/clinical.json`'s `safetyTier` field is `["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]` — PRIORITIZATION is excluded `[VERIFIED: server/lenses/clinical.json:16, read directly]`. `web/src/lib/safetyTier.ts`'s `SAFETY_TIER_UNIT_TYPES` mirrors the same three-item set `[VERIFIED: web/src/lib/safetyTier.ts:12, read directly]`. `conceptRegistry.ts`'s never-auto-merge guard reads `safetyUnitTypes` from the lens data, so it also only covers three types in practice.
**How to avoid:** Either (a) treat this as an intentional design choice — PRIORITIZATION is "nursing-judgment scenario" material, not an exact-value safety fact, so a merge affecting phrasing is lower-stakes than rounding a dosage — and write SC4 verification against the three ACTUAL safetyTier types plus a separate, lower-priority check that PRIORITIZATION units aren't silently corrupted either, or (b) flag to the user that `clinical.json`'s `safetyTier` array may need a fourth entry if PRIORITIZATION really should carry the same protection, before writing tests that assert behavior the lens data doesn't currently declare.
**Warning signs:** A test asserting `isSafetyTierUnitType("PRIORITIZATION") === true` — this will fail against current code and either needs the lens data changed (a locked-decision-adjacent choice) or the test's premise corrected.

### Pitfall 4: The v2 `runAnalysisJob` / `mergeOverlayFields` pattern looks parallel but is dead code for routes

**What goes wrong:** "Fixing" both `runAnalysisJob` (v2) and `runAnalysisJobV3` symmetrically, doubling the diff for no behavioral gain.
**Why it happens:** The file has two full analysis pipelines (v2 pearls/concepts-only, v3 typed spine) with genuinely parallel-looking merge functions.
**How to avoid:** `server/src/routes/analyze.ts` imports and calls ONLY `runAnalysisJobV3` `[VERIFIED: server/src/routes/analyze.ts:11]`. `runAnalysisJob` (v2) has no route caller — it exists for `AnalysisSchema`'s `version: 2` backward-compat reading path only (old analysis.json files on disk), not as a live generation path. Bugs 3/5/6 only manifest in v3-generated output (units/overlay only exist on v3). Scope all Phase 2 work to the v3 path.
**Warning signs:** A plan task touching `mergeOverlayFields`'s v2-only caller path, or `ChunkResultSchema`/`MergeResultSchema` (v2 wire shapes) instead of `ChunkV3ResultSchema`/`ChunkUnitRawSchema`.

### Pitfall 5: Zod v3/v4 SDK barrier applies to any new schema fields too

**What goes wrong:** Adding a new field to `AnalysisUnitSchema`/`ChunkUnitRawSchema` (e.g. an `enrichment` field for ANLZ-02) using zod v4 syntax or importing `zodOutputFormat()`/`client.messages.parse()` from the SDK, which breaks the deliberate manual-JSON-schema + hand-validate path this file uses everywhere else.
**Why it happens:** The Anthropic SDK internally imports `zod/v4`; this repo pins `zod@^3.23.8` (v3-classic) everywhere. Mixing them is documented in the file header (`analysis.ts:1-30`) and CONCERNS.md as an active, permanent-for-now barrier.
**How to avoid:** Any new field must be added the same way every existing field was: (1) a `z.object({...})` field using v3-classic zod syntax, (2) a matching hand-written entry in the relevant `*_JSON_SCHEMA` const (`CHUNK_JSON_SCHEMA`/`MERGE_JSON_SCHEMA` equivalents for the V3 unit schema — search for where `ChunkUnitRawSchema`'s wire shape gets a JSON-schema mirror, likely near `UNIT_ANCHOR_JSON_SCHEMA`/`CLUSTER_MEMBER_JSON_SCHEMA` at `analysis.ts:649-668`), still going through `output_config.format` + manual `.safeParse()`, never `client.messages.parse()`.
**Warning signs:** Any import of `zodOutputFormat` or a v4-style `z.toJSONSchema()` call anywhere in a Phase 2 diff.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting "this LLM output wasn't actually said in the source" | A grounding-verification subsystem (embedding similarity, NLI/entailment check, or a second LLM call auditing the first) | A self-reported boolean/enum field on the unit, following the EXACT pattern `evidence`/`threshold` already use: chunk-level self-report -> OR-across-group merge -> visible UI marking | The codebase's own architecture explicitly avoids embeddings/ML even where it would plausibly help (`conceptRegistry.ts`'s D3 fingerprint match is "no embeddings" by SPEC mandate); a second grounding-verification LLM call would double per-chunk cost and introduce a new async failure mode this file's error-handling philosophy ("skip with warning, never abort") wasn't designed around for a THIRD call type |
| Deciding whether two units are "the same fact" across chunk overlap | A semantic-similarity/embedding merge | The existing `dedupeNearDuplicateUnits` conservative rule (same type + shared anchor timestamp + proper-subset label tokens) | This is already built, tested, and deliberately narrow to avoid false-positive merges (verified against the real MECHANISM near-miss pair) — extending its precision (if needed) should tighten/loosen the existing token-subset rule, not replace it with a new similarity metric |
| Verifying overlay-field discipline | A new validation layer parallel to `scrubOverlayToLens` | `scrubOverlayToLens` itself, already lens-aware and already the single source of truth for "which overlay keys survive to disk" | One enforcement point; a second one risks the two disagreeing on edge cases (e.g. a lens with zero declared overlayFields) |

**Key insight:** This phase's biggest risk is NOT "the merge logic is hard to write" — it already exists and is tested. The risk is (1) not noticing it exists and re-deriving it with new bugs, and (2) the one genuinely unsolved problem (ANLZ-02) tempting a heavier-weight solution (semantic verification) than the codebase's established, lighter-weight self-report pattern.

## Code Examples

### Pattern to follow for ANLZ-02's self-report field (modeled on the existing `threshold` merge rule)

```typescript
// Source: server/src/lib/analysis.ts:1656 (existing, read directly)
// "never average away a threshold signal" — the aggregation rule ANLZ-02's
// new field should copy verbatim, substituting the new field name.
threshold: group.some((g) => g.threshold === true),
```

### Pattern to follow for ANLZ-02's merge aggregation (modeled on `mergeEvidence`)

```typescript
// Source: server/src/lib/analysis.ts:1599-1606 (existing, read directly)
// mergeEvidence's shape is the closest analog to a hypothetical mergeEnrichment:
// self-reported per-chunk field -> OR/priority-combine across the fingerprint
// group -> undefined (not a default value) when nobody ever set it.
function mergeEvidence(group: readonly { evidence?: UnitEvidence }[]): UnitEvidence | undefined {
  const values = group.map((g) => g.evidence).filter((v): v is UnitEvidence => v !== undefined);
  if (values.length === 0) return undefined;
  const hasSlides = values.some((v) => v === "slides" || v === "both");
  const hasTranscript = values.some((v) => v === "transcript" || v === "both");
  if (hasSlides && hasTranscript) return "both";
  return hasSlides ? "slides" : "transcript";
}
```

### The existing near-duplicate collapse rule (ANLZ-01, already shipped — reference for auditing, not rewriting)

```typescript
// Source: server/src/lib/analysis.ts:1694-1729 (existing, read directly)
export function dedupeNearDuplicateUnits(units: readonly AnalysisUnit[]): { units: AnalysisUnit[]; aliases: Map<string, string> } {
  const tokensOf = (id: string) => new Set(id.split("-").filter(Boolean));
  const isProperSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size < b.size && [...a].every((t) => b.has(t));
  // ... groups by (same type + shared anchor t + proper-subset label tokens);
  // absorbed unit contributes anchors, longer summary/body, threshold OR, evidence merge.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Label-fingerprint-only dedup (`mergeUnitsByFingerprint` alone) | Fingerprint dedup + anchor-time-aware near-duplicate collapse (`dedupeNearDuplicateUnits`) | 2026-08-08, commit `468e0b8` | Bug 3's literal duplicate pair no longer survives — but see Pitfall 2 (safety-tier interaction unresolved) |
| Prompt-only "leave the rest empty" instruction for overlay fields | Server-side `scrubOverlayToLens` enforcement + empty-string array filtering | 2026-08-08, commit `468e0b8` | Bug 5's `[""]` leak and cross-domain overlay leakage are closed |
| No enrichment signal at all | Prompt-only "must be grounded" instruction (unenforced) | 2026-08-08, commit `468e0b8` | Bug 6 is NOT closed — the instruction is the same category of fix ("prompt alone") the commit's OWN reasoning says doesn't hold for overlay fields |

**Deprecated/outdated:** The REQUIREMENTS.md/STATE.md/ROADMAP.md text describing ANLZ-01/ANLZ-03 as unstarted work is one day stale against the actual repository state as of this research date (2026-08-09). Do not treat those documents' problem descriptions as the current implementation status — treat `docs/REAL-LECTURE-PROOF-2026-08-08.md`'s bug list as the historical PRE-fix evidence, and `server/src/lib/analysis.ts` (read directly, this session) as the current-state source of truth.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SC4 ("safety tier never auto-merges") refers to the pre-existing `conceptRegistry.ts` cross-project invariant, not a new restriction on `dedupeNearDuplicateUnits` (Interpretation A in Pitfall 2) | Common Pitfalls, Pitfall 2 | If wrong, Phase 2 must add a safety-tier exclusion to `dedupeNearDuplicateUnits`, which would reintroduce Bug 3 for the exact DOSAGE case the fix was built for — this needs explicit user sign-off before planning locks in either direction |
| A2 | PRIORITIZATION's absence from `clinical.json`'s `safetyTier` array is intentional (nursing-judgment/scenario material is lower-stakes than an exact dosage/lab value), not an oversight | Common Pitfalls, Pitfall 3 | If wrong, `clinical.json` needs a data edit (adding `"PRIORITIZATION"` to `safetyTier`) before SC4 can be literally satisfied for all four types named in the roadmap text |
| A3 | Success criterion 1 ("re-analyzing the proof lecture yields no near-duplicate units") is satisfiable via extended fixture-based unit tests (deterministic, no LLM call) rather than requiring a live re-analysis against a real LLM during Phase 2 — the full live re-proof is Phase 4's explicit job | Validation Architecture | If wrong, Phase 2 needs a `checkpoint:human-verify` task gating a real `POST /api/projects/:id/analyze` call against the stored proof project (`/Users/antemo/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1/`, transcript already on disk as `captions.json`) with a real Anthropic/GLM key, which is slower and non-deterministic for CI |
| A4 | The recommended architecture for ANLZ-02 (self-reported field + OR-merge + UI badge) is sufficient to satisfy "visibly marked as enrichment or suppressed" even though it does not verify the LLM's self-report against ground truth | Where the Three Proof Bugs Actually Live — ANLZ-02 | If wrong (i.e. the phase actually needs verified, not just self-reported, grounding), this is a materially larger scope — a second LLM verification call or a text-matching heuristic against transcript/slide text — and should be raised with the user before committing to the lighter design |

## Open Questions

1. **Does SC4 forbid `dedupeNearDuplicateUnits` from ever collapsing two safety-tier units, or does it only require the pre-existing cross-project/UI protections to keep working?**
   - What we know: The shipped fix's own test fixture explicitly types the duplicate-pair example as DOSAGE and expects a collapse — i.e., the people who wrote the fix believed collapsing DOSAGE duplicates was correct and desired.
   - What's unclear: Whether ROADMAP.md's SC4 wording, written the next day, intended to add a NEW restriction on top of that.
   - Recommendation: Surface to the user (or lock via `discuss-phase`/a `checkpoint:human-verify`) before the plan finalizes merge-pass behavior for safety-tier types. Default recommendation if no answer is available: keep current behavior (Interpretation A) and add regression tests proving values are never rounded/paraphrased away during collapse (anchors are unioned, not averaged) — this is the reading most consistent with what's already shipped and tested.

2. **Should PRIORITIZATION be added to `clinical.json`'s `safetyTier` array?**
   - What we know: The roadmap groups it with DOSAGE/CONTRAINDICATION/LAB_VALUE; the codebase's `unitTypeEmphasis` prompt text also groups it with those three as "nursing-judgment material," but explicitly notes it uses a DIFFERENT question style (scenario/options, per `cardTransform.ts:100-102`) rather than the "exact value" style DOSAGE/LAB_VALUE get.
   - What's unclear: Whether PRIORITIZATION's exclusion from `safetyTier` was a deliberate distinction (scenario-judgment vs. exact-value-recall) or an oversight from Phase 5's original lens-registry work.
   - Recommendation: Treat as a data-only decision if the answer is "add it" (single-line change to `clinical.json` plus the `safetyUnitTypes` set already reads from lens data dynamically, so no code change needed) — low risk either way, but confirm before writing a test that asserts the current (three-item) behavior is wrong.

## Environment Availability

Not applicable — this phase touches only existing in-repo TypeScript/Zod logic and its existing Vitest suite. No new external tool, service, or runtime dependency is introduced. `STUDYLOOP_FAKE_ANALYSIS=1` (existing deterministic fake LLM client) and the existing `__setAnalysisClientV3ForTests` injection seam are both already available and sufficient for all Phase 2 test needs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 `[VERIFIED: server/package.json:29]` |
| Config file | `server/vitest.config.ts` |
| Quick run command | `npm run test -w server -- analysisV3` |
| Full suite command | `npm test` (root, runs server + web workspaces) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLZ-01 | `dedupeNearDuplicateUnits` collapses the exact real-lecture DOSAGE pair, keeps genuinely distinct neighbors apart, handles disjoint anchors/different types | unit | `npm run test -w server -- analysisV3 -t "dedupeNearDuplicateUnits"` | ✅ exists (`server/test/analysisV3.test.ts`, added by 468e0b8) — Phase 2 extends, doesn't create |
| ANLZ-01 (SC4 gap) | Safety-tier units surviving `dedupeNearDuplicateUnits` still trip `conceptRegistry.ts`'s never-auto-merge guard and `isSafetyTierUnitType` verbatim-quote rendering unaffected | unit + integration | new test in `server/test/conceptRegistry.test.ts` and `web/src/lib/safetyTier.test.ts` (both exist, extend) | ✅ Wave 0: extend, not create |
| ANLZ-02 | New `enrichment`-style field self-reported, merged (OR-across-group), persisted, and rendered visibly (not silently dropped, not silently shown as fact) | unit + component | new `describe` block in `analysisV3.test.ts` for the merge function; new test in `web/src/concepts/UnitProposalCard.test.tsx` (check if this file exists — component test coverage for this file was NOT confirmed this session) | ❌ Wave 0 — schema/merge test net-new; UI component test file existence unconfirmed, verify before planning assumes it exists |
| ANLZ-03 | `scrubOverlayToLens` strips undeclared keys; `mergeOverlayFields` filters empty-string array entries; no `[""]` survives to a persisted `analysis.json` | unit | `npm run test -w server -- analysisV3 -t "scrubOverlayToLens"` | ✅ exists — Phase 2 extends, doesn't create |

### Sampling Rate
- **Per task commit:** `npm run test -w server -- analysisV3` (fast, ~92 existing tests plus new additions, no network)
- **Per wave merge:** `npm test` (root full suite — 980+ server / 352+ web tests as of Phase 1's verified baseline)
- **Phase gate:** Full suite green before `/gsd-verify-work`; a live `STUDYLOOP_FAKE_ANALYSIS=0` re-analysis against the stored proof-lecture transcript is OPTIONAL (budget-permitting spot check), not a hard gate — the full live re-proof is Phase 4's job (see Assumption A3)

### Wave 0 Gaps
- [ ] Confirm whether `web/src/concepts/UnitProposalCard.test.tsx` exists before planning an ANLZ-02 UI-badge test task (not confirmed this session — check with `ls web/src/concepts/*.test.tsx`)
- [ ] `server/test/conceptRegistry.test.ts` — confirm it currently exercises `safetyUnitTypes` at all (existing file, not read this session; the `never-auto-merge BOUNDARY-typed or threshold-flagged` header comment suggests it does, but the safety-tier extension specifically needs a dedicated assertion)
- [ ] No new fixture files needed — all three ANLZ items are pure-function unit tests against synthetic `AnalysisUnit`/`ChunkUnitRaw` objects, following the existing `finalUnit()` factory pattern in `analysisV3.test.ts`

## Security Domain

Not applicable in the ASVS sense — this phase has no new input validation surface (no new route, no new user-facing input field), no auth/session change, and no cryptography. The one relevant STRIDE-adjacent concern is data-integrity, already covered under Pitfall 2/Common Pitfalls (safety-critical value corruption via over-eager merging) rather than a traditional security control.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Indirectly | Existing Zod schemas (`AnalysisUnitSchema`, `ChunkUnitRawSchema`) already validate any new field the same way as existing ones — no new validation pattern needed |

## Sources

### Primary (HIGH confidence — read directly this session)
- `server/src/lib/analysis.ts` (full read of lines 1-670, 1471-1968) — schema definitions, chunking, merge functions, `runAnalysisJobV3` wiring
- `server/src/lib/conceptRegistry.ts` (lines 1-160) — cross-project never-auto-merge invariant
- `web/src/lib/safetyTier.ts`, `web/src/concepts/UnitProposalCard.tsx` (lines 1-60, 270-310) — client-side safety-tier UI
- `server/lenses/clinical.json` — safetyTier data, overlayFields
- `git show 468e0b8` (full diff: `analysis.ts`, `compileRenderer.ts`, `analysisV3.test.ts`) — the already-shipped fix commit
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `docs/REAL-LECTURE-PROOF-2026-08-08.md`, `.planning/intel/context.md`, `.planning/intel/constraints.md`, `.planning/codebase/{ARCHITECTURE,CONCERNS,TESTING}.md`, `.planning/phases/01-ingestion-pipeline-repair/01-VERIFICATION.md`
- GitNexus symbol query (`node .gitnexus/run.cjs context "mergeUnitsByFingerprint" --repo studyloop`) — confirmed call graph and line ranges

### Secondary (MEDIUM confidence)
- None — this research required no external documentation lookup; the entire domain is in-repo application logic.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, versions read directly from `package.json`
- Architecture: HIGH — every claim traced to a specific file/line read this session, cross-checked against git history and GitNexus's call graph
- Pitfalls: HIGH for what's documented (all traced to source); MEDIUM for the SC4 interpretation question (A1) since it depends on intent not yet confirmed by the user

**Research date:** 2026-08-09
**Valid until:** Should be re-verified if `.planning/` documents are regenerated or if any further commits land on `server/src/lib/analysis.ts` before Phase 2 planning begins — the core finding of this research (ANLZ-01/03 already shipped) is a snapshot of `main` at commit `468e0b8` and later; a `git log --oneline -5 -- server/src/lib/analysis.ts` re-check at plan time is cheap insurance.
