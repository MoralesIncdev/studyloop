# Phase 4 Context — Real-Lecture Proof Re-Run

**Source:** Ryan's rulings 2026-08-10 (in lieu of full discuss-phase; questions raised by 04-RESEARCH.md Open Questions).

<decisions>

## D-01 — Proof interaction layer: FULL BROWSER UI WALKTHROUGH [LOCKED]
**Ruling:** "full" — the proof drives the complete flow through the real web UI (URL paste, transcript, analysis trigger, slides attach, document mode, attestation clicks, compile/export), not API-level with spot-checks. API calls are allowed only for evidence *capture* (reading state to verify), never as a workaround for a UI step — any UI step that cannot be completed in the UI is itself a proof finding.
**Execution note:** Ryan directed Sonnet for the execution agents ("full use sonnet") — proof-run executors run on Sonnet.
**Known UI-verification constraint (from Phases 1-2):** the study view's video layer composites black in browser-pane screenshots — visual evidence = DOM probes + screenshots of non-video surfaces (review queue, compile output, settings rows render fine).

## D-02 — Independent slide deck: source a public deck [LOCKED]
**Ruling:** Find and vet a genuinely independent, publicly available teaching deck (PDF) matching the lecture topic (mechanical ventilation / ICU). Must NOT be manufactured from the transcript. Provenance of the deck (URL, publisher) recorded in the proof report.

## D-03 — Open-question resolutions (operator defaults, consistent with precedent)
- **Evidence location:** `docs/` — the proof report is `docs/REAL-LECTURE-PROOF-<date>.md` (same convention as 2026-08-08); supporting evidence artifacts in `docs/proof-evidence-<date>/` committed with the report.
- **Verbatim-anchor verifier:** a small committed script (`server/scripts/` or `scripts/`) comparing every anchor quote in analysis.json against the caption stream — closes the prior proof's "programmatic check with no backing artifact" gap; rerunnable in Phase 5+ and future proofs.

</decisions>

## Scope notes carried from research
- LLM: `~/.studyloop/config.json` has `llmProvider: "zai"` + key set (same as prior glm-5 proof) — zero setup needed; no Anthropic key configured (PROJECT.md open question stands, not this phase's to resolve).
- Lecture candidate: MedCram "Mechanical Ventilation Explained Clearly | 2 of 5" — ASSUMED; first task must verify transcript availability before committing the run to it.
- Pitfall 3: `watchedUpTo` only visibly changes "Concepts Covered" if a conceptDoc is attached — the run must attach one.
- Watch items to observe during the run: transcriptChain lazy caption pull (no fallback), reviewExport gate inheritance, Ryan's real review.json auto-migration (must NOT be part of the proof project's evidence — proof uses its own project).
- Real user data under ~/StudyLoop and in-repo projects/ is precious; the proof project is a new project; no cleanup that touches real data.
