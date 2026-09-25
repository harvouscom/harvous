/**
 * Content — everything a church's channels have, will have, or are waiting on, in one list
 * (docs/CHURCH_V2_ROADMAP.md §D). An expanded tool opened from the My Church hub.
 *
 * Main column, in the order someone acts on it: what needs your approval (reviewers), what is
 * waiting on someone else's, what is scheduled, what came back (declined, or a scheduled post
 * that could not go out), and what went out recently. Choosing a waiting post docks it beside
 * the list — the note itself, and the decision.
 *
 * Reviewers (admin, pastor, coordinator: `review_content`) see every open post in the church;
 * everyone else sees their own. What is published is already in front of the congregation, so
 * every staffer sees that list.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import {
  formatPublishAt,
  toDateTimeLocal,
  useChurchContent,
  useChurchContentActions,
  useSubmissionPreview,
  type ChurchContentSubmission,
  type ContentAction,
} from '../../hooks/queries/useChurchContent';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { useProtoShell } from '../../layouts/proto-shell-context';
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import PrototypeStaffToolGate from './PrototypeStaffToolGate';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';

function relativeDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function submissionMeta(item: ChurchContentSubmission): string {
  const who = item.author.isYou ? 'You' : item.author.displayName;
  switch (item.status) {
    case 'in_review':
      return [item.channel.title, who, item.publishAt ? `for ${formatPublishAt(item.publishAt)}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'scheduled':
      return [item.channel.title, who, formatPublishAt(item.publishAt)].join(' · ');
    case 'declined':
      return [item.channel.title, 'Not approved', item.reviewNote].filter(Boolean).join(' · ');
    case 'failed':
      return [item.channel.title, 'Couldn’t go out', item.reviewNote].filter(Boolean).join(' · ');
    default:
      return item.channel.title;
  }
}

export default function PrototypeExpandedChurchContent({ exiting, origin, onClose }: ExpandedSidebarToolProps) {
  const { activeChurchOrgId } = useProtoShell();
  const orgId = activeChurchOrgId ?? null;
  const staffStatus = useChurchStaffStatus(orgId);
  const { can } = staffStatus;
  const isStaff = can('publish');
  const query = useChurchContent(orgId, { enabled: isStaff });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = query.data;
  const groups = useMemo(() => {
    const subs = data?.submissions ?? [];
    return {
      toReview: data?.canReview ? subs.filter((s) => s.status === 'in_review') : [],
      waiting: data?.canReview ? [] : subs.filter((s) => s.status === 'in_review'),
      scheduled: subs.filter((s) => s.status === 'scheduled'),
      cameBack: subs.filter((s) => s.status === 'declined' || s.status === 'failed'),
    };
  }, [data]);
  const selected = (data?.submissions ?? []).find((s) => s.id === selectedId) ?? null;
  const nothing =
    data &&
    data.submissions.every((s) => s.status === 'published' || s.status === 'withdrawn') &&
    data.published.length === 0;

  const section = (label: string, items: ChurchContentSubmission[], icon: 'clock' | 'inbox' | 'circle-exclamation') =>
    items.length ? (
      <section className="proto-ministries__group">
        <div className="proto-ministries__head proto-ministries__head--static">
          <span className="pds-list-title">{label}</span>
          <span className="proto-caption proto-ministries__head-meta">{items.length}</span>
        </div>
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="proto-church-tools__row proto-church-review__row-open"
              aria-current={selectedId === item.id ? 'true' : undefined}
              onClick={() => setSelectedId(item.id)}
            >
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name={icon} size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">{item.title}</span>
                <span className="proto-caption proto-church-tools__row-meta">{submissionMeta(item)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <ProtoSidebarExpandedPanel
      label="Content"
      title="Content"
      exiting={exiting}
      origin={origin}
      centered
      onClose={onClose}
    >
      <div className="proto-planner">
        <div className="proto-planner__main">
          {!isStaff ? (
            <PrototypeStaffToolGate
              loading={staffStatus.isLoading}
              error={staffStatus.isError}
              onRetry={() => void staffStatus.refetch()}
              toolName="Content"
            />
          ) : query.isPending ? (
            <ProtoSpaceLoading label="Loading content" />
          ) : query.isError || !data ? (
            <div className="proto-church-review__body proto-church-review__body--empty">
              <PrototypeListEmptyState
                iconName="circle-exclamation"
                title="Couldn’t load content"
                action={
                  <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void query.refetch()}>
                    Try again
                  </button>
                }
              />
            </div>
          ) : nothing ? (
            <div className="proto-church-review__body proto-church-review__body--empty">
              <PrototypeListEmptyState
                iconName="newspaper"
                title="Nothing published yet"
                description="Write a note and add it to a channel — or use the clock beside a channel to schedule it for later."
              />
            </div>
          ) : (
            <div className="proto-church-review__body">
              {section('Needs your approval', groups.toReview, 'inbox')}
              {section('Waiting for approval', groups.waiting, 'clock')}
              {section('Scheduled', groups.scheduled, 'clock')}
              {section('Came back', groups.cameBack, 'circle-exclamation')}

              {data.published.length ? (
                <section className="proto-ministries__group">
                  <div className="proto-ministries__head proto-ministries__head--static">
                    <span className="pds-list-title">Published</span>
                    <span className="proto-caption proto-ministries__head-meta">Recent</span>
                  </div>
                  <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                    {data.published.map((item) => (
                      <div key={`${item.channel.id}:${item.noteId}`} className="proto-church-tools__row proto-church-tools__row--status">
                        <span className="proto-church-tools__row-icon" aria-hidden>
                          <Icon name="rss" size={13} />
                        </span>
                        <span className="proto-church-tools__row-text">
                          <span className="pds-list-title proto-church-tools__row-title">{item.title}</span>
                          <span className="proto-caption proto-church-tools__row-meta">
                            {[item.channel.title, item.author.isYou ? 'You' : item.author.displayName, relativeDay(item.publishedAt)].join(' · ')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <p className="proto-caption proto-church-review__note">
                {data.approvalOn
                  ? 'Teachers’ posts wait for a pastor, admin or coordinator. Turn that off in Church settings.'
                  : 'Staff publish directly. To have a pastor approve teachers’ posts first, turn it on in Church settings.'}
              </p>
            </div>
          )}
        </div>

        {selected ? (
          <SubmissionPane
            key={selected.id}
            submission={selected}
            canReview={Boolean(data?.canReview)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </ProtoSidebarExpandedPanel>
  );
}

function SubmissionPane({
  submission,
  canReview,
  onClose,
}: {
  submission: ChurchContentSubmission;
  canReview: boolean;
  onClose: () => void;
}) {
  const preview = useSubmissionPreview(submission.id);
  const actions = useChurchContentActions();
  const [when, setWhen] = useState(
    submission.publishAt ? toDateTimeLocal(new Date(submission.publishAt)) : '',
  );
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState('');
  const busy = actions.isPending;
  const html = useMemo(() => ({ __html: safeRenderHtml(preview.data?.note.content ?? '') }), [preview.data]);
  const whenIso = when ? new Date(when).toISOString() : null;

  function run(action: ContentAction, done: string, close = true) {
    actions.mutate(action, {
      onSuccess: () => {
        window.toast?.success(done);
        if (close) onClose();
      },
      onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not do that'),
    });
  }

  const reviewing = submission.status === 'in_review' && canReview;
  const scheduled = submission.status === 'scheduled';
  const ownWaiting = submission.status === 'in_review' && submission.author.isYou && !canReview;

  return (
    <aside className="proto-planner-editor proto-church-review-pane" aria-label={submission.title}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">{submission.channel.title}</span>
        <div className="proto-side-panel__header-actions">
          <button type="button" className="proto-side-panel__action-btn" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>
      <div className="proto-planner-editor__body">
        <div className="proto-church-review-editor">
          <p className="proto-caption proto-church-content__byline">
            {submission.author.isYou ? 'You' : submission.author.displayName} · sent {relativeDay(submission.createdAt)}
          </p>
          {preview.isPending ? (
            <ProtoSpaceLoading label="Loading note" />
          ) : preview.isError || !preview.data ? (
            <p className="proto-caption proto-church-review-editor__hint">This note is no longer available.</p>
          ) : (
            <>
              <h3 className="proto-church-content__title">{preview.data.note.title}</h3>
              {preview.data.editedSinceSubmitted ? (
                <p className="proto-caption proto-church-review-editor__hint">
                  Edited since it was sent. What goes out is this version.
                </p>
              ) : null}
              <div className="proto-church-content__body" dangerouslySetInnerHTML={html} />
            </>
          )}

          {submission.reviewNote && (submission.status === 'declined' || submission.status === 'failed') ? (
            <p className="proto-caption proto-church-review-editor__hint">
              {submission.status === 'declined' ? 'Note from the reviewer: ' : 'Why: '}
              {submission.reviewNote}
            </p>
          ) : null}

          {reviewing || scheduled || ownWaiting ? (
            <label className="proto-settings-field">
              <span className="proto-settings-field__label">
                {reviewing ? 'Goes out' : scheduled ? 'Scheduled for' : 'Asked for'}
              </span>
              <input
                className="proto-settings-field__input"
                type="datetime-local"
                value={when}
                min={toDateTimeLocal(new Date())}
                onChange={(e) => setWhen(e.target.value)}
              />
              <span className="proto-caption proto-church-review-editor__hint">
                {when ? formatPublishAt(whenIso) : reviewing ? 'As soon as you approve' : 'As soon as it is approved'}
                {when && !scheduled ? (
                  <>
                    {' · '}
                    <button type="button" className="proto-church-review__text-btn" onClick={() => setWhen('')}>
                      Clear
                    </button>
                  </>
                ) : null}
              </span>
            </label>
          ) : null}

          {declining ? (
            <label className="proto-settings-field">
              <span className="proto-settings-field__label">A note for {submission.author.displayName} (optional)</span>
              <textarea
                className="proto-settings-field__input proto-church-review-editor__prompt"
                rows={2}
                maxLength={280}
                value={declineNote}
                autoFocus
                placeholder="Add the passage for Sunday, then send it again"
                onChange={(e) => setDeclineNote(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <div className="proto-add-notes-sheet__footer proto-church-review-editor__footer">
          {reviewing && !declining ? (
            <>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => setDeclining(true)}>
                Decline
              </button>
              <button
                type="button"
                className="proto-share-popover__primary"
                disabled={busy}
                onClick={() =>
                  run(
                    { type: 'approve', submissionId: submission.id, publishAt: whenIso },
                    whenIso && new Date(whenIso).getTime() > Date.now() + 60_000
                      ? `Approved · goes out ${formatPublishAt(whenIso)}`
                      : `Published to ${submission.channel.title}`,
                  )
                }
              >
                {whenIso && new Date(whenIso).getTime() > Date.now() + 60_000 ? 'Approve' : 'Approve & publish'}
              </button>
            </>
          ) : null}
          {reviewing && declining ? (
            <>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" disabled={busy} onClick={() => setDeclining(false)}>
                Back
              </button>
              <button
                type="button"
                className="proto-share-popover__primary"
                disabled={busy}
                onClick={() => run({ type: 'decline', submissionId: submission.id, note: declineNote || null }, 'Sent back')}
              >
                Send back
              </button>
            </>
          ) : null}
          {scheduled ? (
            <>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                disabled={busy}
                onClick={() => run({ type: 'withdraw', submissionId: submission.id }, 'Unscheduled')}
              >
                Unschedule
              </button>
              {whenIso && submission.publishAt && new Date(whenIso).getTime() !== new Date(submission.publishAt).getTime() ? (
                <button
                  type="button"
                  className="proto-share-popover__primary"
                  disabled={busy}
                  onClick={() => run({ type: 'reschedule', submissionId: submission.id, publishAt: whenIso }, `Moved to ${formatPublishAt(whenIso)}`, false)}
                >
                  Save time
                </button>
              ) : (
                <button
                  type="button"
                  className="proto-share-popover__primary"
                  disabled={busy}
                  onClick={() => run({ type: 'publish-now', submissionId: submission.id }, `Published to ${submission.channel.title}`)}
                >
                  Publish now
                </button>
              )}
            </>
          ) : null}
          {ownWaiting ? (
            <>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                disabled={busy}
                onClick={() => run({ type: 'withdraw', submissionId: submission.id }, 'Taken back')}
              >
                Take back
              </button>
              {(whenIso ?? null) !== (submission.publishAt ? new Date(submission.publishAt).toISOString() : null) ? (
                <button
                  type="button"
                  className="proto-share-popover__primary"
                  disabled={busy}
                  onClick={() =>
                    run({ type: 'reschedule', submissionId: submission.id, publishAt: whenIso ?? '' }, 'Time updated', false)
                  }
                >
                  Save time
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
