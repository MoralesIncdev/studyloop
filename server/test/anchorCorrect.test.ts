// Phase 04.1-03 — widens 04.1-01's tracer correction pass
// (correctAnalysisAnchors) into the full F-10 fix: every drift shape the
// real 2026-08-10 proof run exhibited (RESEARCH's empirical drift table),
// clinical safety-tier moves separately identifiable, ellipsis-joined
// quotes located by their first span (Task 1), and pearl timestamp
// correction (Task 2, narrow rule — see below). See also
// anchorFidelity.test.ts (04.1-01's original 4-outcome tracer coverage,
// still passing) and analysisV3.test.ts (Task 2's per-run correction
// telemetry, Task 3's prompt contract).
import { describe, expect, it } from "vitest";
import { correctAnalysisAnchors, isSafetyTierUnitType, SAFETY_TIER_UNIT_TYPES } from "../src/lib/anchorCorrect.js";
import { DEFAULT_TOLERANCE_SEC } from "../src/lib/anchorVerify.js";
import type { AnalysisUnit, Pearl, UnitAnchor, UnitType } from "../src/lib/analysis.js";
import type { TranscriptSegmentInput } from "../src/lib/models.js";

function segment(start: number, text: string): TranscriptSegmentInput {
  return { start, end: start + 0.5, text };
}

function unit(overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id: "u1",
    type: "CLAIM",
    label: "Test unit",
    summary: "summary",
    body: "body",
    anchors: [],
    confidence: 0.8,
    threshold: false,
    ...overrides,
  };
}

function pearl(overrides: Partial<Pearl> = {}): Pearl {
  return {
    t: 0,
    label: "Test pearl",
    insight: "insight",
    importance: 2,
    ...overrides,
  };
}

// --- Ellipsis-joined quotes ---------------------------------------------------
// RESEARCH and 04.1-02's own cross-validation both found the model sometimes
// emits a quote joining two non-contiguous transcript spans with an
// ellipsis — unfindable as a contiguous substring by construction. Fixture
// text mirrors the real edge-quote shape from
// docs/proof-evidence-2026-08-10/anchor-verification-report.md's
// `pressure-support-ventilation->four-ventilation-modes-compared` row
// ("we've already talked about four different modes...And then we just
// talked about pressure support ventilation") — reused here on a UNIT
// anchor, since edges themselves are out of this module's scope (they carry
// no timestamp for a corrector to fix; Task 3 prevents them at the prompt).

describe("correctAnalysisAnchors — ellipsis-joined quotes", () => {
  const segments = [segment(10, "we've already talked about four different modes."), segment(50, "And then we just talked about pressure support ventilation")];

  it("locates an ellipsis-joined quote by its first span and corrects the anchor to that span's position, leaving the quote text unchanged", () => {
    const drifted: UnitAnchor = {
      t: 500,
      quote: "we've already talked about four different modes...And then we just talked about pressure support ventilation",
    };
    const analysis = { units: [unit({ id: "u-ellipsis", anchors: [drifted] })] };

    const { analysis: corrected, corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0].t).toBe(10);
    expect(corrected.units![0].anchors[0].quote).toBe(drifted.quote); // never rewritten to the matched span
    expect(corrections).toEqual([{ unitId: "u-ellipsis", unitType: "CLAIM", before: 500, after: 10, locatedBy: "ellipsis-first-span" }]);
  });

  it("also recognizes the unicode ellipsis character, not just three dots", () => {
    const drifted: UnitAnchor = {
      t: 500,
      quote: "we've already talked about four different modes…And then we just talked about pressure support ventilation",
    };
    const analysis = { units: [unit({ id: "u-ellipsis-unicode", anchors: [drifted] })] };

    const { corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrections).toEqual([{ unitId: "u-ellipsis-unicode", unitType: "CLAIM", before: 500, after: 10, locatedBy: "ellipsis-first-span" }]);
  });

  it("leaves an ellipsis-joined quote untouched when its first span's occurrence is already within tolerance", () => {
    const goodEnough: UnitAnchor = {
      t: 12,
      quote: "we've already talked about four different modes...And then we just talked about pressure support ventilation",
    };
    const analysis = { units: [unit({ id: "u-ellipsis-good", anchors: [goodEnough] })] };

    const { analysis: corrected, corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0]).toBe(goodEnough); // same reference — untouched
    expect(corrections).toEqual([]);
  });

  it("leaves an ellipsis-joined quote unresolved when even its first span cannot be located under exact or normalized matching", () => {
    const ungroundable: UnitAnchor = { t: 500, quote: "this opening was never spoken...nor was this closing" };
    const analysis = { units: [unit({ id: "u-ellipsis-unresolved", anchors: [ungroundable] })] };

    const { analysis: corrected, corrections, unresolved } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0]).toBe(ungroundable);
    expect(corrections).toEqual([]);
    expect(unresolved).toEqual([{ unitId: "u-ellipsis-unresolved", unitType: "CLAIM", t: 500, quote: ungroundable.quote }]);
  });
});

