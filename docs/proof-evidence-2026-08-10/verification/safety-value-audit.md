# Safety-Value Audit — 2026-08-10

Per Task 1's instruction: every unit whose `type` is in the clinical safety tier
(`DOSAGE`, `CONTRAINDICATION`, `LAB_VALUE`, `PRIORITIZATION`) is compared
digit-by-digit / unit-by-unit against the quoted transcript segment at its
anchor. This analysis (`analysis.json`, project
`41b2d9ea-a4b1-428a-b09a-7065ed3dee1f`) produced **2 safety-tier units, both
`DOSAGE`**. No `CONTRAINDICATION`, `LAB_VALUE`, or `PRIORITIZATION` units were
produced by this run — those three sub-claims of SC2's "safety values are
exact" are untested by this analysis, not passed, and are recorded as such
below rather than silently assumed clean.

## DOSAGE unit 1 — `cpap-and-peep-setting-range`

- **Stated value (`overlay.normalRange`):** `5-20 cm H₂O`
- **Summary:** "CPAP and PEEP can each be set anywhere from 5 to 20 cm of water pressure."
- **Anchor as recorded in analysis.json:** `t=122`, quote: *"you can set CPAP anywhere from five cm of water pressure all the way up to 20. PE can be anywhere from 5 to 20 as well."*
- **Transcript at the claimed anchor (t=122, ±10s):** discusses PEEP's definition ("...it's set to five, there's still pressure of five in your airways...") — a different sentence, not the CPAP/PEEP range statement.
- **Transcript at the quote's true spoken position (t≈78–88s, located by manual search — see anchor-verification-report.md violation list and the anchor-timestamp-drift finding F-10):**
  > [78.8] "...they're always getting the same amount of pressure. And so you can set CPAP" [81.7] "of pressure. And so you can set CPAP anywhere from five cm of water pressure" [85.1] "anywhere from five cm of water pressure all the way up to 20. PE can be anywhere" [88.3] "all the way up to 20. PE can be anywhere from 5 to 20 as well."
- **Digit-by-digit value comparison:** "five" (5) ... "20" ... "5 to 20" — **exact**, no rounding, no paraphrase, no unit change (cm H₂O implied consistently with the lecture's own usage). Verdict on the **value itself: exact**.
- **Anchor-time fidelity: FAIL.** The claimed anchor (t=122) is ~40s away from where this sentence is actually spoken (t≈81–88s), exceeding the verifier's 15s tolerance by a wide margin. A learner clicking this DOSAGE card's timestamp link lands on an unrelated sentence, not the sentence that supports the safety-tier value. This is a genuine fidelity gap distinct from the value's own accuracy — see FINDINGS.md F-10.

## DOSAGE unit 2 — `pressure-support-range`

- **Stated value (`overlay.normalRange`):** `5-15 cm H₂O`
- **Summary:** "Pressure support can be set anywhere from 5 to 15 (cm H₂O)."
- **Anchor as recorded in analysis.json:** `t=448`, quote: *"That could be anywhere from five to 15. Okay."*
- **Transcript at the claimed anchor (t=448, ±10s):** discusses oxygenation/FiO2 ("...the last two is going to affect your oxygenation. Obviously, the amount of oxygen you put in is going to affect how much oxygen you read on your saturation...") — entirely unrelated content; no numeric range is stated here at all.
- **Transcript at the quote's true spoken position (t≈286–288s, confirmed both by manual search and by the anchor verifier's own `time-drift` classification against segment start 288.32):**
  > [284.6] "...the ventilator on, they get a specific amount of pressure. That could be" [286.6] "the ventilator on, they get a specific amount of pressure. That could be anywhere from five to 15. Okay."
- **Digit-by-digit value comparison:** "five to 15" — **exact**, no rounding, no paraphrase. Verdict on the **value itself: exact**.
- **Anchor-time fidelity: FAIL, and the worst case observed in this run.** The claimed anchor (t=448) is **~160 seconds (2m40s)** away from where the value is actually spoken (t≈288s) — nearly 11× the verifier's 15s tolerance. This is StudyLoop's own verifier's `time-drift` classification (not a `quote-not-found` case, because the quote text happens to reoccur in the caption stream at a locatable segment). A learner clicking this DOSAGE card's link during a real study session would land nearly 3 minutes away from the source, on unrelated FiO2/oxygenation content, not the "5 to 15" statement.

## Verdict

**The numeric values on both safety-tier cards are exact — no rounding, no paraphrase, no unit substitution.** The clinical lens's core promise ("verbatim reproduction of safety-critical numbers") holds for both DOSAGE units produced by this run.

**However, both cards' anchor timestamps are wrong by a wide, non-trivial margin (40s and 160s respectively).** SC2's "safety values are exact" claim, read narrowly as "the number is right," passes 2/2. Read as "the number is right and locatable" — which is what a clickable timestamp link (COMP-02) promises a nursing student — it does **not** pass: a student cannot trust either safety card's "jump to source" link to land on the supporting statement. This is reported here as a **MAJOR** finding (FINDINGS.md F-10) and is reflected in the Clinical mode verdict in the dated report as CONDITIONAL, not PASS.

**CONTRAINDICATION / LAB_VALUE / PRIORITIZATION: untested, not passed.** This analysis produced zero units of these three safety-tier types — the lecture's content (ventilator modes and settings) does not include drug contraindications, lab values, or explicit "what do you do first" prioritization material. SC2's exact-values claim is proven only for the DOSAGE sub-case; the other three safety-tier types remain unexercised by this specific proof run, exactly as 04-01's own scope note anticipated (topic gate cleared PEEP/FiO2/pressure-support/CPAP, not a drug-dosage-bearing topic).
