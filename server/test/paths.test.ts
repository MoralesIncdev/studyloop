import { describe, expect, it } from "vitest";
import { isInsideAnyRoot, isInsideRoot, isPathAllowed } from "../src/lib/paths.js";

describe("isInsideRoot", () => {
  it("accepts a path nested under the root", () => {
    expect(isInsideRoot("/Volumes/SSD2025/Library/BJJ/foo.mp4", "/Volumes/SSD2025/Library/BJJ")).toBe(true);
  });

  it("accepts the root itself", () => {
    expect(isInsideRoot("/Volumes/SSD2025/Library/BJJ", "/Volumes/SSD2025/Library/BJJ")).toBe(true);
  });

  it("rejects a sibling directory with a shared string prefix", () => {
    // /Volumes/SSD2025/Library/BJJ-extra should NOT be considered inside /Volumes/SSD2025/Library/BJJ
    expect(isInsideRoot("/Volumes/SSD2025/Library/BJJ-extra/foo.mp4", "/Volumes/SSD2025/Library/BJJ")).toBe(false);
  });

  it("rejects a path traversal escape (..) that resolves outside the root", () => {
    expect(isInsideRoot("/Volumes/SSD2025/Library/BJJ/../../etc/passwd", "/Volumes/SSD2025/Library/BJJ")).toBe(
      false
    );
  });

  it("rejects an unrelated absolute path", () => {
    expect(isInsideRoot("/etc/passwd", "/Volumes/SSD2025/Library/BJJ")).toBe(false);
  });
});

describe("isInsideAnyRoot", () => {
  const roots = ["/Volumes/SSD2025/Library/BJJ", "/Volumes/E6/BJJ Study/01_transcripts"];

  it("accepts a path inside any configured root", () => {
    expect(isInsideAnyRoot("/Volumes/E6/BJJ Study/01_transcripts/foo.json", roots)).toBe(true);
  });

  it("rejects a path outside every configured root", () => {
    expect(isInsideAnyRoot("/Volumes/SSD2025/other/foo.mp4", roots)).toBe(false);
  });

  it("rejects when roots list is empty", () => {
    expect(isInsideAnyRoot("/Volumes/SSD2025/Library/BJJ/foo.mp4", [])).toBe(false);
  });
});

describe("isPathAllowed", () => {
  const config = {
    libraryRoots: ["/Volumes/SSD2025/Library/BJJ"],
    transcriptRoots: ["/Volumes/E6/BJJ Study/01_transcripts"],
    conceptDocs: ["/Volumes/E6/BJJ Study/OPEN GUARD — Concept Curriculum.md"],
  };

  it("allows a file inside libraryRoots", () => {
    expect(isPathAllowed("/Volumes/SSD2025/Library/BJJ/vid.mp4", config)).toBe(true);
  });

  it("allows a file inside transcriptRoots", () => {
    expect(isPathAllowed("/Volumes/E6/BJJ Study/01_transcripts/t.json", config)).toBe(true);
  });

  it("allows an exact conceptDocs entry", () => {
    expect(isPathAllowed("/Volumes/E6/BJJ Study/OPEN GUARD — Concept Curriculum.md", config)).toBe(true);
  });

  it("rejects a path outside all of the above", () => {
    expect(isPathAllowed("/etc/passwd", config)).toBe(false);
  });

  it("rejects a traversal attempt out of a root", () => {
    expect(isPathAllowed("/Volumes/SSD2025/Library/BJJ/../../../etc/passwd", config)).toBe(false);
  });
});
