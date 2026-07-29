// V2-C "Analysis engine" + "Overlays" (SPEC): the right-rail sections that
// render the analysis engine's output. Composed into RightRail.tsx's
// Concepts card (Pearls at the top, ConceptsDock's doc concepts in the
// middle, "AI breakdown" + Themes below — SPEC: "'Pearls' group at top ...
// themes at the bottom of the panel") plus a standalone "Others' analysis"
// card for imported overlays.
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { sortPearls, starStates, hashHueForHandle, AI_CONCEPT_ID_PREFIX } from "../lib/analysisFormat";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { UnitProposalCard } from "./UnitProposalCard";
import type { AttestationEntry, Pearl } from "../lib/types";
import styles from "./AnalysisSections.module.css";

/**
 * V3-B review finding #7 "AI pearls enter review without learner attestation
 * or generation" (PEDAGOGY §5): mirrors the server's isUnitFeedable
 * (lib/attestation.ts) — a unit is feedable once explicitly attested, or has
 * a non-empty userTake, and never when dismissed. Duplicated (not imported)
 * because web/ and server/ are separate packages with no shared runtime
 * module — this is a 4-line predicate, not worth a cross-package dependency.
 */
function isAttestedOrTaken(entry: AttestationEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.status === "dismissed") return false;
  if (entry.status === "attested") return true;
  return Boolean(entry.userTake?.trim());
}

/** Matches ConceptsDock's HIGHLIGHT_DURATION_MS — how long a chip-triggered highlight stays visible before self-clearing. */
const HIGHLIGHT_DURATION_MS = 2600;

/**
 * codex P0-2 "stub-analysis leakage": `analysis.source === "stub"` means the
 * result came from the deterministic offline demo generator
 * (STUDYLOOP_FAKE_ANALYSIS=1), not a real model call. Stub output is only
 * rendered in dev builds (so the flow stays exercisable/screenshottable
 * without an API key) — a production build always falls back to the "run
 * analysis" empty state instead of shipping fake content as if it were real.
 */
export function isAnalysisVisible(analysis: { source?: "model" | "stub" } | null): boolean {
  if (!analysis) return false;
  return analysis.source !== "stub" || import.meta.env.DEV;
}

function StarRating({ importance }: { importance: 1 | 2 | 3 }): JSX.Element {
  return (
    <span className={styles.stars} aria-label={`Importance ${importance} of 3`}>
      {starStates(importance).map((filled, i) => (
        <Icon key={i} name={filled ? "star" : "starOutline"} size={12} />
      ))}
    </span>
  );
}

