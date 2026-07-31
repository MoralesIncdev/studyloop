// Multi-provider LLM support: one registry + one structured-JSON call surface
// that lib/analysis.ts and lib/cardTransform.ts share. Anthropic keeps its
// native structured-output path (`output_config` json_schema via the official
// SDK); every other provider goes through its own JSON mode with the schema
// embedded in the system prompt — the callers' zod safeParse (unchanged)
// remains the real validation gate either way, so a provider that ignores the
// schema degrades to a "skipped" chunk, never a crash.
//
// Anthropic additionally supports an "oauth" auth mode: instead of a pasted
// API key, the server uses ambient credentials — `ANTHROPIC_AUTH_TOKEN` (e.g.
// exported via `ant auth print-credentials --env` after `ant auth login`) or
// `ANTHROPIC_API_KEY` from the environment. OAuth bearer tokens require the
// `anthropic-beta: oauth-2025-04-20` header, added below.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const ProviderIdSchema = z.enum(["anthropic", "openai", "google", "xai", "deepseek", "kimi", "zai"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const AnthropicAuthModeSchema = z.enum(["api-key", "oauth"]);
export type AnthropicAuthMode = z.infer<typeof AnthropicAuthModeSchema>;

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /**
   * Wire protocol: which caller implementation talks to this provider.
   * "anthropic-compat" = a third party speaking Anthropic's messages API
   * (e.g. Kimi Code) — same SDK, custom baseURL, but no native structured
   * outputs, so the schema rides in the prompt like the openai-compat path.
   */
  wire: "anthropic" | "anthropic-compat" | "openai-compat" | "google";
  /** openai-compat / anthropic-compat only: the base URL requests hang off. */
  baseUrl?: string;
  defaultModel: string;
  /** UI suggestions only — the model field stays free text. */
  models: string[];
  keyPlaceholder: string;
  /**
   * For thinking models (kimi-code): reasoning tokens count against
   * max_tokens, so requests are lifted to this ceiling to leave the model
   * headroom — otherwise a long merge pass stops at max_tokens mid-reasoning
   * and the whole analyze job fails.
   */
  maxOutputTokens?: number;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    wire: "anthropic",
    defaultModel: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyPlaceholder: "sk-ant-…",
  },
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    wire: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.1",
    models: ["gpt-5.1", "gpt-5-mini", "gpt-4.1"],
    keyPlaceholder: "sk-…",
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    wire: "google",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview"],
    keyPlaceholder: "AIza…",
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    wire: "openai-compat",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    models: ["grok-4", "grok-3-mini"],
    keyPlaceholder: "xai-…",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai-compat",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyPlaceholder: "sk-…",
  },
  // Kimi For Coding subscription — Anthropic-compatible messages endpoint
  // (the SDK appends /v1/messages to the base URL).
  kimi: {
    id: "kimi",
    label: "Kimi (Kimi Code)",
    wire: "anthropic-compat",
    baseUrl: "https://api.kimi.com/coding",
    defaultModel: "kimi-code",
    models: ["kimi-code"],
    keyPlaceholder: "sk-…",
    // kimi-code is a thinking model; 32768 is the endpoint's output ceiling.
    maxOutputTokens: 32768,
  },
  // Z.ai coding-plan endpoint (GLM) — OpenAI-compatible chat/completions.
  zai: {
    id: "zai",
    label: "Z.ai (GLM)",
    wire: "openai-compat",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    defaultModel: "glm-5",
    models: ["glm-5", "glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.6"],
    keyPlaceholder: "…",
    // GLM-5 is a reasoning model — thinking spends from max_tokens (observed:
    // merge pass exhausted 16k mid-reasoning). Same lift as kimi.
    maxOutputTokens: 32768,
  },
};

/** The slice of StudyLoopConfig this module reads — structural, so config.ts can import from here without a cycle. */
export interface LLMConfigSlice {
  llmProvider: ProviderId;
  anthropicAuthMode: AnthropicAuthMode;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
  xaiApiKey: string | null;
  deepseekApiKey: string | null;
  kimiApiKey: string | null;
  zaiApiKey: string | null;
  analysisModel: string | null;
}

