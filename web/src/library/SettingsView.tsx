// GET/PUT /api/config editor. Roots are edited as comma/newline-separated text and
// split client-side — simplest possible form per SPEC, no fancy list UI needed.
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import styles from "./SettingsView.module.css";

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
  // The server never sends the actual key back (GET /api/config redacts it to
  // `anthropicApiKeySet`), so this field always starts empty — typing in it
  // sets/replaces the key, leaving it blank keeps whatever's already saved.
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
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
    setAnalysisModel(config.analysisModel ?? "");
    setShareHandle(config.shareHandle);
    setLoaded(true);
  }, [config, loaded]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedKey = anthropicApiKey.trim();
      await saveConfig({
        dataDir: dataDir.trim() || "~/StudyLoopData",
        libraryRoots: splitPaths(libraryRoots),
        transcriptRoots: splitPaths(transcriptRoots),
        conceptDocs: splitPaths(conceptDocs),
        // Omit entirely when left blank — sending `null` here would clear an
        // already-saved key just because the field wasn't touched. Use the
        // "Clear key" button for that instead.
        ...(trimmedKey ? { anthropicApiKey: trimmedKey } : {}),
        analysisModel: analysisModel.trim() || null,
        shareHandle: shareHandle.trim() || "anonymous",
      });
      setAnthropicApiKey("");
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
      await saveConfig({ anthropicApiKey: null });
      setAnthropicApiKey("");
      pushToast("API key cleared", "success");
    } catch {
      // store already toasted the error
    }
  };

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
          <span className={styles.label}>Anthropic API key</span>
          <span className={styles.hint}>
            Optional. Not required for playback, notes, or transcripts.{" "}
            {config?.anthropicApiKeySet
              ? "A key is currently saved — leave blank to keep it, or type a new one to replace it."
              : "No key saved yet."}
          </span>
          <input
            type="password"
            className={styles.input}
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder={config?.anthropicApiKeySet ? "•••••••• (leave blank to keep)" : "sk-ant-…"}
            autoComplete="off"
          />
          {config?.anthropicApiKeySet && (
            <button type="button" className={styles.secondaryButton} onClick={() => void handleClearKey()}>
              Clear key
            </button>
          )}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Analysis model</span>
          <span className={styles.hint}>Model used for the ✨ Analyze pipeline. Leave blank for the default (claude-opus-5).</span>
          <input
            type="text"
            className={styles.input}
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            placeholder="claude-opus-5"
          />
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
