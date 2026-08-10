# Phase 2: Analysis Fidelity Hardening - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 8 (2 net-new-field targets across schema+merge, 1 data file, 1 UI file, 4 test files)
**Analogs found:** 8 / 8 (all in-file self-analogs — this phase mostly extends files that already contain the pattern to copy)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `server/src/lib/analysis.ts` — `AnalysisUnitSchema` + `ChunkUnitRawSchema` (add `enrichment`-style field) | model/schema | transform (LLM wire → validated unit) | Same file's `UnitEvidenceSchema` + `evidence` field (self-report provenance) | exact — same file, same shape, same "self-reported optional field" pattern |
| `server/src/lib/analysis.ts` — merge aggregation (`mergeUnitsByFingerprint`) | service | transform/CRUD (fingerprint-group reduce) | Same file's `threshold: group.some((g) => g.threshold === true)` (analysis.ts:1656) and `mergeEvidence` (analysis.ts:1599-1606) | exact — OR-across-group is the literal rule to copy |
| `server/src/lib/analysis.ts` — `dedupeNearDuplicateUnits` (D-01 distinct-fact guard + audit) | service | transform (near-dup collapse pass) | Same function, already shipped in `468e0b8` (analysis.ts:1694-1729) | exact — audit/extend in place, do not rewrite |
| `server/src/lib/analysis.ts` — `CHUNK_V3_JSON_SCHEMA` unit properties (wire mirror for new field) | config | request-response (structured-output schema) | Same file's `evidence: { type: "string", enum: [...] }` wire mirror (analysis.ts:782) | exact |
| `server/lenses/clinical.json` — add `"PRIORITIZATION"` to `safetyTier` | config | CRUD (static data) | Same file's existing `safetyTier` array (line 16) | exact — one-line data edit, no code pattern needed |
| `server/test/analysisV3.test.ts` (extend) | test | unit | `finalUnit()` factory (line 1201) + `describe("dedupeNearDuplicateUnits", ...)` (line 1215) | exact |
| `server/test/conceptRegistry.test.ts` (extend) | test | unit | `describe` block at line ~278-349, `safetyUnitTypes` fixture pattern (lines 298, 323) | exact |
| `web/src/lib/safetyTier.test.ts` (extend) | test | unit | Existing `SAFETY_TIER_UNIT_TYPES` set assertions in `web/src/lib/safetyTier.ts` (line 12) | exact |
| `web/src/lib/types.ts` — mirror new field on `AnalysisUnit` interface | model (type mirror) | transform | Existing `threshold: boolean;` / `evidence?: UnitEvidence;` fields (types.ts:455, 459) | exact |
| `web/src/concepts/UnitProposalCard.tsx` — enrichment badge | component | request-response (render) | Same file's `thresholdBadge`/`thresholdBanner` pattern (lines 259-263, 273) | exact — nearest existing badge-off-a-unit-boolean pattern in the same component |
| New pure helper (if planner wants an `enrichmentBadgeText`-style helper, following Phase 1 precedent) | utility | transform | `web/src/lib/slidesWarning.ts` (Phase 1, PIPE-02) — pure, dependency-free, node-testable `meta -> string | null` | exact — same "no React import, pure function, `X -> string|null`, `null` = render nothing" contract |

## Pattern Assignments

### `server/src/lib/analysis.ts` — new `enrichment` field on `ChunkUnitRawSchema` + `AnalysisUnitSchema` (ANLZ-02)

**Analog:** `UnitEvidenceSchema` / `evidence` field, same file.

**Schema declaration pattern** (analysis.ts:138-139, applied analogously):
```typescript
export const UnitEvidenceSchema = z.enum(["transcript", "slides", "both"]);
export type UnitEvidence = z.infer<typeof UnitEvidenceSchema>;
```
For a boolean self-report (simpler than evidence's 3-way enum, matches research's recommendation `enrichment: z.boolean().optional()`), copy the `threshold` field's exact declaration instead — it is the closer analog since both are booleans:
```typescript
// ChunkUnitRawSchema (analysis.ts:568)
/** V3-D D2: optional (absent treated as false, see mergeUnitsByFingerprint) for the same reason. */
threshold: z.boolean().optional(),
```

