/**
 * The import surface's illustration: a spread of the notes you already have,
 * sitting in the formats they're already in.
 *
 * It shows the *before*, not the after — the promise is that this pile is what
 * you drop, so the cards are the files as they exist on your disk today.
 *
 * Four cards, and only extensions people say out loud. `.enex` and `.html` are
 * both supported, but nobody describes their notes as "an HTML" — they say Apple
 * Notes or Evernote, which the copy handles. A label the viewer has to decode
 * costs more than the card earns, so those two are named in words instead. App
 * logos are deliberately absent; those marks aren't ours to draw.
 *
 * Four also means no middle card, so the hand stays symmetrical and nothing has
 * to be singled out on hover.
 */
/**
 * Portrait, like the paper they stand for — a document is taller than it is wide,
 * and landscape made them read as index cards. Six ragged lines rather than three,
 * because a page-shaped sheet with three short rules looks like an empty one.
 */
const SOURCE_CARDS = [
  { format: 'csv', position: 'far-left', lines: [74, 52, 82, 60, 78, 44] },
  { format: 'pdf', position: 'left', lines: [86, 60, 72, 90, 54, 68] },
  { format: 'docx', position: 'right', lines: [80, 58, 88, 66, 74, 50] },
  { format: 'md', position: 'far-right', lines: [84, 64, 76, 56, 86, 62] },
] as const;

/**
 * `gathered` renders the pile the drop zone collects into, standing on its own —
 * the summary uses it to finish the sentence the drop zone started: scattered,
 * gathering, one stack. Same component and same geometry, so the two can't drift.
 */
export default function ImportSourceFan({ gathered = false }: { gathered?: boolean }) {
  return (
    <div
      className={`proto-import-fan${gathered ? ' proto-import-fan--gathered' : ''}`}
      aria-hidden
    >
      {SOURCE_CARDS.map((card) => (
        <div
          key={card.format}
          className={`proto-import-fan__card proto-import-fan__card--${card.position}`}
        >
          <span className="proto-import-fan__tag">{card.format}</span>
          <span className="proto-import-fan__rules">
            {card.lines.map((width, i) => (
              <span key={i} className="proto-import-fan__rule" style={{ width: `${width}%` }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
