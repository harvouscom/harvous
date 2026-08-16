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
import type { MouseEventHandler, ReactNode } from 'react';
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
      <span className="proto-list-panel__row-text">
        <span className="pds-list-title proto-list-panel__row-title">{title}</span>
        {metaItems.length > 0 ? (
          <span className="proto-caption proto-list-panel__row-meta">
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