// --- Correction record shape + clinical safety-tier accounting ----------------

describe("correctAnalysisAnchors — correction record shape and safety-tier accounting", () => {
  it("carries unitId, unitType, before, after, and locatedBy on every correction record", () => {
    const segments = [segment(0, "Rate and tidal volume affect carbon dioxide.")];
    const drifted: UnitAnchor = { t: 900, quote: "Rate and tidal volume affect carbon dioxide." };
    const analysis = { units: [unit({ id: "u-shape", type: "MECHANISM", anchors: [drifted] })] };

    const { corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrections).toEqual([{ unitId: "u-shape", unitType: "MECHANISM", before: 900, after: 0, locatedBy: "exact" }]);
  });

  it("a DOSAGE unit exhibiting the baseline run's 160-second drift shape (pressure-support-range) is corrected and its record is identifiable as safety-tier without re-deriving anything", () => {
    // Real 2026-08-10 proof project data: claimed t=448 vs the quote's true
    // position ~286.639s — RESEARCH's "worst within-window drift, 160s,
    // entirely in-bounds" DOSAGE case.
    const segments = [segment(286.639, "That could be anywhere from five to 15. Okay.")];
    const drifted: UnitAnchor = { t: 448, quote: "That could be anywhere from five to 15. Okay." };
    const analysis = { units: [unit({ id: "pressure-support-range", type: "DOSAGE", anchors: [drifted] })] };

    const { corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrections).toHaveLength(1);
    const correction = corrections[0];
    expect(correction.before).toBe(448);
    expect(correction.after).toBeCloseTo(286.639, 3);
    // The caller separates safety-tier moves from ordinary ones using
    // unitType alone — no second lookup or re-derivation required.
    expect(isSafetyTierUnitType(correction.unitType)).toBe(true);
    expect(SAFETY_TIER_UNIT_TYPES.has(correction.unitType)).toBe(true);
  });

  it("correction is uniform across unit types — no behavioral special-case for DOSAGE during correction itself, only in what the record enables the caller to do afterward", () => {
    const segments = [segment(0, "A claim stated once.")];
    const claimAnalysis = { units: [unit({ id: "u-claim", type: "CLAIM", anchors: [{ t: 50, quote: "A claim stated once." }] })] };
    const dosageAnalysis = { units: [unit({ id: "u-dosage", type: "DOSAGE", anchors: [{ t: 50, quote: "A claim stated once." }] })] };

    const claimResult = correctAnalysisAnchors(claimAnalysis, segments);
    const dosageResult = correctAnalysisAnchors(dosageAnalysis, segments);

    expect(claimResult.corrections[0].after).toBe(dosageResult.corrections[0].after);
    expect(claimResult.corrections[0].locatedBy).toBe(dosageResult.corrections[0].locatedBy);
    expect(isSafetyTierUnitType("CLAIM")).toBe(false);
    expect(isSafetyTierUnitType("DOSAGE")).toBe(true);
  });
});

// --- Tolerance default ---------------------------------------------------------

describe("correctAnalysisAnchors — tolerance defaults to anchorVerify's own DEFAULT_TOLERANCE_SEC", () => {
  it("leaves an anchor untouched at exactly the default tolerance boundary, and corrects one second beyond it, with no options passed", () => {
    const segments = [segment(100, "A boundary-tolerance sentence.")];

    const atBoundary: UnitAnchor = { t: 100 + DEFAULT_TOLERANCE_SEC, quote: "A boundary-tolerance sentence." };
    const atResult = correctAnalysisAnchors({ units: [unit({ id: "u-at", anchors: [atBoundary] })] }, segments);
    expect(atResult.corrections).toEqual([]);
    expect(atResult.analysis.units![0].anchors[0]).toBe(atBoundary);

    const beyondBoundary: UnitAnchor = { t: 100 + DEFAULT_TOLERANCE_SEC + 1, quote: "A boundary-tolerance sentence." };
    const beyondResult = correctAnalysisAnchors({ units: [unit({ id: "u-beyond", anchors: [beyondBoundary] })] }, segments);
    expect(beyondResult.corrections).toHaveLength(1);
    expect(beyondResult.corrections[0].after).toBe(100);
  });
});

