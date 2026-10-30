/**
 * "Which service do you go to?" — asked once, where a fresh connect lands.
 *
 * Shares the slot the empty "From your church" feed leaves, with the ministry rows, and follows
 * their rules: rows you may act on, not a step you must clear. Ignoring them is a fine answer and
 * changes nothing. Once chosen (here or in Settings) the rows are gone; Settings is where it is
 * changed.
 *
 * What a choice does lives in church-service-choice.ts: This Sunday shows that service's time,
 * church notifications wait until it is over, and the ministries that meet during it come first.
 */
import Icon from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { formatServiceSlot } from '../../lib/church-services';
import { useChurchServiceChoice, useSetChurchServiceChoice } from '../../hooks/queries/useChurchServiceChoice';

/** A church with more services than this is answered in Settings, not on Home. */
const MAX_OFFERED = 4;

export default function PrototypeHomeServicePrompt() {
  const { data } = useChurchServiceChoice();
  const setChoice = useSetChurchServiceChoice();
  if (!data || data.choice || data.slots.length === 0 || data.slots.length > MAX_OFFERED) return null;

  return (
    <>
      {data.slots.map((slot) => (
        <PrototypeHomeRow
          key={`${slot.dayOfWeek}@${slot.startTime}`}
          icon="clock"
          title={formatServiceSlot(slot)}
          meta={['From your church', data.choiceStale ? 'Your old service isn’t listed' : 'Is this your service?']}
          chevron={false}
          trailing={
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`${formatServiceSlot(slot)} is my service`}
              disabled={setChoice.isPending}
              onClick={() => setChoice.mutate({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime })}
            >
              <Icon name="check" size={12} aria-hidden />
            </button>
          }
        />
      ))}
    </>
  );
}
