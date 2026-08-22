/**
 * One row of a Home group — the church hub's Tools anatomy, shared.
 *
 * A group on Home is one glass panel with hairline-separated rows, and every row is the
 * same thing: a small tinted icon block, a title over a quieter meta line, and either a
 * chevron or one trailing control. This used to be six hand-rolled cards that agreed with
 * each other only by accident (and by the time it was noticed, did not — different icon
 * sizes, an eyebrow on some, a preview on others). Building them all from one component is
 * what makes "exactly the church chrome" a property rather than an aspiration.
 *
 * `trailing` changes the row's structure, not just its content: a button cannot nest in a
 * button, so a row with a trailing control becomes a plain container whose tappable body is
 * `__row-main`. Callers do not have to know that — they pass `trailing` and get the right
 * shape.
 *
 * Meta is a list on purpose. What used to be an eyebrow above the title ("Keep reading",
 * "This Sunday's sermon") is now the first meta item, joined to the rest by the same
 * separator the church rows use — so nothing is lost, and the title stays the specific
 * thing the row is about, as it is in the church hub's Following list.
 */
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';

export type HomeRowProps = {
  icon: IconName;
  /**
   * A ready-made block in place of the neutral one — a space's coloured tile, when the row
   * stands for something that belongs to a space. It replaces the icon box entirely; the
   * neutral tint would otherwise show as a ring around the colour.
   */
  iconNode?: ReactNode;
  title: ReactNode;
  /** Meta items; falsy ones are skipped so callers can pass optionals straight through. */
  meta?: ReadonlyArray<ReactNode | null | undefined | false | ''>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  /** A control on the right in place of the chevron — a dismiss, an action. */
  trailing?: ReactNode;
  /** Suppress the chevron on a plain row (a status line, say). */
  chevron?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  title_attr?: string;
};

export function homeRowMetaItems(items: HomeRowProps['meta']): ReactNode[] {
  return (items ?? []).filter((m): m is ReactNode => Boolean(m));
}

/**
 * Roughly how many characters a label is, for pacing the hover marquee.
 *
 * The marquee's duration scales off this so that long labels scroll at the same speed as
 * short ones instead of racing to finish in a fixed five seconds (see `--proto-marquee-chars`
 * in prototype-components.css). Only strings and numbers are counted — a caller that passes
 * elements gets 0 and the CSS default pace, which is the old behaviour and fine.
 */
export function marqueeCharCount(node: ReactNode): number {
  if (typeof node === 'string') return node.length;
  if (typeof node === 'number') return String(node).length;
  if (Array.isArray(node)) return node.reduce<number>((n, child) => n + marqueeCharCount(child), 0);
  return 0;
}

/**
 * Below this, a label is assumed to fit and gets no edge fade at all.
 *
 * Mirrors the subtraction in `--proto-marquee-fade` (prototype-components.css). Kept as a named
 * constant on this side because the two have to agree: if CSS says a 20-character label fades 0px
 * while JS still hands it a mask, the mask is a compositing layer bought for nothing.
 */
export const MARQUEE_FADE_MIN_CHARS = 24;

/**
 * `style` carrying the character count, or nothing when the text could not be read.
 *
 * Sets the fade count as well as the pacing one. They are separate properties because they fail
 * differently when unset: an unpaced marquee runs at the 4s floor, which is fine, while an
 * unmeasured fade softens text nothing is hiding. So the fade defaults to off and every caller
 * that can measure its text opts in here.
 *
 * Exported so other marquee surfaces can adopt it rather than re-deriving the pair — for a long
 * time this row was the only caller, and every other marquee faded on hover for no reason.
 */
export function marqueePace(count: number): CSSProperties | undefined {
  if (count <= 0) return undefined;
  return {
    '--proto-marquee-chars': count,
    '--proto-marquee-fade-chars': count,
    /*
     * Drop the mask outright for a label that fits, rather than leaving a zero-width one.
     *
     * A 0px fade already looks like no fade — its gradient stops land on top of each other — but
     * `mask-image` still promotes the element to its own compositing layer, and text on a
     * composited layer can lose subpixel antialiasing. That reads as a faint haze along the label
     * on hover: not the gradient it was reported as, but a real artefact in the same place, and
     * the reason "it still looks wrong" survived the arithmetic being correct.
     *
     * The threshold is `MARQUEE_FADE_MIN_CHARS`, the same number the CSS clamp subtracts, so the
     * two cannot disagree about which labels fade.
     */
    ...(count > MARQUEE_FADE_MIN_CHARS ? null : { '--proto-marquee-mask': 'none' }),
  } as CSSProperties;
}

export default function PrototypeHomeRow({
  icon,
  iconNode,
  title,
  meta,
  onClick,
  onMouseEnter,
  onFocus,
  trailing,
  chevron = true,
  disabled,
  'aria-label': ariaLabel,
  title_attr,
}: HomeRowProps) {
  const metaItems = homeRowMetaItems(meta);
  const titleChars = marqueeCharCount(title);
  // The separators are rendered between items, so they count toward what has to scroll past —
  // two characters each ("·" plus its spacing).
  const metaChars = marqueeCharCount(metaItems) + Math.max(0, metaItems.length - 1) * 2;

  const body = (
    <>
      {iconNode ? (
        <span className="proto-list-panel__row-icon proto-list-panel__row-icon--tile" aria-hidden>
          {iconNode}
        </span>
      ) : (
        <span className="proto-list-panel__row-icon" aria-hidden>
          <Icon name={icon} size={13} />
        </span>
      )}
      {/* Both lines opt into the hover marquee, the same way the church rows do: the title
          wraps its text in a span (`proto-marquee`), and the meta — a composed expression
          whose parts come from the caller — moves itself (`proto-marquee-self`) inside
          `__row-text`, which is already the clipping box. A row is 260px wide on Home and
          most titles fit; the ones that do not are exactly the ones worth reading. */}
      {/* The column fades once for both lines, so it takes the longer of the two counts —
          whichever line overflows furthest is the one the fade has to cover. */}
      <span
        className="proto-list-panel__row-text"
        style={marqueePace(Math.max(titleChars, metaChars))}
      >
        <span
          className="pds-list-title proto-list-panel__row-title proto-marquee"
          style={marqueePace(titleChars)}
        >
          <span>{title}</span>
        </span>
        {metaItems.length > 0 ? (
          <span
            className="proto-caption proto-list-panel__row-meta proto-marquee-self"
            style={marqueePace(metaChars)}
          >
            {metaItems.map((item, i) => (
              <span key={i} className="proto-home-row__meta-item">
                {i > 0 ? <span className="proto-home-row__meta-sep" aria-hidden>·</span> : null}
                {item}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {chevron && !trailing ? (
        <span className="proto-list-panel__row-chevron" aria-hidden>
          <Icon name="caret-right" size={11} />
        </span>
      ) : null}
    </>
  );

  if (trailing) {
    return (
      <div className="proto-list-panel__row">
        <button
          type="button"
          className="proto-list-panel__row-main"
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onFocus={onFocus}
          disabled={disabled}
          aria-label={ariaLabel}
          title={title_attr}
        >
          {body}
        </button>
        <span className="proto-list-panel__row-trailing">{trailing}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="proto-list-panel__row"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title_attr}
    >
      {body}
    </button>
  );
}
