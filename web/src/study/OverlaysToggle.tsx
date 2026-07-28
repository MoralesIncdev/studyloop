// V2-C "Overlays" (SPEC): the visibility action pill toggles a second marker
// layer for every imported overlay bundle — this file owns the pill itself
// plus the legend chip row rendered above the dock when overlays are visible
// (SPEC: "legend chips above the dock"). SeekBar/PlayerChrome consume
// `overlaysVisible` + `overlays` directly to render the marker layer itself.
import { useEffect } from "react";
import { useStudyLoopStore } from "../state/store";
import { hashHueForHandle } from "../lib/analysisFormat";
import { Icon } from "../components/icons";
import styles from "./OverlaysToggle.module.css";
import compileStyles from "./CompileFlow.module.css";

export function OverlaysPill(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const toggleOverlaysVisible = useStudyLoopStore((s) => s.toggleOverlaysVisible);
  const loadOverlays = useStudyLoopStore((s) => s.loadOverlays);

  useEffect(() => {
    if (currentProject) void loadOverlays();
    // Only re-run when the project itself changes — loadOverlays is stable
    // from zustand and re-fetching on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (!currentProject) return null;

  return (
    <button
      type="button"
      className={`${compileStyles.compileButton} ${overlaysVisible ? styles.pillActive : ""}`}
      onClick={toggleOverlaysVisible}
      disabled={overlays.length === 0}
      title={overlays.length === 0 ? "No imported analyses yet — use Import to add one" : "Toggle others' imported analysis markers"}
      aria-pressed={overlaysVisible}
    >
      <Icon name={overlaysVisible ? "visibility" : "visibilityOff"} size={16} />
      Overlays{overlays.length > 0 ? ` (${overlays.length})` : ""}
    </button>
  );
}

export function OverlayLegend(): JSX.Element | null {
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const deleteOverlayFile = useStudyLoopStore((s) => s.deleteOverlayFile);

  if (!overlaysVisible || overlays.length === 0) return null;

  return (
    <div className={styles.legend}>
      {overlays.map((o) => (
        <span key={o.fileName} className={styles.chip} style={{ borderColor: `hsl(${hashHueForHandle(o.bundle.shareHandle)}, 70%, 55%)` }}>
          <span className={styles.swatch} style={{ background: `hsl(${hashHueForHandle(o.bundle.shareHandle)}, 70%, 55%)` }} />
          {o.bundle.shareHandle}
          <button
            type="button"
            className={styles.removeChip}
            onClick={() => void deleteOverlayFile(o.fileName)}
            aria-label={`Remove ${o.bundle.shareHandle}'s overlay`}
            title="Remove"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
