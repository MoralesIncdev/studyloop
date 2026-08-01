// SPEC V2 "Player chrome (hover, YouTube-style)": bottom gradient scrim + controls
// that fade in on mouse-move/pause and fade out after 3s idle while playing.
// Owns the progress bar (SeekBar, with the heatmap strip + bubble pins + concept
// ticks), the control cluster (PlayerControls), the chapters rail, the status
// chips row, and the keymap overlay — plus the real Fullscreen API on the
// player frame so CC/overlays/chrome all persist into fullscreen.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { api } from "../lib/api";
import { analysisConceptToConceptCard, hashHueForHandle, unitIdForConceptCard, AI_CONCEPT_ID_PREFIX } from "../lib/analysisFormat";
import { Icon } from "../components/icons";
import { SeekBar, type SeekBarConceptTick, type SeekBarOverlayMarker } from "./SeekBar";
import { conceptLoopSpan } from "../lib/conceptLoop";
import { activeConceptAt } from "../lib/activeConcept";
import { PlayerControls } from "./PlayerControls";
import { StatusChips } from "./StatusChips";
import { ChaptersRail, type Chapter } from "./ChaptersRail";
import { KeymapOverlay } from "./KeymapOverlay";
import styles from "./PlayerChrome.module.css";

const IDLE_HIDE_MS = 3000;
/** Console slice B: bubbles within this many seconds of the playhead count as
 *  "notes near here" for the context status chip (mock's own window for the
 *  same purpose, index.html line 941, is a similarly loose ±40s/±30s). */
const NEARBY_NOTES_WINDOW_S = 40;

interface Props {
  frameRef: RefObject<HTMLDivElement>;
  /** Reported whenever the scrim's visible/hidden state changes — CCOverlay
   *  uses this to nudge itself up above the controls (SPEC "CC overlay"). */
  onVisibleChange?: (visible: boolean) => void;
}

