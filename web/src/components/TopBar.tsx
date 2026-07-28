// V2-A: replaces every per-view header (SPEC "TopBar: [logo StudyLoop] [centered
// search + 🔍] [⚙ avatar]"). Mounted once in App.tsx above the routed view.
// Search is wired to client-side library filtering for now — `runSearch` below is
// the one place to swap in a real `GET /api/search?q=` call later (SPEC "Fast
// YouTube layer"), everything else (dropdown shape, sections) is already built
// for it: the YouTube section always renders its "coming in next build" empty
// state regardless of query.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { formatTimestamp } from "../lib/time";
import type { LibraryItem } from "../lib/types";
import styles from "./TopBar.module.css";

const MAX_RESULTS = 6;

/** Client-side stand-in for `GET /api/search?q=`. Swap the body for a fetch later. */
function runSearch(items: LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter((item) => item.title.toLowerCase().includes(q) || item.instructor?.toLowerCase().includes(q))
    .slice(0, MAX_RESULTS);
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
  const libraryItems = useStudyLoopStore((s) => s.libraryItems);
  const libraryLoaded = useStudyLoopStore((s) => s.libraryLoaded);
  const loadLibrary = useStudyLoopStore((s) => s.loadLibrary);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);

  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  // The TopBar is mounted for every view (including Study, where LibraryView
  // never mounts), so it owns loading the library data its own dropdown needs.
  // loadLibrary() no-ops if a load is already in flight (see store.ts).
  useEffect(() => {
    if (!libraryLoaded) void loadLibrary();
  }, [libraryLoaded, loadLibrary]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent): void {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const results = useMemo(() => runSearch(libraryItems, query), [libraryItems, query]);

  const handleOpen = async (item: LibraryItem): Promise<void> => {
    setOpeningPath(item.videoPath);
    try {
      const project = await openOrCreateLocalProject(item);
      setDropdownOpen(false);
      setQuery("");
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <header className={styles.topbar}>
      <Wordmark onClick={() => navigate({ view: "library" })} />

      <div className={styles.searchWrap} ref={searchWrapRef}>
        <form
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search your library"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
          />
          <button type="submit" className={styles.searchButton} aria-label="Search">
            🔍
          </button>
        </form>
        {dropdownOpen && (
          <div className={styles.dropdown} role="listbox">
            <div className={styles.dropdownSection}>
              <div className={styles.dropdownLabel}>Library</div>
              {query.trim().length === 0 && <div className={styles.dropdownEmpty}>Start typing to search your videos…</div>}
              {query.trim().length > 0 && results.length === 0 && (
                <div className={styles.dropdownEmpty}>No matches for &ldquo;{query}&rdquo;.</div>
              )}
              {results.map((item) => (
                <button
                  type="button"
                  key={item.videoPath}
                  className={styles.dropdownItem}
                  disabled={openingPath === item.videoPath}
                  onClick={() => void handleOpen(item)}
                >
                  <span className={styles.dropdownItemThumb} aria-hidden="true">
                    🎞
                  </span>
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
              <div className={styles.dropdownEmpty}>YouTube search is coming in the next build — paste a URL from the home page for now.</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.menuWrap} ref={menuWrapRef}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          ⚙
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
              🏠 Home
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
              ⚙ Settings
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
