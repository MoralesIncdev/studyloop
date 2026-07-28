import { describe, expect, it } from "vitest";
import { insertTimestampToken, roundForToken, tokenizeNotes } from "./notesFormat";

describe("tokenizeNotes", () => {
  it("returns a single text token for plain content", () => {
    expect(tokenizeNotes("hello world")).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("splits out a timestamp token", () => {
    expect(tokenizeNotes("see ^t:125.3 for the setup")).toEqual([
      { type: "text", value: "see " },
      { type: "timestamp", t: 125.3, raw: "^t:125.3" },
      { type: "text", value: " for the setup" },
    ]);
  });

  it("handles a token with no surrounding text", () => {
    expect(tokenizeNotes("^t:60")).toEqual([{ type: "timestamp", t: 60, raw: "^t:60" }]);
  });

  it("handles multiple tokens on one line", () => {
    expect(tokenizeNotes("^t:10 and ^t:20")).toEqual([
      { type: "timestamp", t: 10, raw: "^t:10" },
      { type: "text", value: " and " },
      { type: "timestamp", t: 20, raw: "^t:20" },
    ]);
  });

  it("emits a break token between lines and preserves empty lines", () => {
    expect(tokenizeNotes("a\n\nb")).toEqual([
      { type: "text", value: "a" },
      { type: "break" },
      { type: "text", value: "" },
      { type: "break" },
      { type: "text", value: "b" },
    ]);
  });

  it("tokenizes tokens across multiple lines independently", () => {
    expect(tokenizeNotes("^t:5 first\n^t:15 second")).toEqual([
      { type: "timestamp", t: 5, raw: "^t:5" },
      { type: "text", value: " first" },
      { type: "break" },
      { type: "timestamp", t: 15, raw: "^t:15" },
      { type: "text", value: " second" },
    ]);
  });

  it("returns an empty array for empty content", () => {
    expect(tokenizeNotes("")).toEqual([{ type: "text", value: "" }]);
  });
});

describe("roundForToken", () => {
  it("rounds to one decimal place", () => {
    expect(roundForToken(125.34)).toBe(125.3);
    expect(roundForToken(125.36)).toBe(125.4);
  });

  it("clamps negative values to zero", () => {
    expect(roundForToken(-5)).toBe(0);
  });
});

describe("insertTimestampToken", () => {
  it("inserts a token at the cursor position", () => {
    const result = insertTimestampToken("hello world", 5, 12.34);
    expect(result.content).toBe("hello^t:12.3 world");
    expect(result.cursor).toBe(5 + "^t:12.3".length);
  });

  it("inserts at the start when cursor is 0", () => {
    const result = insertTimestampToken("abc", 0, 1);
    expect(result.content).toBe("^t:1abc");
  });

  it("inserts at the end when cursor is beyond content length", () => {
    const result = insertTimestampToken("abc", 999, 1);
    expect(result.content).toBe("abc^t:1");
    expect(result.cursor).toBe("abc^t:1".length);
  });

  it("clamps a negative cursor to zero", () => {
    const result = insertTimestampToken("abc", -5, 1);
    expect(result.content).toBe("^t:1abc");
  });

  it("round-trips through tokenizeNotes", () => {
    const { content } = insertTimestampToken("note: ", 6, 90);
    const tokens = tokenizeNotes(content);
    expect(tokens.some((tk) => tk.type === "timestamp" && tk.t === 90)).toBe(true);
  });
});