export type ProviderAuth =
  | { provider: "anthropic"; mode: "api-key"; apiKey: string }
  | { provider: "anthropic"; mode: "oauth" }
  | { provider: "openai" | "google" | "xai" | "deepseek" | "kimi" | "zai"; apiKey: string };

/** True when Anthropic OAuth mode can actually authenticate from this process's environment. */
export function hasAmbientAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/**
 * Resolves the configured provider's credentials, or null when the selected
 * provider has none — the analyze guard's `hasApiKey` and both route-level
 * gates key off this. OAuth mode counts as credentialed only when an ambient
 * token is actually present, so the user gets a clear 400 up front instead of
 * every chunk silently failing mid-run.
 */
export function resolveProviderAuth(config: LLMConfigSlice): ProviderAuth | null {
  switch (config.llmProvider) {
    case "anthropic":
      if (config.anthropicAuthMode === "oauth") {
        return hasAmbientAnthropicCredentials() ? { provider: "anthropic", mode: "oauth" } : null;
      }
      return config.anthropicApiKey ? { provider: "anthropic", mode: "api-key", apiKey: config.anthropicApiKey } : null;
    case "openai":
      return config.openaiApiKey ? { provider: "openai", apiKey: config.openaiApiKey } : null;
    case "google":
      return config.googleApiKey ? { provider: "google", apiKey: config.googleApiKey } : null;
    case "xai":
      return config.xaiApiKey ? { provider: "xai", apiKey: config.xaiApiKey } : null;
    case "deepseek":
      return config.deepseekApiKey ? { provider: "deepseek", apiKey: config.deepseekApiKey } : null;
    case "kimi":
      return config.kimiApiKey ? { provider: "kimi", apiKey: config.kimiApiKey } : null;
    case "zai":
      return config.zaiApiKey ? { provider: "zai", apiKey: config.zaiApiKey } : null;
  }
}

/** The model an analyze/transform run should use: the explicit override, else the selected provider's default. */
export function resolveAnalysisModel(config: LLMConfigSlice): string {
  return config.analysisModel ?? PROVIDERS[config.llmProvider].defaultModel;
}

/** Human-readable "why can't I analyze" message for the selected provider — used by routes when resolveProviderAuth returns null. */
export function missingCredentialMessage(config: LLMConfigSlice): string {
  if (config.llmProvider === "anthropic" && config.anthropicAuthMode === "oauth") {
    return "Anthropic sign-in not detected — set ANTHROPIC_AUTH_TOKEN before starting StudyLoop (e.g. `ant auth login`, then `ant auth print-credentials --env`), or switch to an API key in Settings";
  }
  return `No ${PROVIDERS[config.llmProvider].label} API key configured — add one in Settings`;
}

// --- Structured-JSON call surface -------------------------------------------

/** Mirrors lib/analysis.ts's AnalysisSkipReason (string-compatible; not imported to avoid a cycle). */
export type StructuredCallSkipReason = "refusal" | "max_tokens" | "parse_error";

export type StructuredCallResult = { kind: "ok"; text: string } | { kind: "skipped"; reason: StructuredCallSkipReason; detail: string };

export interface StructuredLLMRequest {
  system: string;
  userPrompt: string;
  /** JSON Schema the response must validate against — enforced natively on Anthropic, prompt-embedded elsewhere. */
  jsonSchema: Record<string, unknown>;
  model: string;
  maxTokens: number;
}

export interface StructuredLLMCaller {
  call(request: StructuredLLMRequest): Promise<StructuredCallResult>;
}

class AnthropicStructuredCaller implements StructuredLLMCaller {
  private readonly client: Anthropic;

  constructor(auth: Extract<ProviderAuth, { provider: "anthropic" }>) {
    if (auth.mode === "api-key") {
      this.client = new Anthropic({ apiKey: auth.apiKey });
    } else {
      const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY ?? null,
        authToken: authToken ?? null,
        // OAuth bearer tokens require this beta header on /v1/messages.
        ...(authToken ? { defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" } } : {}),
      });
    }
  }

