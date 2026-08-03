// V3-B B1/B2: the editable domain chip ("router-classified ... editable
// chip near the channel row; PATCH `domain`" — SPEC B1) and the per-project
// novice-mode toggle ("Settings row on project header menu" — SPEC B2,
// implemented here as a compact row rather than a separate menu, since
// StudyView has no overflow-menu component to hang it off of yet).
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStudyLoopStore } from "../state/store";
import type { Domain, LensSummary } from "../lib/types";
import styles from "./DomainRow.module.css";

// Phase 5 "Lens registry": a hardcoded mirror of the shipped
// server/lenses/*.json ids (same "plain interface, not a cross-workspace
// import" convention lib/types.ts's header comment documents), used as an
// instant-render fallback label set before GET /api/lenses (Phase 9) comes
// back — and still the label source for these six even after it does,
// since the fetched registry's `label` for them is identical anyway.
const DOMAIN_LABEL: Partial<Record<Domain, string>> = {
  biology: "Biology",
  history: "History",
  music: "Music",
  physical_skill: "Physical skill",
  clinical: "Clinical / Nursing",
  generic: "Generic",
};

const DOMAIN_OPTIONS: Domain[] = ["biology", "history", "music", "physical_skill", "clinical", "generic"];

export function DomainRow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);
  // Phase 9 "Lens autogeneration for unknown subjects": fetched once so (a)
  // a user-authored or router-generated lens (not one of the hardcoded six
  // above) still gets a real label + a selectable option here, and (b) a
  // generated one's "auto-created lens — review it" note can be shown.
  const [lenses, setLenses] = useState<LensSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getLenses()
      .then((res) => {
        if (!cancelled) setLenses(res.lenses);
      })
      .catch(() => {
        // Best-effort — the hardcoded DOMAIN_OPTIONS/DOMAIN_LABEL fallback
        // above still renders a usable (if incomplete) chip.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const domain = currentProject?.domain;

  // Every id the dropdown should offer: the hardcoded six, whatever the
  // fetched registry actually has (covers a user-authored/generated lens),
  // plus the project's own current domain (so a generated lens the fetch
  // hasn't completed yet, or a stale/unknown id, still renders as a
  // selectable — not silently blank — option).
  const options = useMemo(() => {
    const ids = new Set<Domain>(DOMAIN_OPTIONS);
    for (const l of lenses) ids.add(l.id);
    if (domain) ids.add(domain);
    return [...ids];
  }, [lenses, domain]);

  const activeLens = useMemo(() => lenses.find((l) => l.id === domain), [lenses, domain]);

  if (!currentProject) return null;
  const { noviceMode } = currentProject;

  return (
    <div className={styles.row}>
      {domain && (
        <label className={styles.domainChip} title="Subject-matter domain — classified once per analysis, editable">
          <select
            className={styles.domainSelect}
            value={domain}
            onChange={(e) => void patchCurrentProject({ domain: e.target.value as Domain })}
            aria-label="Domain"
          >
            {options.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d] ?? lenses.find((l) => l.id === d)?.label ?? d}
              </option>
            ))}
          </select>
        </label>
      )}
      {activeLens?.origin === "generated" && (
        <span
          className={styles.generatedNote}
          title={activeLens.path ? `Auto-created lens file: ${activeLens.path}` : "Auto-created lens — review it"}
        >
          auto-created lens for {activeLens.label} — review it
        </span>
      )}
      <label className={styles.noviceToggle} title="Worked example first, then restate it in your own words">
        <input
          type="checkbox"
          checked={Boolean(noviceMode)}
          onChange={(e) => void patchCurrentProject({ noviceMode: e.target.checked })}
        />
        I&rsquo;m new to this subject
      </label>
    </div>
  );
}
