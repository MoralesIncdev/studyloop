# Safety-Value Audit — 04.1-06 Re-Run

Project: `0213f617-f887-4c33-8349-8dfdaf2213c8` (the fresh, live zai/glm-5 analysis produced in 04.1-05, source=model, 24 units/11 pearls/9 edges). Baseline comparison: `41b2d9ea-a4b1-428a-b09a-7065ed3dee1f` (the original 2026-08-10 proof project audited in `docs/proof-evidence-2026-08-10/verification/safety-value-audit.md` and `hallucination-audit.md`).

Per Task 2's instruction, this audit re-establishes PROOF-01's zero-hallucination and exact-values claims for THIS run's own units — Phase 4's audit covered a different 18-unit set and does not carry over to this 24-unit fresh completion.

**Verdict: SUPPORTS both claims.** Both clinical safety-tier (DOSAGE) units carry exact numeric values *and*, unlike the baseline run, anchor times that land within tolerance of where the value is actually spoken — the anchor-drift defect the baseline audit reported (F-10) does not reproduce on either safety-tier unit in this run. A 13/24-unit (54%) stratified sample of the non-safety-tier units, all 11 pearls, and all 9 edges found zero hallucinated, distorted, or clinically-wrong claims. No new finding is filed.

## Clinical safety-tier units (exhaustive — both units this run produced)

This analysis produced **2 safety-tier units, both `DOSAGE`** (same count and same type as the baseline run). No `CONTRAINDICATION`, `LAB_VALUE`, or `PRIORITIZATION` units were produced — those three sub-claims of the exact-values claim remain untested by this run's content, exactly as the baseline audit recorded for its own run (the lecture is ventilator-modes/settings content with no drug-dosage, lab-value, or prioritization material to surface).

### DOSAGE unit 1 — `cpap-and-peep-settings-range`

- **Numeric values present:** `summary`: "5 to 20 cm of water pressure"; `body`: "5 to 20 cm H₂O"; `overlay.normalRange`: `"5–20 cm H₂O"`.
- **Anchor as recorded in analysis.json:** `t=82`, quote: *"you can set CPAP anywhere from five cm of water pressure all the way up to 20"*.
- **Transcript at the anchor position (t=82, ±12s, `captions.json`):**
  > [78.799] "...of pressure. And so you can set CPAP" [81.759] "anywhere from five cm of water pressure" [85.119] "all the way up to 20. PE can be anywhere" [88.32] "from 5 to 20 as well."
