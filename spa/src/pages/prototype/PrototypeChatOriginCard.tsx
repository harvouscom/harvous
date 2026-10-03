import { useState } from 'react';
import Icon from '@/components/react/Icon';
import type { NoteChatOrigin } from '../../hooks/queries/useNote';
import '../../styles/prototype-chat-origin.css';

/**
 * The card at the top of a note an AI app started through the Connector (`start_note`).
 *
 * Chrome, not paper: it sits above the page in a chip surface with its own label, so the AI's
 * words never read as the person's. The note body under it starts empty — the writing stays
 * theirs. Passages are real pills, tappable into the reader like any other.
 */
export type ChatOrigin = NoteChatOrigin;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PrototypeChatOriginCard({
  origin,
  onOpenPassage,
  onRemove,
}: {
  origin: ChatOrigin;
  onOpenPassage?: (reference: string) => void;
  onRemove?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const date = new Date(origin.createdAt);
  const when = `${MONTHS[date.getMonth()]} ${date.getDate()}`;

  return (
    <aside className="proto-chat-origin" aria-label={`From your ${origin.appName} chat`}>
      <header className="proto-chat-origin__head">
        <span className="proto-chat-origin__label pds-caption">
          <Icon name="puzzle-piece" size={11} aria-hidden />
          From your {origin.appName} chat · {when}
        </span>
        {onRemove ? (
          <span className="proto-chat-origin__menu">
            <button
              type="button"
              className="proto-chat-origin__more"
              aria-label="Card options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name="ellipsis" size={12} aria-hidden />
            </button>
            {menuOpen ? (
              <div className="proto-chat-origin__popover" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="proto-chat-origin__menu-item pds-caption"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                >
                  Remove card
                </button>
              </div>
            ) : null}
          </span>
        ) : null}
      </header>

      <p className="proto-chat-origin__summary">{origin.summary}</p>

      {origin.passages.length > 0 ? (
        <div className="proto-chat-origin__passages">
          {origin.passages.map((ref) => (
            <button
              key={ref}
              type="button"
              className="proto-chat-origin__pill"
              data-scripture-reference={ref}
              onClick={() => onOpenPassage?.(ref)}
            >
              {ref}
            </button>
          ))}
        </div>
      ) : null}

      {origin.question ? (
        <p className="proto-chat-origin__question">
          <span className="proto-chat-origin__question-label pds-caption">Still wondering</span>
          {origin.question}
        </p>
      ) : null}
    </aside>
  );
}
