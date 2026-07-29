// V3-B B2: `<project>/attestations.json` persistence — mirrors
// lib/reviewStore.ts's shape, but per-project (like project.json/bubbles.json)
// rather than one file per dataDir, so it reuses store.ts's existing
// per-project mutex (withProjectLock) instead of reviewStore.ts's dedicated
// single-key lock.
import path from "node:path";
import { projectDir, readJsonIfExists, writeJsonAtomic } from "./store.js";
import { emptyAttestations, AttestationsFileSchema, type AttestationsFile } from "./attestation.js";

export function attestationsJsonPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "attestations.json");
}

/** A missing file, corrupt JSON, or a shape that fails schema validation all rebuild to empty — same "corruption never throws" rule reviewStore.ts applies to review.json. */
export async function readAttestations(dataDir: string, id: string): Promise<AttestationsFile> {
  let raw: unknown;
  try {
    raw = await readJsonIfExists<unknown>(attestationsJsonPath(dataDir, id));
  } catch {
    return emptyAttestations();
  }
  if (raw === null) return emptyAttestations();
  const parsed = AttestationsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyAttestations();
}

export async function writeAttestations(dataDir: string, id: string, state: AttestationsFile): Promise<void> {
  await writeJsonAtomic(attestationsJsonPath(dataDir, id), state);
}
