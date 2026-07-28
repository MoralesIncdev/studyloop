import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  canonicalizeForGuard,
  isInsideRootCanonical,
  isPathAllowedCanonical,
} from "../src/lib/paths.js";

// Exercises the realpath-canonical guard against an actual symlink on disk —
// the lexical `isInsideRoot` check can't catch this class of escape because
// the string form of the path never leaves the allowed root; only resolving
// the symlink reveals it does.
describe("realpath-canonical path guard", () => {
  let tmpRoot: string;
  let allowedRoot: string;
  let outsideDir: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-realpath-"));
    allowedRoot = path.join(tmpRoot, "allowed");
    outsideDir = path.join(tmpRoot, "outside");
    await fs.mkdir(allowedRoot, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, "secret.txt"), "top secret");
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("rejects a symlink inside the allowed root that points outside it", async () => {
    const linkPath = path.join(allowedRoot, "escape");
    await fs.symlink(outsideDir, linkPath, "dir");
    const candidate = path.join(linkPath, "secret.txt");

    // Lexically, `candidate` is a string-prefix match under `allowedRoot` —
    // proving the canonical guard is doing real work, not just re-deriving
    // what the lexical check already knew.
    expect(candidate.startsWith(allowedRoot)).toBe(true);

    expect(await isInsideRootCanonical(candidate, allowedRoot)).toBe(false);
  });

  it("still accepts a real (non-symlinked) file inside the allowed root", async () => {
    const filePath = path.join(allowedRoot, "video.mp4");
    await fs.writeFile(filePath, "not really a video");
    expect(await isInsideRootCanonical(filePath, allowedRoot)).toBe(true);
  });

  it("accepts a path that doesn't exist yet, as long as its nearest existing ancestor is inside the root", async () => {
    // Simulates a file about to be created (e.g. a shot or export) — nothing
    // at this path exists on disk, but its parent directory does and is
    // genuinely inside the root.
    const candidate = path.join(allowedRoot, "not-created-yet", "file.txt");
    expect(await isInsideRootCanonical(candidate, allowedRoot)).toBe(true);
  });

  it("rejects a to-be-created path whose nearest existing ancestor is a symlink escaping the root", async () => {
    const linkPath = path.join(allowedRoot, "escape-dir");
    await fs.symlink(outsideDir, linkPath, "dir");
    const candidate = path.join(linkPath, "not-created-yet.txt");
    expect(await isInsideRootCanonical(candidate, allowedRoot)).toBe(false);
  });

  it("resolves a symlinked root itself before comparing", async () => {
    const realRoot = path.join(tmpRoot, "real-root");
    await fs.mkdir(realRoot, { recursive: true });
    const rootLink = path.join(tmpRoot, "root-link");
    await fs.symlink(realRoot, rootLink, "dir");
    const filePath = path.join(realRoot, "video.mp4");
    await fs.writeFile(filePath, "data");

    // Configured root is the symlink; candidate path is via the real dir —
    // both should canonicalize to the same place and match.
    expect(await isInsideRootCanonical(filePath, rootLink)).toBe(true);
  });

  it("isPathAllowedCanonical also canonicalizes conceptDocs exact-match entries", async () => {
    const docPath = path.join(outsideDir, "curriculum.md");
    await fs.writeFile(docPath, "# doc");
    const linkPath = path.join(allowedRoot, "doc-link.md");
    await fs.symlink(docPath, linkPath, "file");

    const config = { libraryRoots: [], transcriptRoots: [], conceptDocs: [docPath] };
    // Accessing via the symlink still resolves to the exact configured doc.
    expect(await isPathAllowedCanonical(linkPath, config)).toBe(true);
    // A different file placed at that same symlink target's directory does not.
    expect(await isPathAllowedCanonical(path.join(outsideDir, "other.md"), config)).toBe(false);
  });

  it("canonicalizeForGuard resolves an existing symlink fully", async () => {
    const realFile = path.join(outsideDir, "real.txt");
    await fs.writeFile(realFile, "x");
    const linkPath = path.join(allowedRoot, "link.txt");
    await fs.symlink(realFile, linkPath, "file");
    const canonical = await canonicalizeForGuard(linkPath);
    expect(canonical).toBe(await fs.realpath(realFile));
  });
});