**Final-unit field placement** (analysis.ts:239-247, `evidence` on `AnalysisUnitSchema`):
```typescript
/**
 * Phase 6 "Slide-text channel" provenance (see UnitEvidenceSchema above).
 * Optional and loosely validated (SPEC: "Loose validation, defaulting
 * absent = transcript") — absent on every unit from a pre-Phase-6 analysis
 * run and on any run for a project with no slides.json at all. Read
 * through `effectiveEvidence` rather than this field directly wherever the
 * "absent means transcript" default matters.
 */
evidence: UnitEvidenceSchema.optional(),
```
Copy this comment/placement style for the new field: state what "absent" means (recommend: absent = not flagged as enrichment, i.e. `false`), and — if adding a read-through default helper — copy `effectiveEvidence` (analysis.ts:267-270):
```typescript
export function effectiveEvidence(unit: Pick<AnalysisUnit, "evidence">): UnitEvidence {
  return unit.evidence ?? "transcript";
}
```

**Wire JSON schema mirror** (`CHUNK_V3_JSON_SCHEMA` unit properties, analysis.ts:760-796) — MANDATORY per RESEARCH.md Pitfall 5 (zod v3/v4 SDK barrier: never use `zodOutputFormat`/`z.toJSONSchema()`, always hand-write the mirror):
```typescript
// Phase 6 "Slide-text channel": required at the wire level (same
// "structured outputs want every property present" convention as
// every other field here) — "transcript" is always a valid value,
// so there's no need for an empty-string sentinel the way
// unitLabel/overlay need one.
evidence: { type: "string", enum: ["transcript", "slides", "both"] },
```
For a new boolean `enrichment` field, follow `threshold`'s wire mirror instead (analysis.ts:772): `threshold: { type: "boolean" },` — and add the key name to BOTH the `properties` object and the `required` array (analysis.ts:784-795), since this codebase's structured-output convention requires every property present at the wire level (empty/false sentinel, not absent).

---

### `server/src/lib/analysis.ts` — merge aggregation for the new field (ANLZ-02, OR-across-group)

**Analog:** `threshold` OR-rule (analysis.ts:1656) and `mergeEvidence` (analysis.ts:1599-1606).

