// F11 Review Mode (SPEC "Entry points"): home page slim "Review — N cards
// due" banner, hidden entirely at N=0. Reads the same reviewCounts the
// TopBar badge does (see App.tsx's loadReviewCounts on mount) — no separate
// fetch.
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import styles from "./ReviewBanner.module.css";

export function ReviewBanner(): JSX.Element | null {
  const due = useStudyLoopStore((s) => s.reviewCounts?.due ?? 0);
  const navigate = useStudyLoopStore((s) => s.navigate);

  if (due <= 0) return null;

  return (
    <button type="button" className={styles.banner} onClick={() => navigate({ view: "review" })}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name="notifications" size={18} />
      </span>
      <span className={styles.text}>
        Review — {due} card{due === 1 ? "" : "s"} due
      </span>
      <Icon name="arrowForward" size={16} className={styles.chevron} />
    </button>
  );
}
