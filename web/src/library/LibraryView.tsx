// F1: fetches /api/library, groups by instructor → series, shows a transcript-match
// badge, and opens (or creates) a project on click. Also hosts the YouTube URL
// paste box and the first-run empty state.
import { useEffect, useMemo, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import type { LibraryItem } from "../lib/types";
import styles from "./LibraryView.module.css";

interface SeriesGroup {
  series: string;
  items: LibraryItem[];
}

interface InstructorGroup {
  instructor: string;
  series: SeriesGroup[];
}

function groupLibrary(items: LibraryItem[]): InstructorGroup[] {
  const byInstructor = new Map<string, Map<string, LibraryItem[]>>();
  for (const item of items) {
    const instructor = item.instructor ?? "Unsorted";
    const series = item.series ?? "General";
    if (!byInstructor.has(instructor)) byInstructor.set(instructor, new Map());
    const bySeries = byInstructor.get(instructor)!;
    if (!bySeries.has(series)) bySeries.set(series, []);
    bySeries.get(series)!.push(item);
  }
  return [...byInstructor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([instructor, bySeries]) => ({
      instructor,
      series: [...bySeries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([series, seriesItems]) => ({
          series,
          items: [...seriesItems].sort((a, b) => a.title.localeCompare(b.title)),
        })),
    }));
}

function YoutubeBox(): JSX.Element {
  const createYoutubeProject = useStudyLoopStore((s) => s.createYoutubeProject);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try {
      const project = await createYoutubeProject(url.trim());
      setUrl("");
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.youtubeBox} onSubmit={handleSubmit}>
      <input
        type="url"
        className={styles.youtubeInput}
        placeholder="Paste a YouTube URL to start studying it…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={submitting}
      />
      <button type="submit" className={styles.youtubeSubmit} disabled={submitting || !url.trim()}>
        {submitting ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

export function LibraryView(): JSX.Element {
  const libraryItems = useStudyLoopStore((s) => s.libraryItems);
  const libraryWarnings = useStudyLoopStore((s) => s.libraryWarnings);
  const libraryLoading = useStudyLoopStore((s) => s.libraryLoading);
  const libraryLoaded = useStudyLoopStore((s) => s.libraryLoaded);
  const loadLibrary = useStudyLoopStore((s) => s.loadLibrary);
  const rescanLibrary = useStudyLoopStore((s) => s.rescanLibrary);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const config = useStudyLoopStore((s) => s.config);
  const loadConfig = useStudyLoopStore((s) => s.loadConfig);

  const [openingPath, setOpeningPath] = useState<string | null>(null);

  useEffect(() => {
    if (!libraryLoaded) void loadLibrary();
    if (!config) void loadConfig();
  }, [libraryLoaded, loadLibrary, config, loadConfig]);

  const groups = useMemo(() => groupLibrary(libraryItems), [libraryItems]);
  const hasNoRoots = config != null && config.libraryRoots.length === 0;
  const showEmptyState = libraryLoaded && !libraryLoading && libraryItems.length === 0;

  const handleOpen = async (item: LibraryItem) => {
    setOpeningPath(item.videoPath);
    try {
      const project = await openOrCreateLocalProject(item);
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>StudyLoop</h1>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => navigate({ view: "settings" })}>
            Settings
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void rescanLibrary()}
            disabled={libraryLoading}
          >
            {libraryLoading ? "Scanning…" : "Rescan library"}
          </button>
        </div>
      </header>

      <YoutubeBox />

      {libraryWarnings.length > 0 && (
        <div className={styles.warnings}>
          {libraryWarnings.map((w) => (
            <div key={w} className={styles.warning}>
              {w}
            </div>
          ))}
        </div>
      )}

      {libraryLoading && !libraryLoaded && <div className={styles.status}>Loading your library…</div>}

      {showEmptyState && (
        <div className={styles.emptyCard}>
          <h2>Let&rsquo;s find your videos</h2>
          <p>
            {hasNoRoots
              ? "No library folders are configured yet. Add one in Settings and StudyLoop will scan it for videos and matching transcripts."
              : "No videos were found in your configured folders. Double-check the paths in Settings, or rescan if you just added files."}
          </p>
          <button type="button" className={styles.primaryButton} onClick={() => navigate({ view: "settings" })}>
            Open Settings
          </button>
          <p className={styles.emptyOr}>— or paste a YouTube URL above to start immediately.</p>
        </div>
      )}

      {!showEmptyState &&
        groups.map((group) => (
          <section key={group.instructor} className={styles.instructorGroup}>
            <h2 className={styles.instructorTitle}>{group.instructor}</h2>
            {group.series.map((series) => (
              <div key={series.series} className={styles.seriesGroup}>
                <h3 className={styles.seriesTitle}>{series.series}</h3>
                <div className={styles.itemGrid}>
                  {series.items.map((item) => (
                    <button
                      key={item.videoPath}
                      type="button"
                      className={styles.itemCard}
                      onClick={() => void handleOpen(item)}
                      disabled={openingPath === item.videoPath}
                    >
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemMeta}>
                        {item.transcriptPath ? (
                          <span className={styles.badgeMatched}>Transcript matched</span>
                        ) : (
                          <span className={styles.badgeMissing}>No transcript</span>
                        )}
                        {openingPath === item.videoPath && <span className={styles.opening}>Opening…</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}