- **Digit-by-digit value comparison:** "five" (5) ... "20" ... "5 to 20" — **exact**. No rounding, no unit substitution (cm H₂O implied consistently with the lecture's own usage, same convention the baseline audit accepted).
- **Anchor-time fidelity: PASS.** `t=82` lands inside the quote's own span (81.759–88.32) — the anchor points at the sentence that actually states the value, not at an unrelated passage. This is the specific defect (F-10) the baseline run's audit flagged for this same fact (baseline anchor `t=122`, true position `t≈81–88s`, ~40s drift) — it does not reproduce here.
- **Wrong-value vs. wrong-position:** neither. Both the value and its pointer are correct.

### DOSAGE unit 2 — `pressure-support-range`

- **Numeric values present:** `summary`: "anywhere from 5 to 15"; `body`: "range of 5 to 15"; `overlay.normalRange`: `"5–15"`.
- **Anchor as recorded in analysis.json:** `t=288`, quote: *"That could be anywhere from five to 15"*.
- **Transcript at the anchor position (t=288, ±12s, `captions.json`):**
  > [284.56] "...the ventilator on, they get a specific" [286.639] "amount of pressure. That could be" [288.32] "anywhere from five to 15. Okay."
- **Digit-by-digit value comparison:** "five to 15" — **exact**. No rounding, no paraphrase.
- **Anchor-time fidelity: PASS.** `t=288` lands 0.32s from the owning segment's start (288.32) — effectively exact, well inside the verifier's 15s tolerance and inside the quote's own span. This is the baseline run's *worst-case* defect (baseline anchor `t=448`, true position `t≈286–288s`, ~160s / 2m40s drift, the largest drift the baseline run observed) — it does not reproduce here.
- **Wrong-value vs. wrong-position:** neither. Both the value and its pointer are correct.

**Safety-tier summary:** 2/2 units carry exact numeric values (matches the baseline's 2/2). 2/2 units carry correctly-positioned anchors (baseline: 0/2 — both baseline DOSAGE anchors were value-correct-but-position-wrong). This is the concrete, unit-level confirmation that F-10's fix (04.1-03's `correctAnalysisAnchors`, exercised live in 04.1-05) reaches the exact unit type PROOF-01's safety-tier claim is about, not just an aggregate anchor-verifier pass rate.

## Non-safety-tier units, pearls, and edges — sampling method and results

**Sampling method:** a stratified sample of 11 of the 22 non-safety-tier units (50%) was audited in full (summary/body claim checked against the transcript at the unit's own anchor), chosen to span: (a) every unit type present (`CLAIM`, `MECHANISM`, `CLUSTER`, `PROCEDURE`, `EXAMPLE`), (b) the full timeline (anchors from t=22 through t=847, early/mid/late lecture content), and (c) units with multi-part numeric content (`writing-ac-ventilator-orders`'s 4-step order values; `ac-mode-settings-example`'s 4 concrete numbers) as the highest-consequence non-safety-tier candidates for a wrong-number hallucination. All 11 pearls (short, cheap to check exhaustively — no reason to sample) and all 9 edges (already individually quote-verified against the transcript by Task 1's 0-violation verifier run; this audit additionally read each edge's connected units' summaries for topical coherence) were checked. Combined with the 2 safety-tier units, this is 13/24 units (54%) individually read against the transcript, plus 100% of pearls and 100% of edges.

This is sufficient to support the conclusion below because: the sample deliberately over-weights the units where a wrong-number hallucination would be highest-consequence (the 4-value AC settings example, the 5-step order-writing procedure) rather than sampling uniformly at random, and every sampled item — without exception — was grounded and accurate.

**Non-safety-tier units audited (11):** `cpap-non-invasive-vs-peep-invasive`, `peep-alveolar-recruitment`, `ps-as-weaning-mode`, `writing-ac-ventilator-orders`, `co2-vs-o2-ventilator-parameters`, `ac-mode-settings-example`, `flow-rate-adjustable-for-copd`, `backup-rate-prevents-hypoventilation`, `decreased-compliance-raises-pressure`, `peak-and-plateau-pressures`, `ac-mode-breath-cycle`, `causes-of-decreased-lung-compliance`, `pressure-alarm-for-compliance-drop` — 13 total including the 2 DOSAGE units already covered above.

Selected results (representative of the full sample — every item checked, not just these):

| Unit id | Type | Claim | Grounded? | Numeric values exact? |
|---|---|---|---|---|
| `cpap-non-invasive-vs-peep-invasive` | CLAIM | CPAP = non-invasive term, PEEP = invasive term, same concept | Yes — verbatim at t=22 | n/a |
| `writing-ac-ventilator-orders` | PROCEDURE | 4-step order-writing: mode+rate 16, tidal volume 550, FiO2 50%, PEEP 5 | Yes — verbatim across anchors t=298–379 | Yes — all 4 numbers match the transcript exactly (cross-checked against `ac-mode-settings-example` below, which restates the same 4 numbers later in the lecture) |
| `co2-vs-o2-ventilator-parameters` | CLAIM | rate+Vt affect CO2 via minute ventilation; FiO2+PEEP affect oxygenation | Yes — verbatim at t=430–442 | n/a |
| `ac-mode-settings-example` | EXAMPLE | AC 16, tidal volume 550, FiO2 50%, PEEP 5 | Yes — verbatim at t=494, "AC 16, tidal volume 550, FiO2 of 50% and a PEEP of five" | Yes — all 4 numbers exact |
| `decreased-compliance-raises-pressure` | MECHANISM | fixed tidal volume + decreased compliance -> higher pressure | Yes — verbatim at t=770–792 | n/a |
| `causes-of-decreased-lung-compliance` | CLAIM | pulmonary edema, pneumothorax, or expansion-blocking conditions decrease compliance | Yes — verbatim at t=806 (transcript ASR spells "pneumothorax" as "numoththorax" — a caption-quality artifact the model correctly normalized, a quality improvement over the raw caption text, same pattern the baseline audit documented for "alvoli"→"alveoli") | n/a |
| `peak-and-plateau-pressures` | CLAIM | two distinct pressures: peak and plateau, deferred to next lecture | Yes — verbatim at t=847, honestly reflects the lecturer's own deferral | n/a |

No item in the 13-unit sample, the 11 pearls, or the 9 edges showed a claim not actually said, a distorted meaning, or a numeric value that differs from the transcript.

**Pearls (11/11 checked):** every pearl's `t` lands on or immediately beside the transcript passage supporting its label (e.g. `t=427` "Rate+Vt → CO₂; FiO₂+PEEP → O₂" matches the transcript's own "the first two parameters are going to affect carbon dioxide... the last two [affect oxygenation]" at t=427.36–441.9). All 11 are grounded and clinically accurate; none is an orphan claim absent from the transcript.

**Edges (9/9 checked):** all 9 edge quotes were confirmed as exact or normalized substrings by Task 1's 0-violation verifier run (`anchor-verification-report.json`: 9 edges checked, 0 violations), and this audit additionally read the connected units on both ends of each edge for topical coherence — no edge connects two units whose combined claim would misrepresent the transcript.

## Enrichment-badge count

**Zero** units and **zero** pearls in this run's analysis carry `enrichment: true` (checked programmatically against all 24 units and all 11 pearls) — matching the baseline run's own zero. No item needed to be excluded from the hallucination claim on enrichment-flag grounds; there is nothing to spot-check for over/under-application of the badge, same as the baseline audit's own finding.

## Overall verdict

**This run supports PROOF-01's zero-hallucination claim:** the 13-unit stratified sample (including both consequence-weighted multi-value units and both safety-tier units), all 11 pearls, and all 9 edges found zero hallucinated, distorted, or clinically-wrong claims. No item was excluded from this claim by an enrichment flag (there were none to exclude).

**This run supports PROOF-01's exact-values claim, and closes the gap the baseline run left open:** both DOSAGE units carry exact numeric values (matching the baseline's own 2/2), and — unlike the baseline run — both DOSAGE units' anchors also land within tolerance of the sentence that states the value (baseline: 0/2, drifted 40s and 160s respectively). The wrong-value-vs-wrong-position distinction the baseline audit had to draw (values right, pointers wrong) collapses on this run: both are right. `CONTRAINDICATION`/`LAB_VALUE`/`PRIORITIZATION` remain untested by this run's content, identically to the baseline — this is a property of the lecture's topic, not a gap this run could have closed.

No wrong value or ungrounded claim was found. No new FINDINGS.md entry is filed as a result of this audit.
