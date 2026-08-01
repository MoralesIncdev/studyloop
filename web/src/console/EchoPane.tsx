// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the echo
// pane — the v6 mock's #p-echo over the real <video>, powered by cross-video
// identity that already exists: V3-D D3's concept registry. When the playhead
// is inside a unit that also spans other projects (store.mergedConcepts, the
// same data behind the "also in ⟨project⟩" chip), a whisper floats over the
// footage with a jump to where you met it before. Park hides it for this
// unit occurrence only.
import { useMemo, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeUnitAt } from "../lib/activeUnit";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./EchoPane.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function EchoPane({ frameRef }: Props): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const mergedConcepts = useStudyLoopStore((s) => s.mergedConcepts);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const queuePendingSeek = useStudyLoopStore((s) => s.queuePendingSeek);
  const [parkedKey, setParkedKey] = useState<string | null>(null);

  const active = useMemo(() => {
    const hit = activeUnitAt(analysis?.units ?? [], currentTime);
    if (!hit) return null;
    const elsewhere = mergedConcepts[hit.unit.id];
    if (!elsewhere || elsewhere.length === 0) return null;
    return { key: `${hit.unit.id}@${hit.t}`, t: hit.t, label: hit.unit.label, elsewhere };
  }, [analysis, currentTime, mergedConcepts]);

  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const hidden = !active || parkedKey === active.key;
  if (hidden && !editing) return null;

  return (
    <Pane
      paneId="p-echo"
      dataPane="echo"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.04, fy: 0.36 }}
      width={300}
      defaultMode="bare"
      chipStatus="attested"
      label={active ? <>ECHO &middot; {formatTimestamp(active.t)}</> : "ECHO"}
      tools={
        !hidden && active ? (
          <button
            type="button"
            className={paneStyles.tool}
            title="Park this echo"
            aria-label="Park echo pane"
            onClick={() => setParkedKey(active.key)}
          >
            <Icon name="close" size={11} />
          </button>
        ) : undefined
      }
    >
      {hidden || !active ? (
        <p className={paneStyles.ghostText}>Appears when a concept here also lives in another video.</p>
      ) : (
        <>
          <p className={styles.body}>
            You&rsquo;ve met this before — <b>{active.label}</b> also lives in{" "}
            <b>{active.elsewhere[0].projectTitle}</b>
            {active.elsewhere.length > 1 ? ` (+${active.elsewhere.length - 1} more)` : ""}.
          </p>
          {/* Console slice D item 7: when the registry carries the other
              project's anchor time, the jump lands on that exact moment — the
              seek is staged (queuePendingSeek) because the router only carries
              a projectId; the destination StudyView consumes it and skips its
              resume prompt. Without a time it degrades to plain navigation. */}
          <button
            type="button"
            className={styles.jump}
            onClick={() => {
              const ref = active.elsewhere[0];
              if (ref.t != null) queuePendingSeek(ref.t);
              navigate({ view: "study", projectId: ref.projectId });
            }}
          >
            {active.elsewhere[0].t != null ? `▸ open it there · ${formatTimestamp(active.elsewhere[0].t)}` : "Open it there"}
          </button>
        </>
      )}
    </Pane>
  );
}
