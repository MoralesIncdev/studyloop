// V2-B: TopBar search now hits GET /api/search?q= (SPEC "Fast YouTube layer")
// instead of the V2-A client-side library filter stub. Debounced 300ms;
// dropdown shows "Your library" (thumbnail-less rows) + "YouTube" (thumb +
// author + duration) sections; ↑/↓/Enter/Esc navigate and act on either
// section. Innertube-down degrades to an empty YouTube section — never an
// error toast (the youtube array is just [] from the server in that case).
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { api, ApiError } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import type { LibraryItem, RelatedVideo, SearchIntent } from "../lib/types";
import styles from "./TopBar.module.css";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_LIBRARY_RESULTS = 6;
const MAX_YOUTUBE_RESULTS = 6;

/** V3-C C2 "Search intent toggles" (SPEC/PEDAGOGY.md §6). */
const INTENT_OPTIONS: { value: SearchIntent; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "deep_dive", label: "Deep dive" },
  { value: "troubleshooting", label: "Troubleshooting" },
];

interface FlatRow {
  section: "library" | "youtube";
  index: number;
}

function Wordmark({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={styles.wordmark} onClick={onClick} aria-label="StudyLoop home">
      <span className={styles.logoMark}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </span>
      <span className={styles.logoText}>StudyLoop</span>
    </button>
  );
}