export function PlayerChrome({ frameRef, onVisibleChange }: Props): JSX.Element {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const autoPaused = useStudyLoopStore((s) => s.autoPaused);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const setLoopA = useStudyLoopStore((s) => s.setLoopA);
  const setLoopB = useStudyLoopStore((s) => s.setLoopB);
  const clearLoop = useStudyLoopStore((s) => s.clearLoop);
  const controller = useStudyLoopStore((s) => s.controller);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const heatmapOwn = useStudyLoopStore((s) => s.heatmapOwn);
  const heatmapOverlays = useStudyLoopStore((s) => s.heatmapOverlays);
  const heatmapMarks = useStudyLoopStore((s) => s.heatmapMarks);
  const heatmapBucketCount = useStudyLoopStore((s) => s.heatmapBucketCount);
  const loadHeatmap = useStudyLoopStore((s) => s.loadHeatmap);
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const attentionLegendSeen = useStudyLoopStore((s) => s.attentionLegendSeen);
  const dismissAttentionLegend = useStudyLoopStore((s) => s.dismissAttentionLegend);
  const notationT = useStudyLoopStore((s) => s.notationModal?.t ?? null);
  const focusMode = useStudyLoopStore((s) => s.focusMode);
  const keymapOpen = useStudyLoopStore((s) => s.keymapOpen);
  const closeKeymap = useStudyLoopStore((s) => s.closeKeymap);
  // Console slice C: Review force-opens the chapters rail (mock line 348,
  // `body.review .chapters{max-height:140px}`) — folding that into the same
  // `chaptersOpen` the scrim's own visibility already keys off (below) also
  // satisfies "the heatmap strip becomes always-visible" in review for free,
  // since HeatmapStrip lives inside the scrim's opacity chain rather than
  // having its own independent hover-reveal the way the mock's `.heat` does.
  const modality = useStudyLoopStore((s) => s.modality);

  const [hovering, setHovering] = useState(false);
  const [chaptersOpenManual, setChaptersOpenManual] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState<{ s: number; e: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chaptersOpen = chaptersOpenManual || modality === "review";

  // Visible whenever paused, the chapters rail is open, or the mouse has
  // moved within the last IDLE_HIDE_MS while playing.
  const visible = !isPlaying || chaptersOpen || hovering;

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  const clearHideTimer = (): void => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setHovering(false), IDLE_HIDE_MS);
  }, []);

  const handleMouseMove = useCallback(() => {
    setHovering(true);
    scheduleHide();
  }, [scheduleHide]);

  const handleMouseLeave = useCallback(() => {
    clearHideTimer();
    setHovering(false);
  }, []);

  useEffect(() => () => clearHideTimer(), []);

  // The show-on-hover hotspot lives on the player FRAME (native listeners),
  // not on chromeLayer — the layer is pointer-events:none now (see
  // PlayerChrome.module.css) so the console panes beneath it stay draggable.
  // Mouse moving over a pane bubbles up to the frame, which matches the
  // YouTube-style "any movement over the video reveals the transport" feel.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.addEventListener("mousemove", handleMouseMove);
    frame.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      frame.removeEventListener("mousemove", handleMouseMove);
      frame.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [frameRef, handleMouseMove, handleMouseLeave]);

  // V2-C: server-side heatmap (SPEC "refetch after analyze completes / bubble
  // changes, debounced" — the debounce itself lives in the store's
  // loadHeatmap). analyze completion is handled by the store directly
  // (startAnalyze/pollAnalyzeStatus call loadHeatmap on success); this effect
  // covers the other trigger, bubble edits, plus the initial fetch once a
  // real duration is known.
  useEffect(() => {
    if (duration > 0) loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, bubbles]);

  // Re-arm the idle timer whenever playback starts (so a just-paused->played
  // transition still fades the chrome out after 3s of no movement), and keep
  // it visible immediately on pause.
  useEffect(() => {
    if (isPlaying) scheduleHide();
    else clearHideTimer();
  }, [isPlaying, scheduleHide]);

  useEffect(() => {
    function onFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [frameRef]);

  const toggleFullscreen = (): void => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  };

  // V2-C: AI-breakdown concepts join the doc-concept tick pool on the seek
  // bar too (SPEC: "anchored ones join the ticker windows like doc
  // concepts") — same shape, so they render identically, just sourced from
  // analysis.concepts instead of the attached concept doc.
  const tickerConcepts = useMemo(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );

  // Console slice B: the seek bar's tick vocabulary (mock lines 287-300) —
  // jade attested / amber proposed / faint plain. `attestations` is keyed by
  // analysis.units[].id, which the server keeps 1:1 with analysis.concepts[].id
  // (see unitIdForConceptCard) — doc concepts never match an entry, so they
  // fall through to "plain" every time, which is correct: they carry no unit.
  // Console slice D: a tick matching a parked pane's anchor (store.parkedPanes)
  // is marked `waiting` — it pulses amber and clicking it undocks the pane
  // instead of seeking (mock's `.tick.waiting` + undockPane).
  const parkedPanes = useStudyLoopStore((s) => s.parkedPanes);
  const undockPane = useStudyLoopStore((s) => s.undockPane);
  const contextFlash = useStudyLoopStore((s) => s.contextFlash);
  const conceptTicks = useMemo<SeekBarConceptTick[]>(
    () =>
      tickerConcepts.flatMap((c) => {
        const isAiBacked = c.id.startsWith(AI_CONCEPT_ID_PREFIX);
        const entry = attestations[unitIdForConceptCard(c.id)];
        const kind: SeekBarConceptTick["kind"] =
          entry?.status === "attested" ? "attested" : isAiBacked && entry?.status !== "dismissed" ? "proposed" : "plain";
        return c.anchors
          .map((a, i): SeekBarConceptTick | null => {
            if (a.t == null) return null;
            const t = a.t;
            return {
              id: `${c.id}-${i}`,
              t,
              title: c.title,
              kind,
              waiting: Object.values(parkedPanes).some((p) => Math.abs(p.t - t) < 0.5),
            };
          })
          .filter((tick): tick is SeekBarConceptTick => tick !== null);
      }),
    [tickerConcepts, attestations, parkedPanes]
  );

  // Console slice 1 (SURVEY.md delta #1): clicking a concept tick scopes playback
  // to the concept's span via the existing A-B loop; clicking it again releases.
  // External loop changes (PlayerControls' clear, manual A/B) deactivate it
  // naturally because active state is derived from loopA/loopB matching the span.
  // Console slice 6: condensed playback — the concept layer becomes a playback
  // program (SURVEY.md, asbplayer's condensed mode). While enabled and outside
  // every concept's span, jump to the next span; an explicit A-B loop wins.
  const condensedPlayback = useStudyLoopStore((s) => s.condensedPlayback);
  const condensedSpans = useMemo(() => {
    const times = conceptTicks.map((x) => x.t).sort((a, b) => a - b);
    return times.map((t0) => conceptLoopSpan(t0, times, duration));
  }, [conceptTicks, duration]);
  useEffect(() => {
    if (!condensedPlayback || !controller || !isPlaying) return;
    if (loopA != null && loopB != null) return;
    if (condensedSpans.length === 0) return;
    const inside = condensedSpans.some((s) => currentTime >= s.start - 3 && currentTime <= s.end + 1);
    if (inside) return;
    const next = condensedSpans.find((s) => s.start > currentTime);
    if (next) controller.seek(Math.max(0, next.start - 2));
  }, [condensedPlayback, currentTime, condensedSpans, controller, isPlaying, loopA, loopB]);

  const [conceptLoop, setConceptLoop] = useState<{ id: string; start: number; end: number } | null>(null);
  const activeConceptTickId =
    conceptLoop && loopA === conceptLoop.start && loopB === conceptLoop.end ? conceptLoop.id : null;
  const handleConceptTick = useCallback(
    (tick: SeekBarConceptTick) => {
      if (conceptLoop && conceptLoop.id === tick.id && loopA === conceptLoop.start && loopB === conceptLoop.end) {
        clearLoop();
        setConceptLoop(null);
        return;
      }
      const span = conceptLoopSpan(tick.t, conceptTicks.map((x) => x.t), duration);
      setLoopA(span.start);
      setLoopB(span.end);
      setConceptLoop({ id: tick.id, ...span });
      controller?.seek(span.start);
    },
    [conceptLoop, loopA, loopB, conceptTicks, duration, controller, clearLoop, setLoopA, setLoopB]
  );

  // Console slice B: the status-chips loop pill (mock line 908 `loopLabel`) —
  // the concept's title when the active loop is a concept-tick scope, else
  // the generic mpv-cycle label. null when no loop is set at all.
  const loopText = useMemo(() => {
    if (loopA == null || loopB == null) return null;
    if (activeConceptTickId) {
      const title = conceptTicks.find((t) => t.id === activeConceptTickId)?.title;
      if (title) return `Looping · ${title}`;
    }
    return "A–B loop · L to clear";
  }, [loopA, loopB, activeConceptTickId, conceptTicks]);

  // Console slice B: chapters rail (mock lines 335-348, 700-708) — one chip
  // per concept, span derived the same way the concept-tick click-to-loop
  // does (lib/conceptLoop.ts), attested straight off the same `attestations`
  // lookup the seek bar's ticks use.
  const chapters = useMemo<Chapter[]>(() => {
    const times = tickerConcepts.flatMap((c) => c.anchors.map((a) => a.t).filter((t): t is number => t != null));
    return tickerConcepts
      .map((c) => {
        const t = c.anchors.find((a) => a.t != null)?.t;
        if (t == null) return null;
        const span = conceptLoopSpan(t, times, duration);
        const attested = attestations[unitIdForConceptCard(c.id)]?.status === "attested";
        return { id: c.id, t, end: span.end, title: c.title, attested };
      })
      .filter((c): c is Chapter => c !== null)
      .sort((a, b) => a.t - b.t);
  }, [tickerConcepts, duration, attestations]);

  // Console slice B: status-chips context line — nearest concept covering the
  // playhead (lib/activeConcept.ts, already used elsewhere for the same
  // "what's being taught right now" question) + a note count in the window
  // around it (mock's showCtx(), index.html lines 940-946).
  const nearestConceptTitle = activeConceptAt(tickerConcepts, currentTime)?.card.title ?? null;
  const nearbyNoteCount = useMemo(
    () => bubbles.filter((b) => Math.abs(b.t - currentTime) <= NEARBY_NOTES_WINDOW_S).length,
    [bubbles, currentTime]
  );

  const overlayMarkers = useMemo<SeekBarOverlayMarker[]>(() => {
    if (!overlaysVisible) return [];
    return overlays.flatMap((o) => {
      const hue = hashHueForHandle(o.bundle.shareHandle);
      const bubbleMarkers = o.bundle.bubbles.map((b, i) => ({
        id: `ov-${o.fileName}-b${i}`,
        t: b.t,
        handle: o.bundle.shareHandle,
        hue,
        kind: "bubble" as const,
      }));
      const pearlMarkers = o.bundle.pearls.map((p, i) => ({
        id: `ov-${o.fileName}-p${i}`,
        t: p.t,
        handle: o.bundle.shareHandle,
        hue,
        kind: "pearl" as const,
      }));
      return [...bubbleMarkers, ...pearlMarkers];
    });
  }, [overlays, overlaysVisible]);

  const zoomFactor = viewport ? duration / (viewport.e - viewport.s) : null;

  return (
    <div className={styles.chromeLayer}>
      <StatusChips
        isPlaying={isPlaying}
        autoPaused={autoPaused}
        currentTime={currentTime}
        loopText={loopText}
        onClearLoop={() => {
          clearLoop();
          setConceptLoop(null);
        }}
        nearestConceptTitle={nearestConceptTitle}
        nearbyNoteCount={nearbyNoteCount}
        contextFlash={contextFlash}
        dimmed={focusMode}
      />
      <div className={`${styles.scrim} ${visible ? styles.scrimVisible : ""}`}>
        {/* V3-C C5 "Attention heatmap" (SPEC): one-time legend line, shown
            above the strip the first time there's anything to see it about. */}
        {!attentionLegendSeen && (heatmapOwn.some((v) => v > 0) || heatmapOverlays.some((v) => v > 0)) && (
          <div className={styles.attentionLegend}>
            <span>Attention = where marks concentrate, not importance.</span>
            <button type="button" className={styles.attentionLegendClose} onClick={dismissAttentionLegend} aria-label="Dismiss">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        <div className={styles.progressWrap}>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            loopA={loopA}
            loopB={loopB}
            provisionalT={notationT}
            attentionOwn={heatmapOwn}
            attentionOverlays={heatmapOverlays}
            attentionMarks={heatmapMarks}
            attentionBucketCount={heatmapBucketCount}
            viewport={viewport}
            onViewportChange={setViewport}
            bubbles={
              currentProject
                ? bubbles.map((b) => ({
                    id: b.id,
                    t: b.t,
                    text: b.text,
                    thumbnailUrl: b.shot ? api.shotUrl(currentProject.id, b.shot) : null,
                  }))
                : []
            }
            conceptTicks={conceptTicks}
            onConceptTick={handleConceptTick}
            onWaitingTick={(tick) => {
              const parked = Object.entries(parkedPanes).find(([, p]) => Math.abs(p.t - tick.t) < 0.5);
              if (parked) undockPane(parked[0]);
            }}
            activeConceptTickId={activeConceptTickId}
            pearls={(analysis?.pearls ?? []).map((p) => ({ id: `pearl-${p.t}-${p.label}`, t: p.t, label: p.label, importance: p.importance }))}
            overlayMarkers={overlayMarkers}
            onSeekPearl={(t) => controller?.seek(Math.max(0, t - 5))}
            onSeek={(t) => controller?.seek(t)}
            onSeekBubble={(t) => controller?.seek(Math.max(0, t - 5))}
          />
        </div>
        <PlayerControls
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          chaptersOpen={chaptersOpen}
          onToggleChapters={() => setChaptersOpenManual((v) => !v)}
          zoomFactor={zoomFactor}
          onResetZoom={() => setViewport(null)}
        />
        <ChaptersRail chapters={chapters} currentTime={currentTime} open={chaptersOpen} onSeek={(t) => controller?.seek(t)} />
      </div>
      <KeymapOverlay open={keymapOpen} onClose={closeKeymap} />
    </div>
  );
}
