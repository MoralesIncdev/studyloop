// F10 compile UI: the header "Compile" button plus its modal flow — V3-A A3
// adds a synthesis checkpoint FIRST ("In your own words…"), then the
// existing optional "caption these?" pass for uncaptioned shots (SPEC: "the
// compile step offers a 5-second caption these pass"), then the compile
// preview modal (rendered markdown + Copy/Reveal). Network calls (compile,
// reveal, the lessonSummary PATCH) live in the store per the codebase's
// convention; each step's open/close state and drafts are ephemeral UI state
// kept local here.
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { getUncaptionedBubbles } from "../lib/compileFlow";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import { MarkdownPreview } from "./MarkdownPreview";
import type { ContinuityCandidate } from "../lib/types";
import styles from "./CompileFlow.module.css";

/** V3-C C3: top-N continuity candidates shown in the post-compile "What's next" section. */
const WHATS_NEXT_COUNT = 3;

/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

export function CompileFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const controller = useStudyLoopStore((s) => s.controller);
  const patchBubble = useStudyLoopStore((s) => s.patchBubble);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);
  const compiling = useStudyLoopStore((s) => s.compiling);
  const compileResult = useStudyLoopStore((s) => s.compileResult);
  const runCompile = useStudyLoopStore((s) => s.runCompile);
  const clearCompileResult = useStudyLoopStore((s) => s.clearCompileResult);
  const revealExport = useStudyLoopStore((s) => s.revealExport);
  const pushToast = useStudyLoopStore((s) => s.pushToast);
  // V3-C C3 "Post-compile 'What's next'" (SPEC): same continuity candidates
  // the rail already loaded (see state/store.ts loadProjectSession) — no
  // second fetch, just the moment-of-peak-momentum surface for them.
  const continuityCandidates = useStudyLoopStore((s) => s.continuityCandidates);
  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const [openingWhatsNextId, setOpeningWhatsNextId] = useState<string | null>(null);

  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [synthesisText, setSynthesisText] = useState("");
  const [savingSynthesis, setSavingSynthesis] = useState(false);
  const synthesisTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [captionPassBubbles, setCaptionPassBubbles] = useState<string[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCaptions, setSavingCaptions] = useState(false);
  // V3-B review finding #4: which bubble ids failed to save on the most
  // recent attempt — non-empty means the modal must stay open with drafts
  // intact and these rows visibly marked, offering Retry, rather than
  // silently discarding them and proceeding to compile regardless.
  const [failedCaptionIds, setFailedCaptionIds] = useState<Set<string>>(new Set());

  // codex P0-3: buffer the last non-null value so each dialog can keep
  // rendering its content for the full ModalShell exit animation instead of
  // vanishing the instant the driving state is nulled.
  const [displayCaptionBubbles, setDisplayCaptionBubbles] = useState<string[] | null>(captionPassBubbles);
  useEffect(() => {
    if (captionPassBubbles) setDisplayCaptionBubbles(captionPassBubbles);
  }, [captionPassBubbles]);

  const [displayCompileResult, setDisplayCompileResult] = useState(compileResult);
  useEffect(() => {
    if (compileResult) setDisplayCompileResult(compileResult);
  }, [compileResult]);

  if (!currentProject) return null;

  // V3-A A3: the synthesis checkpoint is always the first step — Compile no
  // longer jumps straight to the caption pass / compile call.
  const handleCompileClick = (): void => {
    setSynthesisText(currentProject.lessonSummary ?? "");
    setSynthesisOpen(true);
  };

  const proceedAfterSynthesis = (): void => {
    const uncaptioned = getUncaptionedBubbles(bubbles);
    if (uncaptioned.length > 0) {
      setDrafts(Object.fromEntries(uncaptioned.map((b) => [b.id, ""])));
      setFailedCaptionIds(new Set());
      setCaptionPassBubbles(uncaptioned.map((b) => b.id));
      return;
    }
    void runCompile();
  };

  // Closing the synthesis step any way (Skip, X, Escape, backdrop click)
  // proceeds to the next step — "never blocks" (SPEC). "Save & continue"
  // only proceeds once the PATCH actually succeeds (see below). Either way,
  // `proceedAfterSynthesis` itself does NOT run here — it's wired as the
  // synthesis ModalShell's `onExited` (V3-A review finding #5), so the
  // caption/compile step never mounts until this dialog's own exit
  // animation has actually finished (no overlapping focus traps, and a
  // stray Escape hitting the still-closing dialog can't re-trigger it since
  // there's nothing left here for it to call).
  const handleSynthesisSaveAndContinue = async (): Promise<void> => {
    setSavingSynthesis(true);
    const saved = await patchCurrentProject({ lessonSummary: synthesisText.trim() });
    setSavingSynthesis(false);
    if (!saved) {
      // V3-A review finding #1 (CRITICAL): a failed PATCH must not discard
      // the learner's synthesis. patchCurrentProject already pushed an
      // error toast — keep the modal open with their text exactly as they
      // left it instead of proceeding to compile with a stale/missing
      // lessonSummary.
      return;
    }
    setSynthesisOpen(false);
  };

  const handleSynthesisSkip = (): void => {
    if (savingSynthesis) return;
    setSynthesisOpen(false);
  };

  // V3-B review finding #4: patchBubble now reports failure (boolean, like
  // patchCurrentProject) instead of always resolving — Promise.all no longer
  // silently swallows a failed save as if it had succeeded. Saves run
  // sequentially (not Promise.all) and each patchBubble call already does
  // its own PER-BUBBLE optimistic rollback on failure (never a whole-array
  // snapshot that could clobber a different bubble's concurrent success —
  // see state/store.ts). On any failure, the modal stays open: drafts are
  // untouched, failed rows are marked, and the primary button becomes
  // "Retry" — retrying only re-sends the rows that actually failed. Only an
  // explicit Skip (or a fully successful save) proceeds to compile.
  const handleCaptionSave = async (): Promise<void> => {
    setSavingCaptions(true);
    const retryOnly = failedCaptionIds.size > 0;
    const candidateIds = retryOnly ? [...failedCaptionIds] : Object.keys(drafts);
    const toSave = candidateIds
      .map((id): [string, string] => [id, drafts[id] ?? ""])
      .filter(([, text]) => text.trim().length > 0);
    const failed = new Set<string>();
    for (const [id, text] of toSave) {
      // eslint-disable-next-line no-await-in-loop -- intentionally sequential: a failure must never race a concurrent success into clobbering it (see patchBubble's own per-bubble-rollback fix)
      const ok = await patchBubble(id, { text: text.trim() });
      if (!ok) failed.add(id);
    }
    setSavingCaptions(false);
    setFailedCaptionIds(failed);
    if (failed.size > 0) return; // stay open — drafts intact, failed rows marked, Retry available
    // Every caption saved (or had nothing to save) — runCompile fires from
    // this dialog's onExited (below), once its exit animation has actually
    // finished, same overlap/duplicate-invocation guard as the synthesis step.
    setCaptionPassBubbles(null);
  };

  const handleCaptionSkip = (): void => {
    // Explicit Skip is the one allowed way to proceed to compile despite any
    // outstanding save failure (SPEC: "never proceed to compile on partial
    // failure without explicit user Skip").
    setFailedCaptionIds(new Set());
    setCaptionPassBubbles(null);
  };

  const handleCopy = async (): Promise<void> => {
    if (!compileResult) return;
    try {
      await navigator.clipboard.writeText(compileResult.markdown);
      pushToast("Copied markdown to clipboard", "success");
    } catch {
      pushToast("Could not copy to clipboard — your browser may be blocking clipboard access", "error");
    }
  };

  // V3-C C3: "click → create/open project" — same open flow ContinuityCard
  // (RightRail.tsx) uses, duplicated here rather than shared since the two
  // components have no other overlap and this keeps each self-contained.
  const handleOpenWhatsNext = async (candidate: ContinuityCandidate): Promise<void> => {
    setOpeningWhatsNextId(candidate.videoId);
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
      clearCompileResult();
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningWhatsNextId(null);
    }
  };

  const whatsNextCandidates = continuityCandidates.slice(0, WHATS_NEXT_COUNT);

  const captionRows = displayCaptionBubbles
    ? displayCaptionBubbles
        .map((id) => bubbles.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => b != null)
    : [];

  return (
    <>
      <button type="button" className={styles.compileButton} data-ripple onClick={handleCompileClick} disabled={compiling} aria-busy={compiling}>
        <Icon name="bookmark" size={16} />
        {compiling ? "Compiling…" : "Compile"}
      </button>

      <ModalShell
        open={synthesisOpen}
        onClose={handleSynthesisSkip}
        closeDisabled={savingSynthesis}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="In your own words"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
        initialFocusRef={synthesisTextareaRef}
        onExited={proceedAfterSynthesis}
      >
        <header className={styles.header}>
          <h2 className={styles.cardTitle}>In your own words</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleSynthesisSkip}
            aria-label="Skip and close"
            disabled={savingSynthesis}
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className={styles.cardSub}>
          What was this lesson about? Imagine explaining it to someone who hasn&rsquo;t watched.
        </p>
        <textarea
          ref={synthesisTextareaRef}
          className={styles.synthesisTextarea}
          value={synthesisText}
          onChange={(e) => setSynthesisText(e.target.value)}
          placeholder="This lesson was about…"
          rows={4}
          disabled={savingSynthesis}
        />
        <div className={styles.cardActions}>
          <button type="button" className={styles.secondaryButton} onClick={handleSynthesisSkip} disabled={savingSynthesis}>
            Skip for now
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleSynthesisSaveAndContinue()}
            disabled={savingSynthesis}
            aria-busy={savingSynthesis}
          >
            {savingSynthesis && <span className={styles.buttonSpinner} aria-hidden="true" />}
            {savingSynthesis ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={captionPassBubbles != null}
        onClose={handleCaptionSkip}
        closeDisabled={savingCaptions}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Caption these shots?"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
        onExited={() => void runCompile()}
      >
        <header className={styles.header}>
          <h2 className={styles.cardTitle}>Caption these before compiling?</h2>
          <button type="button" className={styles.closeButton} onClick={handleCaptionSkip} aria-label="Skip and close" disabled={savingCaptions}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className={styles.cardSub}>
          {failedCaptionIds.size > 0
            ? `${failedCaptionIds.size} caption${failedCaptionIds.size === 1 ? "" : "s"} failed to save — check the connection and retry, or skip.`
            : `${captionRows.length} screenshot${captionRows.length === 1 ? "" : "s"} ${captionRows.length === 1 ? "has" : "have"} no caption yet. Add a quick note or skip — compile works either way.`}
        </p>
        <ul className={styles.captionList}>
          {captionRows.map((b) => {
            const failed = failedCaptionIds.has(b.id);
            return (
            <li key={b.id} className={`${styles.captionRow} ${failed ? styles.captionRowFailed : ""}`}>
              <button
                type="button"
                className={styles.captionThumb}
                onClick={() => controller?.seek(Math.max(0, b.t - 5))}
                title={`Seek to ${formatTimestamp(b.t)}`}
              >
                {b.shot ? (
                  <img className={styles.captionThumbImg} src={api.shotUrl(currentProject.id, b.shot)} alt="" />
                ) : (
                  <span>—</span>
                )}
              </button>
              <div className={styles.captionField}>
                <span className={styles.captionTime}>
                  {formatTimestamp(b.t)}
                  {failed && (
                    <span className={styles.captionFailedTag} role="status">
                      Failed to save
                    </span>
                  )}
                </span>
                <input
                  type="text"
                  className={`${styles.captionInput} ${failed ? styles.captionInputFailed : ""}`}
                  placeholder="Add a caption…"
                  value={drafts[b.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                  aria-invalid={failed}
                />
              </div>
            </li>
            );
          })}
        </ul>
        <div className={styles.cardActions}>
          <button type="button" className={styles.secondaryButton} onClick={handleCaptionSkip} disabled={savingCaptions}>
            Skip
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void handleCaptionSave()} disabled={savingCaptions} aria-busy={savingCaptions}>
            {savingCaptions && <span className={styles.buttonSpinner} aria-hidden="true" />}
            {savingCaptions ? "Saving…" : failedCaptionIds.size > 0 ? "Retry" : "Save & compile"}
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={compileResult != null}
        onClose={clearCompileResult}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Compiled study document"
        overlayClassName={styles.overlay}
        cardClassName={styles.previewCard}
      >
        {displayCompileResult && (
          <>
            <div className={styles.previewHeader}>
              <h2 className={styles.cardTitle}>Compiled study document</h2>
              <button type="button" className={styles.closeButton} onClick={clearCompileResult} aria-label="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className={styles.previewPathRow}>
              <span className={styles.previewPath}>{displayCompileResult.path}</span>
              <button type="button" className={styles.copyIconButton} onClick={() => void handleCopy()} aria-label="Copy markdown" title="Copy markdown">
                <Icon name="copy" size={14} />
              </button>
            </div>
            <div className={styles.previewBody}>
              <MarkdownPreview
                markdown={displayCompileResult.markdown}
                projectId={currentProject.id}
                onSeek={(t) => controller?.seek(t)}
              />
            </div>
            {/* V3-C C3 "Post-compile 'What's next'" (SPEC): "top-3 continuity
                candidates (same endpoint) with reason chips; click →
                create/open project" — the moment of peak momentum right
                after finishing the lesson. Hidden entirely when there's
                nothing to suggest (matches every other rail section's
                "hide, don't show dead space" convention). */}
            {whatsNextCandidates.length > 0 && (
              <div className={styles.whatsNext}>
                <h3 className={styles.whatsNextTitle}>What&rsquo;s next</h3>
                <ul className={styles.whatsNextList}>
                  {whatsNextCandidates.map((candidate) => (
                    <li key={`${candidate.kind}-${candidate.videoId}`}>
                      <button
                        type="button"
                        className={styles.whatsNextItem}
                        onClick={() => void handleOpenWhatsNext(candidate)}
                        disabled={openingWhatsNextId === candidate.videoId}
                      >
                        <span className={styles.whatsNextThumb}>
                          {candidate.thumbnailUrl ? (
                            <img src={candidate.thumbnailUrl} alt="" className={styles.whatsNextThumbImg} loading="lazy" />
                          ) : (
                            <Icon name="play" size={16} />
                          )}
                        </span>
                        <span className={styles.whatsNextBody}>
                          <span className={styles.whatsNextItemTitle}>{candidate.title}</span>
                          <span className={styles.whatsNextAuthor}>{candidate.author}</span>
                          {candidate.reasons.length > 0 && (
                            <span className={styles.whatsNextReasons}>
                              {candidate.reasons.slice(0, 2).map((reason, i) => (
                                <span key={i} className={styles.whatsNextReasonChip}>
                                  {reason}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.cardActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void revealExport(displayCompileResult.path)}>
                Reveal in Finder
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void handleCopy()}>
                Copy markdown
              </button>
              <button type="button" className={styles.primaryButton} onClick={clearCompileResult}>
                Done
              </button>
            </div>
          </>
        )}
      </ModalShell>
    </>
  );
}