// --- RESEARCH Pitfall 2: in-window-but-wrong vs out-of-window, one code path --
// This module never sees chunk windows at all — the two standalone cases
// below prove that fact in both directions: an anchor RESEARCH's own chunk
// boundaries call "in-window" and one it calls "out-of-window" are both
// corrected identically, purely by quote position.

describe("correctAnalysisAnchors — RESEARCH Pitfall 2: in-window-but-wrong vs out-of-window, same code path", () => {
  it("corrects an anchor whose claimed t is inside its own chunk's window but far from the quote's true position (the majority real-run shape — 8 of 10 drifted units)", () => {
    // pressure-support-range: claimed t=448 sits inside chunk 0's real
    // [0,480] window (RESEARCH) yet is ~161s from the quote's true
    // position — a bounds-check against [0,480] would have passed this
    // anchor as "fine".
    const segments = [segment(286.639, "That could be anywhere from five to 15. Okay.")];
    const analysis = { units: [unit({ id: "pressure-support-range", type: "DOSAGE", anchors: [{ t: 448, quote: "That could be anywhere from five to 15. Okay." }] })] };

    const { analysis: corrected } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0].t).toBeCloseTo(286.639, 3);
  });

  it("corrects an anchor whose claimed t falls entirely outside its own chunk's window, via the identical code path — no separate bounds-check branch exists", () => {
    // vent-parameters-and-gas-exchange: claimed t=710 falls outside chunk
    // 0's [0,480] window entirely (RESEARCH: "710/730 >> 480").
    const quote =
      "the first two parameters are going to affect carbon dioxide. How fast you're breathing and how much breath you're taking with each breath is going to affect your minute ventilation. And the last two is going to affect your oxygenation.";
    const segments = [segment(424.319, quote)];
    const analysis = { units: [unit({ id: "vent-parameters-and-gas-exchange", type: "MECHANISM", anchors: [{ t: 710, quote }] })] };

    const { analysis: corrected } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0].t).toBeCloseTo(424.319, 3);
  });
});

// --- The real 2026-08-10 proof-run drift-table regression ----------------------
//
// Every value below is either read directly from the real proof project's
// own committed analysis.json (claimed `t`) or computed by replaying the
// ACTUAL shipped pipeline (dedupeRollingCaptions + anchorVerify.ts's
// buildCaptionIndex/findQuoteOccurrences — the same primitives
// correctAnalysisAnchors itself uses) against that project's real,
// F-09-deduped captions.json, at
// /Users/antemo/StudyLoopProof-2026-08-10/projects/41b2d9ea-a4b1-428a-b09a-7065ed3dee1f/.
// This gives exact, verifiable "true position" seconds for most anchors —
// strictly more precise than 04.1-RESEARCH.md's own approximate ranges. A
// handful of quotes are lightly ASR-typo-corrected or compressed paraphrases
// the model produced (per verification/hallucination-audit.md) and are not
// found even against the real deduped captions; for those (marked
// `source: "audit-range"` below) the true position is a specific second
// chosen inside RESEARCH's manually-audited range, landing on the exact
// drift magnitude verification/hallucination-audit.md itself reports where
// that document gives one (documented per-row below).
//
// The fixture reproduces DRIFT GEOMETRY (claimed vs. true, in-window vs.
// out) using the real quote wording, not a synthetic paraphrase — this is
// the plan's own explicit request, and is strictly more faithful than a
// hand-invented example.
//
// Finding recorded here, not smoothed over: 04.1-RESEARCH.md's own
// "Empirical drift table" lists `cpap-vs-peep-terminology` as one of its 10
// rows ("near-zero drift"), but replaying the real pipeline against the
// real captions shows BOTH of that unit's claimed anchors are already
// within the 15s tolerance (22 vs 21.99; 45 vs 42.239) — independently
// confirmed by verification/hallucination-audit.md's own per-unit verdict
// ("Anchor-time OK? Yes"). This fixture asserts the honest outcome (both
// anchors untouched) rather than forcing a "correction" the evidence does
// not support. `continuous-pressure-in-cpap-peep` similarly turns out to be
// a MIXED case per the real data: its first anchor (53 vs true 50.879) is
// already within tolerance while its other two anchors genuinely drift
// ~40s — asserted per-anchor below, not lumped per-unit.

