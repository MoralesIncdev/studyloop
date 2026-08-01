// Console slice B (design/mockups/video-console/index.html lines 335-348,
// 700-708): a collapsible strip under the transport listing concept spans as
// chips — time + name, a checkmark when attested, the one containing the
// playhead highlighted. Collapsed by default; the transport's chapters
// button toggles it (PlayerControls).
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import styles from "./ChaptersRail.module.css";

export interface Chapter {
  id: string;
  t: number;
  end: number;
  title: string;
  attested: boolean;
}

interface Props {
  chapters: Chapter[];
  currentTime: number;
  open: boolean;
  onSeek: (t: number) => void;
}

export function ChaptersRail({ chapters, currentTime, open, onSeek }: Props): JSX.Element | null {
  if (chapters.length === 0) return null;
  return (
    <div className={`${styles.chapters} ${open ? styles.open : ""}`}>
      <div className={styles.rail}>
        {chapters.map((c) => {
          const now = currentTime >= c.t && currentTime <= c.end;
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.chapter} ${now ? styles.now : ""}`}
              onClick={() => onSeek(c.t)}
              aria-current={now}
            >
              <span className={styles.time}>{formatTimestamp(c.t)}</span>
              <span className={styles.name}>
                <span className={`${styles.status} ${c.attested ? styles.attested : ""}`}>
                  {c.attested && <Icon name="check" size={9} />}
                </span>
                {c.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
