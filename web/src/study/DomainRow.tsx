// V3-B B1/B2: the editable domain chip ("router-classified ... editable
// chip near the channel row; PATCH `domain`" — SPEC B1) and the per-project
// novice-mode toggle ("Settings row on project header menu" — SPEC B2,
// implemented here as a compact row rather than a separate menu, since
// StudyView has no overflow-menu component to hang it off of yet).
import { useStudyLoopStore } from "../state/store";
import type { Domain } from "../lib/types";
import styles from "./DomainRow.module.css";

const DOMAIN_LABEL: Record<Domain, string> = {
  biology: "Biology",
  history: "History",
  music: "Music",
  physical_skill: "Physical skill",
  generic: "Generic",
};

const DOMAIN_OPTIONS: Domain[] = ["biology", "history", "music", "physical_skill", "generic"];

export function DomainRow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);

  if (!currentProject) return null;
  const { domain, noviceMode } = currentProject;

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
            {DOMAIN_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
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
