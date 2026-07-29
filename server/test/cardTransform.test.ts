// V3-B B4 "Card transformation" — weak-text heuristic + client resolution
// + cache-fill orchestration.
import { afterEach, describe, expect, it } from "vitest";
import {
  __setCardTransformClientForTests,
  attachTransforms,
  fillTransformCache,
  FakeCardTransformClient,
  isWeakBubbleText,
  resolveCardTransformClient,
  type CardTransformInput,
  type CardTransformLLMClient,
  type CardTransformResult,
} from "../src/lib/cardTransform.js";

describe("isWeakBubbleText", () => {
  it("is weak for empty/whitespace-only text", () => {
    expect(isWeakBubbleText("")).toBe(true);
    expect(isWeakBubbleText("   ")).toBe(true);
  });

  it("is weak for short text under 40 chars", () => {
    expect(isWeakBubbleText("Interesting point.")).toBe(true);
  });

  it("is weak for text with no terminal punctuation, even if long", () => {
    const noPunct = "watch the hip angle here not the shoulder or the head";
    expect(noPunct.length).toBeGreaterThanOrEqual(40);
    expect(isWeakBubbleText(noPunct)).toBe(true);
  });

  it("is NOT weak for a complete, reasonably long thought", () => {
    expect(isWeakBubbleText("Watch the hip angle here, not the shoulder or the head.")).toBe(false);
  });

  it("is NOT weak for a genuine question", () => {
    expect(isWeakBubbleText("Why does the elbow stay tucked through this transition?")).toBe(false);
  });
});

describe("FakeCardTransformClient (deterministic)", () => {
  it("is deterministic — same input produces the same output", async () => {
    const client = new FakeCardTransformClient();
    const input = { quote: "The mechanism relies on negative feedback.", note: "", kind: "pearl" as const };
    const first = await client.transform(input, "claude-opus-5");
    const second = await client.transform(input, "claude-opus-5");
    expect(first).toEqual(second);
  });

  it("always returns front/back/why", async () => {
    const client = new FakeCardTransformClient();
    const result = await client.transform({ quote: "q", note: "n", kind: "bubble" }, "claude-opus-5");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.front.length).toBeGreaterThan(0);
    expect(result.data.back.length).toBeGreaterThan(0);
    expect(result.data.why.length).toBeGreaterThan(0);
  });
});

describe("resolveCardTransformClient", () => {
  afterEach(() => {
    __setCardTransformClientForTests(null);
    delete process.env.STUDYLOOP_FAKE_ANALYSIS;
  });

  it("returns a test-injected client above all else", () => {
    const fake: CardTransformLLMClient = { transform: async () => ({ kind: "ok", data: { front: "f", back: "b", why: "w" } }) };
    __setCardTransformClientForTests(fake);
    expect(resolveCardTransformClient(null)).toBe(fake);
  });

  it("returns a FakeCardTransformClient when STUDYLOOP_FAKE_ANALYSIS=1, even with no key", () => {
    process.env.STUDYLOOP_FAKE_ANALYSIS = "1";
    expect(resolveCardTransformClient(null)).toBeInstanceOf(FakeCardTransformClient);
  });

  it("returns null (not a thrown error) when there's no key and no fake mode — transformation is an enhancement, not a gate", () => {
    expect(resolveCardTransformClient(null)).toBeNull();
  });
});

describe("fillTransformCache", () => {
  const candidates = new Map<string, CardTransformInput>([
    ["c1", { quote: "q1", note: "", kind: "bubble" }],
    ["c2", { quote: "q2", note: "", kind: "pearl" }],
  ]);
  let calls: string[];
  function countingClient(): CardTransformLLMClient {
    calls = [];
    return {
      transform: async (input) => {
        calls.push(input.quote);
        return { kind: "ok", data: { front: `front:${input.quote}`, back: `back:${input.quote}`, why: "why" } };
      },
    };
  }

  it("returns the cache unchanged (same reference) when no client resolves", async () => {
    const cache = { c1: { front: "f", back: "b", why: "w" } };
    const result = await fillTransformCache(cache, [{ id: "c2" }], candidates, null, "model");
    expect(result).toBe(cache);
  });

  it("fetches only cards present in transformCandidates, skipping the rest", async () => {
    const client = countingClient();
    await fillTransformCache({}, [{ id: "c1" }, { id: "not-a-candidate" }], candidates, client, "model");
    expect(calls).toEqual(["q1"]);
  });

  it("skips a card that's already cached — never re-fetches it", async () => {
    const client = countingClient();
    const cache = { c1: { front: "cached-front", back: "b", why: "w" } };
    const result = await fillTransformCache(cache, [{ id: "c1" }, { id: "c2" }], candidates, client, "model");
    expect(calls).toEqual(["q2"]); // c1 skipped (already cached), only c2 fetched
    expect(result.c1.front).toBe("cached-front"); // untouched
    expect(result.c2.front).toBe("front:q2");
  });

  it("returns the same cache reference (no-op) when everything requested is already cached or not a candidate", async () => {
    const client = countingClient();
    const cache = { c1: { front: "f", back: "b", why: "w" } };
    const result = await fillTransformCache(cache, [{ id: "c1" }, { id: "unknown" }], candidates, client, "model");
    expect(calls).toEqual([]);
    expect(result).toBe(cache);
  });

  it("leaves the cache untouched for a card whose transform call is skipped (e.g. refusal)", async () => {
    const flaky: CardTransformLLMClient = { transform: async () => ({ kind: "skipped", reason: "refusal", detail: "no" }) };
    const result = await fillTransformCache({}, [{ id: "c1" }], candidates, flaky, "model");
    expect(result).toEqual({});
  });

  it("bounds work to exactly the given card list — never fetches a candidate not in that list", async () => {
    const client = countingClient();
    await fillTransformCache({}, [{ id: "c1" }], candidates, client, "model"); // c2 is a candidate but not requested
    expect(calls).toEqual(["q1"]);
  });
});

describe("attachTransforms", () => {
  it("attaches a matching cache entry as `transformed`, leaving cards without one unchanged", () => {
    const cache: Record<string, CardTransformResult> = { c1: { front: "f", back: "b", why: "w" } };
    const result = attachTransforms([{ id: "c1" }, { id: "c2" }], cache);
    expect(result[0].transformed).toEqual(cache.c1);
    expect(result[1].transformed).toBeUndefined();
  });

  it("returns a plain copy (no transformed field added) when cache is undefined", () => {
    const result = attachTransforms([{ id: "c1" }], undefined);
    expect(result).toEqual([{ id: "c1" }]);
  });
});