interface DriftAnchor {
  claimed: number;
  /** The real (or audit-range-derived) true position. */
  expected: number;
  quote: string;
  /** Whether |claimed - expected| exceeds the default 15s tolerance — i.e. whether correctAnalysisAnchors is expected to move this specific anchor. */
  drifted: boolean;
  source: "real-data" | "audit-range";
}

interface DriftUnit {
  id: string;
  type: UnitType;
  anchors: DriftAnchor[];
}

const REAL_DRIFT_TABLE: DriftUnit[] = [
  {
    id: "cpap-vs-peep-terminology",
    type: "CLAIM",
    anchors: [
      {
        claimed: 22,
        expected: 21.99,
        drifted: false,
        source: "real-data",
        quote:
          "CPAP is typically the term that is used if this is non-invasive ventilation. In other words, if instead of putting a tube down into someone's throat, we instead did a mask to fit over their face like a BiPAP mask or a CPAP mask in fact is what it's called.",
      },
      {
        claimed: 45,
        expected: 42.239,
        drifted: false,
        source: "real-data",
        quote: "you have a ventilator on uh and invasively then it's kind of known as PEEP",
      },
    ],
  },
  {
    id: "continuous-pressure-in-cpap-peep",
    type: "MECHANISM",
    anchors: [
      {
        claimed: 53,
        expected: 50.879,
        drifted: false,
        source: "real-data",
        quote:
          "This mode of ventilation is simply you're not dialing in a vent setting. You're not dialing in a specific volume. In fact, what you're do what you are dialing in, however, is a pressure. But this pressure is continuous.",
      },
      {
        claimed: 112,
        expected: 72.07,
        drifted: true,
        source: "real-data",
        quote: "it doesn't matter whether the patient is breathing in or whether the patient is breathing out, they're always getting the same amount of pressure",
      },
      {
        claimed: 142,
        expected: 101.759,
        drifted: true,
        source: "real-data",
        quote:
          "PEEP stands for positive and expiratory pressure. that positive end expiratory pressure is there even at the end of exhalation. So that when you breathe out instead of having zero pressure in your lungs, there's actually still pressure in there.",
      },
    ],
  },
  {
    id: "cpap-and-peep-setting-range",
    type: "DOSAGE",
    anchors: [
      {
        claimed: 122,
        expected: 78.799,
        drifted: true,
        source: "real-data",
        quote: "you can set CPAP anywhere from five cm of water pressure all the way up to 20. PE can be anywhere from 5 to 20 as well.",
      },
    ],
  },
  {
    id: "peep-alveolar-recruitment",
    type: "MECHANISM",
    // Not found even against the real deduped captions (ASR-typo correction
    // — "grapeike"→"grape-like", "alvoli"→"alveoli", per
    // hallucination-audit.md #4). True position: RESEARCH's ~154-167s
    // range, landing on the exact 78s/82s drift the audit itself reports.
    anchors: [
      {
        claimed: 232,
        expected: 154,
        drifted: true,
        source: "audit-range",
        quote:
          "these airways come down to small little tiny airways where they have little grape-like clusters. That PEEP or that positive end expiratory pressure is really good at keeping those alveoli open and what we call recruited.",
      },
      { claimed: 249, expected: 167, drifted: true, source: "audit-range", quote: "if you'd like to keep those alveoli open, you can increase the PEEP on the ventilator" },
    ],
  },
  {
    id: "cpap-for-obstructive-sleep-apnea",
    type: "EXAMPLE",
    // Not found even against the real deduped captions (compressed
    // paraphrase). True position: RESEARCH's ~134-146s range, landing on
    // the audit's own reported 82s drift.
    anchors: [
      {
        claimed: 216,
        expected: 134,
        drifted: true,
        source: "audit-range",
        quote:
          "this could have a lot of good impact in the non-invasive mode if you've got obstructive sleep apnea because that pressure in your airway is going to keep your tongue forward. It's going to keep your airway open so that you don't have obstructive sleep apnea.",
      },
    ],
  },
  {
    id: "pressure-support-ventilation",
    type: "CLAIM",
    anchors: [
      { claimed: 306, expected: 184.08, drifted: true, source: "real-data", quote: "pressure support or just PS. Now, this is kind of like PEEP and CPAP except it only occurs" },
      {
        claimed: 328,
        expected: 207.67,
        drifted: true,
        source: "real-data",
        quote:
          "this is kind of like AC except that instead of delivering a specific volume, this patient is going to get a certain amount of pressure. So it delivers a specific pressure support for each breath. Now the patient initiates all the breaths.",
      },
      {
        claimed: 354,
        expected: 231.28,
        drifted: true,
        source: "real-data",
        quote: "This is a little different from pressure control where in pressure control you can actually set the rate.",
      },
      // Not found even against the real deduped captions (compressed
      // paraphrase). True position: RESEARCH's ~186-248s range end,
      // landing near the audit's own reported "120-160s" drift ceiling.
      {
        claimed: 400,
        expected: 248,
        drifted: true,
        source: "audit-range",
        quote: "higher pressure supports give bigger breaths. The bigger the pressure, the bigger the breath is going to be. This is a very popular weaning mode of ventilation",
      },
    ],
  },
  {
    id: "pressure-support-range",
    type: "DOSAGE",
    anchors: [{ claimed: 448, expected: 286.639, drifted: true, source: "real-data", quote: "That could be anywhere from five to 15. Okay." }],
  },
  {
    id: "four-ventilation-modes-compared",
    type: "CLUSTER",
    anchors: [
      {
        claimed: 410,
        expected: 247.519,
        drifted: true,
        source: "real-data",
        quote:
          "we've already talked about four different modes. We've talked about AC, where the patient triggers the ventilator and the patient gets a specific volume of breath. We've talked about pressure control, where the patient or the ventilator can both cause the ventilator to give a specific pressure and then come back down to specific pressure. And we've talked about CPAP, where the patient is on a continuous pressure regardless of whether or not they're taking a breath in or out. And then we just talked about pressure support ventilation where on each breath that the patient triggers the ventilator on, they get a specific amount of pressure.",
      },
    ],
  },
  {
    id: "writing-ac-mode-ventilator-orders",
    type: "PROCEDURE",
    anchors: [
      { claimed: 501, expected: 298.479, drifted: true, source: "real-data", quote: "there's four things that you should know about writing the orders for vent" },
      // Not found even against the real deduped captions (compressed
      // paraphrase). Interpolated between the real 298.479 and 334.8
      // anchors either side of it.
      {
        claimed: 511,
        expected: 303,
        drifted: true,
        source: "audit-range",
        quote: "The first thing you need to know is you need to write a mode. In this case, we're going to do AC. Remember that's assist control continuous mandatory ventilation.",
      },
      { claimed: 537, expected: 334.8, drifted: true, source: "real-data", quote: "if we put 16, that means the patient is going to receive at least 16 breaths per minute. If he doesn't breathe, the ventilator is going to give that to him." },
      // Not found even against the real deduped captions. Interpolated
      // between the real 334.8 and 360.4 anchors either side of it.
      { claimed: 552, expected: 345, drifted: true, source: "audit-range", quote: "you need to put in a tidal volume. And let's just say it's going to be 550 milliliters." },
      { claimed: 605, expected: 360.4, drifted: true, source: "real-data", quote: "The next thing you put in is the FiO2. So what is that? The FiO2 is the fractional inspiration of oxygen." },
      {
        claimed: 615,
        expected: 373.039,
        drifted: true,
        source: "real-data",
        quote: "let's just say we're going to set it to about 50%. That means 50% of the volume of the patient's breathing is going to be oxygen.",
      },
      { claimed: 626, expected: 379.28, drifted: true, source: "real-data", quote: "the last thing that we set is the PEEP. Let's say it's five." },
    ],
  },
  {
    id: "vent-parameters-and-gas-exchange",
    type: "MECHANISM",
    anchors: [
      {
        claimed: 710,
        expected: 424.319,
        drifted: true,
        source: "real-data",
        quote:
          "the first two parameters are going to affect carbon dioxide. How fast you're breathing and how much breath you're taking with each breath is going to affect your minute ventilation. And the last two is going to affect your oxygenation.",
      },
      // Not found even against the real deduped captions. Interpolated
      // within RESEARCH's ~427-448s range, close to the real 424.319 anchor
      // just before it — this is RESEARCH's own "largest drift in this
      // run" unit (~282-290s).
      {
        claimed: 730,
        expected: 440,
        drifted: true,
        source: "audit-range",
        quote: "the amount of oxygen you put in is going to affect how much oxygen you read on your saturation. And as it turns out, the higher the PEEP, the more alveoli you can recruit and therefore the better the oxygenation is going to be.",
      },
    ],
  },
];

