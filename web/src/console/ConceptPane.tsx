// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the "active
// concept" pane — the v6 mock's #p-concept over the real <video>. Bare text
// (title + body snippet) floats over the footage; the shared Pane shell owns
// drag/persist/chrome/park-flight. Console slice D: parking round-trips
// through store.parkedPanes — the pane's seek-bar tick pulses `.waiting`
// (PlayerChrome) and clicking it (store.undockPane) re-materializes the pane
// here. The Kinovea opacity envelope (mock lines 1116-1140, lib/envelope.ts)
// drives BOTH visibility and opacity: the pane fades in over the 15s before
// its concept's anchor, holds across the derived span (lib/conceptLoop.ts —
// anchors are points, so the span end is the same one tick-scoping uses),
// decays over the 75s tail, and auto-parks to its tick if it fully decays
// without the user ever hovering it.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { analysisConceptToConceptCard, unitIdForConceptCard } from "../lib/analysisFormat";
import { conceptLoopSpan } from "../lib/conceptLoop";
import { envelopeOpacity, ENVELOPE_PARK_THRESHOLD } from "../lib/envelope";
import { formatTimestamp } from "../lib/time";
import type { ConceptCard, UnitType } from "../lib/types";
import { Pane, type ChipStatus } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./ConceptPane.module.css";

const BODY_PREVIEW_CHARS = 140;
/** Mock's undock/arrival materialize duration (index.html lines 1106-1107). */
const ARRIVING_MS = 1200;

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  CLAIM: "Claim",
  MECHANISM: "Mechanism",
  PROCEDURE: "Procedure",
  EXAMPLE: "Example",
  BOUNDARY: "Boundary",
  CLUSTER: "Cluster",
};

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

interface ActiveConcept {
  card: ConceptCard;
  t: number;
  span: { start: number; end: number };
  /** Envelope value at currentTime — the pane's opacity (and visibility gate). */
  v: number;
}

function bodyPreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_CHARS) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_CHARS).trimEnd()}…`;
}

export function ConceptPane({ frameRef }: Props): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const parked = useStudyLoopStore((s) => s.parkedPanes["p-concept"] ?? null);
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const [arriving, setArriving] = useState(false);
  // Envelope engagement (mock's proposalEngaged, line 1069): once hovered,
  // the pane is the user's — no fade-out, no auto-park. Resets when the
  // active concept changes (a new occurrence earns its own envelope).
  const [engagedKey, setEngagedKey] = useState<string | null>(null);
  const wasParkedRef = useRef(false);

  const tickerConcepts = useMemo<ConceptCard[]>(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );
  const allTickTimes = useMemo(
    () => tickerConcepts.flatMap((c) => c.anchors.map((a) => a.t).filter((t): t is number => t != null)),
    [tickerConcepts]
  );

  // The concept whose envelope is strongest right now (max opacity wins, so a
  // decaying span hands off smoothly to the next concept's fade-in).
  const active = useMemo<ActiveConcept | null>(() => {
    let best: ActiveConcept | null = null;
    for (const card of tickerConcepts) {
      for (const anchor of card.anchors) {
        if (anchor.t == null) continue;
        const span = conceptLoopSpan(anchor.t, allTickTimes, duration);
        const v = envelopeOpacity(currentTime, anchor.t, span.end);
        if (v <= 0) continue;
        if (!best || v > best.v || (v === best.v && anchor.t > best.t)) best = { card, t: anchor.t, span, v };
      }
    }
    return best;
  }, [tickerConcepts, allTickTimes, currentTime, duration]);

  const activeKey = active ? `${active.card.id}@${active.t}` : null;
  const engaged = activeKey != null && engagedKey === activeKey;

  // Undock detection: parked → un-parked re-materializes the pane (mock's
  // undockPane, lines 1102-1110) and counts as engagement (the user just
  // explicitly asked for it back).
  useEffect(() => {
    if (wasParkedRef.current && !parked) {
      wasParkedRef.current = false;
      setEngagedKey(activeKey);
      setArriving(true);
      const timer = setTimeout(() => setArriving(false), ARRIVING_MS);
      return () => clearTimeout(timer);
    }
    wasParkedRef.current = Boolean(parked);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parked]);

  const hidden = !active || Boolean(parked);
  const envelopeOn = !hidden && !editing && !arriving && !engaged;
  const opacity = envelopeOn && active ? Math.max(ENVELOPE_PARK_THRESHOLD, active.v) : undefined;

  // Auto-park on full decay without engagement (mock's tickEnvelope, line 1139)
  // — straight to the waiting state; the flight animation is skipped because
  // the pane is already at ≤5% opacity (nothing visible left to fly).
  useEffect(() => {
    if (!envelopeOn || !active) return;
    if (active.v <= ENVELOPE_PARK_THRESHOLD) {
      useStudyLoopStore.getState().parkPane("p-concept", active.card.id, active.t);
    }
  }, [envelopeOn, active]);

  if (hidden && !editing) return null;

  const unit = active ? analysis?.units?.find((u) => u.id === unitIdForConceptCard(active.card.id)) : undefined;
  const status = unit ? attestations[unit.id]?.status : undefined;
  const chipStatus: ChipStatus = status === "attested" ? "attested" : unit ? "proposed" : "quiet";
  const label = active
    ? unit
      ? `${UNIT_TYPE_LABEL[unit.type]} · ${formatTimestamp(active.t)}–${formatTimestamp(active.span.end)}`
      : `Concept · ${formatTimestamp(active.t)}`
    : "Concept";

  return (
    <Pane
      paneId="p-concept"
      dataPane="concept"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.36, fy: 0.12 }}
      defaultMode="bare"
      label={label}
      chipStatus={chipStatus}
      parkAnchor={active ? { conceptId: active.card.id, t: active.t } : null}
      opacity={opacity}
      arriving={arriving}
      onEngaged={() => setEngagedKey(activeKey)}
    >
      {hidden || !active ? (
        <p className={paneStyles.ghostText}>Appears while a concept is being taught.</p>
      ) : unit && unit.type === "CLUSTER" && unit.members && unit.members.length > 0 ? (
        // Phase 4 "Cluster unit type": the pane's bare-text look, but a
        // member per line instead of one body preview — the parent concept
        // is attested once (same chip/status above), and each member fans
        // out to its own review card later (review.ts's deriveLiveCards).
        <>
          <div className={styles.title}>{active.card.title}</div>
          <ul className={styles.memberList}>
            {unit.members.map((m, i) => (
              <li key={i} className={`${styles.memberItem} ${styles.ai}`}>
                {m.label}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className={styles.title}>{active.card.title}</div>
          <p className={`${styles.body} ${styles.ai}`}>{bodyPreview(active.card.body)}</p>
        </>
      )}
    </Pane>
  );
}
