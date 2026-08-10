# Phase 2 Context — Analysis Fidelity Hardening

**Source:** Ryan's rulings 2026-08-09 (in lieu of full discuss-phase; questions raised by 02-RESEARCH.md Open Questions 1-2).

<decisions>

## D-01 — Safety-tier merge semantics (resolves SC1↔SC4 tension) [LOCKED]
**Ruling:** Collapse identical twins only. A safety-tier unit (DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION) that is the SAME fact re-emitted across chunk overlap — same anchor window, identical values — MAY collapse into one card. DISTINCT safety-tier facts must NEVER merge, and exact values always render as verbatim quotes.
**Implication:** the shipped `dedupeNearDuplicateUnits` behavior (which collapses the t=449 twin tidal-volume DOSAGE cards) is CORRECT and must be preserved; SC4 is satisfied by a distinct-fact-never-merges guard + verbatim-value rendering, not by exempting safety-tier from dedup entirely. SC4's wording "never auto-merge" reads as "never merge distinct facts."

## D-02 — PRIORITIZATION joins the safety tier [LOCKED]
**Ruling:** Add `PRIORITIZATION` to `clinical.json`'s `safetyTier` array so the config matches the roadmap's four-type list. Include a regression test proving all four types get safety-tier treatment (no cross-fact merge, verbatim rendering).

</decisions>

## Scope notes carried from research
- ANLZ-01 (dedup) and ANLZ-03 (overlay scrub) already shipped in `468e0b8` with tests — plans should audit + extend coverage + enforce D-01's distinct-fact guard, not reimplement.
- ANLZ-02 (ungrounded-enrichment marking) is the net-new work: no code mechanism exists, only the unenforced prompt instruction at `analysis.ts:905`. Recommended architecture: self-reported groundedness field + OR-across-group merge propagation + UI badge, following the existing `evidence`/`threshold` pattern. No embeddings (repo philosophy).
