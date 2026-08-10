# Hallucination Audit — 2026-08-10

Per Task 1's instruction: every unit and pearl in this analysis carries
`enrichment: undefined` (i.e. falsy — see F-05, 0 units/pearls flagged
enrichment by the model). That means **all 18 units and all 8 pearls are
in scope for this audit** — none is pre-excluded as "model knowledge, not
lecture content."

Method: for each item, the claim is checked against the actual spoken
transcript at the position where the content is **truly** said — which, for
10 of the 18 units, is *not* the timestamp recorded in `analysis.json`'s
`anchors[].t` field (see FINDINGS.md F-10, the anchor-timestamp-drift
finding; also `verification/safety-value-audit.md`). Checking only at the
claimed-but-wrong `t` would produce false "unsupported" verdicts for content
that is genuinely said elsewhere in the lecture — the audit below locates
the true position for every item so grounding is judged against what was
actually said, not against a broken pointer to it. Where the claimed
timestamp is also wrong, that is noted separately and does **not** by
itself count as a hallucination-audit failure (it's an anchor-fidelity
failure, tracked in F-10).

## Units (18/18 audited)

| # | Unit id | Type | Claim | Grounded? | Clinically correct? | Anchor-time OK? |
|---|---|---|---|---|---|---|
| 1 | `cpap-vs-peep-terminology` | CLAIM | CPAP = non-invasive term, PEEP = invasive term for the same continuous-pressure concept | Yes — verbatim at t≈22–48s | Yes (standard usage) | Yes (t=22 exact; t=45 within tolerance, −3s) |
| 2 | `continuous-pressure-in-cpap-peep` | MECHANISM | CPAP/PEEP dials in a pressure, not a volume; constant through breath cycle | Yes — verbatim at t≈50–180s, spread across the true positions of all 3 anchors | Yes | No — all 3 anchors drift 37–40s past tolerance (content real, pointer wrong) |
| 3 | `cpap-and-peep-setting-range` (DOSAGE) | Range 5–20 cm H₂O | Yes — verbatim at t≈82–88s | Yes | No — anchor drifts 40s (see safety-value-audit.md) |
| 4 | `peep-alveolar-recruitment` | MECHANISM | PEEP keeps alveoli open at end-exhale ("recruitment"); higher PEEP recruits more | Yes — verbatim (with ASR-typo correction: "grapeike"→"grape-like", "alvoli"→"alveoli") at t≈154–167s | Yes | No — both anchors drift 78–82s |
| 5 | `cpap-for-obstructive-sleep-apnea` | EXAMPLE | Non-invasive CPAP holds the tongue forward, keeping the airway open in OSA | Yes — verbatim at t≈134–146s | Yes | No — drifts 82s |
| 6 | `pressure-support-ventilation` | CLAIM | PS sets pressure per patient-triggered breath, no rate, popular weaning mode | Yes — verbatim (compressed from a longer passage) at t≈186–248s | Yes | No — all 4 anchors drift 120–160s |
| 7 | `pressure-support-range` (DOSAGE) | Range 5–15 cm H₂O | Yes — verbatim at t≈286–288s | Yes | No — drifts 160s, the worst case (see safety-value-audit.md) |
| 8 | `four-ventilation-modes-compared` (CLUSTER) | Recap of AC/pressure-control/CPAP/PS | Yes — verbatim recap at t≈250–286s (matches the lecture's own summary sentence almost word-for-word) | Yes | No — drifts 160s |
| 9 | `writing-ac-mode-ventilator-orders` (PROCEDURE) | 4-step order-writing walkthrough: mode+rate, tidal volume, FiO₂, PEEP | Yes — verbatim at t≈301–386s (the teaching pass, distinct from the later recap at t≈491–508s that `ac-mode-example-ventilator-settings` correctly anchors) | Yes | No — all 7 anchors drift 200–245s |
| 10 | `vent-parameters-and-gas-exchange` | MECHANISM | First two AC params → CO₂/minute ventilation; last two → oxygenation | Yes — verbatim at t≈427–448s | Yes | **No — drifts ~282s, the largest drift in this run.** This is also a genuine **near-duplicate**: `ventilator-parameter-effects-on-gas-exchange` (unit #11, CLUSTER type, anchors t=430/433/446/448) states the *same fact in nearly the same words* and is correctly anchored to the true position. Anchor-time-aware dedup (ANLZ-01, Phase 2) apparently failed to collapse these two because the surviving duplicate's own anchor time (710/730) is far outside any reasonable proximity window to the other's (430/448) — see FINDINGS.md F-11. |
| 11 | `peep-recruits-alveoli-for-oxygenation` | MECHANISM | PEEP left in circuit at end-exhale recruits alveoli; higher PEEP → better oxygenation | Yes — verbatim at t=421–463s | Yes | **Yes** — anchors pass verification cleanly |
| 12 | `ventilator-parameter-effects-on-gas-exchange` (CLUSTER) | Same 2-groups-of-2-parameters claim as #10 | Yes — verbatim at t=430–448s | Yes | **Yes** — anchors pass |
| 13 | `ac-mode-example-ventilator-settings` | EXAMPLE | Worked example: AC 16, Vt 550, FiO₂ 50%, PEEP 5 | Yes — verbatim at t=494–503s | Yes (matches the values later reused for the waveform walkthrough) | **Yes** |
| 14 | `ac-mode-breath-cycle-on-waveforms` | MECHANISM | Patient-triggered breath: negative deflection → trigger → preset Vt at constant flow → pressure to peak → return to PEEP (not 0) at exhale | Yes — verbatim, all 9 anchors land within tolerance at t=514–625s | Yes | **Yes** |
| 15 | `triggered-vs-backup-breath-on-pressure-waveform` | BOUNDARY | Triggered breath shows negative deflection; backup-rate breath doesn't, otherwise looks the same | Yes — verbatim at t=745–757s | Yes | **Yes** |
| 16 | `ac-mode-volume-set-pressure-variable` | CLAIM | AC dials in volume; pressure is variable, rises with decreased compliance (pulmonary edema, pneumothorax) | Yes — verbatim at t=776–835s | Yes | **Yes** |
| 17 | `pressure-alarm-for-decreased-compliance` | PROCEDURE | Pressure alarm alerts the RT/nurse if compliance-driven pressure exceeds the set threshold | Yes — verbatim at t=801–828s | Yes | **Yes** |
| 18 | `peak-and-plateau-pressures` | CLAIM | Two pressures to know: peak and plateau (deferred to next lecture) | Yes — verbatim at t=844–852s | Yes (honestly reflects the lecturer's own deferral — matches the same "deferred to next video" pattern the 2026-08-08 report also documented for PEEP/FiO2/SIMV) | **Yes** |

**No hallucinated or clinically-wrong claim found.** Every one of the 18 units states something the lecturer genuinely said, expressed accurately (occasionally with an ASR-typo correction — "alvoli"→"alveoli", "grapeike"→"grape-like", "Nex expatory"→"end expiratory" — which is a *quality improvement* over the raw caption text, not a distortion of meaning). The gap this run surfaces is **anchor-time fidelity** (10/18 units, F-10) and **one near-duplicate slipping past anchor-time-aware dedup because of that same drift** (F-11) — not fabricated or wrong content.

## Pearls (8/8 audited)

| # | Pearl (t, label) | Linked unit | Grounded? |
|---|---|---|---|
| 1 | t=25 "CPAP = non-invasive, PEEP = invasive" | `cpap-vs-peep-terminology` | Yes — matches unit #1, correct position |
| 2 | t=106 "CPAP/PEEP delivers constant pressure" | `continuous-pressure-in-cpap-peep` | Yes — matches unit #2's true position (t≈50–110s) |
| 3 | t=244 "PEEP keeps alveoli open (recruited)" | `peep-alveolar-recruitment` | Yes — matches unit #4's true position (t≈154–167s is nearby; pearl's own t=244 is closer to the unit's *claimed* anchor than its true one, but the pearl's own content is still accurate to what's said around this general passage) |
| 4 | t=406 "Pressure support is a key weaning mode" | `pressure-support-ventilation` | Yes — matches unit #6's content |
| 5 | t=430 "Rate+Vt affect CO₂; FiO₂+PEEP affect O₂" | `ventilator-parameter-effects-on-gas-exchange` | Yes — matches unit #12's correct anchor, t=430 exact |
| 6 | t=745 "Negative deflection marks patient-triggered breath" | `triggered-vs-backup-breath-on-pressure-waveform` | Yes — matches unit #15, correct |
| 7 | t=833 "AC mode: volume set, pressure variable" | `ac-mode-volume-set-pressure-variable` | Yes — matches unit #16, correct |
| 8 | t=844 "Peak vs plateau pressure distinction ahead" | `peak-and-plateau-pressures` | Yes — matches unit #18, correct |

All 8 pearls are grounded, clinically accurate, and linked to a real unit (no orphan pearl-only claims). Pearl #3's own `t` sits closer to `peep-alveolar-recruitment`'s claimed-but-wrong anchor than to that unit's true position — noted for completeness, but the pearl's insight text itself ("PEEP keeps small airways and alveolar clusters open... recruitment... higher PEEP recruits more alveoli") is accurate regardless.

## Edges (8/8 spot-checked)

All 8 edge quotes were independently located in the transcript during the anchor-verification pass (see `anchor-verification-report.md`'s violation list): 6 are genuine contiguous statements broken only by the rolling-caption substring issue (F-09), and 2 (`pressure-support-ventilation->four-ventilation-modes-compared`, `vent-parameters-and-gas-exchange->writing-ac-mode-ventilator-orders`) are ellipsis-joined excerpts of two non-contiguous spans — the same pattern 04-02's cross-validation against the 2026-08-08 project already found and flagged (2/51 there). All 8 are content-accurate; none is fabricated.

## Enrichment-badge spot-check

F-05 already recorded that this analysis produced **zero** enrichment-flagged units or pearls. Per Task 1's instruction to "separately spot-check the enrichment-flagged items to confirm the flag is on the right items rather than sprayed broadly": there is nothing to spot-check — the badge set is empty. Whether that's correct (every claim in this 18-unit set really is transcript-grounded, which the audit above independently confirms) or under-applied (a stricter model might have flagged e.g. the ASR-typo corrections as a form of light enrichment) is a judgment call; since every claim traces to real spoken content, an empty enrichment set is at minimum not a false-negative on the "ungrounded claims presented as lecture-derived" failure mode ANLZ-02 targets — there are no such claims here to have missed.

## Overall verdict

**Zero hallucinated or clinically incorrect claims across 18 units, 8 pearls, and 8 edges.** The MAJOR-severity findings from this adversarial pass (F-09 rolling-caption duplication, F-10 anchor-timestamp drift, F-11 a near-duplicate escaping anchor-time-aware dedup) are about **fidelity of the pointer to the source**, not about **truthfulness of the content**. Both matter to a nursing student — a wrong timestamp breaks trust even when the card's own text is correct — and both are reflected honestly in the dated report's per-mode verdict rather than smoothed into a clean PASS.
