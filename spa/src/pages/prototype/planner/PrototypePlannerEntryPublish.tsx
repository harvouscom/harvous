/**
 * "Goes out Sun, Sep 27, 8:00 AM · Schedule" — a channel plan entry's note, sent on its date.
 *
 * A content entry already reaches the channel's followers as a Home card ("This Sunday: Romans
 * 8"). This is the step from that plan to the material: schedule the note linked to the entry,
 * and when it goes live it claims the entry, so the card shows it (docs/CHURCH_V2_ROADMAP.md §D).
 * The server derives the time — the entry's date at the church's 8:00 — so the planner and the
 * tick agree on the one clock that matters. Approval rules apply unchanged.
 */
import Icon from '@/components/react/Icon';
import {
  formatPublishAt,
  useChurchContentActions,
  useNoteChurchSubmissions,
} from '../../../hooks/queries/useChurchContent';

export default function PrototypePlannerEntryPublish({
  serviceId,
  noteId,
  channelSpaceId,
  orgId,
  hasDate,
}: {
  serviceId: string;
  noteId: string;
  channelSpaceId: string;
  orgId: string | null;
  hasDate: boolean;
}) {
  const query = useNoteChurchSubmissions(noteId);
  const actions = useChurchContentActions();
  const data = query.data;
  if (!data) return null;

  const live = data.liveChannelIds?.includes(channelSpaceId) ?? false;
  const open = data.submissions.find((s) => s.channelSpaceId === channelSpaceId) ?? null;
  const needsApproval = Boolean(orgId && data.approvalRequiredOrgIds.includes(orgId));

  const schedule = () =>
    actions.mutate(
      { type: 'submit', noteId, channelSpaceId, serviceId },
      {
        onSuccess: (response) =>
          window.toast?.success(
            response.status === 'published'
              ? 'Published'
              : response.status === 'in_review'
                ? 'Sent for approval'
                : 'Scheduled',
          ),
        onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not schedule it'),
      },
    );
  const withdraw = () =>
    open &&
    actions.mutate(
      { type: 'withdraw', submissionId: open.id },
      {
        onSuccess: () => window.toast?.success(open.status === 'in_review' ? 'Taken back' : 'Unscheduled'),
        onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not change it'),
      },
    );

  let line: string;
  let action: { label: string; run: () => void } | null = null;
  if (live) {
    line = 'Published in this channel';
  } else if (open?.status === 'scheduled') {
    line = `Goes out ${formatPublishAt(open.publishAt)}`;
    action = { label: 'Unschedule', run: withdraw };
  } else if (open?.status === 'in_review') {
    line = open.publishAt ? `Waiting for approval · for ${formatPublishAt(open.publishAt)}` : 'Waiting for approval';
    action = { label: 'Take back', run: withdraw };
  } else if (!hasDate) {
    line = 'Give it a date to schedule this note';
  } else {
    line = needsApproval ? 'Send it for approval to go out on its date' : 'Send this note out on its date';
    action = { label: needsApproval ? 'Send for approval' : 'Schedule', run: schedule };
  }

  return (
    <p className="proto-caption proto-planner-entry-publish">
      <Icon name={live ? 'check' : 'clock'} size={11} aria-hidden />
      <span>{line}</span>
      {action ? (
        <>
          {' · '}
          <button
            type="button"
            className="proto-church-review__text-btn"
            disabled={actions.isPending}
            onClick={action.run}
          >
            {action.label}
          </button>
        </>
      ) : null}
    </p>
  );
}
