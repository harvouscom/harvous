/**
 * Today's passage as a row in Suggested.
 *
 * Its shape once the card at the top of Activity has been acted on (see
 * `PrototypeDailyPassageCard`), and its only shape when there are no words to show — the card
 * needs the passage text, and a failed lookup should cost the words, not the passage. The
 * actions are the card's (`useDailyPassageActions`), at row size: the row opens the reader,
 * the pencil writes about it, the X is "Not today".
 */
import PrototypeHomeRow from './PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { VotdToday } from '../../lib/votd-today';
import { useDailyPassageActions } from './use-daily-passage-actions';

type Props = {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
};

export default function PrototypeDailyPassagePill({ homeSpaceId, notes, votd }: Props) {
  const { hidden, openInReader, takeNote, dismiss } = useDailyPassageActions({
    homeSpaceId,
    notes,
    votd,
  });

  if (!homeSpaceId || hidden) return null;

  return (
    <div id="todays-passage">
      <PrototypeHomeRow
        icon="scroll"
        title={votd.reference}
        meta={['Today\u2019s passage']}
        aria-label="Read today's passage"
        onClick={openInReader}
        trailing={
          <>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Add passage to notes"
              title="Add passage to notes"
              onClick={takeNote}
            >
              <Icon name="pen-to-square" size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Dismiss today's passage"
              title="Not today"
              onClick={dismiss}
            >
              <Icon name="xmark" size={12} aria-hidden />
            </button>
          </>
        }
      />
    </div>
  );
}
