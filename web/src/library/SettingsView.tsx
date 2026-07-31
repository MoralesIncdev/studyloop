// GET/PUT /api/config editor. Roots are edited as comma/newline-separated text and
// split client-side — simplest possible form per SPEC, no fancy list UI needed.
import { useEffect, useState } from "react";
import { LLM_PROVIDERS, LLM_PROVIDER_IDS, type AnthropicAuthMode, type LlmProviderId, type StudyLoopConfig } from "../lib/types";
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
    setLoaded(true);
  }, [config, loaded]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedKey = apiKey.trim();
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
      });
      setApiKey("");
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

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving…" : "Save & rescan"}
          </button>
        </div>
      </form>
    </div>
  );
}
