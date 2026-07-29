import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readReviewState, reviewJsonPath, withReviewLock, writeReviewState } from "../src/lib/reviewStore.js";
import { emptyReviewState, introduceCardState, type ReviewState } from "../src/lib/review.js";

describe("readReviewState / writeReviewState", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-review-store-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns an empty state when review.json doesn't exist yet", async () => {
    expect(await readReviewState(dataDir)).toEqual(emptyReviewState());
  });

  it("round-trips a written state", async () => {
    const state: ReviewState = { version: 1, cards: { "bubble:p1:b1": introduceCardState(Date.now()) } };
    await writeReviewState(dataDir, state);
    expect(await readReviewState(dataDir)).toEqual(state);
  });

  it("rebuilds empty on corrupt JSON, rather than throwing (SPEC: 'review.json corruption -> rebuild empty')", async () => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(reviewJsonPath(dataDir), "{ not valid json", "utf8");
    expect(await readReviewState(dataDir)).toEqual(emptyReviewState());
  });

  it("rebuilds empty on a shape that fails schema validation", async () => {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(reviewJsonPath(dataDir), JSON.stringify({ version: 1, cards: "not-an-object" }), "utf8");
    expect(await readReviewState(dataDir)).toEqual(emptyReviewState());
  });
});

describe("withReviewLock", () => {
  it("serializes concurrent operations (global — no key)", async () => {
    const order: number[] = [];
    await Promise.all([
      withReviewLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push(1);
      }),
      withReviewLock(async () => {
        order.push(2);
      }),
    ]);
    // The second call was queued behind the first even though the first is slower.
    expect(order).toEqual([1, 2]);
  });

  it("a rejected operation doesn't poison the lock for the next waiter", async () => {
    await expect(
      withReviewLock(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(withReviewLock(async () => "ok")).resolves.toBe("ok");
  });
});
