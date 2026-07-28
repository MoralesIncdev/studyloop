// F7 concept ticker: the expanded full-card side overlay, opened by clicking a
// compact ConceptCard's body (from the ticker) or a row in the Concepts dock tab.
// Renders the concept body as markdown-lite (headings/bold/paragraphs) via
// lib/conceptFormat.ts — no external markdown lib per SPEC quality bar.
import { useEffect } from "react";
import { parseConceptBody, type ConceptInline } from "../lib/conceptFormat";
import type { ConceptCard as ConceptCardType } from "../lib/types";
import styles from "./ConceptOverlay.module.css";

interface Props {
  card: ConceptCardType;
  onClose: () => void;
}

function Inlines({ inlines }: { inlines: ConceptInline[] }): JSX.Element {
  return (
    <>
      {inlines.map((inline, i) => (inline.bold ? <strong key={i}>{inline.text}</strong> : <span key={i}>{inline.text}</span>))}
    </>
  );
}

export function ConceptOverlay({ card, onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const blocks = parseConceptBody(card.body);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{card.title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ✕
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
      </div>
    </div>
  );
}
