// F10 "Reveal in Finder": macOS-only `open -R <path>` against a project's
// exports/ directory (or a specific file inside it). Split into pure/testable
// pieces per the codebase convention (paths.ts guards, frames.ts/ytdlp.ts
// process wrappers) rather than inlined in the route handler.
import { execFile } from "node:child_process";
import path from "node:path";
import { canonicalizeForGuard, isInsideRoot, realpathOrSelf } from "./paths.js";

/**
 * Resolves the filesystem path to reveal: `requestedPath` if given and it
 * canonically resolves inside `exportsDirPath`, otherwise `exportsDirPath`
 * itself (reveals the whole exports folder). Returns null if `requestedPath`
 * was given but escapes the exports directory (symlink-aware, mirrors the
 * *Canonical guards in paths.ts) — the caller should respond 403.
 */
export async function resolveRevealTarget(
  exportsDirPath: string,
  requestedPath?: string
): Promise<string | null> {
  if (!requestedPath) return exportsDirPath;
  const candidate = path.resolve(requestedPath);
  const [candidateCanonical, dirReal] = await Promise.all([
    canonicalizeForGuard(candidate),
    realpathOrSelf(exportsDirPath),
  ]);
  if (!isInsideRoot(candidateCanonical, dirReal)) return null;
  return candidate;
}

export interface RevealResult {
  ok: boolean;
  message?: string;
}

/** Runs `open -R <target>` on macOS; no-ops with an explanatory message elsewhere. */
export function revealInFinder(target: string): Promise<RevealResult> {
  if (process.platform !== "darwin") {
    return Promise.resolve({
      ok: false,
      message: "Reveal in Finder is only supported on macOS. The file is at: " + target,
    });
  }
  return new Promise((resolve) => {
    execFile("open", ["-R", target], (err) => {
      if (err) resolve({ ok: false, message: err.message });
      else resolve({ ok: true });
    });
  });
}