// The eight correctly-anchored units (RESEARCH's own list) — every anchor's
// real position (computed the same way, against the real deduped captions)
// is already within tolerance of its claimed `t`, per
// hallucination-audit.md's independent "Anchor-time OK? Yes" verdict for
// all eight.
const REAL_CORRECT_UNITS: DriftUnit[] = [
  {
    id: "peep-recruits-alveoli-for-oxygenation",
    type: "MECHANISM",
    anchors: [
      { claimed: 421, expected: 416.639, drifted: false, source: "real-data", quote: "is going to be left in the circuit at the end of exhalation. Remember this" },
      { claimed: 424, expected: 421.28, drifted: false, source: "real-data", quote: "pressure is there to recruit alvoli." },
      { claimed: 458, expected: 455.12, drifted: false, source: "real-data", quote: "turns out, the higher the PEEP, the more" },
      { claimed: 460, expected: 457.759, drifted: false, source: "real-data", quote: "alvoli you can recruit and therefore the" },
      { claimed: 463, expected: 460.08, drifted: false, source: "real-data", quote: "better the oxygenation is going to be." },
    ],
  },
  {
    id: "ventilator-parameter-effects-on-gas-exchange",
    type: "CLUSTER",
    anchors: [
      { claimed: 430, expected: 427.36, drifted: false, source: "real-data", quote: "first two" },
      { claimed: 433, expected: 430.08, drifted: false, source: "real-data", quote: "parameters are going to affect carbon" },
      { claimed: 446, expected: 441.919, drifted: false, source: "real-data", quote: "ventilation. And the last two" },
      { claimed: 448, expected: 446.08, drifted: false, source: "real-data", quote: "is going to affect your oxygenation." },
    ],
  },
  {
    id: "ac-mode-example-ventilator-settings",
    type: "EXAMPLE",
    anchors: [
      { claimed: 494, expected: 494.4, drifted: false, source: "real-data", quote: "AC 16, tidal volume 550," },
      { claimed: 503, expected: 500.4, drifted: false, source: "real-data", quote: "FiO2 of 50% and a PEEP of five." },
    ],
  },
  {
    id: "ac-mode-breath-cycle-on-waveforms",
    type: "MECHANISM",
    anchors: [
      { claimed: 514, expected: 511.84, drifted: false, source: "real-data", quote: "a PEEP of five. And so there will always" },
      { claimed: 528, expected: 523.919, drifted: false, source: "real-data", quote: "down to a negative pressure. Okay? And" },
      { claimed: 530, expected: 527.519, drifted: false, source: "real-data", quote: "at that point it's going to trigger the ventilator" },
      { claimed: 550, expected: 550.31, drifted: false, source: "real-data", quote: "title volume. Okay." },
      { claimed: 570, expected: 570.32, drifted: false, source: "real-data", quote: "immediately go up and it's going to be a" },
      { claimed: 576, expected: 572.88, drifted: false, source: "real-data", quote: "constant flow that you can preset until" },
      { claimed: 596, expected: 593.519, drifted: false, source: "real-data", quote: "in COPD. Now, when you have that preset" },
      { claimed: 623, expected: 621.12, drifted: false, source: "real-data", quote: "But it will not go to zero because" },
      { claimed: 625, expected: 622.56, drifted: false, source: "real-data", quote: "remember we have a peep of five." },
    ],
  },
  {
    id: "triggered-vs-backup-breath-on-pressure-waveform",
    type: "BOUNDARY",
    anchors: [
      { claimed: 745, expected: 740.959, drifted: false, source: "real-data", quote: "Notice that in a patient triggered" },
      { claimed: 747, expected: 745.2, drifted: false, source: "real-data", quote: "breath you will see a negative" },
      { claimed: 750, expected: 746.88, drifted: false, source: "real-data", quote: "deflection in the pressure circuit but" },
      { claimed: 753, expected: 749.92, drifted: false, source: "real-data", quote: "in a ventilator" },
      { claimed: 757, expected: 753.12, drifted: false, source: "real-data", quote: "given breath it will be missing." },
    ],
  },
  {
    id: "ac-mode-volume-set-pressure-variable",
    type: "CLAIM",
    anchors: [
      { claimed: 776, expected: 771.92, drifted: false, source: "real-data", quote: "compliance of the system goes down," },
      { claimed: 780, expected: 778.16, drifted: false, source: "real-data", quote: "going to give the same volume. But what" },
      { claimed: 783, expected: 780.399, drifted: false, source: "real-data", quote: "you would see is you would see a higher" },
      { claimed: 808, expected: 806.32, drifted: false, source: "real-data", quote: "let's say it becomes with pulmonary" },
      { claimed: 810, expected: 807.839, drifted: false, source: "real-data", quote: "edema or there's a numoththorax or" },
      { claimed: 830, expected: 830.32, drifted: false, source: "real-data", quote: "So remember, in AC mode, you dial in the" },
      { claimed: 833, expected: 832.959, drifted: false, source: "real-data", quote: "volume. The pressure is variable" },
      { claimed: 835, expected: 835.2, drifted: false, source: "real-data", quote: "depending on the compliance." },
    ],
  },
  {
    id: "pressure-alarm-for-decreased-compliance",
    type: "PROCEDURE",
    anchors: [
      { claimed: 801, expected: 797.36, drifted: false, source: "real-data", quote: "you can actually set a pressure alarm" },
      { claimed: 818, expected: 813.92, drifted: false, source: "real-data", quote: "If this pressure exceeds" },
      { claimed: 822, expected: 818.48, drifted: false, source: "real-data", quote: "the set pressure alarm, there will be a" },
      { claimed: 825, expected: 821.92, drifted: false, source: "real-data", quote: "bell that goes off and the respiratory" },
      { claimed: 828, expected: 825.04, drifted: false, source: "real-data", quote: "therapist or the nurse will be drawn to" },
    ],
  },
  {
    id: "peak-and-plateau-pressures",
    type: "CLAIM",
    anchors: [
      { claimed: 844, expected: 842.399, drifted: false, source: "real-data", quote: "There's actually two types of pressures" },
      { claimed: 847, expected: 844.399, drifted: false, source: "real-data", quote: "that you've got to be concerned about." },
      { claimed: 849, expected: 846.88, drifted: false, source: "real-data", quote: "One is a peak pressure and the other is" },
      { claimed: 852, expected: 849.44, drifted: false, source: "real-data", quote: "a plateau pressure." },
    ],
  },
];

