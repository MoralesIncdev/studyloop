// V3-B B4 "Card transformation" — weak-text heuristic + client resolution
// + cache-fill orchestration.
import { afterEach, describe, expect, it } from "vitest";
import {
  __setCardTransformClientForTests,
  attachTransforms,
  fillTransformCache,
  FakeCardTransformClient,
  hashCardTransformInput,
  isWeakBubbleText,
  resolveCardTransformClient,
  type CachedCardTransform,
  type CardTransformInput,
  type CardTransformLLMClient,
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

describe("hashCardTransformInput", () => {
  it("is deterministic — same input produces the same hash", () => {
    const input: CardTransformInput = { quote: "hip angle", note: "", kind: "bubble" };
    expect(hashCardTransformInput(input)).toBe(hashCardTransformInput({ ...input }));
  });

  it("changes when the quote text changes (e.g. a bubble edit)", () => {
    const a = hashCardTransformInput({ quote: "hip angle", note: "", kind: "bubble" });
    const b = hashCardTransformInput({ quote: "shoulder pressure", note: "", kind: "bubble" });
    expect(a).not.toBe(b);
  });

  it("changes when note or kind changes, holding quote fixed", () => {
    const base = hashCardTransformInput({ quote: "q", note: "n1", kind: "pearl" });
    expect(hashCardTransformInput({ quote: "q", note: "n2", kind: "pearl" })).not.toBe(base);
    expect(hashCardTransformInput({ quote: "q", note: "n1", kind: "bubble" })).not.toBe(base);
  });
});

describe("fillTransformCache", () => {
  const c1Input: CardTransformInput = { quote: "q1", note: "", kind: "bubble" };
  const c2Input: CardTransformInput = { quote: "q2", note: "", kind: "pearl" };
  const candidates = new Map<string, CardTransformInput>([
    ["c1", c1Input],
    ["c2", c2Input],
  ]);
  const c1Hash = hashCardTransformInput(c1Input);
  const c2Hash = hashCardTransformInput(c2Input);

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

  it("returns the cache unchanged (same reference) when no client resolves and nothing is stale", async () => {
    const cache: Record<string, CachedCardTransform> = { c1: { front: "f", back: "b", why: "w", sourceHash: c1Hash } };
    const result = await fillTransformCache(cache, [{ id: "c2" }], candidates, null, "model");
    expect(result).toBe(cache);
  });

  it("fetches only cards present in transformCandidates, skipping the rest", async () => {
    const client = countingClient();
    await fillTransformCache({}, [{ id: "c1" }, { id: "not-a-candidate" }], candidates, client, "model");
    expect(calls).toEqual(["q1"]);
  });

  it("skips a card that's already validly cached (matching sourceHash) — never re-fetches it", async () => {
    const client = countingClient();
    const cache: Record<string, CachedCardTransform> = { c1: { front: "cached-front", back: "b", why: "w", sourceHash: c1Hash } };
    const result = await fillTransformCache(cache, [{ id: "c1" }, { id: "c2" }], candidates, client, "model");
    expect(calls).toEqual(["q2"]); // c1 skipped (already validly cached), only c2 fetched
    expect(result.c1.front).toBe("cached-front"); // untouched
    expect(result.c2.front).toBe("front:q2");
    expect(result.c2.sourceHash).toBe(c2Hash); // freshly-fetched entries carry their hash forward
  });

  it("returns the same cache reference (no-op) when everything requested is already validly cached or not a candidate", async () => {
    const client = countingClient();
    const cache: Record<string, CachedCardTransform> = { c1: { front: "f", back: "b", why: "w", sourceHash: c1Hash } };
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

  // --- V3-B review finding #2: source-content hash invalidation -----------

  it("invalidates and retransforms a cached entry whose sourceHash no longer matches its candidate's current text", async () => {
    const client = countingClient();
    const staleCache: Record<string, CachedCardTransform> = {
      c1: { front: "stale-front", back: "stale-back", why: "stale-why", sourceHash: "deadbeefdeadbeef" },
    };
    const result = await fillTransformCache(staleCache, [{ id: "c1" }], candidates, client, "model");
    expect(calls).toEqual(["q1"]); // retransformed, not skipped
    expect(result.c1.front).toBe("front:q1");
    expect(result.c1.sourceHash).toBe(c1Hash);
  });

  it("drops (never reuses) a pre-migration cached entry with no sourceHash at all, even with no client available", async () => {
    const legacyCache: Record<string, CachedCardTransform> = { c1: { front: "legacy-front", back: "b", why: "w" } };
    const result = await fillTransformCache(legacyCache, [{ id: "c1" }], candidates, null, "model");
    expect(result.c1).toBeUndefined();
  });

  it("retransforms a pre-migration entry with no sourceHash once a client is available", async () => {
    const client = countingClient();
    const legacyCache: Record<string, CachedCardTransform> = { c1: { front: "legacy-front", back: "b", why: "w" } };
    const result = await fillTransformCache(legacyCache, [{ id: "c1" }], candidates, client, "model");
    expect(calls).toEqual(["q1"]);
    expect(result.c1.front).toBe("front:q1");
    expect(result.c1.sourceHash).toBe(c1Hash);
  });

  it("leaves a cached entry alone (no hash check) when its id is no longer a transform candidate at all", async () => {
    const client = countingClient();
    const cache: Record<string, CachedCardTransform> = { gone: { front: "f", back: "b", why: "w" } }; // no sourceHash, and not in `candidates`
    const result = await fillTransformCache(cache, [{ id: "gone" }], candidates, client, "model");
    expect(calls).toEqual([]);
    expect(result).toBe(cache);
  });
});

describe("attachTransforms", () => {
  it("attaches a matching cache entry as `transformed` (front/back/why only, sourceHash stripped), leaving cards without one unchanged", () => {
    const cache: Record<string, CachedCardTransform> = { c1: { front: "f", back: "b", why: "w", sourceHash: "abc123" } };
    const result = attachTransforms([{ id: "c1" }, { id: "c2" }], cache);
    expect(result[0].transformed).toEqual({ front: "f", back: "b", why: "w" });
    expect(result[1].transformed).toBeUndefined();
  });

  it("returns a plain copy (no transformed field added) when cache is undefined", () => {
    const result = attachTransforms([{ id: "c1" }], undefined);
    expect(result).toEqual([{ id: "c1" }]);
  });
});
