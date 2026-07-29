// V3-B B2 "Attestation + reveal-gating" (SPEC): AI-extracted typed units
// (analysis.units — see lib/analysis.ts) render as PROPOSALS in the rail;
// the learner attests, edits, or dismisses each one, and that per-unit state
// is what actually gates whether the unit feeds review cards / compile
// concept sections (PEDAGOGY §1 "only attested/learner-touched material
// becomes review cards"). Kept dependency-free and side-effect-free (no fs),
// matching this codebase's "routes stay thin, lib/ holds the logic + tests"
// convention (see lib/review.ts, lib/analysisJobs.ts).
import { z } from "zod";

export const AttestationStatusSchema = z.enum(["attested", "dismissed"]);
export type AttestationStatus = z.infer<typeof AttestationStatusSchema>;

/**
 * SPEC's own shape is `{status: attested|dismissed, userTake?, userBody?, at}`
 * — `status` is written here as `.optional()` rather than required, which is
 * a deliberate widening: the learner can type a "your take" generation
 * attempt (the input above the reveal control) and have it saved WITHOUT
 * clicking the explicit Attest checkmark, and SPEC's own gating rule ("Only
 * attested units (or units with a userTake) feed review...") only makes
 * sense if that in-between state — a saved userTake with no status yet — is
 * representable. `status` becomes required-in-practice the moment the
 * learner clicks Attest or Dismiss.
 */
export const AttestationEntrySchema = z.object({
  status: AttestationStatusSchema.optional(),
  userTake: z.string().optional(),
  userBody: z.string().optional(),
  at: z.string(),
});
export type AttestationEntry = z.infer<typeof AttestationEntrySchema>;

/** `{[unitId]: AttestationEntry}` — one file per project, `<project>/attestations.json` (see lib/attestationStore.ts). */
export const AttestationsFileSchema = z.record(AttestationEntrySchema);
export type AttestationsFile = z.infer<typeof AttestationsFileSchema>;

export function emptyAttestations(): AttestationsFile {
  return {};
}

/**
 * SPEC B2: "Only attested units (or units with a userTake) feed review cards
 * + compile concept sections." A dismissed unit never feeds either surface
 * regardless of what else is on its entry (dismiss always wins); otherwise
 * an explicit "attested" status, or a non-empty userTake alone, is enough.
 */
export function isUnitFeedable(entry: AttestationEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.status === "dismissed") return false;
  if (entry.status === "attested") return true;
  return Boolean(entry.userTake?.trim());
}

/** Convenience: the subset of a unit id list that currently feeds review/compile — used by both routes/review.ts and lib/compileRenderer.ts's caller. */
export function feedableUnitIds(unitIds: readonly string[], attestations: AttestationsFile): Set<string> {
  return new Set(unitIds.filter((id) => isUnitFeedable(attestations[id])));
}

/** SPEC B3 "n/m attested" progress line — counts units with status exactly "attested" (a bare userTake without the explicit check doesn't count toward this number, only toward feedability). */
export function attestedCount(unitIds: readonly string[], attestations: AttestationsFile): number {
  return unitIds.filter((id) => attestations[id]?.status === "attested").length;
}
