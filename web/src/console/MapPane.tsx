// Console slice D item 5 (mock's #p-map, index.html lines 464-489): the
// constellation map — a small SVG graph of THIS video's concepts (same doc +
// AI merge the seek bar's ticks use), laid out deterministically by
// lib/constellation.ts (golden-angle scatter; no physics dependency). Jade
// fill = attested (same attestations lookup as the ticks), an amber pulsing
// ring marks the concept holding the playhead, edges connect temporally
// adjacent concepts. Clicking a node seeks to its anchor.
import { useMemo, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { analysisConceptToConceptCard, unitIdForConceptCard } from "../lib/analysisFormat";
import { activeConceptAt } from "../lib/activeConcept";
import { layoutConstellation, constellationEdges, type ConstellationInput } from "../lib/constellation";
import type { ConceptCard } from "../lib/types";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./MapPane.module.css";

/** viewBox the normalized [0,1] layout scales into (mock's own 210x200). */
const VIEW_W = 210;
const VIEW_H = 200;
const LABEL_CHARS = 16;

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

function shortLabel(title: string): string {
  return title.length > LABEL_CHARS ? `${title.slice(0, LABEL_CHARS).trimEnd()}…` : title;
}

export function MapPane({ frameRef }: Props): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const editing = useStudyLoopStore((s) => s.consoleEditMode);

  const tickerConcepts = useMemo<ConceptCard[]>(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );

  // Chronological order — the layout is index-seeded, so a stable order is
  // what keeps nodes from reshuffling across renders (lib/constellation.ts).
  const items = useMemo<ConstellationInput[]>(
    () =>
      tickerConcepts
        .flatMap((c) => {
          const t = c.anchors.find((a) => a.t != null)?.t;
          if (t == null) return [];
          return [
            {
              id: c.id,
              title: c.title,
              t,
              attested: attestations[unitIdForConceptCard(c.id)]?.status === "attested",
            },
          ];
        })
        .sort((a, b) => a.t - b.t),
    [tickerConcepts, attestations]
  );

  const activeId = useMemo(() => activeConceptAt(tickerConcepts, currentTime)?.card.id ?? null, [tickerConcepts, currentTime]);
  const nodes = useMemo(() => layoutConstellation(items, activeId), [items, activeId]);
  const edges = useMemo(() => constellationEdges(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const hidden = items.length === 0;
  if (hidden && !editing) return null;

  return (
    <Pane
      paneId="p-map"
      dataPane="map"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.72, fy: 0.12 }}
      width={250}
      defaultMode="bare"
      chipStatus="attested"
      label="Knowledge map"
    >
      {hidden ? (
        <p className={paneStyles.ghostText}>A map of this video&rsquo;s concepts appears once they exist.</p>
      ) : (
        <svg className={styles.svg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {edges.map((edge) => {
            const a = nodeById.get(edge.a);
            const b = nodeById.get(edge.b);
            if (!a || !b) return null;
            return (
              <line
                key={`${edge.a}|${edge.b}`}
                className={styles.edge}
                x1={a.x * VIEW_W}
                y1={a.y * VIEW_H}
                x2={b.x * VIEW_W}
                y2={b.y * VIEW_H}
              />
            );
          })}
          {nodes.map((node) => (
            <g key={node.id}>
              <circle
                className={`${styles.node} ${node.attested ? styles.attested : ""} ${node.isNow ? styles.now : ""}`}
                cx={node.x * VIEW_W}
                cy={node.y * VIEW_H}
                r={node.isNow ? 7.5 : 5.5}
                onClick={() => useStudyLoopStore.getState().controller?.seek(node.t)}
              >
                <title>{`${node.title} — click to seek`}</title>
              </circle>
              <text
                className={`${styles.label} ${node.isNow ? styles.hot : ""}`}
                x={node.x * VIEW_W}
                y={node.y * VIEW_H + (node.isNow ? 18 : 16)}
                textAnchor="middle"
              >
                {shortLabel(node.title)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </Pane>
  );
}