  async call(request: StructuredLLMRequest): Promise<StructuredCallResult> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.userPrompt }],
        // `thinking` is deliberately omitted (SPEC: "omit `thinking` param
        // entirely") — Claude Opus 5 runs adaptive thinking by default.
        output_config: { format: { type: "json_schema", schema: request.jsonSchema } },
      });
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (response.stop_reason === "refusal") {
      return { kind: "skipped", reason: "refusal", detail: "Claude declined this request (safety classifier)" };
    }
    if (response.stop_reason === "max_tokens") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit max_tokens before finishing" };
    }
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text" && typeof b.text === "string");
    if (!textBlock?.text) {
      return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    }
    return { kind: "ok", text: textBlock.text };
  }
}

/**
 * Third parties speaking Anthropic's messages protocol (Kimi Code). Same SDK
 * pointed at a custom baseURL, but compat layers don't implement Anthropic's
 * native structured outputs — so no `output_config`; the schema rides in the
 * system prompt like the openai-compat path, and zod downstream is the gate.
 */
class AnthropicCompatStructuredCaller implements StructuredLLMCaller {
  private readonly client: Anthropic;

  constructor(
    baseUrl: string,
    apiKey: string,
    /** When set, requests are lifted to this ceiling — thinking models spend reasoning tokens out of max_tokens (see ProviderInfo.maxOutputTokens). */
    private readonly maxOutputTokens?: number
  ) {
    this.client = new Anthropic({ baseURL: baseUrl, apiKey });
  }

  async call(request: StructuredLLMRequest): Promise<StructuredCallResult> {
    let response: Anthropic.Message;
    try {
      // Streamed, then collected: the SDK refuses non-streaming requests at
      // this max_tokens ("Streaming is required for operations that may take
      // longer than 10 minutes"), and a thinking model genuinely can reason
      // for minutes before emitting the JSON.
      response = await this.client.messages
        .stream({
          model: request.model,
          max_tokens: Math.max(request.maxTokens, this.maxOutputTokens ?? 0),
          system: `${request.system}\n\n${schemaInstruction(request.jsonSchema)}`,
          messages: [{ role: "user", content: request.userPrompt }],
        })
        .finalMessage();
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (response.stop_reason === "refusal") {
      return { kind: "skipped", reason: "refusal", detail: "Model declined this request" };
    }
    if (response.stop_reason === "max_tokens") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit max_tokens before finishing" };
    }
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text" && typeof b.text === "string");
    if (!textBlock?.text) {
      return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    }
    return { kind: "ok", text: stripJsonFences(textBlock.text) };
  }
}

