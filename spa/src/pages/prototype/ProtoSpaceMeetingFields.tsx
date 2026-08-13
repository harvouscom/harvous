/**
 * When and where a room meets — the create sheet and Space settings share it.
 *
 * Extracted at the point the second field arrived: the day chips were already
 * written twice, and adding a kind toggle beside them would have made it four
 * copies of the same two controls drifting in two files.
 *
 * Everything here is optional. A space with no rhythm and no kind is legal and
 * is what every space created before these fields existed still looks like.
 */
import Icon from '@/components/react/Icon';
import {
  MEETING_KINDS,
  MEETING_KIND_LABELS,
  meetingKindHasUrl,
  type MeetingKind,
} from '@/utils/space-meeting-rhythm';

/** Sunday first, matching `Date.getDay()` and `Spaces.meetingDay`. */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface ProtoSpaceMeetingFieldsProps {
  meetingDay: number | null;
  meetingTime: string;
  meetingKind: MeetingKind | null;
  meetingUrl: string;
  onMeetingDayChange: (day: number | null) => void;
  onMeetingTimeChange: (time: string) => void;
  onMeetingKindChange: (kind: MeetingKind | null) => void;
  onMeetingUrlChange: (url: string) => void;
  /** Labelling element id — the create sheet supplies its own inline label. */
  labelledBy: string;
  /**
   * `center` for the create dialog, whose whole card is centred; `start` for
   * settings, where every other field is a left-aligned label over a control
   * and a centred block was the one thing floating in the middle.
   */
  align?: 'center' | 'start';
}

export default function ProtoSpaceMeetingFields({
  meetingDay,
  meetingTime,
  meetingKind,
  meetingUrl,
  onMeetingDayChange,
  onMeetingTimeChange,
  onMeetingKindChange,
  onMeetingUrlChange,
  labelledBy,
  align = 'center',
}: ProtoSpaceMeetingFieldsProps) {
  return (
    <div
      className={`proto-create-shared-space__rhythm${
        align === 'start' ? ' proto-create-shared-space__rhythm--start' : ''
      }`}
    >
      <div className="proto-create-shared-space__rhythm-days" role="radiogroup" aria-labelledby={labelledBy}>
        {WEEKDAY_NAMES.map((name, day) => {
          const selected = meetingDay === day;
          return (
            <button
              key={day}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              className={`proto-create-shared-space__rhythm-day${
                selected ? ' proto-create-shared-space__rhythm-day--selected' : ''
              }`}
              /* Tapping the chosen day again clears the rhythm — the only way
                 back to "we don't meet on a schedule" once you have picked. */
              onClick={() => {
                onMeetingDayChange(selected ? null : day);
                if (selected) onMeetingTimeChange('');
              }}
            >
              {name.charAt(0)}
            </button>
          );
        })}
      </div>

      {meetingDay !== null ? (
        <input
          type="time"
          className="proto-create-shared-space__rhythm-time"
          value={meetingTime}
          aria-label="Meeting time"
          onChange={(e) => onMeetingTimeChange(e.target.value)}
        />
      ) : null}

      {/* Its own row: where is a different question from when, and a room can
          answer either one without the other. */}
      <div className="proto-create-shared-space__place" role="radiogroup" aria-label="Where it meets">
        {MEETING_KINDS.map((kind) => {
          const selected = meetingKind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`proto-create-shared-space__place-chip${
                selected ? ' proto-create-shared-space__place-chip--selected' : ''
              }`}
              onClick={() => {
                const next = selected ? null : kind;
                onMeetingKindChange(next);
                // A link the room can no longer carry goes with it.
                if (!meetingKindHasUrl(next)) onMeetingUrlChange('');
              }}
            >
              {MEETING_KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      {meetingKindHasUrl(meetingKind) ? (
        <div className="proto-create-shared-space__place-link">
          <Icon name="link" size={11} aria-hidden />
          <input
            type="url"
            className="proto-create-shared-space__place-url"
            value={meetingUrl}
            placeholder="https://meet.google.com/…"
            aria-label="Meeting link"
            onChange={(e) => onMeetingUrlChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
