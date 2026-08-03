// Phase 6 "Slide-text channel, smallest slice (PDF)"
// (design/EXECUTION-PLAN-post-review-v1.md): the project-settings-surface
// affordance for attaching/removing a PDF slide deck — lives right next to
// DomainRow (project domain/novice-mode toggle) below the channel row,
// rather than the console stage, matching where every other "settings, not
// stage" per-project control already lives. No stale-analysis banner exists
// anywhere in the web app yet (PATCH /api/projects/:id/terms's own
// analysisMarkedStale only ever surfaces as a toast — see
// state/store.ts's correctTranscriptTerm) — this renders the "smallest
// honest slice" the phase spec calls out instead: a quiet inline note.
import { useRef } from "react";
import { useStudyLoopStore } from "../state/store";
import styles from "./SlidesRow.module.css";

export function SlidesRow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const slidesMeta = useStudyLoopStore((s) => s.slidesMeta);
  const slidesLoading = useStudyLoopStore((s) => s.slidesLoading);
  const uploadSlides = useStudyLoopStore((s) => s.uploadSlides);
  const deleteSlides = useStudyLoopStore((s) => s.deleteSlides);
  const staleReason = useStudyLoopStore((s) => s.analysis?.staleReason);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!currentProject) return null;

  return (
    <div className={styles.row}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className={styles.hiddenInput}
        aria-label="Attach slides (PDF)"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so choosing the exact same filename again still fires onChange.
          e.target.value = "";
          if (file) void uploadSlides(file);
        }}
      />
      {slidesMeta ? (
        <>
          <span className={styles.chip} title={`${slidesMeta.filename} — ${slidesMeta.pageCount} pages`}>
            📄 {slidesMeta.filename} · {slidesMeta.pageCount} {slidesMeta.pageCount === 1 ? "page" : "pages"}
          </span>
          <button
            type="button"
            className={styles.removeBtn}
            disabled={slidesLoading}
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm(`Remove "${slidesMeta.filename}"?`)) return;
              void deleteSlides();
            }}
          >
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          className={styles.attachBtn}
          disabled={slidesLoading}
          onClick={() => fileInputRef.current?.click()}
          title="Extract each page's text and fold it into the analysis prompt as supplementary context"
        >
          {slidesLoading ? "Attaching…" : "Attach slides (PDF)"}
        </button>
      )}
      {staleReason === "slides-changed" && (
        <span className={styles.staleNote}>analysis predates slide attach — re-analyze</span>
      )}
    </div>
  );
}
