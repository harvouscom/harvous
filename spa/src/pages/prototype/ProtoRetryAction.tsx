import Icon from '@/components/react/Icon';

/**
 * "Try again" for a list that failed to load, in the same glass control the empty states
 * already use for their one action (see `libraryBrowseMyHomeAction`).
 *
 * The error copy on these surfaces always said "Try again in a moment" with nothing to
 * press, and several surfaces had no error branch at all, so a failed request read as
 * "you have nothing here". A failure should look like a failure, with a way out of it.
 */
export default function ProtoRetryAction({ onRetry, label = 'Try again' }: { onRetry: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--control proto-glass-action"
      onClick={onRetry}
    >
      <span aria-hidden>
        <Icon name="arrows-rotate" size={12} />
      </span>
      <span className="proto-glass-action__label">{label}</span>
    </button>
  );
}
