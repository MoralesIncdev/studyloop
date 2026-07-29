// F7 concept ticker: the expanded full-card side overlay, opened by clicking a
// compact ConceptCard's body (from the ticker) or a row in the Concepts dock tab.
// Renders the concept body as markdown-lite (headings/bold/paragraphs) via
// lib/conceptFormat.ts — no external markdown lib per SPEC quality bar.
import { useEffect, useState } from "react";
import { parseConceptBody, type ConceptInline } from "../lib/conceptFormat";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import type { ConceptCard as ConceptCardType } from "../lib/types";
import styles from "./ConceptOverlay.module.css";

/** Matches --duration-panel (240ms), the panel's own CSS exit-animation length. */
const EXIT_DURATION_MS = 240;

interface Props {
  card: ConceptCardType | null;
  onClose: () => void;
}

function Inlines({ inlines }: { inlines: ConceptInline[] }): JSX.Element {
  return (
    <>
      {inlines.map((inline, i) => (inline.bold ? <strong key={i}>{inline.text}</strong> : <span key={i}>{inline.text}</span>))}
    </>
  );
}

export function ConceptOverlay({ card, onClose }: Props): JSX.Element | null {
  // codex P0-3: the caller nulls `card` synchronously on close — buffer the
  // last one so the panel keeps its content for the whole slide-out.
  const [displayCard, setDisplayCard] = useState(card);
  useEffect(() => {
    if (card) setDisplayCard(card);
  }, [card]);

  if (!displayCard) return null;
  const blocks = parseConceptBody(displayCard.body);

  return (
    <ModalShell
      open={card != null}
      onClose={onClose}
      exitDurationMs={EXIT_DURATION_MS}
      ariaLabel={displayCard.title}
      overlayClassName={styles.backdrop}
      cardClassName={styles.panel}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{displayCard.title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className={styles.body}>
        {blocks.length === 0 && <p className={styles.empty}>No details.</p>}
        {blocks.map((block, i) => {
          if (block.type === "heading") {
            const cls = block.level <= 2 ? styles.h2 : block.level === 3 ? styles.h3 : styles.h4;
            return (
              <p key={i} className={cls}>
                <Inlines inlines={block.inlines} />
              </p>
            );
          }
          return (
            <p key={i} className={styles.paragraph}>
              <Inlines inlines={block.inlines} />
            </p>
          );
        })}
      </div>
    </ModalShell>
  );
}
