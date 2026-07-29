// V3-A A4 "Concept ticker demotion": replaces the old slide-over ticker
// (ConceptCard stack over the video) with a slim chip row directly below the
// player — signaling, not decoration (PEDAGOGY §4). Reuses the same
// activeConcepts([anchor, anchor+90s]) selector the old ticker used. Chips
// fade in/out with the active window; clicking one opens the Concepts rail
// section with that card highlighted (no seek — full card on demand).
// Empty strip renders nothing at all (zero height, no dead space). The
// existing ticker-mute toggle (RightRail's Concepts header button) now
// gates this strip instead of the old ticker.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeConcepts } from "../lib/selectors";
import { selectConceptChips } from "../lib/conceptChips";
import { analysisConceptToConceptCard } from "../lib/analysisFormat";
import styles from "./ConceptChipStrip.module.css";

const MAX_VISIBLE = 2;
/**
 * Matches --duration-fast (120ms) — SPEC A4 "chips appear/disappear with the
 * active window (fade, --duration-fast)". A plain conditional-render list
 * would unmount a chip (or the whole strip) the instant it drops out of the
 * active window, cutting its fade-out CSS transition off before a frame
 * plays — the same problem components/ModalShell.tsx's usePresence exists to
 * solve for dialogs. Chips that leave the active set are kept mounted with
 * `data-state="closing"` for this long before actually being dropped
 * (V3-A review finding #8). `prefers-reduced-motion` is handled by the
 * global CSS block in index.css, same as every other timed transition here.
 */
const FADE_DURATION_MS = 120;

function scrollToConceptsRail(): void {
  document.getElementById("concepts-rail")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

interface ChipDescriptor {
  id: string;
  label: string;
  title?: string;
  overflow: boolean;
}

interface ChipPresenceEntry {
  chip: ChipDescriptor;
  state: "open" | "closing";
}

export function ConceptChipStrip(): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const muted = useStudyLoopStore((s) => s.conceptTickerMuted);
  const focusConceptInRail = useStudyLoopStore((s) => s.focusConceptInRail);

  // V2-C: AI-breakdown concepts join the same active-window pool doc
  // concepts use (SPEC: "anchored ones join the ticker windows like doc concepts").
  const allConcepts = useMemo(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );
  const active = useMemo(() => activeConcepts(allConcepts, currentTime), [allConcepts, currentTime]);
  const { visible, overflowCount } = muted ? { visible: [], overflowCount: 0 } : selectConceptChips(active, MAX_VISIBLE);

  const currentChips = useMemo<ChipDescriptor[]>(() => {
    const chips: ChipDescriptor[] = visible.map((entry) => ({
      id: entry.card.id,
      label: entry.card.title,
      title: entry.card.title,
      overflow: false,
    }));
    if (overflowCount > 0) chips.push({ id: "__overflow__", label: `+${overflowCount}`, overflow: true });
    return chips;
  }, [visible, overflowCount]);
  const currentKey = currentChips.map((c) => `${c.id}:${c.label}`).join("|");

  // See FADE_DURATION_MS above: track presence per chip id so a chip that
  // drops out of `currentChips` gets to play its exit fade instead of
  // vanishing on the next render. Seeded lazily from whatever's already
  // active on first mount (e.g. opening a project mid-segment) so the strip
  // doesn't flash empty for one render before the effect below catches up.
  const [entries, setEntries] = useState<Map<string, ChipPresenceEntry>>(
    () => new Map(currentChips.map((chip) => [chip.id, { chip, state: "open" as const }]))
  );
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setEntries((prev) => {
      let changed = false;
      const next = new Map(prev);
      const currentIds = new Set(currentChips.map((c) => c.id));

      for (const chip of currentChips) {
        const existing = next.get(chip.id);
        if (!existing || existing.state !== "open" || existing.chip.label !== chip.label) {
          next.set(chip.id, { chip, state: "open" });
          changed = true;
        }
        const timer = timersRef.current.get(chip.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(chip.id);
        }
      }

      for (const [id, entry] of prev) {
        if (currentIds.has(id)) continue;
        if (entry.state !== "closing") {
          next.set(id, { ...entry, state: "closing" });
          changed = true;
        }
        if (!timersRef.current.has(id)) {
          const timer = setTimeout(() => {
            timersRef.current.delete(id);
            setEntries((cur) => {
              if (!cur.has(id)) return cur;
              const copy = new Map(cur);
              copy.delete(id);
              return copy;
            });
          }, FADE_DURATION_MS);
          timersRef.current.set(id, timer);
        }
      }

      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentKey is the intentional dep (a stable digest of currentChips' ids+labels)
  }, [currentKey]);

  // Clear any pending fade-out timers on unmount (project switch etc.).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  if (entries.size === 0) return null;

  const openCard = (conceptId: string): void => {
    focusConceptInRail(conceptId);
    scrollToConceptsRail();
  };
  const openOverflow = (): void => {
    focusConceptInRail();
    scrollToConceptsRail();
  };

  return (
    <div className={styles.strip} role="group" aria-label="Active concepts">
      {Array.from(entries.values()).map(({ chip, state }) =>
        chip.overflow ? (
          <button
            key={chip.id}
            type="button"
            className={styles.overflowChip}
            data-state={state}
            onClick={openOverflow}
            aria-label={`${chip.label.replace("+", "")} more active concepts`}
          >
            {chip.label}
          </button>
        ) : (
          <button
            key={chip.id}
            type="button"
            className={styles.chip}
            data-state={state}
            onClick={() => openCard(chip.id)}
            title={chip.title}
          >
            {chip.label}
          </button>
        )
      )}
    </div>
  );
}
