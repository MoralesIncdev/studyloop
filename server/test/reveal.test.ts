import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveRevealTarget, revealInFinder } from "../src/lib/reveal.js";

describe("resolveRevealTarget", () => {
  let exportsDirPath: string;

  beforeEach(async () => {
    exportsDirPath = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-exports-"));
  });

  afterEach(async () => {
    await fs.rm(exportsDirPath, { recursive: true, force: true });
  });

  it("defaults to the exports directory itself when no path is requested", async () => {
    const target = await resolveRevealTarget(exportsDirPath);
    expect(target).toBe(exportsDirPath);
  });

  it("allows a file that lives inside the exports directory", async () => {
    const filePath = path.join(exportsDirPath, "study-2026-07-28.md");
    await fs.writeFile(filePath, "# doc");
    const target = await resolveRevealTarget(exportsDirPath, filePath);
    expect(target).toBe(filePath);
  });

  it("rejects a path outside the exports directory (403 territory)", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-outside-"));
    try {
      const target = await resolveRevealTarget(exportsDirPath, path.join(outside, "secret.md"));
      expect(target).toBeNull();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a traversal attempt (../) that escapes the exports directory", async () => {
    const target = await resolveRevealTarget(exportsDirPath, path.join(exportsDirPath, "..", "..", "etc", "passwd"));
    expect(target).toBeNull();
  });

  it("allows a sibling-looking path that is actually nested (no false-positive prefix match)", async () => {
    // e.g. exportsDirPath = "/tmp/foo", requested = "/tmp/foo-evil/x" must be rejected.
    const evilSibling = `${exportsDirPath}-evil`;
    await fs.mkdir(evilSibling, { recursive: true });
    try {
      const target = await resolveRevealTarget(exportsDirPath, path.join(evilSibling, "x.md"));
      expect(target).toBeNull();
    } finally {
      await fs.rm(evilSibling, { recursive: true, force: true });
    }
  });
});

describe("revealInFinder", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("no-ops with an explanatory message on non-macOS platforms", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const result = await revealInFinder("/some/path");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/macOS/);
  });

  it("no-ops on Windows too", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const result = await revealInFinder("C:\\some\\path");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/macOS/);
  });
});
