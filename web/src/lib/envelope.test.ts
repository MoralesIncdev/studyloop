import { describe, expect, it } from "vitest";
import { ENVELOPE_DECAY_S, ENVELOPE_FADE_IN_S, envelopeOpacity } from "./envelope";

describe("envelopeOpacity", () => {
  const start = 100;
  const end = 130;

  it("is 0 well before the fade-in window", () => {
    expect(envelopeOpacity(start - ENVELOPE_FADE_IN_S - 1, start, end)).toBe(0);
  });

  it("ramps linearly across the fade-in window", () => {
    const mid = start - ENVELOPE_FADE_IN_S / 2;
    expect(envelopeOpacity(mid, start, end)).toBeCloseTo(0.5);
    expect(envelopeOpacity(start - ENVELOPE_FADE_IN_S, start, end)).toBeCloseTo(0);
  });

  it("is 1 across the whole span, inclusive of both ends", () => {
    expect(envelopeOpacity(start, start, end)).toBe(1);
    expect(envelopeOpacity((start + end) / 2, start, end)).toBe(1);
    expect(envelopeOpacity(end, start, end)).toBe(1);
  });

  it("decays linearly after the span ends", () => {
    const mid = end + ENVELOPE_DECAY_S / 2;
    expect(envelopeOpacity(mid, start, end)).toBeCloseTo(0.5);
  });

  it("is 0 once fully decayed", () => {
    expect(envelopeOpacity(end + ENVELOPE_DECAY_S, start, end)).toBe(0);
    expect(envelopeOpacity(end + ENVELOPE_DECAY_S + 100, start, end)).toBe(0);
  });

  it("honors custom fade-in/decay windows", () => {
    expect(envelopeOpacity(start - 5, start, end, 10, 20)).toBeCloseTo(0.5);
    expect(envelopeOpacity(end + 10, start, end, 10, 20)).toBeCloseTo(0.5);
  });
});