/** Strips markdown code fences some JSON-mode models still wrap their output in. */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function schemaInstruction(jsonSchema: Record<string, unknown>): string {
  return `Respond with ONLY a single JSON object — no markdown fences, no prose before or after — that validates against this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
}

/**
 * OpenAI, xAI, DeepSeek, and Z.ai all speak the OpenAI chat-completions shape;
 * only base URL, the max-tokens param name, and the output ceiling differ.
 * Requests are STREAMED (SSE) and re-assembled: reasoning models (glm-5,
 * deepseek-reasoner) can generate for many minutes, and a non-streaming fetch
 * would trip Node/undici's ~5-minute idle timeouts while the provider computes
 * the whole response.
 */
class OpenAICompatStructuredCaller implements StructuredLLMCaller {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    /** OpenAI's newer models reject `max_tokens` in favor of `max_completion_tokens`; xAI/DeepSeek/Z.ai still use `max_tokens`. */
    private readonly maxTokensParam: "max_tokens" | "max_completion_tokens",
    /** When set, requests are lifted to this ceiling — reasoning models spend thinking tokens out of max_tokens (see ProviderInfo.maxOutputTokens). */
    private readonly maxOutputTokens?: number
  ) {}

  async call(request: StructuredLLMRequest): Promise<StructuredCallResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: `${request.system}\n\n${schemaInstruction(request.jsonSchema)}` },
            { role: "user", content: request.userPrompt },
          ],
          response_format: { type: "json_object" },
          stream: true,
          [this.maxTokensParam]: Math.max(request.maxTokens, this.maxOutputTokens ?? 0),
        }),
      });
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return { kind: "skipped", reason: "parse_error", detail: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` };
    }
    if (!res.body) {
      return { kind: "skipped", reason: "parse_error", detail: "No response body" };
    }

    // Re-assemble the SSE stream: accumulate delta.content (ignoring
    // reasoning_content), remember the final finish_reason.
    let content = "";
    let refusal = "";
    let finishReason: string | undefined;
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          let event: unknown;
          try {
            event = JSON.parse(payload);
          } catch {
            continue; // partial/keep-alive line
          }
          const err = (event as { error?: { message?: string } }).error;
          if (err) {
            return { kind: "skipped", reason: "parse_error", detail: `Stream error: ${err.message ?? JSON.stringify(err).slice(0, 300)}` };
          }
          const choice = (event as { choices?: Array<{ finish_reason?: string | null; delta?: { content?: unknown; refusal?: unknown } }> })
            .choices?.[0];
          if (!choice) continue;
          if (typeof choice.delta?.content === "string") content += choice.delta.content;
          if (typeof choice.delta?.refusal === "string") refusal += choice.delta.refusal;
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
      }
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: `Stream read failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (refusal) return { kind: "skipped", reason: "refusal", detail: refusal.slice(0, 300) };
    if (finishReason === "content_filter") {
      return { kind: "skipped", reason: "refusal", detail: "Provider content filter declined this request" };
    }
    if (finishReason === "length") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit the output token limit before finishing" };
    }
    if (!content.trim()) {
      return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    }
    return { kind: "ok", text: stripJsonFences(content) };
  }
}

class GoogleStructuredCaller implements StructuredLLMCaller {
  constructor(private readonly apiKey: string) {}

  async call(request: StructuredLLMRequest): Promise<StructuredCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    let res: Response;
    let bodyText: string;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${request.system}\n\n${schemaInstruction(request.jsonSchema)}` }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
          generationConfig: { maxOutputTokens: request.maxTokens, responseMimeType: "application/json" },
        }),
      });
      bodyText = await res.text();
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (!res.ok) {
      return { kind: "skipped", reason: "parse_error", detail: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` };
    }
    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      return { kind: "skipped", reason: "parse_error", detail: "Non-JSON response body" };
    }
    const parsed = json as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (parsed.promptFeedback?.blockReason) {
      return { kind: "skipped", reason: "refusal", detail: `Blocked: ${parsed.promptFeedback.blockReason}` };
    }
    const candidate = parsed.candidates?.[0];
    if (!candidate) return { kind: "skipped", reason: "parse_error", detail: "No candidates in response" };
    if (candidate.finishReason === "MAX_TOKENS") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit maxOutputTokens before finishing" };
    }
    if (candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT") {
      return { kind: "skipped", reason: "refusal", detail: `Gemini declined this request (${candidate.finishReason})` };
    }
    const text = (candidate.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    return { kind: "ok", text: stripJsonFences(text) };
  }
}

export function createStructuredCaller(auth: ProviderAuth): StructuredLLMCaller {
  switch (auth.provider) {
    case "anthropic":
      return new AnthropicStructuredCaller(auth);
    case "openai":
      return new OpenAICompatStructuredCaller(PROVIDERS.openai.baseUrl as string, auth.apiKey, "max_completion_tokens");
    case "xai":
      return new OpenAICompatStructuredCaller(PROVIDERS.xai.baseUrl as string, auth.apiKey, "max_tokens");
    case "deepseek":
      return new OpenAICompatStructuredCaller(PROVIDERS.deepseek.baseUrl as string, auth.apiKey, "max_tokens");
    case "zai":
      return new OpenAICompatStructuredCaller(PROVIDERS.zai.baseUrl as string, auth.apiKey, "max_tokens", PROVIDERS.zai.maxOutputTokens);
    case "kimi":
      return new AnthropicCompatStructuredCaller(PROVIDERS.kimi.baseUrl as string, auth.apiKey, PROVIDERS.kimi.maxOutputTokens);
    case "google":
      return new GoogleStructuredCaller(auth.apiKey);
  }
}
