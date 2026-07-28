// Renders the parsed blocks from lib/markdownLite.ts as JSX for the F10
// compile preview modal. Pure rendering only — all parsing logic (and its
// unit tests) lives in lib/markdownLite.ts.
import { parseMarkdownLite, normalizeShotSrc, type InlineSegment, type MdBlock } from "../lib/markdownLite";
import { api } from "../lib/api";
import styles from "./MarkdownPreview.module.css";

function Inline({ segments, onSeek }: { segments: InlineSegment[]; onSeek: (t: number) => void }): JSX.Element {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "bold") return <strong key={i}>{seg.value}</strong>;
        if (seg.type === "link") {
          const seekMatch = /^#t=(\d+(?:\.\d+)?)$/.exec(seg.href);
          if (seekMatch) {
            const t = Number(seekMatch[1]);
            return (
              <button type="button" key={i} className={styles.seekLink} onClick={() => onSeek(t)}>
                {seg.text}
              </button>
            );
          }
          return (
            <a key={i} href={seg.href} target="_blank" rel="noreferrer" className={styles.link}>
              {seg.text}
            </a>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </>
  );
}

interface Props {
  markdown: string;
  projectId: string;
  onSeek: (t: number) => void;
}

export function MarkdownPreview({ markdown, projectId, onSeek }: Props): JSX.Element {
  const blocks = parseMarkdownLite(markdown);

  return (
    <div className={styles.doc}>
      {blocks.map((block: MdBlock, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${block.level}` as const) as "h1" | "h2" | "h3";
            return (
              <Tag key={i} className={styles[`h${block.level}`]}>
                {block.text}
              </Tag>
            );
          }
          case "hr":
            return <hr key={i} className={styles.hr} />;
          case "image":
            return (
              <img
                key={i}
                className={styles.image}
                src={api.shotUrl(projectId, normalizeShotSrc(block.src))}
                alt={block.alt}
              />
            );
          case "list":
            return (
              <ul key={i} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={j} className={styles.listItem}>
                    <div>
                      <Inline segments={item.inline} onSeek={onSeek} />
                    </div>
                    {item.image && (
                      <img
                        className={styles.image}
                        src={api.shotUrl(projectId, normalizeShotSrc(item.image.src))}
                        alt={item.image.alt}
                      />
                    )}
                  </li>
                ))}
              </ul>
            );
          case "paragraph":
          default:
            return (
              <p key={i} className={styles.paragraph}>
                <Inline segments={block.inline} onSeek={onSeek} />
              </p>
            );
        }
      })}
    </div>
  );
}