describe("correctAnalysisAnchors — real 2026-08-10 proof-run drift-table regression (all 18 units, 66 anchors)", () => {
  const allUnits = [...REAL_DRIFT_TABLE, ...REAL_CORRECT_UNITS];
  const segments: TranscriptSegmentInput[] = allUnits
    .flatMap((u) => u.anchors)
    .sort((a, b) => a.expected - b.expected)
    .map((a) => segment(a.expected, a.quote));

  const analysis = {
    units: allUnits.map((u) => unit({ id: u.id, type: u.type, anchors: u.anchors.map((a) => ({ t: a.claimed, quote: a.quote })) })),
  };

  const { analysis: corrected, corrections, unresolved } = correctAnalysisAnchors(analysis, segments);

  it("resolves every one of the 66 real anchors — none unresolved", () => {
    expect(unresolved).toEqual([]);
  });

  it("corrects exactly the 21 genuinely-drifted anchors (>15s from true position) across the 10 drifted-table units, leaving the other 45 untouched", () => {
    const expectedDriftedCount = allUnits.reduce((n, u) => n + u.anchors.filter((a) => a.drifted).length, 0);
    expect(expectedDriftedCount).toBe(21);
    expect(corrections).toHaveLength(21);
  });

  describe.each(REAL_DRIFT_TABLE)("unit $id", (fixture) => {
    it("every anchor lands at its documented true position when genuinely drifted, or stays at its claimed t when already within tolerance", () => {
      const correctedUnit = corrected.units!.find((u) => u.id === fixture.id)!;
      fixture.anchors.forEach((a, i) => {
        if (a.drifted) {
          expect(correctedUnit.anchors[i].t).toBeCloseTo(a.expected, 1);
        } else {
          expect(correctedUnit.anchors[i].t).toBe(a.claimed);
        }
        // The quote is never rewritten, whether or not t moved.
        expect(correctedUnit.anchors[i].quote).toBe(a.quote);
      });
    });
  });

  describe.each(REAL_CORRECT_UNITS)("unit $id", (fixture) => {
    it("every anchor is byte-identical to the original (already within tolerance in the real run)", () => {
      const originalUnit = analysis.units.find((u) => u.id === fixture.id)!;
      const correctedUnit = corrected.units!.find((u) => u.id === fixture.id)!;
      expect(correctedUnit.anchors).toEqual(originalUnit.anchors);
    });
  });

  it("both DOSAGE safety-tier units (cpap-and-peep-setting-range, pressure-support-range) are corrected, and each correction record is identifiable as safety-tier", () => {
    const dosageCorrections = corrections.filter((c) => c.unitType === "DOSAGE");
    expect(dosageCorrections.map((c) => c.unitId).sort()).toEqual(["cpap-and-peep-setting-range", "pressure-support-range"]);
    for (const c of dosageCorrections) expect(isSafetyTierUnitType(c.unitType)).toBe(true);
  });
});

