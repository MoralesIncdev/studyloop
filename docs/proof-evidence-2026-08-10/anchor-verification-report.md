# Anchor Verification Report

- **Project:** `/Users/antemo/StudyLoopProof-2026-08-10/projects/41b2d9ea-a4b1-428a-b09a-7065ed3dee1f`
- **Checked at:** 2026-08-10T19:25:11.091Z
- **Tolerance:** 15s

## Totals by collection

| Collection | Checked |
|---|---|
| Unit anchors | 66 |
| Edge quotes | 8 |
| Pearl timestamps | 8 |
| **Total** | **82** |

## Exact / normalized split

| Classification | Count |
|---|---|
| Exact | 50 |
| Normalized (whitespace/case) | 0 |
| Violations | 32 |

## Violations (32)

| Kind | Id | Reason | Anchor t | Matched segment start | Quote |
|---|---|---|---|---|---|
| unit | cpap-vs-peep-terminology | quote-not-found | 22 |  | CPAP is typically the term that is used if this is non-invasive ventilation. In other words, if instead of putting a tub… |
| unit | cpap-vs-peep-terminology | quote-not-found | 45 |  | you have a ventilator on uh and invasively then it's kind of known as PEEP |
| unit | continuous-pressure-in-cpap-peep | quote-not-found | 53 |  | This mode of ventilation is simply you're not dialing in a vent setting. You're not dialing in a specific volume. In fac… |
| unit | continuous-pressure-in-cpap-peep | quote-not-found | 112 |  | it doesn't matter whether the patient is breathing in or whether the patient is breathing out, they're always getting th… |
| unit | continuous-pressure-in-cpap-peep | quote-not-found | 142 |  | PEEP stands for positive and expiratory pressure. that positive end expiratory pressure is there even at the end of exha… |
| unit | cpap-and-peep-setting-range | quote-not-found | 122 |  | you can set CPAP anywhere from five cm of water pressure all the way up to 20. PE can be anywhere from 5 to 20 as well. |
| unit | peep-alveolar-recruitment | quote-not-found | 232 |  | these airways come down to small little tiny airways where they have little grape-like clusters. That PEEP or that posit… |
| unit | peep-alveolar-recruitment | quote-not-found | 249 |  | if you'd like to keep those alveoli open, you can increase the PEEP on the ventilator |
| unit | cpap-for-obstructive-sleep-apnea | quote-not-found | 216 |  | this could have a lot of good impact in the non-invasive mode if you've got obstructive sleep apnea because that pressur… |
| unit | pressure-support-ventilation | quote-not-found | 306 |  | pressure support or just PS. Now, this is kind of like PEEP and CPAP except it only occurs |
| unit | pressure-support-ventilation | quote-not-found | 328 |  | this is kind of like AC except that instead of delivering a specific volume, this patient is going to get a certain amou… |
| unit | pressure-support-ventilation | quote-not-found | 354 |  | This is a little different from pressure control where in pressure control you can actually set the rate. |
| unit | pressure-support-ventilation | quote-not-found | 400 |  | higher pressure supports give bigger breaths. The bigger the pressure, the bigger the breath is going to be. This is a v… |
| unit | pressure-support-range | time-drift | 448 | 288.32 | That could be anywhere from five to 15. Okay. |
| unit | four-ventilation-modes-compared | quote-not-found | 410 |  | we've already talked about four different modes. We've talked about AC, where the patient triggers the ventilator and th… |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 501 |  | there's four things that you should know about writing the orders for vent |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 511 |  | The first thing you need to know is you need to write a mode. In this case, we're going to do AC. Remember that's assist… |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 537 |  | if we put 16, that means the patient is going to receive at least 16 breaths per minute. If he doesn't breathe, the vent… |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 552 |  | you need to put in a tidal volume. And let's just say it's going to be 550 milliliters. |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 605 |  | The next thing you put in is the FiO2. So what is that? The FiO2 is the fractional inspiration of oxygen. |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 615 |  | let's just say we're going to set it to about 50%. That means 50% of the volume of the patient's breathing is going to b… |
| unit | writing-ac-mode-ventilator-orders | quote-not-found | 626 |  | the last thing that we set is the PEEP. Let's say it's five. |
| unit | vent-parameters-and-gas-exchange | quote-not-found | 710 |  | the first two parameters are going to affect carbon dioxide. How fast you're breathing and how much breath you're taking… |
| unit | vent-parameters-and-gas-exchange | quote-not-found | 730 |  | the amount of oxygen you put in is going to affect how much oxygen you read on your saturation. And as it turns out, the… |
| edge | cpap-for-obstructive-sleep-apnea->continuous-pressure-in-cpap-peep | quote-not-found |  |  | this could have a lot of good impact in the non-invasive mode if you've got obstructive sleep apnea because that pressur… |
| edge | peep-alveolar-recruitment->continuous-pressure-in-cpap-peep | quote-not-found |  |  | That PEEP or that positive end expiratory pressure is really good at keeping those alveoli open and what we call recruit… |
| edge | pressure-support-ventilation->four-ventilation-modes-compared | quote-not-found |  |  | we've already talked about four different modes...And then we just talked about pressure support ventilation |
| edge | writing-ac-mode-ventilator-orders->four-ventilation-modes-compared | quote-not-found |  |  | The first thing you need to know is you need to write a mode. In this case, we're going to do AC. |
| edge | vent-parameters-and-gas-exchange->writing-ac-mode-ventilator-orders | quote-not-found |  |  | the first two parameters are going to affect carbon dioxide...And the last two is going to affect your oxygenation. |
| edge | pressure-alarm-for-decreased-compliance->ac-mode-volume-set-pressure-variable | quote-not-found |  |  | you can actually set a pressure alarm here so that if the compliance of the lung does go down |
| edge | ac-mode-breath-cycle-on-waveforms->ac-mode-volume-set-pressure-variable | quote-not-found |  |  | we're still going to give the same volume. But what you would see is you would see a higher pressure. |
| edge | ac-mode-example-ventilator-settings->ac-mode-breath-cycle-on-waveforms | quote-not-found |  |  | So what we have here recall is AC 16, tidal volume 550, FiO2 of 50% and a PEEP of five. So the first thing you want to n… |
