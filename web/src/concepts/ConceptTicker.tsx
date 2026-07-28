// F7 concept ticker: watches store.concepts + currentTime for concepts entering
// their [anchor, anchor+90s] window (activeConcepts selector) and slides in a
// compact ConceptCard for each newly-active one, stacked bottom-left over the
// video (max 2 visible + "+N more" chip that opens the Concepts dock tab).
// Ephemeral UI state lives here (not the store) — StudyView remounts this whole
// tree by `key={projectId}` on project change (see App.tsx), so it resets for
// free between sessions.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeConcepts } from "../lib/selectors";
import { analysisConceptToConceptCard } from "../lib/analysisFormat";
import type { ConceptCard as ConceptCardType } from "../lib/types";
import { ConceptCard } from "./ConceptCard";
import { ConceptOverlay } from "./ConceptOverlay";
import styles from "./ConceptTicker.module.css";

/** Concepts now live in the right-rail Concepts card (see study/RightRail.tsx),
 *  not a bottom-dock tab — the ticker's overflow chip scrolls it into view. */
function scrollToConceptsRail(): void {
  document.getElementById("concepts-rail")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

const MAX_VISIBLE = 2;

function tickerKey(conceptId: string, anchorT: number): string {
  return `${conceptId}:${anchorT}`;
}

interface Entry {
  key: string;
  card: ConceptCardType;
}

interface Props {
  /** True while the player chrome scrim is visible — the ticker shifts its
   *  bottom offset up so it never sits under the control cluster (codex §5
   *  "Ticker must sit above player controls only when chrome is hidden"). */
  chromeVisible?: boolean;
}

export function ConceptTicker({ chromeVisible = false }: Props): JSX.Element {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const muted = useStudyLoopStore((s) => s.conceptTickerMuted);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<ConceptCardType | null>(null);
  // Keys currently inside their active window, as of the last effect run.
  const prevKeysRef = useRef<Set<string>>(new Set());
  // Keys dismissed (auto or manual) while still inside their window — kept out
  // of the ticker until playback leaves and re-enters the window.
  const dismissedRef = useRef<Set<string>>(new Set());

  // V2-C: AI-breakdown concepts join the ticker's candidate pool alongside
  // doc concepts (SPEC: "anchored ones join the ticker windows like doc concepts").
  const allConcepts = useMemo(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );
  const active = useMemo(() => activeConcepts(allConcepts, currentTime), [allConcepts, currentTime]);
  // A stable string to key the effect off — `active` is a fresh array every
  // render even when its contents haven't changed.
  const signature = active.map((a) => tickerKey(a.card.id, a.anchorT)).join("|");

  useEffect(() => {
    const activeKeys = new Set(active.map((a) => tickerKey(a.card.id, a.anchorT)));
    const prevKeys = prevKeysRef.current;

    const leftKeys = [...prevKeys].filter((k) => !activeKeys.has(k));
    if (leftKeys.length > 0) {
      setEntries((cur) => cur.filter((e) => !leftKeys.includes(e.key)));
      leftKeys.forEach((k) => dismissedRef.current.delete(k));
    }

    if (!muted) {
      const additions = active
        .filter((a) => !prevKeys.has(tickerKey(a.card.id, a.anchorT)))
        .filter((a) => !dismissedRef.current.has(tickerKey(a.card.id, a.anchorT)))
        .map((a) => ({ key: tickerKey(a.card.id, a.anchorT), card: a.card }));
      if (additions.length > 0) setEntries((cur) => [...cur, ...additions]);
    }

    prevKeysRef.current = activeKeys;
    // `active`/`signature` are derived from the same [concepts, currentTime]
    // pair; depending on the stable string avoids re-running this effect
    // every ~250ms sync tick when the active set hasn't actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, muted]);

  const dismiss = (key: string): void => {
    dismissedRef.current.add(key);
    setEntries((cur) => cur.filter((e) => e.key !== key));
  };

  const visible = entries.slice(0, MAX_VISIBLE);
  const overflowCount = entries.length - visible.length;

  return (
    <>
      {!muted && entries.length > 0 && (
        <div className={styles.stack} data-chrome-visible={chromeVisible}>
          {visible.map((entry) => (
            <ConceptCard
              key={entry.key}
              card={entry.card}
              onDismiss={() => dismiss(entry.key)}
              onExpand={() => setExpanded(entry.card)}
            />
          ))}
          {overflowCount > 0 && (
            <button type="button" className={styles.moreChip} onClick={scrollToConceptsRail}>
              +{overflowCount} more
            </button>
          )}
        </div>
      )}
      {expanded && <ConceptOverlay card={expanded} onClose={() => setExpanded(null)} />}
    </>
  );
}
