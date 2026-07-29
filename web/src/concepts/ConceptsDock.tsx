// F7 Concepts dock tab. Two modes:
//  - unattached: a picker over the configured conceptDocs (from GET /api/config)
//    plus a free-path input; attaching PATCHes the project then loads concepts.
//  - attached: full concept list, anchored (grouped/sorted by anchor time, mm:ss
//    seek chips) then unanchored, with search filter, covered checkmarks
//    (passedConcepts), active-concept highlight, and a "covered n/m" line.
//
// V3-A A4: clicking a concept chip below the player (ConceptChipStrip) sets
// store.highlightedConceptId — this component scrolls that row into view and
// gives it a brief highlight pulse, then clears itself after a few seconds.
// Clicking a row's title also opens the full ConceptOverlay ("component may
// remain for the expanded overlay reached by click" — now reached from the
// rail rather than the old slide-over ticker).
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeConcepts, passedConcepts } from "../lib/selectors";
import { AI_CONCEPT_ID_PREFIX } from "../lib/analysisFormat";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { ConceptOverlay } from "./ConceptOverlay";
import type { ConceptCard } from "../lib/types";
import styles from "./ConceptsDock.module.css";

/** How long a chip-triggered highlight stays visible before fading itself out. */
const HIGHLIGHT_DURATION_MS = 2600;

interface AnchoredRow {
  card: ConceptCard;
  t: number;
}

/** Varying widths so the loading skeleton doesn't look like a uniform, obviously-fake grid. */
const SKELETON_ROW_WIDTHS = [72, 50, 84, 60, 45];

