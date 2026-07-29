// F11 "Review Mode": `<dataDir>/review.json` persistence — the atomic-write
// primitives already live in lib/store.ts, but review.json isn't scoped to a
// single project the way everything else in store.ts is (one file per
// dataDir, not per project id), so it gets its own small module rather than
// stretching store.ts's per-project helpers to fit.
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "./store.js";
import { emptyReviewState, ReviewStateSchema, type ReviewState } from "./review.js";

export function reviewJsonPath(dataDir: string): string {
  return path.join(dataDir, "review.json");
}

/**
 * SPEC: "review.json corruption → rebuild empty" — a missing file, an
 * unparseable file (invalid JSON), or a shape that fails schema validation
 * are all treated the same way: a fresh empty state, never a thrown error.
 * `readJsonIfExists` only guards ENOENT (see store.ts), so a JSON.parse
 * failure on an actually-corrupt file is caught here explicitly.
 */
export async function readReviewState(dataDir: string): Promise<ReviewState> {
  let raw: unknown;
  try {
    raw = await readJsonIfExists<unknown>(reviewJsonPath(dataDir));
  } catch {
    return emptyReviewState();
  }
  if (raw === null) return emptyReviewState();
  const parsed = ReviewStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyReviewState();
}

export async function writeReviewState(dataDir: string, state: ReviewState): Promise<void> {
  await writeJsonAtomic(reviewJsonPath(dataDir), state);
}

// ---------------------------------------------------------------------------
// Global mutex (SPEC: "via the existing atomic-write + a global mutex").
// review.json is a single dataDir-level file, not keyed by project id, so
// this can't reuse store.ts's withProjectLock (keyed by project id) — it's
// the same promise-chain-lock shape, just with exactly one key.
// ---------------------------------------------------------------------------

let reviewLock: Promise<unknown> = Promise.resolve();

export function withReviewLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = reviewLock.then(fn, fn);
  // Chain link used purely for ordering; never rejects, so it can't poison
  // the next waiter's `.then()` regardless of whether `fn` throws.
  reviewLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