// --- Task 2: pearl timestamp correction — the narrow rule ---------------------
// anchorVerify.ts's own pearl check (:273-284) is a range check against the
// last caption segment's end, with no quote to match — that is exactly what
// bounds what correction is even possible here: a pearl is never located by
// content, only ever brought back inside a range it already has independent
// evidence for (its own linked unit's corrected anchor).

describe("correctAnalysisAnchors — pearl timestamp correction", () => {
  const segments = [segment(0, "Opening statement of the lecture."), segment(20, "Closing statement of the lecture.")];
  // lastSegmentEnd = 20.5 (segments run 0-0.5 and 20-20.5).

  it("leaves an in-range pearl timestamp byte-identical, whether or not it links to a unit", () => {
    const linked = pearl({ label: "in-range-linked", t: 10, unitId: "u-anchored" });
    const unlinked = pearl({ label: "in-range-unlinked", t: 15 });
    const analysis = {
      units: [unit({ id: "u-anchored", anchors: [{ t: 5, quote: "Opening statement of the lecture." }] })],
      pearls: [linked, unlinked],
    };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.pearls![0]).toBe(linked); // same reference — untouched
    expect(corrected.pearls![1]).toBe(unlinked);
    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toEqual([]);
  });

  it("moves an out-of-range pearl to its linked unit's earliest CORRECTED anchor time", () => {
    // The unit's own anchor is itself drifted (claimed t=999, far outside
    // the caption stream) and gets corrected to 0 first — the pearl must
    // land on the CORRECTED position (0), not the unit's stale claimed one.
    const analysis = {
      units: [unit({ id: "u-anchored", anchors: [{ t: 999, quote: "Opening statement of the lecture." }] })],
      pearls: [pearl({ label: "out-of-range-linked", t: 500, unitId: "u-anchored" })],
    };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.pearls![0].t).toBe(0);
    expect(pearlCorrections).toEqual([{ pearlLabel: "out-of-range-linked", unitId: "u-anchored", before: 500, after: 0 }]);
    expect(unresolvedPearls).toEqual([]);
  });

  it("leaves an out-of-range pearl untouched and unresolved when it links to no unit — never clamps it to the transcript end", () => {
    const orphan = pearl({ label: "out-of-range-orphan", t: 500 });
    const analysis = { units: [unit({ id: "u-anchored", anchors: [{ t: 5, quote: "Opening statement of the lecture." }] })], pearls: [orphan] };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.pearls![0]).toBe(orphan); // untouched, not clamped to 20.5
    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toEqual([{ pearlLabel: "out-of-range-orphan", t: 500, unitId: undefined }]);
  });

  it("leaves an out-of-range pearl untouched and unresolved when its linked unit has zero anchors", () => {
    const orphanLink = pearl({ label: "out-of-range-empty-unit", t: 500, unitId: "u-no-anchors" });
    const analysis = { units: [unit({ id: "u-no-anchors", anchors: [] })], pearls: [orphanLink] };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.pearls![0]).toBe(orphanLink);
    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toEqual([{ pearlLabel: "out-of-range-empty-unit", t: 500, unitId: "u-no-anchors" }]);
  });

  it("leaves an out-of-range pearl untouched and unresolved when its unitId names a unit that does not exist", () => {
    const staleLink = pearl({ label: "out-of-range-stale-link", t: 500, unitId: "u-does-not-exist" });
    const analysis = { units: [unit({ id: "u-anchored", anchors: [{ t: 5, quote: "Opening statement of the lecture." }] })], pearls: [staleLink] };

    const { pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toEqual([{ pearlLabel: "out-of-range-stale-link", t: 500, unitId: "u-does-not-exist" }]);
  });

  it("a `pearls` key that is absent entirely leaves the returned analysis with no `pearls` key at all — 04.1-01's units-only tracer scope is unaffected", () => {
    const analysis = { units: [unit({ id: "u-only", anchors: [{ t: 5, quote: "Opening statement of the lecture." }] })] };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, segments);

    expect("pearls" in corrected).toBe(false);
    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toEqual([]);
  });

  it("an empty caption stream (no valid range at all) leaves every pearl untouched and unresolved, never a false pass", () => {
    const analysis = { units: [], pearls: [pearl({ label: "no-captions", t: 5 })] };

    const { analysis: corrected, pearlCorrections, unresolvedPearls } = correctAnalysisAnchors(analysis, []);

    expect(corrected.pearls![0].t).toBe(5);
    expect(pearlCorrections).toEqual([]);
    expect(unresolvedPearls).toHaveLength(1);
  });
});