export function ConceptsDock(): JSX.Element {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const concepts = useStudyLoopStore((s) => s.concepts);
  const conceptsLoading = useStudyLoopStore((s) => s.conceptsLoading);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const controller = useStudyLoopStore((s) => s.controller);
  const config = useStudyLoopStore((s) => s.config);
  const loadConfig = useStudyLoopStore((s) => s.loadConfig);
  const attachConceptDoc = useStudyLoopStore((s) => s.attachConceptDoc);
  const detachConceptDoc = useStudyLoopStore((s) => s.detachConceptDoc);
  const pushToast = useStudyLoopStore((s) => s.pushToast);
  const highlightedConceptId = useStudyLoopStore((s) => s.highlightedConceptId);
  const clearHighlightedConcept = useStudyLoopStore((s) => s.clearHighlightedConcept);

  const [query, setQuery] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [expandedCard, setExpandedCard] = useState<ConceptCard | null>(null);

  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // Hoisted above the highlight effect below (it needs to know whether the
  // target row is currently filtered out by the search box).
  const q = query.trim().toLowerCase();
  const matchesQuery = (card: ConceptCard): boolean =>
    !q || card.title.toLowerCase().includes(q) || card.body.toLowerCase().includes(q);

  // V3-A A4 + review finding #4: scroll the chip-highlighted row into view,
  // expand it (doc concepts: the full ConceptOverlay — "for doc concepts
  // open the overlay/expanded state"), and self-clear the highlight after a
  // few seconds (the store never auto-clears — a chip click can fire again
  // on the exact same card, and each fresh click should restart the pulse).
  // AI-breakdown concepts (`ai:<id>`) are AnalysisSections' AiBreakdownSection's
  // concern, not this component's — it has no row for them.
  useEffect(() => {
    if (!highlightedConceptId || highlightedConceptId.startsWith(AI_CONCEPT_ID_PREFIX)) return undefined;
    const target = concepts.find((c) => c.id === highlightedConceptId);
    if (!target) return undefined;
    if (q && !matchesQuery(target)) {
      // The rail's own search filter would otherwise hide the chip's target
      // entirely — SPEC A4 requires it actually be reachable. Clear the
      // filter; this effect re-runs (via the `q` dependency below) once the
      // row is back in the DOM.
      setQuery("");
      return undefined;
    }
    rowRefs.current[highlightedConceptId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setExpandedCard(target);
    const timer = setTimeout(clearHighlightedConcept, HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesQuery is a fresh closure every render over `q`, already a dep
  }, [highlightedConceptId, clearHighlightedConcept, concepts, q]);

  const attached = !!currentProject?.conceptDoc?.path;

  useEffect(() => {
    if (!attached && !config) void loadConfig();
  }, [attached, config, loadConfig]);

  const activeIds = useMemo(
    () => new Set(activeConcepts(concepts, currentTime).map((a) => a.card.id)),
    [concepts, currentTime]
  );
  // Covered state is derived from the same monotonic high-water mark compile
  // uses (max(watchedUpTo, currentTime)), not raw currentTime alone — so
  // scrubbing backward to rewatch a section doesn't visually un-cover
  // concepts you've already passed, matching what the compiled doc will show.
  const coveredT = Math.max(currentProject?.watchedUpTo ?? 0, currentTime);
  const coveredIds = useMemo(
    () => new Set(passedConcepts(concepts, coveredT).map((c) => c.id)),
    [concepts, coveredT]
  );

  const anchoredRows = useMemo<AnchoredRow[]>(() => {
    const rows: AnchoredRow[] = [];
    for (const card of concepts) {
      for (const anchor of card.anchors) {
        if (anchor.t != null) rows.push({ card, t: anchor.t });
      }
    }
    return rows.sort((a, b) => a.t - b.t);
  }, [concepts]);

  const unanchoredCards = useMemo(() => concepts.filter((c) => !c.anchors.some((a) => a.t != null)), [concepts]);

  const visibleAnchored = anchoredRows.filter((r) => matchesQuery(r.card));
  const visibleUnanchored = unanchoredCards.filter(matchesQuery);
  const noMatches = q.length > 0 && visibleAnchored.length === 0 && visibleUnanchored.length === 0;

  const handleAttach = async (path: string): Promise<void> => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setAttaching(true);
    try {
      await attachConceptDoc(trimmed);
      pushToast("Concept doc attached", "success");
    } finally {
      setAttaching(false);
    }
  };

  if (!currentProject) return <p className={styles.status}>Loading…</p>;

  if (!attached) {
    const docs = config?.conceptDocs ?? [];
    return (
      <div className={styles.attachPane}>
        <p className={styles.status}>No concept doc attached to this project.</p>
        {docs.length > 0 && (
          <div className={styles.docList}>
            {docs.map((path) => (
              <button
                key={path}
                type="button"
                className={styles.docButton}
                disabled={attaching}
                onClick={() => void handleAttach(path)}
                title={path}
              >
                {path}
              </button>
            ))}
          </div>
        )}
        <div className={styles.customRow}>
          <input
            type="text"
            className={styles.input}
            placeholder="/path/to/concept-doc.md"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAttach(customPath);
            }}
          />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={attaching || !customPath.trim()}
            onClick={() => void handleAttach(customPath)}
          >
            {attaching ? "Attaching…" : "Attach"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="Search concepts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={styles.detachButton} onClick={() => void detachConceptDoc()}>
          Detach
        </button>
      </div>
      {concepts.length > 0 && (
        <div className={styles.progress}>
          Covered {coveredIds.size} / {concepts.length}
        </div>
      )}
      {conceptsLoading && (
        // codex P1-3: geometry-matched skeleton rows instead of a plain
        // "Loading…" line — same .item row shape the real list renders.
        <div className={styles.skeletonList} aria-hidden="true">
          {SKELETON_ROW_WIDTHS.map((width, i) => (
            <div key={i} className={styles.skeletonItem}>
              <span className={`${styles.skeletonChip} skeleton`} />
              <span className={`${styles.skeletonTitle} skeleton`} style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
      )}
      {!conceptsLoading && concepts.length === 0 && <p className={styles.status}>No concepts found in this doc.</p>}
      {!conceptsLoading && concepts.length > 0 && (
        <div className={styles.list}>
          {visibleAnchored.length > 0 && (
            <ul className={styles.group}>
              {visibleAnchored.map((row, i) => (
                <li
                  key={`${row.card.id}-${i}`}
                  ref={(el) => {
                    rowRefs.current[row.card.id] = el;
                  }}
                  className={`${styles.item} ${activeIds.has(row.card.id) ? styles.itemActive : ""} ${
                    highlightedConceptId === row.card.id ? styles.itemHighlighted : ""
                  }`}
                >
                  <button type="button" className={styles.timeChip} onClick={() => controller?.seek(row.t)}>
                    {formatTimestamp(row.t)}
                  </button>
                  <button type="button" className={styles.itemTitleButton} onClick={() => setExpandedCard(row.card)}>
                    {row.card.title}
                  </button>
                  {coveredIds.has(row.card.id) && (
                    <span className={styles.covered} title="Covered" aria-label="Covered">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {visibleUnanchored.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Unanchored</div>
              <ul className={styles.group}>
                {visibleUnanchored.map((card) => (
                  <li
                    key={card.id}
                    ref={(el) => {
                      rowRefs.current[card.id] = el;
                    }}
                    className={`${styles.item} ${activeIds.has(card.id) ? styles.itemActive : ""} ${
                      highlightedConceptId === card.id ? styles.itemHighlighted : ""
                    }`}
                  >
                    <button type="button" className={styles.itemTitleButton} onClick={() => setExpandedCard(card)}>
                      {card.title}
                    </button>
                    {coveredIds.has(card.id) && (
                      <span className={styles.covered} title="Covered" aria-label="Covered">
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {noMatches && <p className={styles.status}>No concepts match &ldquo;{query}&rdquo;.</p>}
        </div>
      )}
      <ConceptOverlay card={expandedCard} onClose={() => setExpandedCard(null)} />
    </div>
  );
}
