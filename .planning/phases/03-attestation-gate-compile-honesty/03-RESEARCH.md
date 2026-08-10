# Phase 3: Attestation Gate & Compile Honesty - Research

**Researched:** 2026-08-10
**Domain:** Local Node/TypeScript monorepo (Fastify server + React/Vite web), file-based persistence, spaced-repetition review scheduling, markdown compile rendering
**Confidence:** HIGH

## Summary

This phase's roadmap description assumes GATE-01, COMP-01, and COMP-02 are open implementation problems. **They are not.** Direct source reading (not grep — full `Read` of every file cited below) shows that the un-attested pearl review-card channel was already closed in commit `813dc21` (2026-07-29, `fix: codex V3 wave review (scores, caches, races, pedagogy gating)`), and the compile "Dismissed" section plus clickable pearl/unit timestamp links were already shipped in commit `468e0b8` (2026-08-08, `Quality fixes from the real-lecture proof verifiers`). Both commits predate this GSD milestone's `REQUIREMENTS.md` (authored 2026-08-09) and both already carry passing regression tests. This is the same "already-fixed-pre-ingest" pattern documented in `REQUIREMENTS.md`'s PIPE-01 provenance note for Phase 1 — it recurs here for three of this phase's four requirements.

`GATE-02` is the one requirement with genuine remaining work: `SPEC.md`'s F11 "Cards" section (lines 467-476, specifically 472-473) and V3-B "B4. Review-loop upgrades" section (lines 659-673, specifically 664-665) still describe the pre-gating pearl-card contract with no mention of the attestation/explicit-add gate that has been live in code for two weeks. The build contract is stale relative to the codebase; the fix is a documentation edit, not a behavior change, and SPEC.md already has a precedent format for this exact situation (F11's own "Implementation notes (deviations from the literal wording above)" subsection at lines 489-501).

**Primary recommendation:** Plan this phase as verification-plus-documentation, not new feature work. (1) Read and re-run the existing test suites covering `deriveLiveCards`/`buildReviewQueue` (server/test/review.test.ts) and `renderAnalysisUnitsV3`/`renderAnalysisPearls` (server/test/compile.test.ts) to confirm SC1/SC2/SC4/SC5 are already true of the shipped code; add any missing edge-case regression coverage the audit turns up (see Open Questions). (2) Write the SPEC.md F11 + V3-B edits for SC3/GATE-02, following the existing "Implementation notes" deviation-callout convention. (3) Update REQUIREMENTS.md's GATE-01/COMP-01/COMP-02 checkboxes to `[x]` with a provenance note citing the commit hashes, mirroring PIPE-01's precedent. Do not write new attestation-mutation or review-scheduling code — none is needed, and STATE.md's standing concern about the web store's optimistic-no-rollback attestation pattern (`web/src/state/store.ts:1565-1589`) means any *new* touch to that code path should not deepen it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pearl/unit review-card gating (attestation check) | API / Backend (`server/src/lib/review.ts`, `attestation.ts`) | — | Pure derivation logic, dependency-free, unit-tested in isolation; server is the single source of truth for what enters the queue |
| review.json scheduling state + migration/orphan-drop | API / Backend (`server/src/lib/review.ts`, `reviewStore.ts`) | Database / Storage (file: `<dataDir>/review.json`) | Server owns the SM-2-lite ladder math and the orphan-vs-kept migration rule; storage is a flat JSON file with an atomic-write + global mutex, no separate persistence tier |
| Explicit pearl "Add to review" learner action | Browser / Client (`AnalysisSections.tsx` button) | API / Backend (`routes/pearlReview.ts`, `pearlReviewStore.ts`) | UI captures the learner-touch signal; server persists it per-project as the durable gate input |
| Compiled document rendering (Dismissed section, clickable anchors) | API / Backend (`server/src/lib/compileRenderer.ts`) | — | Compile is a server-side markdown renderer invoked via `POST /api/projects/:id/compile`; no client-side rendering of the exported doc |
| SPEC.md build-contract text | N/A (documentation, not a runtime tier) | — | Doc-only edit; no architectural tier owns it |

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new dependencies — every requirement (GATE-01, GATE-02, COMP-01, COMP-02) is satisfied by existing code, existing tests, or a documentation edit. `npm ls` was not run because no `package.json` changes are anticipated by any plan this research would produce. If a plan surfaces a genuine new-package need during planning, re-run the Package Legitimacy Gate at that time.

