import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeHomeSection from './PrototypeHomeSection';
import { PLUS_BADGE_COPY } from './proto-review-copy';
import { useHistoryWindowStatus } from '../../hooks/queries/useHistoryWindowStatus';
import { LEAVING_ROW_META, leavingRowTitle } from '../../lib/history-window-copy';

/**
 * "Your study from Jul 2–5 leaves your history in 4 days" — the free window's soft landing.
 *
 * Shows only while something is actually in its last week of view (the grace band). Dismissing
 * puts this batch away: the key is the day the first item leaves, so the row comes back for
 * the *next* batch rather than never again — one quiet line per batch, not a standing ad.
 * Free accounts only; Plus has no window and guests no account, so both render nothing.
 */
const DISMISSED_KEY = 'harvous-history-leaving-dismissed';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export default function PrototypeHistoryLeavingSection() {
  const navigate = useNavigate();
  const { status } = useHistoryWindowStatus();
  const [dismissedFor, setDismissedFor] = useState(readDismissed);
  const leaving = status?.leavingSoon ?? null;
  const batchKey = leaving ? leaving.firstLeavesAt.slice(0, 10) : null;

  const dismiss = useCallback(() => {
    if (!batchKey) return;
    setDismissedFor(batchKey);
    try {
      window.localStorage.setItem(DISMISSED_KEY, batchKey);
    } catch {
      // The state above still hides it for this session.
    }
  }, [batchKey]);

  if (!leaving || dismissedFor === batchKey) return null;

  return (
    <PrototypeHomeSection title="History">
      <PrototypeHomeRow
        icon="clock-rotate-left"
        title={leavingRowTitle(leaving)}
        meta={[LEAVING_ROW_META]}
        onClick={() => void navigate({ to: '/upgrade' })}
        trailing={
          <span className="proto-review-section__plus">
            <span className="proto-menu-item__badge">{PLUS_BADGE_COPY}</span>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Hide this"
              onClick={(event) => {
                event.stopPropagation();
                dismiss();
              }}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          </span>
        }
      />
    </PrototypeHomeSection>
  );
}