export function TopBar(): JSX.Element {
  const navigate = useStudyLoopStore((s) => s.navigate);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);
  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
  const pushToast = useStudyLoopStore((s) => s.pushToast);
  const reviewDueCount = useStudyLoopStore((s) => s.reviewCounts?.due ?? 0);
  const searchIntent = useStudyLoopStore((s) => s.searchIntent);
  const setSearchIntent = useStudyLoopStore((s) => s.setSearchIntent);

  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryResults, setLibraryResults] = useState<LibraryItem[]>([]);
  const [youtubeResults, setYoutubeResults] = useState<RelatedVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function onPointerDown(e: MouseEvent): void {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Debounced GET /api/search?q=[&intent=]. A trailing empty query clears
  // results immediately (no request, dropdown just closes) rather than
  // waiting out the debounce. V3-C C2: re-runs immediately on an intent
  // toggle too (searchIntent in the dependency array) — the reshaped
  // youtube-only query only affects the youtube half of the results.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setLibraryResults([]);
      setYoutubeResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      void api
        .search(q, searchIntent)
        .then((res) => {
          if (requestId !== requestIdRef.current) return; // superseded by a newer keystroke
          setLibraryResults(res.library.slice(0, MAX_LIBRARY_RESULTS));
          // Innertube-down surfaces here as an already-empty `youtube` array
          // from the server (see lib/innertube.ts / lib/search.ts) — nothing
          // for the UI to distinguish from "no results", by design (no error toast).
          setYoutubeResults(res.youtube.slice(0, MAX_YOUTUBE_RESULTS));
        })
        .catch(() => {
          // A failed /api/search request itself (not an Innertube-only
          // failure, which already degrades server-side) — fail quiet, the
          // dropdown just shows empty states rather than spamming a toast on
          // every keystroke.
          if (requestId !== requestIdRef.current) return;
          setLibraryResults([]);
          setYoutubeResults([]);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchIntent]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [libraryResults, youtubeResults]);

  const rows = useMemo<FlatRow[]>(() => {
    const libraryRows: FlatRow[] = libraryResults.map((_, index) => ({ section: "library", index }));
    const youtubeRows: FlatRow[] = youtubeResults.map((_, index) => ({ section: "youtube", index }));
    return [...libraryRows, ...youtubeRows];
  }, [libraryResults, youtubeResults]);

  const handleOpenLibrary = async (item: LibraryItem): Promise<void> => {
    setOpeningKey(`lib:${item.videoPath}`);
    try {
      const project = await openOrCreateLocalProject(item);
      setDropdownOpen(false);
      setQuery("");
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningKey(null);
    }
  };

  const handleOpenYoutube = async (video: RelatedVideo): Promise<void> => {
    setOpeningKey(`yt:${video.videoId}`);
    try {
      const project = await openOrCreateYoutubeProject(video.videoId);
      setDropdownOpen(false);
      setQuery("");
      navigate({ view: "study", projectId: project.id });
    } catch (err) {
      if (!(err instanceof ApiError)) pushToast(`Could not open "${video.title}"`, "error");
    } finally {
      setOpeningKey(null);
    }
  };

  const activateRow = (row: FlatRow): void => {
    if (row.section === "library") void handleOpenLibrary(libraryResults[row.index]);
    else void handleOpenYoutube(youtubeResults[row.index]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      setDropdownOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!dropdownOpen || rows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = activeIndex >= 0 ? rows[activeIndex] : rows[0];
      if (row) activateRow(row);
    }
  };

  const libraryActiveIndex = rows[activeIndex]?.section === "library" ? rows[activeIndex].index : -1;
  const youtubeActiveIndex = rows[activeIndex]?.section === "youtube" ? rows[activeIndex].index : -1;

  return (
    <header className={styles.topbar}>
      <Wordmark onClick={() => navigate({ view: "library" })} />

      <div className={styles.searchWrap} ref={searchWrapRef}>
        <form
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (rows[0]) activateRow(rows[0]);
          }}
        >
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search your library or YouTube"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls="topbar-search-dropdown"
          />
          <button type="submit" className={styles.searchButton} aria-label="Search">
            <Icon name="search" size={18} />
          </button>
        </form>
        {dropdownOpen && query.trim().length > 0 && (
          <div id="topbar-search-dropdown" className={styles.dropdown} role="listbox">
            {/* V3-C C2 "Search intent toggles" (SPEC/PEDAGOGY.md §6): only
                reshapes the youtube half of the query (see lib/search.ts) —
                off by default, sticky per session (store.searchIntent, not
                persisted across reloads). */}
            <div className={styles.intentRow} role="group" aria-label="Search intent">
              {INTENT_OPTIONS.map((opt) => {
                const active = searchIntent === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.intentChip} ${active ? styles.intentChipActive : ""}`}
                    aria-pressed={active}
                    onClick={() => setSearchIntent(active ? null : opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className={styles.dropdownSection}>
              <div className={styles.dropdownLabel}>Your library</div>
              {searching && libraryResults.length === 0 && (
                <div className={styles.dropdownEmpty}>Searching…</div>
              )}
              {!searching && libraryResults.length === 0 && (
                <div className={styles.dropdownEmpty}>No matches for &ldquo;{query.trim()}&rdquo;.</div>
              )}
              {libraryResults.map((item, index) => (
                <button
                  type="button"
                  key={item.videoPath}
                  className={`${styles.dropdownItem} ${index === libraryActiveIndex ? styles.dropdownItemActive : ""}`}
                  disabled={openingKey === `lib:${item.videoPath}`}
                  onMouseEnter={() => setActiveIndex(rows.findIndex((r) => r.section === "library" && r.index === index))}
                  onClick={() => void handleOpenLibrary(item)}
                >
                  <span className={styles.dropdownItemBody}>
                    <span className={styles.dropdownItemTitle}>{item.title}</span>
                    <span className={styles.dropdownItemMeta}>
                      {item.instructor ?? "Unsorted"}
                      {item.durationSeconds ? ` · ${formatTimestamp(item.durationSeconds)}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.dropdownSection}>
              <div className={styles.dropdownLabel}>YouTube</div>
              {youtubeResults.length === 0 && (
                <div className={styles.dropdownEmpty}>
                  {searching ? "Searching…" : "No YouTube results — try a different search."}
                </div>
              )}
              {youtubeResults.map((video, index) => (
                <button
                  type="button"
                  key={video.videoId}
                  className={`${styles.dropdownItem} ${index === youtubeActiveIndex ? styles.dropdownItemActive : ""}`}
                  disabled={openingKey === `yt:${video.videoId}`}
                  onMouseEnter={() => setActiveIndex(rows.findIndex((r) => r.section === "youtube" && r.index === index))}
                  onClick={() => void handleOpenYoutube(video)}
                >
                  <span className={styles.dropdownItemThumb} aria-hidden="true">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className={styles.dropdownItemThumbImg} />
                    ) : (
                      <Icon name="play" size={16} />
                    )}
                  </span>
                  <span className={styles.dropdownItemBody}>
                    <span className={styles.dropdownItemTitle}>{video.title}</span>
                    <span className={styles.dropdownItemMeta}>
                      {video.author}
                      {video.durationSeconds ? ` · ${formatTimestamp(video.durationSeconds)}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.reviewButton}
        onClick={() => navigate({ view: "review" })}
        aria-label={reviewDueCount > 0 ? `Review — ${reviewDueCount} card${reviewDueCount === 1 ? "" : "s"} due` : "Review"}
        title="Review"
      >
        <Icon name="notifications" size={20} />
        {reviewDueCount > 0 && (
          <span className={styles.reviewBadge} aria-hidden="true">
            {reviewDueCount > 99 ? "99+" : reviewDueCount}
          </span>
        )}
      </button>

      <div className={styles.menuWrap} ref={menuWrapRef}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          <Icon name="settings" size={20} />
        </button>
        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate({ view: "library" });
              }}
            >
              <Icon name="home" size={18} />
              Home
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate({ view: "settings" });
              }}
            >
              <Icon name="settings" size={18} />
              Settings
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
