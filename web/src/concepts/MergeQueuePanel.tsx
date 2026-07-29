// V3-D D3 "Concept merge queue" (SPEC): "panel shows side-by-side
// label+summary with Merge / Keep separate buttons." Opened from the
// Concepts rail header badge (see RightRail.tsx) — mergeCandidates/
// mergeQueueOpen/resolveMergeCandidateAction all live in state/store.ts so
// the badge count and this panel share one source of truth without a
// second fetch.
import { useEffect } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import styles from "./MergeQueuePanel.module.css";

/** Matches --duration-modal (280ms) — mirrors NotationModal's own exit-duration convention. */
const EXIT_DURATION_MS = 280;

export function MergeQueuePanel(): JSX.Element {
  const open = useStudyLoopStore((s) => s.mergeQueueOpen);
  const setOpen = useStudyLoopStore((s) => s.setMergeQueueOpen);
  const candidates = useStudyLoopStore((s) => s.mergeCandidates);
  const resolveMergeCandidateAction = useStudyLoopStore((s) => s.resolveMergeCandidateAction);

  // Refresh the moment the panel opens — the badge's count could be a few
  // minutes stale (loaded once app-wide on mount) by the time the learner
  // actually clicks it.
  const loadMergeCandidates = useStudyLoopStore((s) => s.loadMergeCandidates);
  useEffect(() => {
    if (open) void loadMergeCandidates();
  }, [open, loadMergeCandidates]);

  const close = (): void => setOpen(false);

  return (
    <ModalShell
      open={open}
      onClose={close}
      exitDurationMs={EXIT_DURATION_MS}
      ariaLabel="Review concept merges"
      overlayClassName={styles.overlay}
      cardClassName={styles.card}
    >
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Review merges</h2>
          <span className={styles.subtitle}>Concepts that look like the same idea across your projects.</span>
        </div>
        <button type="button" className={styles.closeButton} onClick={close} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className={styles.content}>
        {candidates.length === 0 && <p className={styles.empty}>No merges to review right now.</p>}
        {candidates.map((candidate) => (
          <div key={candidate.id} className={styles.candidate}>
            <div className={styles.candidateMeta}>
              <span>{candidate.domain}</span>
              <span className={styles.similarityChip}>{Math.round(candidate.similarity * 100)}% match</span>
            </div>
            <div className={styles.sides}>
              <div className={styles.side}>
                <span className={styles.sideProject}>{candidate.left.projectTitle}</span>
                <span className={styles.sideLabel}>{candidate.left.label}</span>
                <span className={styles.sideSummary}>{candidate.left.summary}</span>
              </div>
              <div className={styles.divider} aria-hidden="true">
                <Icon name="arrowForward" size={16} />
              </div>
              <div className={styles.side}>
                <span className={styles.sideProject}>{candidate.right.projectTitle}</span>
                <span className={styles.sideLabel}>{candidate.right.label}</span>
                <span className={styles.sideSummary}>{candidate.right.summary}</span>
              </div>
            </div>
            <div className={styles.candidateActions}>
              <button
                type="button"
                className={styles.keepSeparateButton}
                onClick={() => void resolveMergeCandidateAction(candidate.id, "ignore")}
              >
                Keep separate
              </button>
              <button
                type="button"
                className={styles.mergeButton}
                onClick={() => void resolveMergeCandidateAction(candidate.id, "merge")}
              >
                Merge
              </button>
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
