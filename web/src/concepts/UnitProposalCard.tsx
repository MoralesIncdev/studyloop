// V3-B B2 "Attestation + reveal-gating" (SPEC): one typed unit (analysis.units)
// rendered as a PROPOSAL — label + type badge always visible, body collapsed
// behind Reveal. Reveal itself is gated by generation (PEDAGOGY §1: "before
// the app shows its answer... the learner is invited to produce their own"):
// a one-line "your take" input sits above the reveal control; typing
// anything (blurred = saved) OR an explicit Skip unlocks it. novice mode
// (per-project toggle) flips the order — body first, "restate it" prompt
// after (expertise-reversal rule). Card actions: Attest / Edit / Dismiss —
// state lives in <project>/attestations.json (state/store.ts).
//
// Shared between RightRail's Concepts card (analysis order) and the Study
// Path rail tab (topo order, + a "n/m attested" progress line owned by the
// caller) — this component only renders ONE unit's card.
import { useEffect, useMemo, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { formatTimestamp } from "../lib/time";
import { pickPrompt, promptPoolFor } from "../lib/notationPrompts";
import { isSafetyTierUnitType } from "../lib/safetyTier";
import type { AnalysisUnit, UnitOverlay } from "../lib/types";
import styles from "./UnitProposalCard.module.css";

const UNIT_TYPE_LABEL: Record<AnalysisUnit["type"], string> = {
  CLAIM: "Claim",
  MECHANISM: "Mechanism",
  PROCEDURE: "Procedure",
  EXAMPLE: "Example",
  BOUNDARY: "Boundary",
  // Phase 4 "Cluster unit type": a CLUSTER's own proposal card still renders
  // through this same rail component (attest/dismiss are unit-id-level,
  // unchanged) — its members list renders below, see the CLUSTER branch in
  // the body section.
  CLUSTER: "Cluster",
  // Phase 5 "Lens registry": spine-level additions (clinical is the first lens to emphasize them).
  DOSAGE: "Dosage",
  CONTRAINDICATION: "Contraindication",
  LAB_VALUE: "Lab value",
  PRIORITIZATION: "Prioritization",
};

/** V3-D D1 "Advanced fold" — human labels for UnitOverlaySchema's flat field set. */
const OVERLAY_FIELD_LABEL: Record<keyof UnitOverlay, string> = {
  levelOfOrganization: "Level of organization",
  mechanismType: "Mechanism type",
  entities: "Entities",
  sourceType: "Source type",
  causationType: "Causation type",
  actors: "Actors",
  perspectiveFlag: "Perspective",
  schema: "Schema",
  notation: "Notation",
  keyContext: "Key context",
  triggers: "Triggers",
  failureModes: "Failure modes",
  drillPairing: "Drill pairing",
  // Phase 5 "Clinical lens" overlay fields (server/lenses/clinical.json's overlayFields).
  drugClass: "Drug class",
  genericName: "Generic name",
  brandName: "Brand name",
  route: "Route",
  normalRange: "Normal range",
  nclexCategory: "NCLEX category",
};

/**
 * V3-D D1 "Advanced" fold: domain overlay fields, collapsed by default,
 * dimmed label (SPEC: "renderer shows overlay in an 'Advanced' fold on the
 * unit card"). Renders nothing when the unit carries no overlay content at
 * all (generic-domain units, or a unit the transcript didn't support any
 * overlay field for).
 */
function AdvancedFold({ overlay }: { overlay: AnalysisUnit["overlay"] }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!overlay) return null;
  const entries = (Object.entries(overlay) as [keyof UnitOverlay, string | string[] | undefined][]).filter(
    ([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v))
  );
  if (entries.length === 0) return null;
  return (
    <div className={styles.advancedFold}>
      <button type="button" className={styles.advancedToggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="chevronDown" size={12} className={open ? styles.advancedChevronOpen : undefined} />
        <span className={styles.advancedLabel}>Advanced</span>
      </button>
      {open && (
        <dl className={styles.advancedList}>
          {entries.map(([key, value]) => (
            <div key={key} className={styles.advancedRow}>
              <dt className={styles.advancedKey}>{OVERLAY_FIELD_LABEL[key]}</dt>
              <dd className={styles.advancedValue}>{Array.isArray(value) ? value.join(", ") : value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

interface Props {
  unit: AnalysisUnit;
}

export function UnitProposalCard({ unit }: Props): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const noviceMode = useStudyLoopStore((s) => s.currentProject?.noviceMode ?? false);
  const domain = useStudyLoopStore((s) => s.currentProject?.domain);
  const entry = useStudyLoopStore((s) => s.attestations[unit.id]);
  const attestUnit = useStudyLoopStore((s) => s.attestUnit);
  const saveUnitTake = useStudyLoopStore((s) => s.saveUnitTake);
  const saveUnitBody = useStudyLoopStore((s) => s.saveUnitBody);
  const dismissUnit = useStudyLoopStore((s) => s.dismissUnit);
  const clearUnitAttestation = useStudyLoopStore((s) => s.clearUnitAttestation);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);
  // V3-D D3 "also in ⟨other project⟩" chip — populated once GET /api/projects/:id/merged-concepts loads (state/store.ts loadMergedConcepts, fired alongside attestations on project open).
  const mergedIn = useStudyLoopStore((s) => s.mergedConcepts[unit.id]);
  const navigate = useStudyLoopStore((s) => s.navigate);

  const [take, setTake] = useState(entry?.userTake ?? "");
  /** Set by an explicit Skip, or by clicking Reveal with a non-empty take — "typing anything (or explicit skip) unlocks reveal" (SPEC B2). */
  const [unlocked, setUnlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(entry?.userBody ?? unit.body);
  // V3-C review finding #8 "rationales are neither rail-editable nor
  // retained for editing": this IS the v3 own-concept row (analysis.concepts
  // mirrors analysis.units 1:1 by id — see server's unitsToConceptsMirror),
  // so the "why this grouping" affordance lives here, collapsed by default,
  // persisted via patchCurrentProject's conceptRationales merge.
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [rationaleDraft, setRationaleDraft] = useState(currentProject?.conceptRationales?.[unit.id] ?? "");

  // Sync local draft state when the underlying entry changes out from under
  // us (e.g. a fresh project load, or clearing the attestation) — mirrors
  // NotationModal's controlled-then-local-draft pattern elsewhere in this app.
  useEffect(() => {
    setTake(entry?.userTake ?? "");
    setEditBody(entry?.userBody ?? unit.body);
  }, [entry?.userTake, entry?.userBody, unit.body]);

  const persistedRationale = currentProject?.conceptRationales?.[unit.id] ?? "";
  useEffect(() => {
    // Depends on the primitive string value (not the whole conceptRationales
    // object reference) — an unrelated project PATCH response (e.g. the
    // periodic lastPosition/watchedUpTo save) produces a brand-new object
    // graph on every fetch even when this unit's rationale text is
    // unchanged; keying on the object reference would re-fire this effect
    // on every such save and could clobber an in-progress unsaved edit.
    setRationaleDraft(persistedRationale);
  }, [persistedRationale, unit.id]);

  const t = unit.anchors[0]?.t;
  const status = entry?.status;
  const revealed = noviceMode || unlocked || Boolean(entry?.userTake?.trim());
  const canReveal = take.trim().length > 0;

  const handleTakeBlur = (): void => {
    const trimmed = take.trim();
    if (trimmed && trimmed !== (entry?.userTake ?? "").trim()) void saveUnitTake(unit.id, trimmed);
  };

  const handleSkip = (): void => setUnlocked(true);

  const handleReveal = (): void => {
    const trimmed = take.trim();
    if (trimmed) void saveUnitTake(unit.id, trimmed);
    setUnlocked(true);
  };

  const handleSaveEdit = (): void => {
    void saveUnitBody(unit.id, editBody);
    setEditing(false);
  };

  const handleRationaleBlur = (): void => {
    const trimmed = rationaleDraft.trim();
    if (trimmed !== (currentProject?.conceptRationales?.[unit.id] ?? "").trim()) {
      void patchCurrentProject({ conceptRationales: { [unit.id]: trimmed } });
    }
  };

  // V3-D D1 "Generation slots become domain-aware": the same promptPoolFor(domain)
  // hook the notation modal draws its ghost prompt from (SPEC: "Study Path +
  // notation modal both consume it") — one prompt per unit, stable across
  // re-renders/keystrokes (not re-rolled while typing).
  const domainSlotPrompt = useMemo(() => pickPrompt(promptPoolFor(domain)), [unit.id, domain]);

  const generationSlot = (
    <div className={styles.generationSlot}>
      <textarea
        className={styles.takeInput}
        placeholder={noviceMode ? "Restate it in your own words — or skip" : `${domainSlotPrompt} — or skip`}
        value={take}
        onChange={(e) => setTake(e.target.value)}
        onBlur={handleTakeBlur}
        rows={2}
      />
      {!revealed && (
        <div className={styles.revealRow}>
          <button type="button" className={styles.skipButton} onClick={handleSkip}>
            Skip
          </button>
          <button type="button" className={styles.revealButton} disabled={!canReveal} onClick={handleReveal}>
            Reveal
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.card} data-status={status ?? "none"}>
      <div className={styles.head}>
        <span className={styles.typeBadge}>{UNIT_TYPE_LABEL[unit.type]}</span>
        {t != null && (
          <button type="button" className={styles.timeChip} onClick={() => controller?.seek(Math.max(0, t - 3))}>
            {formatTimestamp(t)}
          </button>
        )}
        <span className={styles.label}>{unit.label}</span>
        {unit.threshold && (
          <span className={styles.thresholdBadge} title="Threshold concept — unlocks later material" aria-label="Threshold concept">
            <Icon name="key" size={13} />
          </span>
        )}
        {status === "attested" && (
          <span className={styles.statusBadge} title="Attested" aria-label="Attested">
            <Icon name="check" size={13} />
          </span>
        )}
        {status === "dismissed" && <span className={styles.statusBadge}>Dismissed</span>}
      </div>

      {/* V3-D D2: "one-line banner on the card ('This idea unlocks later material')". */}
      {unit.threshold && <p className={styles.thresholdBanner}>This idea unlocks later material</p>}

      {/* V3-D D3: "Merged units display a subtle 'also in ⟨other project⟩' chip linking there." */}
      {mergedIn && mergedIn.length > 0 && (
        <div className={styles.mergedChips}>
          {mergedIn.map((ref) => (
            <button
              key={ref.projectId}
              type="button"
              className={styles.mergedChip}
              onClick={() => navigate({ view: "study", projectId: ref.projectId })}
              title={`Also appears in "${ref.projectTitle}"`}
            >
              also in {ref.projectTitle}
            </button>
          ))}
        </div>
      )}

      {/* Phase 5 "Safety tier", item 5(a): units whose type is in the active
          lens's safetyTier ALWAYS render their verbatim transcript quote —
          never paraphrase-only. Deliberately placed OUTSIDE the reveal
          gate/attestation flow below (unconditional, regardless of
          `revealed`/novice-mode/editing state) — the pedagogy reveal gate
          governs the AI's paraphrase (summary/body), not the safety-critical
          source evidence backing it. */}
      {isSafetyTierUnitType(unit.type) && unit.anchors.length > 0 && (
        <div className={styles.safetyQuotes} aria-label="Verbatim source quote">
          {unit.anchors.map((a, i) => (
            <p key={i} className={styles.safetyQuote}>
              &ldquo;{a.quote}&rdquo;
            </p>
          ))}
        </div>
      )}

      {!noviceMode && generationSlot}

      {revealed && !editing && (
        <div className={styles.body}>
          <p className={styles.summary}>{unit.summary}</p>
          <p className={styles.bodyText}>{entry?.userBody?.trim() || unit.body}</p>
          <AdvancedFold overlay={unit.overlay} />
        </div>
      )}

      {noviceMode && generationSlot}

      {editing && (
        <div className={styles.editPane}>
          <textarea className={styles.editTextarea} value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} />
          <div className={styles.editActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={handleSaveEdit}>
              Save
            </button>
          </div>
        </div>
      )}

      {revealed && !editing && status !== "dismissed" && (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionButton} ${status === "attested" ? styles.actionButtonActive : ""}`}
            onClick={() => void attestUnit(unit.id)}
            title="I've got this"
          >
            <Icon name="check" size={14} />
            Attest
          </button>
          <button type="button" className={styles.actionButton} onClick={() => setEditing(true)}>
            <Icon name="editNote" size={14} />
            Edit
          </button>
          <button type="button" className={styles.actionButton} onClick={() => void dismissUnit(unit.id)}>
            <Icon name="close" size={14} />
            Dismiss
          </button>
        </div>
      )}

      {status === "dismissed" && (
        <button type="button" className={styles.undoButton} onClick={() => void clearUnitAttestation(unit.id)}>
          Undo dismiss
        </button>
      )}

      <div className={styles.rationaleField}>
        <button
          type="button"
          className={styles.rationaleToggle}
          onClick={() => setRationaleOpen((v) => !v)}
          aria-expanded={rationaleOpen}
        >
          <Icon name="chevronDown" size={11} className={rationaleOpen ? styles.rationaleChevronOpen : undefined} />
          why this grouping
        </button>
        {rationaleOpen && (
          <input
            type="text"
            className={styles.rationaleInput}
            placeholder="Why this grouping…"
            value={rationaleDraft}
            onChange={(e) => setRationaleDraft(e.target.value)}
            onBlur={handleRationaleBlur}
          />
        )}
      </div>
    </div>
  );
}
