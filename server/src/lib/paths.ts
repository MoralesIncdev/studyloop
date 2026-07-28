import path from "node:path";

/**
 * True if `target` (absolute path) resolves to a location inside `root`
 * (absolute path), inclusive of `root` itself. Used to guard every file-path
 * query param against traversal outside configured roots.
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
