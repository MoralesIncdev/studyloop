// GET /api/transcript path resolution, split out of routes/transcript.ts so
// it's unit-testable the same way every other guard in this codebase is
// (paths.ts, reveal.ts) — routes stay thin, lib/ holds the logic + tests.
import path from "node:path";
import type { ResolvedRoots } from "../config.js";
import { canonicalizeForGuard, isInsideRoot, isPathAllowedCanonical, realpathOrSelf } from "./paths.js";
import { projectDir, readProject } from "./store.js";

export type TranscriptPathResolution =
  | { ok: true; filePath: string }
  | { ok: false; status: number; error: string };

/**
 * Resolves `rawPath` for a transcript read. When `projectId` is given and
 * `rawPath` isn't already absolute, it's treated as project-relative (e.g.
 * `captions.json` persisted next to `project.json` for a YouTube project —
 * see lib/store.ts writeCaptions) and resolved inside that project's own
 * directory (realpath-canonical, can't escape it) — a location the
 * configured libraryRoots/transcriptRoots don't (and shouldn't need to)
 * cover, since it's server-managed data, not user filesystem content.
 * Absolute paths always go through the standard root-allowlist guard
 * regardless of whether `projectId` was also passed, so a local project's
 * transcript path (always absolute) is unaffected by the project-relative
 * branch.
 */
export async function resolveTranscriptPath(
  dataDir: string,
  roots: ResolvedRoots,
  rawPath: string,
  projectId: string | undefined
): Promise<TranscriptPathResolution> {
  if (projectId && !path.isAbsolute(rawPath)) {
    const project = await readProject(dataDir, projectId);
    if (!project) return { ok: false, status: 404, error: "Project not found" };
    const dir = projectDir(dataDir, projectId);
    const candidate = path.resolve(dir, rawPath);
    const [candidateCanonical, dirReal] = await Promise.all([canonicalizeForGuard(candidate), realpathOrSelf(dir)]);
    if (!isInsideRoot(candidateCanonical, dirReal)) {
      return { ok: false, status: 403, error: "Path escapes the project directory" };
    }
    return { ok: true, filePath: candidate };
  }

  if (!(await isPathAllowedCanonical(rawPath, roots))) {
    return { ok: false, status: 403, error: "Path is outside configured roots" };
  }
  return { ok: true, filePath: rawPath };
}