export function PearlsSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const controller = useStudyLoopStore((s) => s.controller);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const pearlReviewAdds = useStudyLoopStore((s) => s.pearlReviewAdds);
  const addPearlToReview = useStudyLoopStore((s) => s.addPearlToReview);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addingT, setAddingT] = useState<number | null>(null);

  if (!analysis || analysis.pearls.length === 0) return null;
  const pearls = sortPearls(analysis.pearls);

  const toggle = (i: number): void => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleAddToReview = async (t: number): Promise<void> => {
    setAddingT(t);
    try {
      await addPearlToReview(t);
    } finally {
      setAddingT(null);
    }
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeader}>Pearls</h3>
      <ul className={styles.list}>
        {pearls.map((pearl: Pearl, i) => {
          // V3-B review finding #7 (PEDAGOGY §5): a pearl only ever feeds
          // review via an attested linked unit or this explicit action —
          // never automatically. Hide the button once either path already
          // applies (nothing left to add).
          const linkedFeedable = pearl.unitId !== undefined && isAttestedOrTaken(attestations[pearl.unitId]);
          const explicitlyAdded = pearlReviewAdds.has(String(pearl.t));
          const inReview = linkedFeedable || explicitlyAdded;
          return (
            <li key={`${pearl.t}-${pearl.label}`} className={styles.pearlRow} onClick={() => toggle(i)}>
              <div className={styles.pearlHead}>
                <StarRating importance={pearl.importance} />
                <button
                  type="button"
                  className={styles.timeChip}
                  onClick={(e) => {
                    e.stopPropagation();
                    controller?.seek(Math.max(0, pearl.t - 5));
                  }}
                >
                  {formatTimestamp(pearl.t)}
                </button>
                <span className={styles.pearlLabel}>{pearl.label}</span>
                {inReview ? (
                  <span className={styles.pearlInReviewTag} title="This pearl is in your review queue">
                    <Icon name="check" size={11} />
                    In review
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.pearlAddToReviewButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAddToReview(pearl.t);
                    }}
                    disabled={addingT === pearl.t}
                    aria-busy={addingT === pearl.t}
                    title="Add this pearl to your spaced-review queue"
                  >
                    Add to review
                  </button>
                )}
              </div>
              {expanded.has(i) && <p className={styles.pearlInsight}>{pearl.insight}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AiBreakdownSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const controller = useStudyLoopStore((s) => s.controller);
  const highlightedConceptId = useStudyLoopStore((s) => s.highlightedConceptId);
  const clearHighlightedConcept = useStudyLoopStore((s) => s.clearHighlightedConcept);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);

  // Collapsed by default (title + seek chips only) — clicking a row, or a
  // concept chip targeting it, reveals the summary. Doc concepts (see
  // ConceptsDock.tsx) get their own full ConceptOverlay panel for this; AI
  // concepts have no such overlay, so "expanded" (SPEC A4) means the row
  // itself (V3-A review finding #4).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  // V3-C review finding #8 "rationales are neither rail-editable nor
  // retained for editing": the "why this grouping" affordance lives here, on
  // each own-concept row — collapsed by default, persisted on the project
  // (conceptRationales, merged per-concept — see store.ts/lib/store.ts).
  // ShareFlow.tsx now prefills its export-step drafts from this persisted
  // value instead of always starting blank.
  const [rationaleOpen, setRationaleOpen] = useState<Set<string>>(new Set());
  const [rationaleDrafts, setRationaleDrafts] = useState<Record<string, string>>({});

  const toggleRationale = (id: string): void => {
    setRationaleDrafts((d) => (id in d ? d : { ...d, [id]: currentProject?.conceptRationales?.[id] ?? "" }));
    setRationaleOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveRationale = (id: string): void => {
    const text = (rationaleDrafts[id] ?? "").trim();
    if (text === (currentProject?.conceptRationales?.[id] ?? "").trim()) return; // unchanged — skip the round trip
    void patchCurrentProject({ conceptRationales: { [id]: text } });
  };

  const highlightedRawId =
    highlightedConceptId?.startsWith(AI_CONCEPT_ID_PREFIX) ? highlightedConceptId.slice(AI_CONCEPT_ID_PREFIX.length) : null;

  useEffect(() => {
    if (!highlightedRawId) return undefined;
    setExpanded((cur) => (cur.has(highlightedRawId) ? cur : new Set(cur).add(highlightedRawId)));
    rowRefs.current[highlightedRawId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(clearHighlightedConcept, HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightedRawId, clearHighlightedConcept]);

  if (!analysis || analysis.concepts.length === 0) return null;

  const toggle = (id: string): void => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeader}>AI breakdown</h3>
      <ul className={styles.list}>
        {analysis.concepts.map((concept) => (
          <li
            key={concept.id}
            ref={(el) => {
              rowRefs.current[concept.id] = el;
            }}
            className={`${styles.conceptRow} ${highlightedRawId === concept.id ? styles.conceptRowHighlighted : ""}`}
            onClick={() => toggle(concept.id)}
          >
            <p className={styles.conceptTitle}>{concept.title}</p>
            {expanded.has(concept.id) && <p className={styles.conceptSummary}>{concept.summary}</p>}
            <div className={styles.anchorRow}>
              {concept.anchors.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.timeChip}
                  onClick={(e) => {
                    e.stopPropagation();
                    controller?.seek(Math.max(0, a.t - 5));
                  }}
                >
                  {formatTimestamp(a.t)}
                </button>
              ))}
            </div>
            {/* V3-C review finding #8: collapsed-by-default "why this
                grouping" affordance, own concepts only (this section IS the
                own-concept list). Persists via patchCurrentProject's
                conceptRationales merge on blur. */}
            <div className={styles.rationaleField}>
              <button
                type="button"
                className={styles.rationaleToggle}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRationale(concept.id);
                }}
                aria-expanded={rationaleOpen.has(concept.id)}
              >
                <Icon
                  name="chevronDown"
                  size={11}
                  className={rationaleOpen.has(concept.id) ? styles.introCardChevronOpen : undefined}
                />
                why this grouping
              </button>
              {rationaleOpen.has(concept.id) && (
                <input
                  type="text"
                  className={styles.rationaleInput}
                  placeholder="Why this grouping…"
                  value={rationaleDrafts[concept.id] ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRationaleDrafts((d) => ({ ...d, [concept.id]: value }));
                  }}
                  onBlur={() => saveRationale(concept.id)}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * V3-B B1/B2: v3's typed-spine replacement for AiBreakdownSection's flat
 * concept list — each unit renders as an attestable PROPOSAL
 * (UnitProposalCard) instead of a plain expand/collapse row. Analysis order
 * (not topo order — that's Study Path's job, see StudyPathSection.tsx).
 */
export function UnitsProposalsSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  if (!analysis || analysis.version !== 3 || !analysis.units || analysis.units.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeader}>Concept breakdown</h3>
      <div className={styles.list}>
        {analysis.units.map((unit) => (
          <UnitProposalCard key={unit.id} unit={unit} />
        ))}
      </div>
    </section>
  );
}

export function ThemesSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  if (!analysis || analysis.themes.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeader}>Themes</h3>
      <ul className={styles.list}>
        {analysis.themes.map((theme) => (
          <li key={theme.title} className={styles.themeRow}>
            <p className={styles.themeTitle}>{theme.title}</p>
            <p className={styles.themeBody}>{theme.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * V3-C C6 "Bundle narrative fields" (SPEC): "On import, author's
 * lessonSummary renders as collapsible intro card atop the overlay rail
 * section." Defaults collapsed — it's a "read this if you want the
 * author's framing" affordance, not something that should push the actual
 * marks/pearls further down the rail every time.
 */
function LessonSummaryIntroCard({ summary }: { summary: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.introCard}>
      <button
        type="button"
        className={styles.introCardHeader}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Icon name="chevronDown" size={14} className={expanded ? styles.introCardChevronOpen : undefined} />
        <span>In their own words</span>
      </button>
      {expanded && <p className={styles.introCardBody}>{summary}</p>}
    </div>
  );
}

/** SPEC: "'Others' analysis' right-rail section grouped by handle (their pearls/notes read-only, click-seek)". */
export function OthersAnalysisSection(): JSX.Element | null {
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const controller = useStudyLoopStore((s) => s.controller);

  if (!overlaysVisible || overlays.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeader}>Others&rsquo; analysis</h3>
      {overlays.map((overlay) => {
        const hue = hashHueForHandle(overlay.bundle.shareHandle);
        const rationales = overlay.bundle.conceptRationales ?? {};
        const conceptsWithRationale = overlay.bundle.concepts.filter((c) => rationales[c.id]);
        return (
          <div key={overlay.fileName} className={styles.handleGroup}>
            <div className={styles.handleHeader}>
              <span className={styles.handleSwatch} style={{ background: `hsl(${hue}, 70%, 55%)` }} />
              {overlay.bundle.shareHandle}
            </div>
            {overlay.bundle.lessonSummary?.trim() && (
              <LessonSummaryIntroCard summary={overlay.bundle.lessonSummary.trim()} />
            )}
            {overlay.bundle.pearls.length === 0 && overlay.bundle.bubbles.length === 0 && (
              <p className={styles.empty}>No pearls or captures in this bundle.</p>
            )}
            {overlay.bundle.pearls.length > 0 && (
              <ul className={styles.list}>
                {sortPearls(overlay.bundle.pearls).map((pearl) => (
                  <li key={`${pearl.t}-${pearl.label}`} className={styles.pearlRow}>
                    <div className={styles.pearlHead}>
                      <StarRating importance={pearl.importance} />
                      <button type="button" className={styles.timeChip} onClick={() => controller?.seek(Math.max(0, pearl.t - 5))}>
                        {formatTimestamp(pearl.t)}
                      </button>
                      <span className={styles.pearlLabel}>{pearl.label}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* V3-C C6: "why this grouping" — the apprenticeship payload
                (PEDAGOGY §3: "the bundle carries why this person organized
                it this way"). Only concepts the author actually annotated. */}
            {conceptsWithRationale.length > 0 && (
              <ul className={styles.list}>
                {conceptsWithRationale.map((concept) => (
                  <li key={concept.id} className={styles.rationaleRow}>
                    <p className={styles.conceptTitle}>{concept.title}</p>
                    <p className={styles.rationaleText}>{rationales[concept.id]}</p>
                  </li>
                ))}
              </ul>
            )}
            {overlay.bundle.notes.trim() && <p className={styles.othersNotes}>{overlay.bundle.notes.trim()}</p>}
          </div>
        );
      })}
    </section>
  );
}
