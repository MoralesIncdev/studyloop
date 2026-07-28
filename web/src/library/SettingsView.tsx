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
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
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
    setAnthropicApiKey(config.anthropicApiKey ?? "");
    setLoaded(true);
  }, [config, loaded]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveConfig({
        dataDir: dataDir.trim() || "~/StudyLoop",
        libraryRoots: splitPaths(libraryRoots),
        transcriptRoots: splitPaths(transcriptRoots),
        conceptDocs: splitPaths(conceptDocs),
        anthropicApiKey: anthropicApiKey.trim() || null,
      });
      pushToast("Settings saved", "success");
      await rescanLibrary();
      navigate({ view: "library" });
    } catch {
      // store already toasted the error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigate({ view: "library" })}>
          ← Library
        </button>
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
            placeholder="~/StudyLoop"
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
          <span className={styles.hint}>Optional. Not required for playback, notes, or transcripts.</span>
          <input
            type="password"
            className={styles.input}
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
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
