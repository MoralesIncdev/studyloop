// Ryan's live-use fix (2026-08-01): the self-test pane sealed the unit body
// and showed only "Sealed · attempt first" — there was no actual question to
// attempt. This builds one locally from the unit's type + label. Label only:
// summary/body would leak the answer through the prompt.
import type { AnalysisUnit } from "./types";

type PromptableUnit = Pick<AnalysisUnit, "type" | "label"> & {
  members?: AnalysisUnit["members"];
};

export function testPrompt(unit: PromptableUnit): string {
  const label = unit.label;
  switch (unit.type) {
    case "CLUSTER": {
      const n = unit.members?.length ?? 0;
      return n > 1
        ? `From memory, list all ${n} — ${label}`
        : `From memory, list everything under: ${label}`;
    }
    case "PROCEDURE":
      return `From memory, walk through the steps: ${label}`;
    case "MECHANISM":
      return `From memory, explain how it works: ${label}`;
    case "BOUNDARY":
      return `From memory — where does this stop applying: ${label}?`;
    case "CONTRAINDICATION":
      return `From memory — when must this NOT be used: ${label}?`;
    case "DOSAGE":
      return `Exact values matter — state it precisely: ${label}`;
    case "LAB_VALUE":
      return `Exact values matter — state the range: ${label}`;
    case "PRIORITIZATION":
      return `From memory — what comes first here, and why: ${label}?`;
    case "EXAMPLE":
      return `From memory, describe the example: ${label}`;
    default:
      return `In your own words — what is "${label}", and why does it matter?`;
  }
}
