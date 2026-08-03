// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// transcript-less local-video projects get a "Transcribe" affordance here,
// right next to SlidesRow/DomainRow (the project-settings surface, not the
// console stage — same reasoning as SlidesRow's own placement) — shows
// queued/running (with elapsed)/failed (with message)/done states, matching
// the store's TranscribeStatus 1:1 (server/src/lib/asrJobs.ts's
// AsrJobStatusView).
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import styles from "./TranscribeRow.module.css";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function TranscribeRow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const transcribable = useStudyLoopStore((s) => s.transcribable);
  const transcribeStatus = useStudyLoopStore((s) => s.transcribeStatus);
  const startTranscribe = useStudyLoopStore((s) => s.startTranscribe);
  const cancelTranscribeJob = useStudyLoopStore((s) => s.cancelTranscribeJob);

  // The store only refreshes transcribeStatus once per poll tick (every
  // 2s — see state/store.ts's TRANSCRIBE_POLL_INTERVAL_MS); this forces a
  // re-render every second in between so a running job's elapsed time
  // (computed live from `startedAt`, below) doesn't visibly stall.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (transcribeStatus.state !== "running") return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [transcribeStatus.state]);

  // ASR needs an actual local media file (see routes/transcribe.ts's
  // "not_local" guard) — a youtube-source project can end up `transcribable`
  // too (nothing in the chain matched it either), but there's nothing this
  // button could ever do for one.
  if (!currentProject || currentProject.source.type !== "local") return null;
  if (!transcribable && transcribeStatus.state === "idle") return null;

  if (transcribeStatus.state === "queued") {
    return (
      <div className={styles.row}>
        <span className={styles.chip}>Transcription queued…</span>
        <button type="button" className={styles.cancelBtn} onClick={() => void cancelTranscribeJob()}>
          Cancel
        </button>
      </div>
    );
  }

  if (transcribeStatus.state === "running") {
    const elapsedMs = transcribeStatus.startedAt
      ? Date.now() - new Date(transcribeStatus.startedAt).getTime()
      : (transcribeStatus.elapsedMs ?? 0);
    return (
      <div className={styles.row}>
        <span className={styles.chip}>Transcribing… {formatElapsed(elapsedMs)}</span>
        <button type="button" className={styles.cancelBtn} onClick={() => void cancelTranscribeJob()}>
          Cancel
        </button>
      </div>
    );
  }

  if (transcribeStatus.state === "failed") {
    return (
      <div className={styles.row}>
        <span className={styles.errorChip} title={transcribeStatus.message}>
          Transcription failed{transcribeStatus.message ? `: ${transcribeStatus.message}` : ""}
        </span>
        <button type="button" className={styles.attachBtn} onClick={() => void startTranscribe()}>
          Retry
        </button>
      </div>
    );
  }

  if (transcribeStatus.state === "done") {
    // Transcript already loaded via the chain by the time this shows —
    // a quiet confirmation chip, same register as SlidesRow's "attached" chip.
    return (
      <div className={styles.row}>
        <span className={styles.chip}>Transcribed</span>
      </div>
    );
  }

  // idle + transcribable: nothing has ever run for this project yet.
  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.attachBtn}
        onClick={() => void startTranscribe()}
        title="Transcribe this video locally via your configured ASR adapter (Settings → Transcription)"
      >
        Transcribe
      </button>
    </div>
  );
}
