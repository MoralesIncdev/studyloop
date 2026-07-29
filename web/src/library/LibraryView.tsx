// F1 (restyled V2-A "home grid" per SPEC): fetches /api/library, groups by
// instructor → series, and renders each video as a YouTube-home-style thumbnail
// card — a real, lazily-generated mid-video-frame thumbnail (codex P1-1, see
// GET /api/thumb) with the film-glyph placeholder only as a load-failure
// fallback. Also hosts the YouTube URL paste bar (now a slim bar under the
// global TopBar) and the first-run empty state.
import { useEffect, useMemo, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { api } from "../lib/api";
import { ReviewBanner } from "../review/ReviewBanner";
import type { LibraryItem } from "../lib/types";
import styles from "./LibraryView.module.css";

interface SeriesGroup {
  series: string;
  items: LibraryItem[];
}

/** Enough skeleton cards to fill a typical first screen without looking sparse. */
const SKELETON_CARD_COUNT_ARRAY = Array.from({ length: 8 }, (_, i) => i);

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

function YoutubeBar(): JSX.Element {
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
    <form className={styles.youtubeBar} onSubmit={handleSubmit}>
      <span className={styles.youtubeBarIcon} aria-hidden="true">
        <Icon name="play" size={16} />
      </span>
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

function VideoCard({ item, onOpen, opening }: { item: LibraryItem; onOpen: () => void; opening: boolean }): JSX.Element {
  // codex P1-1: real thumbnails — lazily generated/cached server-side (see
  // GET /api/thumb). Falls back to the film-glyph placeholder while missing
  // or on any load failure (never generated, ffmpeg unavailable, etc.).
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <button type="button" className={styles.card} onClick={onOpen} disabled={opening}>
      <div className={styles.thumb}>
        {thumbFailed ? (
          <span className={styles.thumbGlyph} aria-hidden="true">
            <Icon name="video" size={32} />
          </span>
        ) : (
          <img
            className={styles.thumbImage}
            src={api.thumbUrl(item.videoPath)}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
        {item.durationSeconds != null && (
          <span className={styles.durationBadge}>{formatTimestamp(item.durationSeconds)}</span>
        )}
        {opening && <span className={styles.thumbOverlay}>Opening…</span>}
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardTitle}>{item.title}</span>
        <span className={styles.cardInstructor}>{item.instructor ?? "Unsorted"}</span>
        {/* codex P2: a "Transcript" badge on every card (the normal state)
            read as diagnostic metadata. Only flag the exceptional case —
            a video with no transcript to study alongside. */}
        {!item.transcriptPath && <span className={styles.badgeMissing}>No transcript</span>}
      </div>
    </button>
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
      <ReviewBanner />
      <YoutubeBar />

      <div className={styles.toolbar}>
        <span className={styles.toolbarCount}>
          {libraryItems.length} video{libraryItems.length === 1 ? "" : "s"}
        </span>
        <button type="button" className={styles.secondaryButton} onClick={() => void rescanLibrary()} disabled={libraryLoading}>
          {libraryLoading ? "Scanning…" : "Rescan library"}
        </button>
      </div>

      {libraryWarnings.length > 0 && (
        <div className={styles.warnings}>
          {libraryWarnings.map((w) => (
            <div key={w} className={styles.warning}>
              {w}
            </div>
          ))}
        </div>
      )}

      {libraryLoading && !libraryLoaded && (
        // codex P1-3: geometry-matched skeleton grid (same card/thumb shape
        // as VideoCard) instead of a plain "Loading…" line.
        <div className={styles.grid} aria-hidden="true">
          {SKELETON_CARD_COUNT_ARRAY.map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={`${styles.thumb} skeleton`} />
              <div className={styles.cardBody}>
                <span className={`${styles.skeletonLine} skeleton`} style={{ width: "85%" }} />
                <span className={`${styles.skeletonLine} skeleton`} style={{ width: "45%" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showEmptyState && (
        <div className={styles.emptyCard}>
          <Icon name="video" size={48} className={styles.emptyIcon} />
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
                <div className={styles.grid}>
                  {series.items.map((item) => (
                    <VideoCard
                      key={item.videoPath}
                      item={item}
                      opening={openingPath === item.videoPath}
                      onOpen={() => void handleOpen(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}
