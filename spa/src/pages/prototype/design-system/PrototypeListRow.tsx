import type { ReactNode } from 'react';

export type PrototypeListRowVariant = 'sidebarCompact' | 'conversation';

type Props = {
  title: ReactNode;
  preview?: ReactNode;
  timestamp?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  keyboardFocus?: boolean;
  variant?: PrototypeListRowVariant;
  href?: string;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
};

/**
 * Canonical list row chrome — mirrors native `HarvousListRow` / `NoteFeedRow`.
 * Uses existing `.proto-note-row*` styles so sidebar density stays consistent.
 */
export default function PrototypeListRow({
  title,
  preview,
  timestamp,
  leading,
  trailing,
  active = false,
  keyboardFocus = false,
  variant = 'sidebarCompact',
  href,
  onClick,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const itemClass = ['proto-note-row-item', className].filter(Boolean).join(' ');
  const isConversation = variant === 'conversation';

  const main = (
    <>
      <div className="proto-note-row__title-line">
        {leading}
        <span className="proto-note-row__title-text pds-list-title">{title}</span>
        {isConversation && timestamp ? (
          <span className="pds-list-timestamp pds-list-row__trailing-time">{timestamp}</span>
        ) : null}
      </div>
      {(preview || (!isConversation && timestamp)) && (
        <div className="proto-note-row__preview pds-list-preview">
          {!isConversation && timestamp ? <span className="pds-list-timestamp">{timestamp}</span> : null}
          {!isConversation && timestamp && preview ? '  ' : null}
          {preview}
        </div>
      )}
    </>
  );

  return (
    <li className={itemClass} data-active={active ? 'true' : undefined} data-keyboard-focus={keyboardFocus ? 'true' : undefined}>
      {href ? (
        <a className="proto-note-row__main" href={href} aria-label={ariaLabel} onClick={onClick}>
          {main}
        </a>
      ) : (
        <button type="button" className="proto-note-row__main" aria-label={ariaLabel} onClick={onClick}>
          {main}
        </button>
      )}
      {trailing ? <div className="proto-note-row__menu">{trailing}</div> : null}
    </li>
  );
}