**Copy this verbatim, substituting field name** (analysis.ts:1656, inside `mergeUnitsByFingerprint`'s return object):
```typescript
// V3-D D1/D2: overlay collapses to undefined rather than `{}` (nothing
// for the Advanced fold to show); threshold is true if ANY unit in the
// group was flagged (never "average away" a threshold signal).
threshold: group.some((g) => g.threshold === true),
```
This is the exact rule RESEARCH.md's Code Examples section already flags as the pattern to copy for ANLZ-02's aggregation. Apply the same `.some(...)` OR rule to the new field inside `mergeUnitsByFingerprint`.

If the new field needs enum-style merging (not boolean OR), copy `mergeEvidence`'s full shape (analysis.ts:1599-1606):
```typescript
function mergeEvidence(group: readonly { evidence?: UnitEvidence }[]): UnitEvidence | undefined {
  const values = group.map((g) => g.evidence).filter((v): v is UnitEvidence => v !== undefined);
  if (values.length === 0) return undefined;
  const hasSlides = values.some((v) => v === "slides" || v === "both");
  const hasTranscript = values.some((v) => v === "transcript" || v === "both");
  if (hasSlides && hasTranscript) return "both";
  return hasSlides ? "slides" : "transcript";
}
```

**Also propagate through `dedupeNearDuplicateUnits`'s survivor-merge branch** (analysis.ts:1714-1726) — the field must be OR'd/merged there too, exactly the way `threshold` and `evidence` already are on the collapsed unit:
```typescript
kept[matchIdx] = {
  ...survivor,
  summary: unit.summary.length > survivor.summary.length ? unit.summary : survivor.summary,
  body: unit.body.length > survivor.body.length ? unit.body : survivor.body,
  anchors: [...anchorByT.entries()].sort((a, b) => a[0] - b[0]).map(([t, quote]) => ({ t, quote })),
  confidence: Math.max(survivor.confidence, unit.confidence),
  threshold: survivor.threshold || unit.threshold,
  evidence: survivor.evidence === unit.evidence ? survivor.evidence : mergeEvidence([survivor, unit]),
};
```
Add a line for the new field here following `threshold`'s pattern (`survivor || unit`) — this is the seam D-01's "distinct-fact guard" and ANLZ-02's OR-propagation both pass through, so any new field must be threaded through this exact object literal.

---

### `server/src/lib/analysis.ts` — `dedupeNearDuplicateUnits` D-01 audit (not a rewrite)

**Analog:** the function itself, already shipped `468e0b8` (analysis.ts:1694-1729) — see Core Pattern excerpt above (already quoted in full in RESEARCH.md, re-read directly this session, unchanged).

**Per D-01 (locked):** the collapse rule is CORRECT as shipped — same type + shared anchor `t` + proper-subset id-token match is inherently a same-fact guard (distinct facts fail the subset test, per the MECHANISM near-miss fixture already in `analysisV3.test.ts`). Per RESEARCH.md Pitfall 2 / Interpretation A (the recommended, D-01-consistent reading): do NOT add a type-based exclusion for safety-tier types here. Instead:
1. Add regression tests proving values are never rounded/paraphrased away during collapse — anchors are unioned (line 1716-1717: `anchorByT` keyed by `t`, never overwritten if already present) not averaged, and the LONGER summary/body wins (lines 1720-1721), never a blended/truncated one.
2. Extend `server/test/conceptRegistry.test.ts` (see below) to prove `evaluateNewUnit`'s cross-project `safetyUnitTypes` guard and the web's verbatim-quote rendering are unaffected by units having passed through this pass.

---

### `server/lenses/clinical.json` — D-02 PRIORITIZATION addition

**Analog:** the file's own existing `safetyTier` array.

**Current (line 16):**
```json
"safetyTier": ["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]
```
**Change to:**
```json
"safetyTier": ["DOSAGE", "CONTRAINDICATION", "LAB_VALUE", "PRIORITIZATION"]
```
No code change required elsewhere — both `web/src/lib/safetyTier.ts`'s `SAFETY_TIER_UNIT_TYPES` (currently hardcoded, see below) and `conceptRegistry.ts`'s `safetyUnitTypes` read dynamically from lens data at the call site (`routes/analyze.ts:148-156`), EXCEPT `web/src/lib/safetyTier.ts` which currently hardcodes the three-item set rather than reading `clinical.json` — that file needs its own edit too (see next section).

---

### `web/src/lib/safetyTier.ts` — D-02 mirror update

**Current (safetyTier.ts:12):**
```typescript
export const SAFETY_TIER_UNIT_TYPES: ReadonlySet<UnitType> = new Set<UnitType>(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]);
```
Add `"PRIORITIZATION"` to this literal set to match `clinical.json`'s new array (this file is a static mirror, not a dynamic lens read — confirmed by its own header comment: "a lens's `safetyTier` field only ever REFERENCES ... server/lenses/clinical.json's `safetyTier` list — same 'plain interface tier (CODE, not data)'" — i.e. this constant is deliberately hand-kept-in-sync, not computed).

---

### `web/src/concepts/UnitProposalCard.tsx` — ANLZ-02 enrichment badge (net-new UI, first provenance badge ever shipped per RESEARCH.md)

**Analog:** the `threshold` badge/banner pair in the same file (UnitProposalCard.tsx:259-263, 273).

**Badge-in-head pattern to copy** (lines 259-263):
```tsx
{unit.threshold && (
  <span className={styles.thresholdBadge} title="Threshold concept — unlocks later material" aria-label="Threshold concept">
    <Icon name="key" size={13} />
  </span>
)}
```
**Banner-below-head pattern to copy** (line 273):
```tsx
{/* V3-D D2: "one-line banner on the card ('This idea unlocks later material')". */}
{unit.threshold && <p className={styles.thresholdBanner}>This idea unlocks later material</p>}
```
For the enrichment badge, mirror this exactly: `{unit.enrichment && <span className={styles.enrichmentBadge} title="..." aria-label="Enrichment — not directly from the source">...</span>}` plus an optional banner line. Do NOT place it inside the `isSafetyTierUnitType` verbatim-quote block (lines 299-307) — that block is unconditional/reveal-gate-independent by design; enrichment is an orthogonal signal about provenance, not safety-tier status. Keep the two blocks separate, following the file's existing pattern of one `{unit.<field> && ...}` conditional block per signal (threshold, mergedIn, safetyTier are each their own independent block — see lines 259-307).

**If a pure text-derivation helper is wanted (following Phase 1 precedent):** copy `web/src/lib/slidesWarning.ts` in full:
```typescript
// pure, dependency-free, DOM-free copy function — Node-testable by design,
// no React import, no store read, just meta in -> string | null out.
export function slidesWarningText(meta: SlidesMeta): string | null {
  const { emptyPageCount, pageCount } = meta;
  if (emptyPageCount <= 0 || pageCount <= 0) return null;
  // ...
}
```
Called from the component exactly like `SlidesRow.tsx` calls it (SlidesRow.tsx:13, 27, 60):
```tsx
import { slidesWarningText } from "../lib/slidesWarning";
// ...
const slidesWarning = slidesMeta ? slidesWarningText(slidesMeta) : null;
// ...
{slidesWarning && <span className={styles.warnNote}>{slidesWarning}</span>}
```
This is only needed if the enrichment badge requires derived copy beyond a static string (e.g. varying text by unit type or count) — a bare `unit.enrichment` boolean badge (like `threshold`) likely does not need a helper at all; use judgment, but the helper contract (`X -> string | null`, `null` = render nothing, no React/store imports, node-testable) is the pattern to follow if one is added.

## Shared Patterns

### Self-reported field → OR-merge → UI badge (the ANLZ-02 architecture, end to end)
**Source:** `evidence`/`threshold` field triad across `server/src/lib/analysis.ts` (schema at 138-139/239-247/565-568/580, wire mirror at 782/772, merge at 1599-1606/1656, dedupe-propagation at 1725/1724) and `UnitProposalCard.tsx` (259-273 for threshold; evidence has NO UI yet — enrichment IS the first provenance badge, per RESEARCH.md).
**Apply to:** the new `enrichment` field, top to bottom — every layer above must get a change; skipping the wire-schema mirror or the dedupe-propagation line is the most likely place to under-scope the diff.

### Zod v3-classic + hand-written JSON-schema mirror (never `zodOutputFormat`)
**Source:** file header note `analysis.ts:1-30`; enforced by `CHUNK_V3_JSON_SCHEMA` being hand-maintained rather than generated (analysis.ts:649-798).
**Apply to:** any new field on `ChunkUnitRawSchema`/`AnalysisUnitSchema`. Two edits are required per new wire field, not one: the zod schema AND the JSON-schema properties/required arrays.

### Safety-tier verbatim-quote rendering, unconditional block
**Source:** `UnitProposalCard.tsx:292-307`, `isSafetyTierUnitType` from `web/src/lib/safetyTier.ts:14-15`.
**Apply to:** no code change needed for D-02 beyond the two data/constant edits above — this block already reads `isSafetyTierUnitType(unit.type)` dynamically, so once `PRIORITIZATION` is added to `SAFETY_TIER_UNIT_TYPES`, PRIORITIZATION units automatically get verbatim-quote treatment with zero UI-file changes.

### Test fixture factory pattern
**Source:** `finalUnit()` helper, `server/test/analysisV3.test.ts:1201` (`function finalUnit(id: string, overrides: Partial<AnalysisUnit> = {}): AnalysisUnit`).
**Apply to:** all new `analysisV3.test.ts` cases (ANLZ-01 D-01 regression tests, ANLZ-02 merge tests) — use `finalUnit(id, { type: "DOSAGE", enrichment: true, ... })`-style overrides rather than constructing full unit literals by hand, matching every existing test in the `describe("dedupeNearDuplicateUnits", ...)` block (line 1215+).

### conceptRegistry safetyUnitTypes fixture pattern
**Source:** `server/test/conceptRegistry.test.ts:278-349`, e.g.:
```typescript
it("never auto-merges a unit whose type is in safetyUnitTypes, even on an exact fingerprint match — queues a candidate instead", () => {
  // ...
  safetyUnitTypes: new Set(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]),
  // ...
});
```
**Apply to:** the new PRIORITIZATION regression test (D-02) — copy this exact `it` block, add `"PRIORITIZATION"` to the `safetyUnitTypes` set literal, and assert the same auto-merge-blocked outcome (`conceptRegistry.ts:152`: `unit.type === "BOUNDARY" || unit.threshold === true || Boolean(safetyUnitTypes?.has(unit.type))`).

## No Analog Found

None — every file in this phase's change surface has a strong same-file or same-directory analog already in the codebase (this is an "extend existing patterns" phase per RESEARCH.md, not a net-new-architecture phase). The only genuinely first-of-its-kind element is the enrichment UI badge (no prior provenance badge exists), but its closest sibling pattern (`threshold` badge, same file, same component) is a strong structural match even though it's semantically a new concept.

## Metadata

**Analog search scope:** `server/src/lib/analysis.ts` (full read: lines 138-139, 225-320, 555-800, 1580-1729), `server/lenses/clinical.json`, `web/src/lib/safetyTier.ts`, `web/src/lib/types.ts` (lines 370-459), `web/src/concepts/UnitProposalCard.tsx` (lines 1-320), `web/src/lib/slidesWarning.ts` (full), `web/src/study/SlidesRow.tsx` (lines 1-70), `server/test/analysisV3.test.ts` (line 1201, 1215), `server/test/conceptRegistry.test.ts` (lines 278-349)
**Files scanned:** 9
**Pattern extraction date:** 2026-08-09
