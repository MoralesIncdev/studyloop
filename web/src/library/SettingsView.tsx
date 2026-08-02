// GET/PUT /api/config editor. Roots are edited as comma/newline-separated text and
// split client-side — simplest possible form per SPEC, no fancy list UI needed.
import { useEffect, useState } from "react";
import {
  LLM_PROVIDERS,
  LLM_PROVIDER_IDS,
  type AnthropicAuthMode,
  type AsrMode,
  type LlmProviderId,
  type StudyLoopConfig,
} from "../lib/types";
import { useStudyLoopStore } from "../state/store";
import styles from "./SettingsView.module.css";

/** Which `…ApiKeySet` flag corresponds to the selected provider. */
function keySetFor(config: StudyLoopConfig, provider: LlmProviderId): boolean {
  switch (provider) {
    case "anthropic":
      return config.anthropicApiKeySet;
    case "openai":
      return config.openaiApiKeySet;
    case "google":
      return config.googleApiKeySet;
    case "xai":
      return config.xaiApiKeySet;
    case "deepseek":
      return config.deepseekApiKeySet;
    case "kimi":
      return config.kimiApiKeySet;
    case "zai":
      return config.zaiApiKeySet;
  }
}

function splitPaths(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SettingsView(): JSX.Element {
  const config = useStudyLoopStore((s) => s.config);
  const loadConfig = useStudyLoopStore((s) => s.loadConfig);
  const saveConfig = useStudyLoopStore((s) => s.saveConfig);
  const rescanLibrary = useStudyLoopStore((s) => s.rescanLibrary);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const pushToast = useStudyLoopStore((s) => s.pushToast);

  const [dataDir, setDataDir] = useState("");
  const [libraryRoots, setLibraryRoots] = useState("");
  const [transcriptRoots, setTranscriptRoots] = useState("");
  const [conceptDocs, setConceptDocs] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProviderId>("anthropic");
  const [anthropicAuthMode, setAnthropicAuthMode] = useState<AnthropicAuthMode>("api-key");
  // The server never sends actual keys back (GET /api/config redacts them to
  // per-provider `…ApiKeySet` booleans), so this field always starts empty —
  // typing in it sets/replaces the selected provider's key, leaving it blank
  // keeps whatever's already saved.
  const [apiKey, setApiKey] = useState("");
  const [analysisModel, setAnalysisModel] = useState("");
  const [shareHandle, setShareHandle] = useState("");
  // Phase 11 "Bring-your-own local ASR adapters".
  const [asrMode, setAsrMode] = useState<AsrMode>("off");
  const [asrCommand, setAsrCommand] = useState("");
  const [asrEndpoint, setAsrEndpoint] = useState("");
  // Same "server never echoes the key back, field always starts empty" convention as the LLM provider apiKey field above.
  const [asrApiKey, setAsrApiKey] = useState("");
  const [asrModel, setAsrModel] = useState("");
  const [asrLanguage, setAsrLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!config || loaded) return;
    setDataDir(config.dataDir);
    setLibraryRoots(config.libraryRoots.join("\n"));
    setTranscriptRoots(config.transcriptRoots.join("\n"));
    setConceptDocs(config.conceptDocs.join("\n"));
    setLlmProvider(config.llmProvider);
    setAnthropicAuthMode(config.anthropicAuthMode);
    setAnalysisModel(config.analysisModel ?? "");
    setShareHandle(config.shareHandle);
    setAsrMode(config.asr.mode);
    setAsrCommand(config.asr.command ?? "");
    setAsrEndpoint(config.asr.endpoint ?? "");
    setAsrModel(config.asr.model ?? "");
    setAsrLanguage(config.asr.language ?? "");
    setLoaded(true);
  }, [config, loaded]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedKey = apiKey.trim();
      const trimmedAsrKey = asrApiKey.trim();
      await saveConfig({
        dataDir: dataDir.trim() || "~/StudyLoopData",
        libraryRoots: splitPaths(libraryRoots),
        transcriptRoots: splitPaths(transcriptRoots),
        conceptDocs: splitPaths(conceptDocs),
        llmProvider,
        anthropicAuthMode,
        // Omit entirely when left blank — sending `null` here would clear an
        // already-saved key just because the field wasn't touched. Use the
        // "Clear key" button for that instead.
        ...(trimmedKey ? { [`${llmProvider}ApiKey`]: trimmedKey } : {}),
        analysisModel: analysisModel.trim() || null,
        shareHandle: shareHandle.trim() || "anonymous",
        // Phase 11 "Bring-your-own local ASR adapters": sent as one whole
        // object (server/src/config.ts's updateConfig shallow-merges it over
        // the existing asr config), same "omit apiKey to keep it" rule as
        // the LLM provider key above.
        asr: {
          mode: asrMode,
          command: asrCommand.trim() || null,
          endpoint: asrEndpoint.trim() || null,
          model: asrModel.trim() || null,
          language: asrLanguage.trim() || null,
          ...(trimmedAsrKey ? { apiKey: trimmedAsrKey } : {}),
        },
      });
      setApiKey("");
      setAsrApiKey("");
      pushToast("Settings saved", "success");
      await rescanLibrary();
      navigate({ view: "library" });
    } catch {
      // store already toasted the error
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    try {
      await saveConfig({ [`${llmProvider}ApiKey`]: null });
      setApiKey("");
      pushToast("API key cleared", "success");
    } catch {
      // store already toasted the error
    }
  };

  const handleClearAsrKey = async () => {
    try {
      await saveConfig({ asr: { apiKey: null } });
      setAsrApiKey("");
      pushToast("ASR API key cleared", "success");
    } catch {
      // store already toasted the error
    }
  };

  const provider = LLM_PROVIDERS[llmProvider];
  const keySet = config ? keySetFor(config, llmProvider) : false;
  const oauthSelected = llmProvider === "anthropic" && anthropicAuthMode === "oauth";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <form className={styles.form} onSubmit={handleSave}>
        <label className={styles.field}>
          <span className={styles.label}>Data directory</span>
          <span className={styles.hint}>Where StudyLoop stores project data (notes, bubbles, screenshots).</span>
          <input
            type="text"
            className={styles.input}
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            placeholder="~/StudyLoopData"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Library folders</span>
          <span className={styles.hint}>Folders to scan for video files. One per line (or comma-separated).</span>
          <textarea
            className={styles.textarea}
            value={libraryRoots}
            onChange={(e) => setLibraryRoots(e.target.value)}
            rows={3}
            placeholder={"/Volumes/Library/BJJ/Gordon Ryan"}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Transcript folders</span>
          <span className={styles.hint}>Folders to scan for transcript JSON files.</span>
          <textarea
            className={styles.textarea}
            value={transcriptRoots}
            onChange={(e) => setTranscriptRoots(e.target.value)}
            rows={3}
            placeholder={"/Volumes/Study/transcripts"}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Concept documents</span>
          <span className={styles.hint}>Markdown files providing concept cards for projects.</span>
          <textarea
            className={styles.textarea}
            value={conceptDocs}
            onChange={(e) => setConceptDocs(e.target.value)}
            rows={2}
            placeholder={"/Volumes/Study/curriculum.md"}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>AI provider</span>
          <span className={styles.hint}>
            Which LLM powers Analyze and card improvement. Optional — not required for playback, notes, or transcripts.
          </span>
          <select
            className={styles.input}
            value={llmProvider}
            onChange={(e) => {
              setLlmProvider(e.target.value as LlmProviderId);
              setApiKey("");
            }}
          >
            {LLM_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {LLM_PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </label>

        {llmProvider === "anthropic" && (
          <div className={styles.field}>
            <span className={styles.label}>Anthropic sign-in method</span>
            <span className={styles.hint}>
              OAuth uses the machine&apos;s existing Anthropic sign-in (ANTHROPIC_AUTH_TOKEN, e.g. from <code>ant auth login</code>)
              instead of a pasted key — the token must be in StudyLoop&apos;s environment when the server starts.
            </span>
            <label className={styles.hint}>
              <input
                type="radio"
                name="anthropicAuthMode"
                checked={anthropicAuthMode === "api-key"}
                onChange={() => setAnthropicAuthMode("api-key")}
              />{" "}
              API key
            </label>
            <label className={styles.hint}>
              <input
                type="radio"
                name="anthropicAuthMode"
                checked={anthropicAuthMode === "oauth"}
                onChange={() => setAnthropicAuthMode("oauth")}
              />{" "}
              OAuth / local sign-in
            </label>
          </div>
        )}

        {!oauthSelected && (
          <label className={styles.field}>
            <span className={styles.label}>{provider.label} API key</span>
            <span className={styles.hint}>
              {keySet
                ? "A key is currently saved — leave blank to keep it, or type a new one to replace it."
                : "No key saved yet for this provider."}
            </span>
            <input
              type="password"
              className={styles.input}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keySet ? "•••••••• (leave blank to keep)" : provider.keyPlaceholder}
              autoComplete="off"
            />
            {keySet && (
              <button type="button" className={styles.secondaryButton} onClick={() => void handleClearKey()}>
                Clear key
              </button>
            )}
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Analysis model</span>
          <span className={styles.hint}>
            Model used for the Analyze pipeline. Leave blank for the provider default ({provider.defaultModel}).
          </span>
          <input
            type="text"
            className={styles.input}
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            placeholder={provider.defaultModel}
            list="analysis-model-suggestions"
          />
          <datalist id="analysis-model-suggestions">
            {provider.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Share handle</span>
          <span className={styles.hint}>Your author name, embedded in exported .studyloop.json analysis bundles.</span>
          <input
            type="text"
            className={styles.input}
            value={shareHandle}
            onChange={(e) => setShareHandle(e.target.value)}
            placeholder="anonymous"
          />
        </label>

        {/* Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
            two adapter styles — a local command (whisper.cpp, faster-whisper,
            mlx-whisper, ...) or an OpenAI-compatible endpoint (speaches,
            LocalAI, a hosted Whisper) — mirroring the AI provider section
            above. Entirely optional: transcript-less local videos work fine
            without this, they just show no "Transcribe" affordance. */}
        <label className={styles.field}>
          <span className={styles.label}>Transcription (bring-your-own ASR)</span>
          <span className={styles.hint}>
            No cloud dependency, no bundled model. When a local video has no captions anywhere (no pipeline transcript, no
            same-dir .srt/.vtt, no YouTube captions), a "Transcribe" button appears on that project and runs whichever adapter
            you configure here.
          </span>
          <select className={styles.input} value={asrMode} onChange={(e) => setAsrMode(e.target.value as typeof asrMode)}>
            <option value="off">Off</option>
            <option value="command">Local command (whisper.cpp, faster-whisper, mlx-whisper, ...)</option>
            <option value="endpoint">Endpoint (OpenAI-compatible server)</option>
          </select>
        </label>

        {asrMode === "command" && (
          <label className={styles.field}>
            <span className={styles.label}>Command template</span>
            <span className={styles.hint}>
              Must contain both <code>{"{input}"}</code> and <code>{"{output}"}</code> — run directly (never through a shell),
              so pipes/redirects/chaining aren&apos;t supported. Example (whisper.cpp):{" "}
              <code>whisper-cli -m models/ggml-base.en.bin -f {"{input}"} -of {"{output}"} -osrt</code>
            </span>
            <textarea
              className={styles.textarea}
              value={asrCommand}
              onChange={(e) => setAsrCommand(e.target.value)}
              rows={2}
              placeholder="whisper-cli -m models/ggml-base.en.bin -f {input} -of {output} -osrt"
            />
          </label>
        )}

        {asrMode === "endpoint" && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Endpoint URL</span>
              <span className={styles.hint}>
                Base URL of an OpenAI-compatible server — <code>{"{endpoint}"}/v1/audio/transcriptions</code> is POSTed to.
                Example: a local speaches server at <code>http://localhost:8000</code>.
              </span>
              <input
                type="text"
                className={styles.input}
                value={asrEndpoint}
                onChange={(e) => setAsrEndpoint(e.target.value)}
                placeholder="http://localhost:8000"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Endpoint API key</span>
              <span className={styles.hint}>
                {config?.asr.apiKeySet
                  ? "A key is currently saved — leave blank to keep it, or type a new one to replace it."
                  : "Optional — only needed if your endpoint requires one."}
              </span>
              <input
                type="password"
                className={styles.input}
                value={asrApiKey}
                onChange={(e) => setAsrApiKey(e.target.value)}
                placeholder={config?.asr.apiKeySet ? "•••••••• (leave blank to keep)" : "not required by most local servers"}
                autoComplete="off"
              />
              {config?.asr.apiKeySet && (
                <button type="button" className={styles.secondaryButton} onClick={() => void handleClearAsrKey()}>
                  Clear key
                </button>
              )}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Model</span>
              <span className={styles.hint}>Forwarded as the multipart `model` field, when set.</span>
              <input
                type="text"
                className={styles.input}
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                placeholder="whisper-1"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Language</span>
              <span className={styles.hint}>Optional ISO 639-1 code (e.g. "en") — forwarded when set, auto-detected otherwise.</span>
              <input
                type="text"
                className={styles.input}
                value={asrLanguage}
                onChange={(e) => setAsrLanguage(e.target.value)}
                placeholder="en"
              />
            </label>
          </>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving…" : "Save & rescan"}
          </button>
        </div>
      </form>
    </div>
  );
}
