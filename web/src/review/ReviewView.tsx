// F11 "Review Mode" (SPEC): #/review — a centered single-card flow that
// resurfaces bubbles-with-text and analysis pearls across every project.
// Scheduling is entirely server-side and hidden (SPEC: "SRS mechanics must
// be HIDDEN") — this view only ever sees `due` cards + summary counts, never
// interval/lapses/reps. The session queue itself (ordering, "Again"
// re-queuing) is client-owned local state (see state/store.ts
// ReviewSessionState) built once from the initial GET /api/review/queue.
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import { lapseTier } from "../lib/lapseTier";
import { ReviewClipPlayer } from "./ReviewClipPlayer";
import type { ReviewCard } from "../lib/types";
import styles from "./ReviewView.module.css";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * V3-B B4 "Lapse-to-context pipeline": escalates by how many times THIS card
 * has been graded "Again" so far this session (state/store.ts
 * ReviewSessionState.againCounts, via lib/lapseTier.ts) — applies uniformly
 * across every card kind (bubble/pearl/unit all carry sourceType/sourcePath/
 * sourceVideoId/t), not just bubbles. ×2: an inline auto-playing clip
 * (local) or a lighter "at mm:ss" link (YouTube) replaces the old
 * click-to-play button. ×3: a single "Open in player" action for either
 * source type — seeds lastPosition, navigates, and (by unmounting this view)
 * pauses the queue.
 */
function LapseMediaAction({ card }: { card: ReviewCard }): JSX.Element | null {
  const openReviewCardInStudy = useStudyLoopStore((s) => s.openReviewCardInStudy);
  const againCount = useStudyLoopStore((s) => s.reviewSession?.againCounts[card.id] ?? 0);
  const [clipOpen, setClipOpen] = useState(false);
  const tier = lapseTier(againCount);

  if (tier === "none" && card.kind !== "bubble") return null; // pearl/unit cards with no lapse escalation yet have no default media action
  if (tier === "none" && card.kind === "bubble" && card.sourceType === "local" && card.sourcePath) {
    if (clipOpen) return <ReviewClipPlayer src={api.videoStreamUrl(card.sourcePath)} t={card.t} />;
    return (
      <button type="button" className={styles.mediaActionButton} onClick={() => setClipOpen(true)}>
        <Icon name="play" size={16} />
        Play 10s clip
      </button>
    );
  }
  if (tier === "none" && card.kind === "bubble" && card.sourceType === "youtube") {
    return (
      <button type="button" className={styles.mediaActionButton} onClick={() => void openReviewCardInStudy(card)}>
        <Icon name="arrowForward" size={16} />
        Open at timestamp
      </button>
    );
  }

  if (tier === "player") {
    return (
      <button type="button" className={styles.mediaActionButton} onClick={() => void openReviewCardInStudy(card)}>
        <Icon name="arrowForward" size={16} />
        Open in player
      </button>
    );
  }

  // tier === "clip" — ReviewClipPlayer already auto-plays the instant it
  // mounts (see its own loadedmetadata handler); rendering it directly here
  // (rather than behind the "Play 10s clip" button) is what makes it
  // "auto-playing" per SPEC, with no extra prop needed.
  if (card.sourceType === "local" && card.sourcePath) {
    return <ReviewClipPlayer src={api.videoStreamUrl(card.sourcePath)} t={card.t} />;
  }
  if (card.sourceType === "youtube") {
    return (
      <button type="button" className={styles.mediaActionButton} onClick={() => void openReviewCardInStudy(card)}>
        <Icon name="arrowForward" size={16} />
        At {formatTimestamp(card.t)}
      </button>
    );
  }
  return null;
}

function CardFront({ card }: { card: ReviewCard }): JSX.Element {
  if (card.kind === "unit") {
    return (
      <>
        <p className={styles.pearlLabel}>{card.label}</p>
        <p className={styles.prompt}>In your own words — what&rsquo;s the key idea here?</p>
      </>
    );
  }
  if (card.kind === "pearl") {
    return (
      <>
        <p className={styles.pearlLabel}>{card.transformed?.front ?? card.label}</p>
        <p className={styles.projectTitle}>{card.projectTitle}</p>
      </>
    );
  }
  return (
    <>
      <div className={styles.media}>
        {card.shot ? (
          <img className={styles.shotImage} src={api.shotUrl(card.projectId, card.shot)} alt="" />
        ) : (
          <>
            <span className={styles.timestampChip}>{formatTimestamp(card.t)}</span>
            <p className={styles.projectTitle}>{card.projectTitle}</p>
          </>
        )}
      </div>
      <p className={styles.prompt}>{card.transformed?.front ?? "What was your note here?"}</p>
    </>
  );
}

function CardBack({ card }: { card: ReviewCard }): JSX.Element {
  if (card.kind === "unit") {
    return (
      <>
        <p className={styles.backText}>{card.summary}</p>
        {card.userTake && <p className={styles.whyText}>Your take: {card.userTake}</p>}
        <LapseMediaAction card={card} />
      </>
    );
  }
  const backText = card.kind === "bubble" ? (card.transformed?.back ?? card.text) : (card.transformed?.back ?? card.insight);
  return (
    <>
      <p className={styles.backText}>{backText}</p>
      {card.transformed?.why && <p className={styles.whyText}>{card.transformed.why}</p>}
      <LapseMediaAction card={card} />
    </>
  );
}

