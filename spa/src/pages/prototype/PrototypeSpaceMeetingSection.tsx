/**
 * "Meeting" — when and where a room gathers, on its own page.
 *
 * It started inside Space settings and did not belong there: that panel is the
 * room's identity (name, description, colour, cover), its own hub row says as
 * much in those words, and a day/time/place block sat in the middle of it
 * answering a different question. Here it is one concern per page, like People
 * and Invite links beside it, and — the point — entirely optional. A room that
 * never opens this page is a room with no rhythm, which is most of them.
 *
 * Saving goes through the same space-update route as settings, so it has to
 * carry `title`, `color` and `coverVariant`: the route rewrites the cover from
 * colour + variant on every write, and sending a default variant here would
 * quietly reset a cover the owner chose on the other page.
 */
import { useEffect, useState } from 'react';
import { resolveSpaceCoverVariant } from '@/utils/space-cover-presets';
import type { SpaceCoverBg } from '@/utils/space-cover';
import { meetingKindHasUrl, type MeetingKind } from '@/utils/space-meeting-rhythm';
import { useUpdateSharedSpace } from '../../hooks/mutations/useUpdateSharedSpace';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import ProtoSpaceMeetingFields from './ProtoSpaceMeetingFields';

export interface PrototypeSpaceMeetingSectionProps {
  spaceId: string;
  /** Carried through the shared update route, not editable here. */
  spaceTitle: string;
  spaceColor?: string | null;
  spaceCoverBgLight?: SpaceCoverBg | null;
  initialMeetingDay?: number | null;
  initialMeetingTime?: string | null;
  initialMeetingKind?: MeetingKind | null;
  initialMeetingUrl?: string | null;
}

export default function PrototypeSpaceMeetingSection({
  spaceId,
  spaceTitle,
  spaceColor,
  spaceCoverBgLight,
  initialMeetingDay = null,
  initialMeetingTime = null,
  initialMeetingKind = null,
  initialMeetingUrl = null,
}: PrototypeSpaceMeetingSectionProps) {
  const [meetingDay, setMeetingDay] = useState<number | null>(initialMeetingDay ?? null);
  const [meetingTime, setMeetingTime] = useState(initialMeetingTime ?? '');
  const [meetingKind, setMeetingKind] = useState<MeetingKind | null>(initialMeetingKind ?? null);
  const [meetingUrl, setMeetingUrl] = useState(initialMeetingUrl ?? '');
  const updateSpace = useUpdateSharedSpace();

  useEffect(() => {
    setMeetingDay(initialMeetingDay ?? null);
    setMeetingTime(initialMeetingTime ?? '');
    setMeetingKind(initialMeetingKind ?? null);
    setMeetingUrl(initialMeetingUrl ?? '');
  }, [initialMeetingDay, initialMeetingTime, initialMeetingKind, initialMeetingUrl, spaceId]);

  const normalizedUrl = meetingKindHasUrl(meetingKind) ? meetingUrl.trim() || null : null;
  const dirty =
    meetingDay !== (initialMeetingDay ?? null) ||
    (meetingTime || null) !== (initialMeetingTime || null) ||
    meetingKind !== (initialMeetingKind ?? null) ||
    normalizedUrl !== (initialMeetingUrl || null);

  function save() {
    updateSpace.mutate(
      {
        spaceId,
        title: spaceTitle,
        color: spaceColor || 'blue',
        // Resolved from the stored cover, never defaulted — see the note above.
        coverVariant: resolveSpaceCoverVariant(spaceCoverBgLight, (spaceColor || 'blue').toLowerCase()),
        meetingDay,
        meetingTime: meetingDay === null ? null : meetingTime || null,
        meetingKind,
        meetingUrl: normalizedUrl,
      },
      {
        onSuccess: () => toast.success('Saved'),
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update';
          toast.error(msg);
        },
      },
    );
  }

  return (
    <div className="proto-shared-space-settings">
      <div className="proto-shared-space-settings__field">
        <label id="proto-space-meeting-day">When</label>
        <ProtoSpaceMeetingFields
          meetingDay={meetingDay}
          meetingTime={meetingTime}
          meetingKind={meetingKind}
          meetingUrl={meetingUrl}
          onMeetingDayChange={setMeetingDay}
          onMeetingTimeChange={setMeetingTime}
          onMeetingKindChange={setMeetingKind}
          onMeetingUrlChange={setMeetingUrl}
          labelledBy="proto-space-meeting-day"
          align="start"
        />
      </div>

      <button
        type="button"
        className="proto-settings-btn"
        disabled={!dirty || updateSpace.isPending}
        onClick={save}
      >
        {updateSpace.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
