// V2-C "Analysis engine" (SPEC): the channel-row Analyze pill. No API key →
// toast + open Settings; otherwise POST /analyze, poll status 1s (via the
// store), and show a thin YT-style progress bar under the pill while running.
// The chrome cluster's autoAwesome button (PlayerControls) drives the exact
// same store actions — see its onClick there — so behavior stays identical
// between the two entry points the SPEC calls out ("Analyze pill (channel
// row) + chrome button go live").
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import styles from "./AnalyzeButton.module.css";

export function AnalyzeButton(): JSX.Element {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const analyzeStatus = useStudyLoopStore((s) => s.analyzeStatus);
  const startAnalyze = useStudyLoopStore((s) => s.startAnalyze);
  const confirmReanalyze = useStudyLoopStore((s) => s.confirmReanalyze);

  const running = analyzeStatus.state === "running";
  const hasAnalysis = analysis !== null;

  const handleClick = (): void => {
    if (running) return;
    if (hasAnalysis) confirmReanalyze();
    else void startAnalyze();
  };

  const label = running
    ? `Analyzing… ${analyzeStatus.pct}%`
    : hasAnalysis
      ? "Re-analyze"
      : analyzeStatus.state === "error"
        ? "Retry analysis"
        : "Analyze";

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.analyzePill}
        data-ripple
        onClick={handleClick}
        disabled={running}
        aria-busy={running}
        title={analyzeStatus.state === "error" ? analyzeStatus.message : undefined}
      >
        <Icon name="autoAwesome" size={16} />
        {label}
      </button>
      {running && (
        <div className={styles.progressTrack} role="progressbar" aria-valuenow={analyzeStatus.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.progressFill} style={{ width: `${analyzeStatus.pct}%` }} />
        </div>
      )}
    </div>
  );
}
