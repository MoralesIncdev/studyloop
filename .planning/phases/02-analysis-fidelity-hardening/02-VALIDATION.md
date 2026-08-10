---
phase: 2
slug: analysis-fidelity-hardening
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.0 (server), `server/test/*.test.ts` + web colocated tests |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `npm run test -w server -- analysisV3` |
| **Full suite command** | `npm test` (server + web) |
| **Baseline** | 980 server + 352 web green (post-Phase-1) — must not regress |

## Sampling Rate

- **Per task commit:** `npm run test -w server -- analysisV3` (fast, no network)
- **Per wave merge:** `npm test` full suite
- **Phase gate:** full suite green + `npm run typecheck` both workspaces (schema field mirrored server↔web). Live re-analysis of the proof lecture is OPTIONAL spot-check — the full live re-proof is Phase 4's job.

## Requirements → Test Map

| Req ID | Behavior | Test | Exists? |
|--------|----------|------|---------|
| ANLZ-01 | `dedupeNearDuplicateUnits` collapses identical-twin re-emissions (t=449 DOSAGE case), keeps distinct facts apart | `server/test/analysisV3.test.ts -t "dedupeNearDuplicateUnits"` | ✅ shipped in 468e0b8 — extend with D-01 distinct-fact-never-merges cases |
| ANLZ-01/SC4 | Safety-tier (incl. new PRIORITIZATION per D-02): distinct facts never merge; verbatim-quote rendering unaffected | extend `server/test/conceptRegistry.test.ts` (exists, 10 safety refs) + `web/src/lib/safetyTier.test.ts` (exists) | ✅ extend, not create |
| ANLZ-02 | Groundedness/enrichment field: self-reported, OR-across-group merge, persisted, visibly rendered | new describe block in `analysisV3.test.ts` (merge) + pure web helper test (Phase-1 `slidesWarning` pattern) | ❌ Wave 0 — net-new; NO component test files exist in `web/src/concepts/` (verified) → UI badge verify is manual/checkpoint |
| ANLZ-03 | `scrubOverlayToLens` strips undeclared keys; no `[""]` survives to persisted analysis.json | `analysisV3.test.ts -t "scrubOverlayToLens"` | ✅ shipped in 468e0b8 — extend edge cases |

## Wave 0 Gaps

- [x] `web/src/concepts/*.test.tsx` — confirmed NONE exist → ANLZ-02 UI badge gets a pure-helper test + human-verify checkpoint, per Phase 1 precedent
- [x] `server/test/conceptRegistry.test.ts` — confirmed exists with safety-tier coverage (10 references) → extend with D-02 PRIORITIZATION assertion
- [ ] No new fixtures needed — pure-function tests against synthetic `AnalysisUnit`/`ChunkUnitRaw` objects via the existing `finalUnit()` factory
