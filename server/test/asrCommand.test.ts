// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// pure command-template tokenization/validation/substitution — no process
// spawning, no I/O (see asr.test.ts for the adapters themselves).
import { describe, expect, it } from "vitest";
import { substituteAsrCommandTokens, tokenizeAsrCommand, validateAsrCommandTemplate } from "../src/lib/asrCommand.js";

describe("tokenizeAsrCommand", () => {
  it("splits on whitespace", () => {
    expect(tokenizeAsrCommand("whisper-cli -f {input} -of {output} -osrt")).toEqual([
      "whisper-cli",
      "-f",
      "{input}",
      "-of",
      "{output}",
      "-osrt",
    ]);
  });

  it("collapses repeated whitespace and trims leading/trailing", () => {
    expect(tokenizeAsrCommand("  cmd   {input}    {output}  ")).toEqual(["cmd", "{input}", "{output}"]);
  });

  it("treats a double-quoted span as one token, quotes stripped (lets a template quote a path with spaces)", () => {
    expect(tokenizeAsrCommand('cmd -f "{input}" -of "{output} file"')).toEqual(["cmd", "-f", "{input}", "-of", "{output} file"]);
  });

  it("treats a single-quoted span as one token, quotes stripped", () => {
    expect(tokenizeAsrCommand("cmd -f '{input}'")).toEqual(["cmd", "-f", "{input}"]);
  });

  it("handles a placeholder embedded mid-token", () => {
    expect(tokenizeAsrCommand("cmd --input={input} --output={output}")).toEqual(["cmd", "--input={input}", "--output={output}"]);
  });

  it("returns an empty array for an all-whitespace string", () => {
    expect(tokenizeAsrCommand("   ")).toEqual([]);
  });
});

describe("validateAsrCommandTemplate", () => {
  it("accepts a well-formed template referencing both placeholders", () => {
    const result = validateAsrCommandTemplate("whisper-cli -m model.bin -f {input} -of {output} -osrt");
    expect(result.ok).toBe(true);
    expect(result.tokens).toContain("{input}");
    expect(result.tokens).toContain("{output}");
  });

  it("rejects an empty template", () => {
    expect(validateAsrCommandTemplate("").ok).toBe(false);
    expect(validateAsrCommandTemplate("   ").ok).toBe(false);
  });

  it("rejects a template missing {input}", () => {
    const result = validateAsrCommandTemplate("cmd -of {output}");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/{input}/);
  });

  it("rejects a template missing {output}", () => {
    const result = validateAsrCommandTemplate("cmd -f {input}");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/{output}/);
  });

  it.each([";", "&", "|", "`", "$", ">", "<"])("rejects a template whose token contains the shell metacharacter %s", (char) => {
    const result = validateAsrCommandTemplate(`cmd -f {input} ${char} -of {output}`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/shell metacharacter/);
  });

  it("rejects redirection even glued to a placeholder token", () => {
    expect(validateAsrCommandTemplate("cmd -f {input} > {output}").ok).toBe(false);
  });

  it("accepts a template whose paths (once substituted) could contain such characters, since only the TEMPLATE tokens are checked", () => {
    // The template itself is clean; a video path containing a `$` is a
    // substituted argv value, never re-validated against this rule (see
    // substituteAsrCommandTokens — it runs on the ALREADY-validated tokens).
    const result = validateAsrCommandTemplate("cmd -f {input} -of {output}");
    expect(result.ok).toBe(true);
  });
});

describe("substituteAsrCommandTokens", () => {
  it("replaces whole-token placeholders", () => {
    const { tokens } = validateAsrCommandTemplate("whisper-cli -f {input} -of {output} -osrt");
    expect(substituteAsrCommandTokens(tokens, "/videos/lesson.mp4", "/tmp/out")).toEqual([
      "whisper-cli",
      "-f",
      "/videos/lesson.mp4",
      "-of",
      "/tmp/out",
      "-osrt",
    ]);
  });

  it("replaces a placeholder embedded mid-token", () => {
    const { tokens } = validateAsrCommandTemplate("cmd --input={input} --output={output}");
    expect(substituteAsrCommandTokens(tokens, "/in.mp4", "/out")).toEqual(["cmd", "--input=/in.mp4", "--output=/out"]);
  });

  it("substitutes a path containing characters that would be rejected in the TEMPLATE itself (no re-validation on substituted values)", () => {
    const { tokens } = validateAsrCommandTemplate("cmd -f {input} -of {output}");
    expect(substituteAsrCommandTokens(tokens, "/videos/weird$name;file.mp4", "/tmp/out")).toEqual([
      "cmd",
      "-f",
      "/videos/weird$name;file.mp4",
      "-of",
      "/tmp/out",
    ]);
  });

  it("substitutes multiple occurrences of the same placeholder", () => {
    const { tokens } = validateAsrCommandTemplate("cmd {input} {input} {output}");
    expect(substituteAsrCommandTokens(tokens, "IN", "OUT")).toEqual(["cmd", "IN", "IN", "OUT"]);
  });
});
