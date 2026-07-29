// V3-D D3: `<dataDir>/conceptRegistry.json` persistence — dataDir-scoped
// (not per-project, since identity spans projects by design), mirrors
// lib/reviewStore.ts's shape: corruption/missing/unparseable all rebuild to
// empty rather than throwing, and a dedicated promise-chain mutex (same
// "single fixed key" pattern as reviewStore.ts's withReviewLock and
// store.ts's withTeacherScoresLock) serializes read-modify-write against the
// one file.
import path from "node:path";
import { readJsonIfExists, writeJsonAtomic } from "./store.js";
import { emptyConceptRegistry, ConceptRegistrySchema, type ConceptRegistryFile } from "./conceptRegistry.js";

export function conceptRegistryJsonPath(dataDir: string): string {
  return path.join(dataDir, "conceptRegistry.json");
}

export async function readConceptRegistry(dataDir: string): Promise<ConceptRegistryFile> {
  let raw: unknown;
  try {
    raw = await readJsonIfExists<unknown>(conceptRegistryJsonPath(dataDir));
  } catch {
    return emptyConceptRegistry();
  }
  if (raw === null) return emptyConceptRegistry();
  const parsed = ConceptRegistrySchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyConceptRegistry();
}

export async function writeConceptRegistry(dataDir: string, state: ConceptRegistryFile): Promise<void> {
  await writeJsonAtomic(conceptRegistryJsonPath(dataDir), state);
}

let conceptRegistryLock: Promise<unknown> = Promise.resolve();

export function withConceptRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = conceptRegistryLock.then(fn, fn);
  conceptRegistryLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
