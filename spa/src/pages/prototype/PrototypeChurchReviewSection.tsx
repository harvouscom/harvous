/**
 * A church's review questions, in the My Church hub (docs/CHURCH_V2_ROADMAP.md §B).
 *
 * Per channel: the passages Harvous suggests from what the channel published (keep publishes a
 * passage question, no thanks makes sure it is never suggested again), the questions staff have
 * written, and a way to write another. Followers of the channel get the published ones in their
 * Review, free — that part is delivery, not this pane.
 *
 * What it never shows: who has a question, who answered, or how anyone did. The one number is
 * "Answered by N", and only from five people up.
 */
import { useEffect, useState } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import {
  useChurchReviewActions,
  useChurchReviewChannels,
  useChurchReviewExercises,
  type ChurchReviewExercise,
} from '../../hooks/queries/useChurchReview';
import PrototypeChurchReviewEditorSheet from './PrototypeChurchReviewEditorSheet';
import ProtoSpaceLoading from './ProtoSpaceLoading';

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

export default function PrototypeChurchReviewSection({
  orgId,
  canView,
  lapsed,
}: {
  orgId: string | null;
  /** Any staff member. Gates the requests, not just the render. */
  canView: boolean;
  /** The church's plan has ended: questions can be taken down, not written. */
  lapsed: boolean;
}) {
  const channels = useChurchReviewChannels(orgId, { enabled: canView });
  const list = channels.data?.channels ?? [];
  const [channelId, setChannelId] = useState<string | null>(null);
  useEffect(() => {
    if (!channelId && list.length) setChannelId(list[0].id);
  }, [channelId, list]);
  const exercises = useChurchReviewExercises(orgId, channelId, { enabled: canView && Boolean(channelId) });
  const actions = useChurchReviewActions(orgId);
  const [editor, setEditor] = useState<{ open: boolean; exercise: ChurchReviewExercise | null }>({
    open: false,
    exercise: null,
  });

  if (!canView) return null;
  if (channels.isPending) return <ProtoSpaceLoading label="Loading review questions" />;
  if (channels.isError) {
    return (
      <div className="proto-home-section">
        <p className="proto-caption proto-church-join__lede">Couldn&rsquo;t load review questions.</p>
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void channels.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="proto-home-section">
        <p className="proto-caption proto-church-join__lede">
          Review questions belong to a channel. Make a ministry channel first, and its followers get
          its questions in their Review.
        </p>
      </div>
    );
  }

  const channel = list.find((c) => c.id === channelId) ?? list[0];
  const data = exercises.data;
  const busy = actions.isPending;

  function run(action: Parameters<typeof actions.mutate>[0], done?: string) {
    actions.mutate(action, {
      onSuccess: () => {
        if (done) window.toast?.success(done);
      },
      onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not do that'),
    });
  }

  return (
    <div className="proto-home-section proto-church-review">
      <p className="proto-caption proto-church-join__lede">
        Questions your people answer in their Review. Anyone who follows the channel gets them, free.
        You only ever see how many answered, never who.
      </p>

      {list.length > 1 ? (
        <div className="proto-church-review__channels" role="tablist" aria-label="Channel">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === channel.id}
              className={`proto-church-review__channel${c.id === channel.id ? ' proto-church-review__channel--on proto-ink-on-accent' : ''}`}
              onClick={() => setChannelId(c.id)}
            >
              {c.title}
            </button>
          ))}
        </div>
      ) : null}

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
                    onClick={() => setEditor({ open: true, exercise })}
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

          <button
            type="button"
            className="proto-settings-btn proto-church-review__new"
            disabled={lapsed}
            title={lapsed ? 'Your church’s plan has ended' : undefined}
            onClick={() => setEditor({ open: true, exercise: null })}
          >
            <Icon name="plus" size={12} /> New question
          </button>
        </>
      )}

      <PrototypeChurchReviewEditorSheet
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        orgId={orgId}
        channelId={channel.id}
        channelTitle={channel.title}
        exercise={editor.exercise}
        canWrite={!lapsed}
      />
    </div>
  );
}
