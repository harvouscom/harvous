/**
 * What the congregation has proposed, waiting on a decision.
 *
 * The queue names the person who asked. That is the one place in any
 * church-facing surface where a congregant is named, and it is deliberate: a
 * pastor deciding what their church studies from cannot weigh a stack of
 * anonymous links, and cannot follow up on one either. See the docblock on
 * server/routes/church-library-suggestions.ts for why this is not a breach of
 * "review is never shared".
 *
 * Approve and decline sit at the same weight. Declining is an ordinary,
 * frequent answer — making it the quiet destructive-looking option would push
 * reviewers toward approving things to avoid the red button.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  useLibrarySuggestionQueue,
  useReviewLibrarySuggestion,
  type LibrarySuggestionForReview,
} from '../../../hooks/queries/useChurchLibrary';
import ProtoSpaceLoading from '../ProtoSpaceLoading';

function relativeDay(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PrototypeLibrarySuggestionQueue({
  orgId,
  canReview,
}: {
  orgId: string | null;
  canReview: boolean;
}) {
  const queue = useLibrarySuggestionQueue(orgId, { enabled: canReview, status: 'open' });
  const review = useReviewLibrarySuggestion(orgId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canReview) {
    return (
      <p className="proto-caption proto-planner__empty">
        A pastor or admin reviews what your church suggests.
      </p>
    );
  }

  if (queue.isLoading) return <ProtoSpaceLoading label="Loading suggestions" />;

  const suggestions = queue.data?.suggestions ?? [];

  if (suggestions.length === 0) {
    return (
      <p className="proto-caption proto-planner__empty">
        Nothing waiting. When someone in your church suggests a resource, it
        turns up here.
      </p>
    );
  }

  const act = (suggestion: LibrarySuggestionForReview, action: 'approve' | 'decline') => {
    setPendingId(suggestion.id);
    setError(null);
    review.mutate(
      { suggestionId: suggestion.id, action },
      {
        /* The server refuses a second review with ALREADY_REVIEWED — surfaced
           verbatim, because "someone else got here first" is the useful thing
           to know when two curators open the queue at once. */
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not review this.'),
        onSettled: () => setPendingId(null),
      },
    );
  };

  return (
    <div className="proto-planner-list">
      {error ? (
        <p className="proto-connect-note-sheet__error proto-planner__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {suggestions.map((suggestion) => {
          const busy = pendingId === suggestion.id;
          return (
            <div
              key={suggestion.id}
              className="proto-church-tools__row proto-church-tools__row--status proto-library-suggestion"
            >
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="inbox" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span
                  className="pds-list-title proto-church-tools__row-title proto-marquee"
                  title={suggestion.title ?? suggestion.url}
                >
                  <span>{suggestion.title ?? suggestion.url}</span>
                </span>
                <span className="proto-caption proto-church-tools__row-meta">
                  {suggestion.domain ? `${suggestion.domain} · ` : ''}
                  {suggestion.suggestedByName}
                  {relativeDay(suggestion.createdAt) ? ` · ${relativeDay(suggestion.createdAt)}` : ''}
                </span>
                {/* The "why". Often the only thing distinguishing a good
                    suggestion from a link someone liked. */}
                {suggestion.note ? (
                  <span className="proto-caption proto-library-suggestion__note">
                    “{suggestion.note}”
                  </span>
                ) : null}
              </span>
              <span className="proto-library-suggestion__actions">
                <button
                  type="button"
                  className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                  disabled={busy}
                  onClick={() => act(suggestion, 'approve')}
                >
                  <span className="proto-glass-action__label">{busy ? '…' : 'Add it'}</span>
                </button>
                <button
                  type="button"
                  className="proto-sheet-quiet-action"
                  disabled={busy}
                  onClick={() => act(suggestion, 'decline')}
                >
                  Not now
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
