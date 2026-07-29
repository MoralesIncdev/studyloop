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
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { formatTimestamp } from "../lib/time";
import type { AnalysisUnit } from "../lib/types";
import styles from "./UnitProposalCard.module.css";

const UNIT_TYPE_LABEL: Record<AnalysisUnit["type"], string> = {
  CLAIM: "Claim",
  MECHANISM: "Mechanism",
  PROCEDURE: "Procedure",
  EXAMPLE: "Example",
  BOUNDARY: "Boundary",
};

interface Props {
  unit: AnalysisUnit;
}

export function UnitProposalCard({ unit }: Props): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const noviceMode = useStudyLoopStore((s) => s.currentProject?.noviceMode ?? false);
  const entry = useStudyLoopStore((s) => s.attestations[unit.id]);
  const attestUnit = useStudyLoopStore((s) => s.attestUnit);
  const saveUnitTake = useStudyLoopStore((s) => s.saveUnitTake);
  const saveUnitBody = useStudyLoopStore((s) => s.saveUnitBody);
  const dismissUnit = useStudyLoopStore((s) => s.dismissUnit);
  const clearUnitAttestation = useStudyLoopStore((s) => s.clearUnitAttestation);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);

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

  const generationSlot = (
    <div className={styles.generationSlot}>
      <textarea
        className={styles.takeInput}
        placeholder={noviceMode ? "Restate it in your own words — or skip" : "Define it / predict it in your own words — or skip"}
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
        {status === "attested" && (
          <span className={styles.statusBadge} title="Attested" aria-label="Attested">
            <Icon name="check" size={13} />
          </span>
        )}
        {status === "dismissed" && <span className={styles.statusBadge}>Dismissed</span>}
      </div>

      {!noviceMode && generationSlot}

      {revealed && !editing && (
        <div className={styles.body}>
          <p className={styles.summary}>{unit.summary}</p>
          <p className={styles.bodyText}>{entry?.userBody?.trim() || unit.body}</p>
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
