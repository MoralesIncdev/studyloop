import fs from "node:fs/promises";
import path from "node:path";

/**
 * True if `target` (absolute path) resolves to a location inside `root`
 * (absolute path), inclusive of `root` itself. Used to guard every file-path
 * query param against traversal outside configured roots.
 *
 * NOTE: this is a *lexical* check only (no filesystem access) — it does not
 * protect against a symlink inside an allowed root pointing outside of it.
 * Use the `*Canonical` variants below at any boundary where the path came
 * from user input.
 */
export function isInsideRoot(target: string, root: string): boolean {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget === resolvedRoot) return true;
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(rootWithSep);
}

/** True if `target` is inside at least one of `roots`. */
export function isInsideAnyRoot(target: string, roots: readonly string[]): boolean {
  return roots.some((root) => isInsideRoot(target, root));
}

export interface RootsConfig {
  libraryRoots: readonly string[];
  transcriptRoots: readonly string[];
  conceptDocs: readonly string[];
}

/**
 * Broader guard used by routes that read transcript/concept-doc files: allows
 * anything inside libraryRoots or transcriptRoots, plus any path explicitly
 * listed in conceptDocs (exact match). Never allows arbitrary filesystem paths.
 */
export function isPathAllowed(target: string, config: RootsConfig): boolean {
  if (isInsideAnyRoot(target, config.libraryRoots)) return true;
  if (isInsideAnyRoot(target, config.transcriptRoots)) return true;
  const resolvedTarget = path.resolve(target);
  return config.conceptDocs.some((p) => path.resolve(p) === resolvedTarget);
}

// ---------------------------------------------------------------------------
// Canonical (realpath-based) guards.
//
// A lexical prefix check can be defeated by a symlink that lives inside an
// allowed root but points somewhere else on disk (e.g. `libraryRoot/evil ->
// /etc`). These variants resolve symlinks — for both the candidate path and
// the configured root — before doing the prefix comparison, so the guard
// reflects where the path *actually* lives, not just its string form.
//
// A candidate path may not exist yet (e.g. a file about to be created), so we
// realpath the nearest existing ancestor and re-attach the non-existent tail
// lexically (a tail that doesn't exist on disk can't itself be a symlink).
// ---------------------------------------------------------------------------

/** Resolves symlinks in `p`; falls back to the lexically-resolved path if `p` doesn't exist. */
export async function realpathOrSelf(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/** Walks up from `p` until it finds a path segment that exists on disk. */
async function nearestExistingAncestor(p: string): Promise<string> {
  let current = path.resolve(p);
  // Bounded by path depth; a filesystem root always "exists".
  for (;;) {
    try {
      await fs.access(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/**
 * Canonicalizes `target` for guard purposes: realpath's the nearest existing
 * ancestor (defeating symlink tricks on the part of the path that exists),
 * then re-attaches whatever tail doesn't exist yet.
 */
export async function canonicalizeForGuard(target: string): Promise<string> {
  const resolvedTarget = path.resolve(target);
  const ancestor = await nearestExistingAncestor(resolvedTarget);
  const ancestorReal = await realpathOrSelf(ancestor);
  const suffix = path.relative(ancestor, resolvedTarget);
  return suffix ? path.join(ancestorReal, suffix) : ancestorReal;
}

/** Realpath-canonical version of {@link isInsideRoot}. */
export async function isInsideRootCanonical(target: string, root: string): Promise<boolean> {
  const [candidate, rootReal] = await Promise.all([canonicalizeForGuard(target), realpathOrSelf(root)]);
  return isInsideRoot(candidate, rootReal);
}

/** Realpath-canonical version of {@link isInsideAnyRoot}. */
export async function isInsideAnyRootCanonical(target: string, roots: readonly string[]): Promise<boolean> {
  for (const root of roots) {
    // eslint-disable-next-line no-await-in-loop -- short-circuit on first match, roots list is small
    if (await isInsideRootCanonical(target, root)) return true;
  }
  return false;
}

/** Realpath-canonical version of {@link isPathAllowed}. */
export async function isPathAllowedCanonical(target: string, config: RootsConfig): Promise<boolean> {
  if (await isInsideAnyRootCanonical(target, config.libraryRoots)) return true;
  if (await isInsideAnyRootCanonical(target, config.transcriptRoots)) return true;
  const candidate = await canonicalizeForGuard(target);
  for (const p of config.conceptDocs) {
    // eslint-disable-next-line no-await-in-loop -- short-circuit on first match, list is small
    const docReal = await realpathOrSelf(p);
    if (docReal === candidate) return true;
  }
  return false;
}
