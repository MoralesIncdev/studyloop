// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// pure command-template validation + tokenization/substitution for the
// command adapter (whisper.cpp, faster-whisper, mlx-whisper, ...). No
// process-spawning or filesystem I/O here (that's lib/asr.ts) — this module
// has zero dependencies on the rest of the codebase (mirrors lib/providers.ts's
// "structural, so config.ts can import from here without a cycle" reasoning)
// so config.ts's AsrConfigSchema can validate a saved `asr.command` template
// at config-save time without pulling in child_process.
//
// Templates are executed via execFile (see lib/asr.ts), NEVER through a
// shell — argument *contents* (a video path with a `$` or `;` in it) are
// always literal argv entries, never interpreted. What this module guards
// against is a template that assumes shell behavior it will never get (a
// pipe, a `&&` chain, a subshell, output redirection) — silently no-oping or
// half-running would be far more confusing than refusing it up front, at
// save time, with a clear reason.

const PLACEHOLDER_INPUT = "{input}";
const PLACEHOLDER_OUTPUT = "{output}";

/** Anything that would only do something meaningful under a shell — a template is never run through one. */
const SHELL_METACHARACTER_RE = /[;&|`$><]/;

export interface AsrCommandValidation {
  ok: boolean;
  error?: string;
  /** Present only when `ok` — the tokenized (unsubstituted) template, ready for `substituteAsrCommandTokens`. */
  tokens: string[];
}

/**
 * Splits a command-line template into argv-style tokens: whitespace
 * separated, with single/double-quoted spans treated as one token (quotes
 * stripped) so a template can quote a path containing spaces
 * (`-f "{input}"`). This is intentionally NOT a full shell grammar — no
 * backslash escapes, no nesting, no variable expansion — none of that is
 * meaningful here since the result is fed straight to execFile, never a shell.
 */
export function tokenizeAsrCommand(template: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = template.length;
  while (i < n) {
    while (i < n && /\s/.test(template[i])) i++;
    if (i >= n) break;
    let token = "";
    let quote: string | null = null;
    while (i < n) {
      const ch = template[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
          i++;
          continue;
        }
        token += ch;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (/\s/.test(ch)) break;
      token += ch;
      i++;
    }
    tokens.push(token);
  }
  return tokens;
}

/**
 * Validates a command adapter template: non-empty, must reference both
 * placeholders somewhere in its text (SPEC: "requires a template containing
 * {input} and {output} placeholders"), and no token may contain a shell
 * metacharacter (`; & | \` $ > <` — see this module's header comment for why).
 */
export function validateAsrCommandTemplate(template: string): AsrCommandValidation {
  const trimmed = template.trim();
  if (!trimmed) return { ok: false, error: "Command template is empty", tokens: [] };
  if (!trimmed.includes(PLACEHOLDER_INPUT) || !trimmed.includes(PLACEHOLDER_OUTPUT)) {
    return { ok: false, error: "Command template must contain both {input} and {output} placeholders", tokens: [] };
  }
  const tokens = tokenizeAsrCommand(trimmed);
  if (tokens.length === 0) return { ok: false, error: "Command template has no tokens", tokens: [] };
  for (const token of tokens) {
    if (SHELL_METACHARACTER_RE.test(token)) {
      return {
        ok: false,
        error: `Command template contains a shell metacharacter (; & | \` $ > <) in "${token}" — templates run directly via execFile, never through a shell, so pipes/redirects/chaining can't work here`,
        tokens: [],
      };
    }
  }
  return { ok: true, tokens };
}

/**
 * Substitutes both placeholders (possibly embedded mid-token, e.g.
 * `--input={input}`) with the resolved input/output paths. Call only on an
 * already-validated template's tokens — the resolved paths themselves may
 * contain any character (they're literal argv entries under execFile, never
 * shell-interpreted), so no metacharacter check applies to them.
 */
export function substituteAsrCommandTokens(tokens: readonly string[], inputPath: string, outputPath: string): string[] {
  return tokens.map((t) => t.split(PLACEHOLDER_INPUT).join(inputPath).split(PLACEHOLDER_OUTPUT).join(outputPath));
}