function StreakLine(): JSX.Element | null {
  const streak = useStudyLoopStore((s) => s.reviewStreak);
  if (!streak || streak.count <= 0) return null;
  return (
    <p className={styles.streakLine}>
      {streak.count} day{streak.count === 1 ? "" : "s"} in a row
    </p>
  );
}

function CaughtUpState({ heading, body }: { heading: string; body: string }): JSX.Element {
  const navigate = useStudyLoopStore((s) => s.navigate);
  return (
    <div className={styles.stateCard}>
      <span className={styles.stateIcon} aria-hidden="true">
        <Icon name="check" size={32} />
      </span>
      <h2>{heading}</h2>
      <p>{body}</p>
      <StreakLine />
      <button type="button" className={styles.primaryButton} onClick={() => navigate({ view: "library" })}>
        Back to StudyLoop
      </button>
    </div>
  );
}

export function ReviewView(): JSX.Element {
  const session = useStudyLoopStore((s) => s.reviewSession);
  const sessionLoading = useStudyLoopStore((s) => s.reviewSessionLoading);
  const grading = useStudyLoopStore((s) => s.reviewGrading);
  const reviewCounts = useStudyLoopStore((s) => s.reviewCounts);
  const masteryCount = useStudyLoopStore((s) => s.masteryCount);
  const startReviewSession = useStudyLoopStore((s) => s.startReviewSession);
  const revealCurrentReviewCard = useStudyLoopStore((s) => s.revealCurrentReviewCard);
  const gradeCurrentReviewCard = useStudyLoopStore((s) => s.gradeCurrentReviewCard);
  const exitReviewSession = useStudyLoopStore((s) => s.exitReviewSession);
  const navigate = useStudyLoopStore((s) => s.navigate);

  useEffect(() => {
    void startReviewSession();
    return () => exitReviewSession();
    // Runs once per mount, like StudyView's session-loading effect — the
    // store actions themselves are stable references from getState().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = session?.cards[0] ?? null;
  const revealed = session?.revealed ?? false;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        navigate({ view: "library" });
        return;
      }
      if (!current) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!revealed) revealCurrentReviewCard();
        return;
      }
      if (!revealed || grading) return;
      const key = e.key.toLowerCase();
      if (key === "1" || key === "a") {
        e.preventDefault();
        void gradeCurrentReviewCard("again");
      } else if (key === "2" || key === "g") {
        e.preventDefault();
        void gradeCurrentReviewCard("good");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, revealed, grading, navigate, revealCurrentReviewCard, gradeCurrentReviewCard]);

  const progressPct = session && session.total > 0 ? Math.min(100, (session.clearedCount / session.total) * 100) : 0;

  return (
    <div className={styles.page}>
      <div className={styles.progressTrack} role="progressbar" aria-valuenow={session?.clearedCount ?? 0} aria-valuemin={0} aria-valuemax={session?.total ?? 0}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>

      <button type="button" className={styles.exitButton} onClick={() => navigate({ view: "library" })} aria-label="Exit review">
        <Icon name="close" size={20} />
      </button>

      <div className={styles.content}>
        {(sessionLoading || (!session && !sessionLoading)) && (
          <div className={styles.skeletonCard} aria-hidden="true">
            <div className={`${styles.skeletonMedia} skeleton`} />
            <div className={`${styles.skeletonLine} skeleton`} style={{ width: "60%" }} />
            <div className={`${styles.skeletonLine} skeleton`} style={{ width: "40%" }} />
          </div>
        )}

        {session && session.total === 0 && reviewCounts?.total === 0 && (
          <CaughtUpState
            heading="Nothing to review yet"
            body="Take notes while studying — they come back here for review."
          />
        )}

        {session && session.total === 0 && (reviewCounts?.total ?? 0) > 0 && (
          <CaughtUpState heading="All caught up" body="No cards are due right now — check back later." />
        )}

        {session && session.total > 0 && !current && (
          // V3-B B4 "Mastery over streaks": the session-summary headline is
          // the mastery count (cards graduated past the 30-day interval,
          // across every project), not the streak — streak stays a small
          // footnote via StreakLine below (PEDAGOGY §5: "streak demoted from
          // headline to footnote; the celebrated number is concepts locked in").
          <CaughtUpState
            heading={`Concepts locked in: ${masteryCount ?? 0}`}
            body={`Reviewed ${session.clearedCount} card${session.clearedCount === 1 ? "" : "s"} this session.`}
          />
        )}

        {session && current && (
          <div className={styles.card} data-kind={current.kind}>
            {!revealed ? (
              <div className={styles.face} key={`${current.id}-front`}>
                <CardFront card={current} />
                <div className={styles.reveal}>
                  <button type="button" className={styles.primaryButton} onClick={revealCurrentReviewCard}>
                    Show answer
                  </button>
                  <span className={styles.hint}>Space</span>
                </div>
              </div>
            ) : (
              <div className={styles.face} data-state="back" key={`${current.id}-back`}>
                <CardBack card={current} />
                <div className={styles.gradeRow}>
                  <button
                    type="button"
                    className={styles.againButton}
                    disabled={grading}
                    onClick={() => void gradeCurrentReviewCard("again")}
                  >
                    Again
                    <span className={styles.hint}>1</span>
                  </button>
                  <button
                    type="button"
                    className={styles.goodButton}
                    disabled={grading}
                    onClick={() => void gradeCurrentReviewCard("good")}
                  >
                    Got it
                    <span className={styles.hint}>2</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
