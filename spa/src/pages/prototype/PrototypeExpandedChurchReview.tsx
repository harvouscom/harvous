/**
 * A church's review questions — an expanded tool, opened from the My Church hub
 * (docs/CHURCH_V2_ROADMAP.md §B). The planner's and the library's shape: the list in the
 * main column, the editor docked beside it, channels as chips beside the title. It was a
 * narrow hub pane with a modal editor on top, which cramped both on the screen where staff
 * actually write.
 *
 * Per channel: the passages Harvous suggests from what the channel published (keep publishes a
 * passage question, no thanks makes sure it is never suggested again), the questions staff have
 * written, and a way to write another. Followers of the channel get the published ones in their
 * Review, free — that part is delivery, not this pane.
 *
 * What it never shows: who has a question, who answered, or how anyone did. The one number is
 * "Answered by N", and only from five people up.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import {
  useChurchReviewActions,
  useChurchReviewChannels,
  useChurchReviewExercises,
  type ChurchReviewExercise,
} from '../../hooks/queries/useChurchReview';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { useChurchChannels } from '../../hooks/queries/useChurchChannels';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeChurchReviewEditorPane from './PrototypeChurchReviewEditorPane';
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import ProtoChipBar from './components/ProtoChipBar';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';

const KIND_LABEL: Record<string, string> = {
  choice: 'Multiple choice',
  order: 'In order',
  match: 'Match',
  verse: 'Verse',
  chapter: 'Chapter',
};

const KIND_ICON: Record<string, IconName> = {
  choice: 'list-check',
  order: 'list-ol',
  match: 'arrows-left-right',
  verse: 'scroll',
  chapter: 'book-open-reader',
};

function exerciseTitle(exercise: ChurchReviewExercise): string {
  return exercise.prompt?.trim() || exercise.scriptureReference || 'Question';
}

function exerciseMeta(exercise: ChurchReviewExercise): string {
  const parts = [
    exercise.status === 'draft' ? 'Draft' : exercise.status === 'archived' ? 'Taken down' : null,
    KIND_LABEL[exercise.kind] ?? exercise.kind,
    exercise.status === 'published' && exercise.answeredCount != null ? `Answered by ${exercise.answeredCount}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

type Selection = { mode: 'create' } | { mode: 'edit'; exerciseId: string } | null;

export default function PrototypeExpandedChurchReview({ exiting, origin, onClose }: ExpandedSidebarToolProps) {
  const { activeChurchOrgId } = useProtoShell();
  const orgId = activeChurchOrgId ?? null;
  const { can } = useChurchStaffStatus(orgId);
  // Any staff member: writing a channel's questions is publishing to it.
  const canView = can('publish');
  /* Lapsed gates writes only — read off the channels payload the hub already loads. */
  const lapsed = useChurchChannels().data?.sponsorship?.state === 'lapsed';

  const channels = useChurchReviewChannels(orgId, { enabled: canView });
  const list = useMemo(() => channels.data?.channels ?? [], [channels.data]);
  const [channelId, setChannelId] = useState<string | null>(null);
  useEffect(() => {
    if (!channelId && list.length) setChannelId(list[0].id);
  }, [channelId, list]);
  const channel = list.find((c) => c.id === channelId) ?? list[0] ?? null;
  const exercises = useChurchReviewExercises(orgId, channel?.id ?? null, { enabled: canView && Boolean(channel) });
  const actions = useChurchReviewActions(orgId);
  const [selection, setSelection] = useState<Selection>(null);

  const data = exercises.data;
  const editing = useMemo<ChurchReviewExercise | null>(() => {
    if (selection?.mode !== 'edit') return null;
    return data?.exercises.find((e) => e.id === selection.exerciseId) ?? null;
  }, [selection, data]);
  const busy = actions.isPending;

  function chooseChannel(id: string) {
    setChannelId(id);
    setSelection(null);
  }

  function run(action: Parameters<typeof actions.mutate>[0], done?: string) {
    actions.mutate(action, {
      onSuccess: () => {
        if (done) window.toast?.success(done);
      },
      onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not do that'),
    });
  }

  return (
    <ProtoSidebarExpandedPanel
      label="Review questions"
      title="Review questions"
      scope={
        list.length > 1 && channel ? (
          <ProtoChipBar
            ariaLabel="Channel"
            options={list.map((c) => ({ id: c.id, label: c.title }))}
            selectedId={channel.id}
            onSelect={chooseChannel}
          />
        ) : undefined
      }
      actions={
        canView && channel ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            disabled={lapsed}
            title={lapsed ? 'Your church’s plan has ended' : undefined}
            onClick={() => setSelection({ mode: 'create' })}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">New question</span>
          </button>
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
      centered
      onClose={onClose}
    >
      <div className="proto-planner">
        <div className="proto-planner__main proto-church-review">
          {!canView ? null : channels.isPending ? (
            <ProtoSpaceLoading label="Loading review questions" />
          ) : channels.isError ? (
            <div className="proto-church-review__body">
              <p className="proto-caption proto-church-join__lede">Couldn&rsquo;t load review questions.</p>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void channels.refetch()}>
                Try again
              </button>
            </div>
          ) : !channel ? (
            <div className="proto-church-review__body">
              <p className="proto-caption proto-church-join__lede">
                Review questions belong to a channel. Make a ministry channel first, and its followers
                get its questions in their Review.
              </p>
            </div>
          ) : (
            <div className="proto-church-review__body">
              <p className="proto-caption proto-church-join__lede">
                Questions your people answer in their Review. Anyone who follows {channel.title} gets
                them, free. You only ever see how many answered, never who.
              </p>
      {!data ? (
        exercises.isError ? (
          <p className="proto-caption proto-church-join__count">Couldn&rsquo;t load this channel&rsquo;s questions.</p>
        ) : (
          <ProtoSpaceLoading label="Loading questions" />
        )
      ) : (
        <>
          {data.suggestions.length > 0 ? (
            <>
              <p className="proto-caption proto-home-section__eyebrow proto-church-review__eyebrow">
                Suggested from what {channel.title} published
              </p>
              <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                {data.suggestions.slice(0, 8).map((suggestion) => (
                  <div key={suggestion.key} className="proto-church-tools__row proto-church-tools__row--status">
                    <span className="proto-church-tools__row-icon" aria-hidden>
                      <Icon name={suggestion.kind === 'chapter' ? 'book-open-reader' : 'scroll'} size={13} />
                    </span>
                    <span className="proto-church-tools__row-text">
                      <span className="pds-list-title proto-church-tools__row-title">{suggestion.reference}</span>
                      <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                        {suggestion.sourceServiceTitle
                          ? `Taught in “${suggestion.sourceServiceTitle}”`
                          : suggestion.citedIn > 1
                            ? `Cited in ${suggestion.citedIn} notes`
                            : suggestion.sourceNoteTitle
                              ? `Cited in “${suggestion.sourceNoteTitle}”`
                              : 'Cited in a note'}
                      </span>
                    </span>
                    <span className="proto-church-review__row-actions">
                      <button
                        type="button"
                        className="proto-side-panel__action-btn"
                        title="No thanks"
                        aria-label={`Don't ask about ${suggestion.reference}`}
                        disabled={busy || lapsed}
                        onClick={() => run({ type: 'dismiss', channelId: channel.id, reference: suggestion.reference })}
                      >
                        <Icon name="xmark" size={11} />
                      </button>
                      <button
                        type="button"
                        className="proto-side-panel__action-btn"
                        title="Ask about this"
                        aria-label={`Ask about ${suggestion.reference}`}
                        disabled={busy || lapsed}
                        onClick={() =>
                          run(
                            {
                              type: 'create',
                              channelId: channel.id,
                              draft: { kind: suggestion.kind, reference: suggestion.reference },
                              publish: true,
                              fromSuggestion: true,
                              sourceNoteId: suggestion.sourceNoteId,
                              sourceServiceId: suggestion.sourceServiceId,
                            },
                            `${suggestion.reference} added to ${channel.title}`,
                          )
                        }
                      >
                        <Icon name="check" size={11} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="proto-church-tools__lane-head proto-church-review__eyebrow">
            <p className="proto-caption proto-home-section__eyebrow">Questions</p>
          </div>
          {data.exercises.length > 0 ? (
            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {data.exercises.map((exercise) => (
                <div key={exercise.id} className="proto-church-tools__row proto-church-tools__row--status">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name={KIND_ICON[exercise.kind] ?? 'list-check'} size={13} />
                  </span>
                  <button
                    type="button"
                    className="proto-church-review__row-open"
                    disabled={exercise.status === 'archived'}
                    aria-current={selection?.mode === 'edit' && selection.exerciseId === exercise.id ? 'true' : undefined}
                    onClick={() => setSelection({ mode: 'edit', exerciseId: exercise.id })}
                  >
                    <span className="proto-church-tools__row-text">
                      <span className="pds-list-title proto-church-tools__row-title">{exerciseTitle(exercise)}</span>
                      <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                        {exerciseMeta(exercise)}
                      </span>
                    </span>
                  </button>
                  <span className="proto-church-review__row-actions">
                    {exercise.status === 'draft' ? (
                      <button
                        type="button"
                        className="proto-church-review__text-btn"
                        disabled={busy || lapsed}
                        onClick={() => run({ type: 'publish', exerciseId: exercise.id }, `Published to ${channel.title}`)}
                      >
                        Publish
                      </button>
                    ) : exercise.status === 'published' ? (
                      <button
                        type="button"
                        className="proto-church-review__text-btn"
                        disabled={busy}
                        onClick={() => run({ type: 'archive', exerciseId: exercise.id }, 'Taken down')}
                      >
                        Take down
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="proto-caption proto-church-join__count">
              No questions for {channel.title} yet.
            </p>
          )}

        </>
      )}

            </div>
          )}
        </div>

        {selection && channel ? (
          <PrototypeChurchReviewEditorPane
            key={selection.mode === 'edit' ? selection.exerciseId : `new:${channel.id}`}
            onClose={() => setSelection(null)}
            orgId={orgId}
            channelId={channel.id}
            channelTitle={channel.title}
            exercise={editing}
            canWrite={!lapsed}
          />
        ) : null}
      </div>
    </ProtoSidebarExpandedPanel>
  );
}