## Standard Stack

No new libraries. Existing stack (verified via `server/package.json`, `Node -v` on this machine):

| Library | Version (installed) | Purpose | Confidence |
|---------|---------|---------|--------------|
| Fastify | ^4.28.1 | Server routing | [VERIFIED: server/package.json] |
| Zod | ^3.23.8 | Request/state validation (review.json, attestations.json schemas) | [VERIFIED: server/package.json] |
| Vitest | ^1.6.0 | Unit/integration test runner | [VERIFIED: server/package.json] |
| Node.js | v22.23.1 (this machine) | Runtime | [VERIFIED: `node -v` on dev machine] |

## Architecture Patterns

### System Architecture Diagram

```
Learner action (browser)
  │
  ├─► [Attest / Dismiss / userTake on a unit]  (StudyView → AnalysisSections/UnitProposalCard)
  │        │
  │        ▼
  │   PATCH /api/projects/:id/attestations/:unitId
  │        │
  │        ▼
  │   attestationStore.ts writes <project>/attestations.json  {[unitId]: {status, userTake?, userBody?, at}}
  │
  ├─► [click "Add to review" on a pearl]  (AnalysisSections.tsx)
  │        │
  │        ▼
  │   POST /api/projects/:id/pearls/:t/review-add
  │        │
  │        ▼
  │   pearlReviewStore.ts writes <project>/pearlReviewAdds.json  (Set<string> keyed by pearlReviewKey(t))
  │
  ▼
GET /api/review/queue  (routes/review.ts → loadLiveCards)
  │  reads, per project: bubbles.json, analysis.json, attestations.json, pearlReviewAdds.json
  ▼
lib/review.ts:deriveLiveCards(project, bubbles, analysis, stubVisible, attestations, pearlReviewAdds)
  │  GATE: a pearl becomes a candidate card iff
  │    (a) pearl.unitId links to a unit where isUnitFeedable(attestations[unitId]) === true, OR
  │    (b) pearlReviewAdds.has(pearlReviewKey(pearl.t))   [explicit learner touch]
  │  a v3 unit becomes a candidate "generation" card iff isUnitFeedable(attestations[unit.id])
  ▼
lib/review.ts:buildReviewQueue(liveCards, priorState, nowMs)
  │  joins live (gate-passing) cards against persisted <dataDir>/review.json scheduling state
  │  - orphan drop: a tracked card no longer in liveIds is dropped from state...
  │  - MIGRATION EXCEPTION: ...unless it's a `pearl:` card with reps > 0 (real progress) — kept in
  │    `cards` state (mastery count unaffected) but NEVER re-enters dueCards (it's not in liveCards),
  │    i.e. "suspended", exactly matching SC2's "dropped or suspended" language
  │  - introduces newly-live cards up to the 20/day cap
  ▼
review.json (atomic write + global mutex, via reviewStore.ts)
  │
  ▼
ReviewView.tsx renders the due queue — only cards that survived the gate above ever appear here


POST /api/projects/:id/compile  (routes/compile.ts)
  ▼
lib/compileRenderer.ts:renderCompiledDocument(input)
  │  renderAnalysisUnitsV3: partitions units into
  │    attested   → isUnitFeedable(attestations[u.id])
  │    dismissed  → !feedable && attestations[u.id]?.status === "dismissed"   → "### Dismissed"
  │    notYet     → !feedable && status !== "dismissed"                       → "### Not yet reviewed"
  │  timestampLink(seconds) → `[mm:ss](#t=N)` used for EVERY anchor in Pearls + Concept breakdown,
  │    same convention renderNotesTokens already used for `^t:` note tokens
  ▼
exports/study-<date>.md
```

### Recommended Project Structure

No new files/folders. Touch points for this phase's actual (documentation) work:

```
SPEC.md                                    # GATE-02: edit F11 "Cards" + V3-B "B4" sections
.planning/REQUIREMENTS.md                  # flip GATE-01/COMP-01/COMP-02 to [x] with provenance notes
.planning/phases/03-.../03-PLAN*.md        # plan(s) documenting the verify-and-audit work + SPEC.md edit
server/test/review.test.ts                 # (if audit finds a gap) additional regression case(s)
server/test/compile.test.ts                # (if audit finds a gap) additional regression case(s)
```

### Pattern 1: Gate-then-schedule separation (`lib/review.ts`)

**What:** `deriveLiveCards()` is the *gate* (pure function: given attestations + explicit-add state, which cards are even eligible to exist right now); `buildReviewQueue()` is the *scheduler* (joins eligible cards against persisted SM-2-lite state, handles orphan-drop/migration/new-card cap). The two are deliberately separate pure functions with no I/O — `routes/review.ts` is the only place that touches disk.
**When to use:** Any future work that needs to know "is X reviewable" should call `isUnitFeedable()` (from `lib/attestation.ts`) directly, not re-derive attestation logic inline. `compileRenderer.ts` already does this correctly.
**Example (verbatim from server/src/lib/review.ts:298-303, read this session):**
```typescript
const analysisVisible = analysis !== null && (analysis.source === "model" || (analysis.source === "stub" && stubAnalysesVisible));
if (analysisVisible && analysis) {
  for (const p of analysis.pearls) {
    const linkedUnitFeedable = p.unitId !== undefined && isUnitFeedable(attestations[p.unitId]);
    const explicitlyAdded = pearlReviewAdds.has(pearlReviewKey(p.t));
    if (!linkedUnitFeedable && !explicitlyAdded) continue;
```

### Pattern 2: "corruption never throws, rebuild empty" (file-store convention)

**What:** Every dataDir/project-level JSON store (`reviewStore.ts`, `attestationStore.ts`, `pearlReviewStore.ts`) follows the identical shape: `readJsonIfExists` → try/catch around parse → `.safeParse()` against a Zod schema → on any failure, return an empty default rather than throwing.
**When to use:** If GATE-01's audit surfaces a need for an additional store or schema migration, follow this exact pattern rather than inventing a new one.
**Example (verbatim from server/src/lib/reviewStore.ts:21-31, read this session):**
```typescript
export async function readReviewState(dataDir: string): Promise<ReviewState> {
  let raw: unknown;
  try {
    raw = await readJsonIfExists<unknown>(reviewJsonPath(dataDir));
  } catch {
    return emptyReviewState();
  }
  if (raw === null) return emptyReviewState();
  const parsed = ReviewStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyReviewState();
}
```

### Pattern 3: Server/web copy mirroring (not cross-workspace import)

**What:** `compileRenderer.ts`'s `ENRICHMENT_NOTE` constant is intentionally a hand-copied, character-identical duplicate of `web/src/lib/enrichment.ts`'s `ENRICHMENT_NOTICE_TEXT` — server and web are separate npm workspaces with no shared runtime module. A dedicated test asserts the two strings match.
**When to use:** If GATE-02's SPEC.md edit needs to describe any UI-facing copy (e.g. the "Add to review" button label), quote it verbatim from `AnalysisSections.tsx` rather than paraphrasing, and don't invent a shared-constants module that doesn't exist in this codebase's conventions.

### Anti-Patterns to Avoid

- **Deepening the optimistic-no-rollback attestation pattern:** `web/src/state/store.ts:1565-1589` (`attestUnit`, `saveUnitTake`, etc.) updates local Zustand state before the API call resolves, with no rollback on failure — a documented, accepted concern in `.planning/codebase/CONCERNS.md` and explicitly flagged in `.planning/STATE.md`'s Blockers as something "Phase 3 work touching attestation flows must not deepen." Since this phase's actual work does not require touching that code path, the safest plan is to not touch it at all.
- **Re-deriving attestation/gating logic inline:** Don't write a new "is this pearl reviewable" check anywhere outside `lib/review.ts`'s `deriveLiveCards` — `routes/reviewExport.ts` (CSV export) and `routes/compile.ts` both correctly reuse the shared `isUnitFeedable`/`deriveLiveCards`/`buildReviewQueue` functions; any new surface should do the same.
- **Treating "SPEC.md says X" as ground truth without checking code:** This phase is proof that SPEC.md can be stale relative to shipped behavior by weeks. Before writing any GATE-02 edit, re-verify against the current file state (grep `git log -1` for last-touch date) rather than trusting the constraints.md synthesis alone — SPEC.md itself may have moved between the doc-ingest run (2026-08-09) and phase execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Is this unit's content allowed into review/compile?" | A new gating predicate | `isUnitFeedable()` from `server/src/lib/attestation.ts` | Already handles dismissed-always-wins, attested-status, and bare-userTake cases; used identically by review, compile, and CSV export — a second implementation would drift |
| Pearl review-card eligibility | A new pearl-gate check | `deriveLiveCards()`'s existing `linkedUnitFeedable || explicitlyAdded` logic (`server/src/lib/review.ts:298-317`) | Already covers both ADR-PED-02 paths (attested-unit link, explicit learner touch) and is regression-tested |
| Legacy/un-gated review.json cleanup | A one-off migration script | `buildReviewQueue()`'s existing orphan-drop + pearl-reps-exception logic, which already runs on every `GET /api/review/queue` call and has been running since 2026-07-29 | The "migration" already happened continuously in production since the gate landed; no batch script is needed or safe to add (would risk double-processing) |

**Key insight:** Every review/compile capability this phase's success criteria describe already has exactly one canonical implementation in this codebase, reused everywhere it's needed. The risk in this phase is not missing logic — it's a planner assuming logic is missing and duplicating it, or overwriting stale-but-harmless SPEC.md prose with a rewrite that accidentally changes described behavior instead of just documenting the gate.

## Runtime State Inventory

This phase is not a rename/refactor/migration phase in the traditional sense (no renamed identifiers), but SC2 explicitly asks about `review.json` migration safety, so this inventory answers the canonical question directly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `<dataDir>/review.json` (`ReviewStateSchema`: `{version:1, cards:{...}, streak?, transformed?}`) is dataDir-wide (not per-project); may contain `pearl:<projectId>:<t>` card ids introduced before the 2026-07-29 gating fix. | None — `buildReviewQueue`'s orphan-drop + reps>0 exception (in production since 2026-07-29) already migrates these on every queue read: reps===0 legacy pearls are silently dropped, reps>0 legacy pearls are kept in `cards` (protecting mastery count) but permanently excluded from `dueCards` since they're absent from `liveCards`. **No batch migration script needed or should be written** — writing one risks double-processing state that's already been migrating continuously for two weeks. |
| Live service config | None found. review.json is the only relevant "live config"; not an external service. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None. `STUDYLOOP_FAKE_ANALYSIS` env var gates dev-mode stub-analysis visibility in review (`stubAnalysesVisible()` in `routes/review.ts:45-47`) — unrelated to attestation, unaffected by this phase. | None |
| Build artifacts / installed packages | None. | None |
| **Real user data risk (flagged in task brief)** | Ryan's actual `~/.studyloop/... /review.json` (or wherever his real `dataDir` points) has real cards due (12+, per task brief) and has been live-migrating on every app open since the 2026-07-29 gating commit. It is NOT a fixture and should never be read/written by any test. | Any regression test this phase adds MUST construct its own in-memory `ReviewState` fixture (as `server/test/review.test.ts` already does — see `describe("buildReviewQueue — orphan dropping")`, lines 321-374) or use a disposable temp `dataDir`, exactly like `server/test/reviewStore.test.ts` does (`beforeEach`/`afterEach` with a temp directory). Never point a test's `dataDir` at the real `~/.studyloop` or `~/StudyLoopData` path. |

## Common Pitfalls

### Pitfall 1: Assuming the roadmap's phase description reflects current code state
**What goes wrong:** A planner reads "Phase 3: Attestation Gate & Compile Honesty" and its five success criteria and plans four waves of new feature work (build a gate, write a migration script, add a Dismissed section, add clickable links) — duplicating ~500 lines of already-shipped, already-tested logic, and risking behavior regressions in code that currently passes.
**Why it happens:** `ROADMAP.md`, `REQUIREMENTS.md`, and `PROJECT.md` were all authored 2026-08-09 from a doc-ingest process that read `SPEC.md`/`docs/PRD.md`/the proof report — none of which re-read the actual `server/src/lib/*.ts` files line-by-line. The proof report (`docs/REAL-LECTURE-PROOF-2026-08-08.md`) genuinely found Bug 4 (dismissed-vs-not-yet-reviewed) and Bug 7 (non-clickable timestamps) on 2026-08-08 — but both were fixed same-day in commit `468e0b8`, before the proof report's own "what must be fixed" list was even read by the ingest process the next day. GATE-01's gate itself is older still (2026-07-29), predating the proof entirely — the proof's Bug list never mentioned it because it was already fixed by then.
**How to avoid:** Before planning any phase in this milestone, `git log --oneline -1 -- <file>` on every file the phase's requirements cite, and `Read` the current file content — not just the requirements doc's characterization of it.
**Warning signs:** A requirement's cited "fix site" (e.g. `compileRenderer.ts:91-110`) has different line numbers or different logic than described when you actually open the file.

### Pitfall 2: Treating "explicit Add to review" as equivalent to attestation without checking ADR wording
**What goes wrong:** SC1 requires pearls to enter review "only after the learner has attested or touched the source material." The shipped gate's path (b) — clicking "Add to review" on a pearl — is a *different* learner action than attesting the pearl's underlying unit. It is unambiguously a learner-initiated action (not passive AI output), which satisfies ADR-PED-02's "learner-touched" language, but a planner writing GATE-02's SPEC.md text should describe this path accurately (an explicit opt-in add, not an "attestation") rather than conflating the two, since SPEC.md's own B2 section already distinguishes "Attest" from other actions precisely.
**Why it happens:** The phrase "attested or learner-touched" is doing real work in ADR-PED-02 — it's two categories, and the pearl gate's path (b) is squarely the second one, not the first.
**How to avoid:** When writing the GATE-02 SPEC.md edit, describe both gate paths explicitly and accurately (unit-attestation link vs. explicit add), matching the code comment at `server/src/lib/review.ts:263-272` (read this session) rather than compressing to one sentence.
**Warning signs:** SPEC.md text says "gated on attestation" without mentioning the explicit-add path, which would make the doc inaccurate in the other direction.

### Pitfall 3: Writing a "migration" plan/task when none is needed
**What goes wrong:** SC2's wording ("existing review.json state migrates safely") reads like a one-time data migration is required. Writing one (a script, a startup hook, a version-bump handler) when the continuous per-request migration already in `buildReviewQueue` has been running since 2026-07-29 risks either double-processing state or introducing a new code path that has to be kept in sync with the existing one.
**Why it happens:** SC2's phrasing was very likely written against the *hypothetical* pre-fix codebase the ingest process imagined, not the actual shipped one.
**How to avoid:** Confirm via `server/test/review.test.ts` lines 348-374 (`"keeps a no-longer-live pearl card's scheduling state when it has reps > 0..."`, `"drops a no-longer-live pearl card with reps === 0..."`) that this is already tested, then treat SC2 as **already satisfied**, needing only a verification note (or one additional edge-case test if the audit finds a real gap — see Open Questions).
**Warning signs:** A plan task titled "write review.json migration script" or "add a schema version bump for review.json."

## Code Examples

### Gate check used identically across review, export, and compile

```typescript
// Source: server/src/lib/attestation.ts:65-71 (read this session)
export function isUnitFeedable(entry: AttestationEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.status === "dismissed") return false;
  if (entry.status === "attested") return true;
  return Boolean(entry.userTake?.trim());
}
```

### Dismissed-vs-not-yet-reviewed partition (already shipped, COMP-01)

```typescript
// Source: server/src/lib/compileRenderer.ts:105-137 (read this session)
function renderAnalysisUnitsV3(units: readonly AnalysisUnit[], attestations: AttestationsFile): string {
  const attested = units.filter((u) => isUnitFeedable(attestations[u.id]));
  const dismissed = units.filter((u) => !isUnitFeedable(attestations[u.id]) && attestations[u.id]?.status === "dismissed");
  const notYet = units.filter((u) => !isUnitFeedable(attestations[u.id]) && attestations[u.id]?.status !== "dismissed");
  // ... "### Not yet reviewed" and "### Dismissed" rendered as separate sections
}
```

### Clickable timestamp links (already shipped, COMP-02) — same convention as `^t:` note tokens

```typescript
// Source: server/src/lib/compileRenderer.ts:52-60 (read this session)
function timestampLink(seconds: number): string {
  return `[${formatTimestamp(seconds)}](#t=${Math.round(seconds)})`;
}
export function renderNotesTokens(notes: string): string {
  return notes.replace(/\^t:(\d+(?:\.\d+)?)/g, (_match, secondsStr: string) => timestampLink(Number(secondsStr)));
}
// renderAnalysisPearls (line 95) and renderAnalysisUnitsV3 (lines 120, 143) both call timestampLink()
```

## State of the Art

| Old Approach (SPEC.md as written) | Current Approach (shipped code) | When Changed | Impact |
|--------------------------------|------------------|---------------|--------|
| F11 "Pearl card... Only from `source: 'model'` analyses" — no attestation gate mentioned | Pearl becomes a card iff linked unit is feedable OR explicitly added by the learner (`deriveLiveCards`) | commit `813dc21`, 2026-07-29 | SPEC.md text is now inaccurate/stale; GATE-02 closes this gap |
| Compile: "Unattested render in compile under 'Not yet reviewed' as titles only" (SPEC B2, no dismissed distinction) | Dismissed units get their own "### Dismissed" section, separate from "### Not yet reviewed" | commit `468e0b8`, 2026-08-08 | SC3/GATE-02 must also update this SPEC.md line, not just the F11 pearl-card line |
| Compile: pearl/unit timestamps rendered as plain `**[mm:ss]**` text | All timestamps render as `[mm:ss](#t=N)` seek links, same convention as note `^t:` tokens | commit `468e0b8`, 2026-08-08 | Already matches SC5 exactly |

**Deprecated/outdated:** SPEC.md's F11 (lines 467-476) and V3-B B4 (lines 659-673) sections describe pre-2026-07-29/pre-2026-08-08 behavior and should be treated as historical record, not current contract, until GATE-02's edit lands.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An explicit "Add to review" click on a pearl satisfies ADR-PED-02's "learner-touched" clause (as distinct from, but equally valid to, "attested") | Common Pitfalls #2, Summary | If the user/planner decides explicit-add should NOT count as sufficient learner-touch (e.g. requires the underlying unit be attested too), the shipped gate would need a real code change, not just a SPEC.md doc edit — this would upgrade GATE-01 from "verify" to "modify." Low likelihood: the ADR's own wording explicitly lists multiple learner-touch forms ("verify, correct, complete, or answer a slot" per ADR-PED-02 in decisions.md) and "explicitly clicking a button to add this to my review deck" is squarely an intentional learner action, not passive AI output. |
| A2 | No other route or code path (besides `routes/review.ts`, `routes/reviewExport.ts`, `routes/compile.ts`) constructs review cards or reads pearls into a review-like surface | Architecture Patterns, Don't Hand-Roll | If a code path was missed (e.g. a dev-only debug route), an un-attested pearl could leak through it. Mitigated by: `grep -rn "ReviewCard\|deriveLiveCards\|pearl:" server/src/routes/` during planning should be a cheap confirmation step before declaring SC1 verified. |
| A3 | Ryan's real `dataDir`/`review.json` has been read (and thus continuously migrated) at least once since 2026-07-29 | Runtime State Inventory | If his real data directory was never re-opened since before the gate fix (e.g. he only reviews via a stale browser tab / has not restarted the server), his real review.json could still contain un-migrated legacy state. This has zero code risk (the migration is idempotent and happens automatically on next read) but is worth a one-line callout to Ryan rather than assuming. |

## Open Questions (RESOLVED)

1. **Is there a genuine SC1/SC2 test gap worth closing, or is existing coverage sufficient?**
   - What we know: `server/test/review.test.ts` covers `deriveLiveCards`'s two gate paths (lines 193, 199) and `buildReviewQueue`'s migration exception (lines 348-374) individually.
   - What's unclear: whether there's an *end-to-end* test (route-level, via `routes/review.ts`) proving a legacy un-gated `review.json` fixture, run through the real `GET /api/review/queue` handler, produces a queue with zero un-attested pearl cards. The existing tests are all at the `lib/review.ts` unit level, not integration/route level.
   - Recommendation: the planner should grep `server/test/` for a route-level review test (there may be one not yet inspected in this session — this research read `lib/review.ts`'s and `lib/compileRenderer.ts`'s test files but not every route-integration test file in the repo) and, if none exists, add one lightweight route-level regression case as this phase's actual "new work" deliverable for GATE-01, on top of the SPEC.md edit for GATE-02.

2. **Should REQUIREMENTS.md's GATE-01/COMP-01/COMP-02 provenance notes cite commit hashes the way PIPE-01's does?**
   - What we know: PIPE-01's REQUIREMENTS.md entry has a full provenance parenthetical citing the exact commit/PR and stating "Phase 1's actual delta... is regression coverage... not a behavior change."
   - What's unclear: whether the user wants the same treatment applied retroactively to GATE-01/COMP-01/COMP-02, or a lighter touch.
   - Recommendation: follow the PIPE-01 precedent for consistency — cite `813dc21` (GATE-01) and `468e0b8` (COMP-01, COMP-02) explicitly.

## Environment Availability

Skipped — this phase has no external tool/service dependencies. All work is in-repo TypeScript/markdown editing plus running the existing `npm test` suite, already confirmed available (Vitest 1.6.0, `node -v` v22.23.1 on this machine).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 (server), Vitest (web, devDependency) [VERIFIED: server/package.json] |
| Config file | `server/vitest.config.ts`, `web/vitest.config.ts` |
| Quick run command | `npm run test -w server -- review` / `npm run test -w server -- compile` |
| Full suite command | `npm test` (server + web; 1019+357 passing as of Phase 2's verification) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 (SC1) | Pearl gated on attested-unit-link OR explicit-add | unit | `npm run test -w server -- review.test -t "produces a pearl card"` | ✅ (server/test/review.test.ts:193-217) |
| GATE-01 (SC2) | Legacy pearl cards drop (reps=0) or suspend (reps>0) without corrupting other cards' scheduling | unit | `npm run test -w server -- review.test -t "no-longer-live pearl card"` | ✅ (server/test/review.test.ts:348-374) |
| GATE-01 (SC1, route-level) | End-to-end `GET /api/review/queue` never returns an un-attested pearl | integration | TBD — see Open Question 1 | ❌ likely Wave 0 gap — audit during planning |
| GATE-02 (SC3) | SPEC.md F11 + V3-B text matches shipped gated behavior | manual/doc review | N/A (documentation correctness, not a runtime test) | N/A |
| COMP-01 (SC4) | Dismissed units render under "### Dismissed", never under "### Not yet reviewed" | unit | `npm run test -w server -- compile.test -t "Dismissed"` | ✅ (server/test/compile.test.ts:320-337) |
| COMP-02 (SC5) | Pearl/unit anchors render as `[mm:ss](#t=N)` links | unit | `npm run test -w server -- compile.test -t "seek link"` (or nearby assertions at lines 183-187, 237, 296) | ✅ (server/test/compile.test.ts) |

### Sampling Rate

- **Per task commit:** `npm run test -w server -- review compile`
- **Per wave merge:** `npm test` (full root suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual diff-read of the SPEC.md edit against the ADR wording

### Wave 0 Gaps

- [ ] Route-level (`routes/review.ts` via Fastify inject, not just `lib/review.ts` unit tests) regression proving `GET /api/review/queue` end-to-end never surfaces an un-attested pearl, using a temp-dataDir fixture with a pre-gating-style `review.json` — confirm this doesn't already exist (`server/test/` may have an integration-level review route test not inspected this session) before writing a new one.
- [ ] No new test framework or fixture infrastructure needed otherwise — the existing temp-dataDir pattern (`server/test/reviewStore.test.ts`'s `beforeEach`/`afterEach`) is sufficient and should be reused, never pointing at the real `~/.studyloop`/`~/StudyLoopData` directory.

## Security Domain

`security_enforcement` not found in `.planning/config.json` (file does not exist in this repo) — treated as enabled per default.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Loopback-only, no-auth-by-design (documented constraint, out of scope for this phase) |
| V3 Session Management | No | Stateless server, no sessions |
| V4 Access Control | Marginally | `isUnitFeedable`/attestation gating IS an access-control mechanism (gating what data reaches the review surface) — already implemented and tested; this phase does not change it |
| V5 Input Validation | Yes | Zod schemas on all touched shapes (`ReviewStateSchema`, `AttestationsFileSchema`, `PearlReviewAddsSchema`) — already in place, unchanged by this phase |
| V6 Cryptography | No | Not applicable to this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Un-attested/hallucinated AI content leaking into the durable review queue | Tampering (data integrity) | The `isUnitFeedable`/`deriveLiveCards` gate — already implemented; this phase's job is to verify it holds, not to build it |
| A future code path bypassing the shared gate function (e.g. a new export/debug route reading pearls directly) | Tampering | Convention: always call `deriveLiveCards`/`buildReviewQueue`/`isUnitFeedable` rather than re-deriving; grep-audit during planning per Assumption A2 |

## Sources

### Primary (HIGH confidence — direct file reads this session)

- `server/src/lib/review.ts` — full read; gate logic, scheduling, migration exception
- `server/src/lib/attestation.ts` — full read; `isUnitFeedable` and bounds
- `server/src/lib/compileRenderer.ts` — full read; Dismissed section, timestamp links
- `server/src/lib/pearlReviewStore.ts`, `server/src/routes/pearlReview.ts` — full read; explicit-add path
- `server/src/lib/reviewStore.ts`, `server/src/routes/review.ts`, `server/src/lib/reviewExport.ts` — full read
- `SPEC.md` lines 462-536 (F11) and 616-673 (V3-B) — full read with line numbers
- `docs/REAL-LECTURE-PROOF-2026-08-08.md` — full read
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/intel/decisions.md`, `.planning/intel/constraints.md`, `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `TESTING.md`, `.planning/phases/02-.../02-VERIFICATION.md`, `.planning/ROADMAP.md` (Phase 3 section) — full read
- `git log`, `git show -s --format` on commits `813dc21`, `5ccb77d`, `4a6a97c`, `468e0b8` — confirmed dates and diffs
- `server/test/review.test.ts`, `server/test/compile.test.ts`, `server/test/reviewStore.test.ts` — grepped for relevant `describe`/`it` blocks confirming regression coverage exists

### Secondary (MEDIUM confidence)

- `web/src/state/store.ts`, `web/src/lib/api.ts`, `web/src/concepts/AnalysisSections.tsx` — grepped (not fully read) to confirm the "Add to review" UI action is wired end-to-end

### Tertiary (LOW confidence)

- None — this phase's research required no external web search; it is entirely an in-repo code-vs-doc reconciliation task.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, existing versions read directly from package.json
- Architecture: HIGH — every claimed code path was read in full this session, not inferred
- Pitfalls: HIGH — grounded in actual git history (commit dates precede requirements authoring) and actual test file contents

**Research date:** 2026-08-10
**Valid until:** Effectively indefinite for the "already implemented" finding (it's git history, immutable) — but re-verify against `git log -1` before executing the plan in case further commits land between this research and execution.
