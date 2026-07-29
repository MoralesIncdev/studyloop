// V3-B review fix #7 "AI pearls enter review without learner attestation or
// generation": `<project>/pearlReviewAdds.json` — the set of pearls the
// learner explicitly added to their review queue via the rail's "Add to
// review" action (PEDAGOGY §5 path (b); path (a) is the pearl's `unitId`
// link being attested — see lib/review.ts's deriveLiveCards). Mirrors
// lib/attestationStore.ts's shape: per-project (not per-dataDir), so it
// reuses store.ts's existing per-project mutex (withProjectLock).
import path from "node:path";
import { z } from "zod";
import { projectDir, readJsonIfExists, writeJsonAtomic } from "./store.js";

const PearlReviewAddsSchema = z.array(z.string());

export function pearlReviewAddsJsonPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "pearlReviewAdds.json");
}

/** A missing file, corrupt JSON, or a shape that fails schema validation all rebuild to an empty set — same "corruption never throws" rule attestationStore.ts/reviewStore.ts apply to their own files. */
export async function readPearlReviewAdds(dataDir: string, id: string): Promise<Set<string>> {
  let raw: unknown;
  try {
    raw = await readJsonIfExists<unknown>(pearlReviewAddsJsonPath(dataDir, id));
  } catch {
    return new Set();
  }
  if (raw === null) return new Set();
  const parsed = PearlReviewAddsSchema.safeParse(raw);
  return parsed.success ? new Set(parsed.data) : new Set();
}

export async function writePearlReviewAdds(dataDir: string, id: string, keys: ReadonlySet<string>): Promise<void> {
  await writeJsonAtomic(pearlReviewAddsJsonPath(dataDir, id), [...keys]);
}
