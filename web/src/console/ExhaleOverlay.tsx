// Console slice 9 "end-of-video exhale" (design/mockups/video-console/
// BUILD-BRIEF.md, v6 mock #exhale): when the playhead reaches the end, the
// console exhales — the session ledger (real counts, never scores) and the
// concept-continuity thread rise over the dimmed frame. Discovery becomes the
// closing scene instead of a rail you scroll to. Deliberately the opposite of
// the autoplay-countdown pattern (SURVEY trap list): nothing advances on its
// own, and the only self-acting control is "Back to the video". Re-arms when
// the playhead leaves the tail, so replaying the ending exhales again.
import { useEffect, useMemo, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import type { ContinuityCandidate } from "../lib/types";
import styles from "./ExhaleOverlay.module.css";

/** "The end" = within this many seconds of the duration. */
const END_WINDOW_S = 1.5;
/** Leaving the tail past this re-arms the overlay for the next arrival. */
const REARM_WINDOW_S = 5;
const MAX_THREAD = 3;

export function ExhaleOverlay(): JSX.Element | null {
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const candidates = useStudyLoopStore((s) => s.continuityCandidates);
  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const controller = useStudyLoopStore((s) => s.controller);

  const [dismissed, setDismissed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const atEnd = duration > 0 && currentTime >= duration - END_WINDOW_S;
  const inTail = duration > 0 && currentTime >= duration - REARM_WINDOW_S;
  useEffect(() => {
    if (!inTail) setDismissed(false);
  }, [inTail]);

  const attestedCount = useMemo(
    () => Object.values(attestations).filter((a) => a.status === "attested").length,
    [attestations]
  );
  // Phase 3 "Restated vs claimed counts": mirrors server/src/lib/attestation.ts's
  // restatedCount (attested AND non-empty userTake) — computed client-side
  // the same way attestedCount already is, since attestations are served as
  // the raw map rather than pre-aggregated counts.
  const restatedCount = useMemo(
    () => Object.values(attestations).filter((a) => a.status === "attested" && Boolean(a.userTake?.trim())).length,
    [attestations]
  );
  const claimedCount = attestedCount - restatedCount;
  const unitCount = analysis?.units?.length ?? 0;
  const thread = useMemo(() => candidates.slice(0, MAX_THREAD), [candidates]);

  if (!atEnd || dismissed) return null;

  const handleOpen = async (candidate: ContinuityCandidate): Promise<void> => {
    setOpeningId(candidate.videoId);
    try {
      const project =
        candidate.kind === "youtube"
          ? await openOrCreateYoutubeProject(candidate.videoId)
          : await openOrCreateLocalProject({
              videoPath: candidate.videoPath ?? candidate.videoId,
              title: candidate.title,
              transcriptPath: candidate.transcriptPath,
              durationSeconds: candidate.durationSeconds,
            });
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningId(null);
    }
  };

  const handleBack = (): void => {
    setDismissed(true);
    controller?.seek(Math.max(0, duration - 10));
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <span className={styles.kicker}>Session complete</span>
        <h2 className={styles.headline}>The video ends; the knowledge stays.</h2>
        <p className={styles.sum}>
          {unitCount > 0
            ? `${attestedCount} of ${unitCount} concepts attested${
                claimedCount > 0 ? ` (${restatedCount} restated · ${claimedCount} claimed)` : ""
              } · `
            : ""}
          {bubbles.length} {bubbles.length === 1 ? "note" : "notes"} pinned.
        </p>
        {thread.length > 0 && (
          <>
            <span className={styles.threadKicker}>Where this thread goes</span>
            {thread.map((c) => (
              <div key={c.videoId} className={styles.threadRow}>
                <div className={styles.threadText}>
                  <span className={styles.threadTitle}>{c.title}</span>
                  {c.reasons[0] && <span className={styles.threadWhy}>{c.reasons[0]}</span>}
                </div>
                <button
                  type="button"
                  className={styles.threadOpen}
                  disabled={openingId !== null}
                  onClick={() => void handleOpen(c)}
                >
                  {openingId === c.videoId ? "Opening…" : "Open"}
                </button>
              </div>
            ))}
          </>
        )}
        <button type="button" className={styles.back} onClick={handleBack}>
          Back to the video
        </button>
      </div>
    </div>
  );
}
