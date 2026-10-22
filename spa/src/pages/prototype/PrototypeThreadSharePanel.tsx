/**
 * Sharing a personal Thread, shown in place inside whatever surface the Thread is already open in
 * — the note page's Threads popover or drawer, or the Library panel's Thread view.
 *
 * It used to be a second dialog stacked on the first, and that dialog only sent the Thread to
 * Discover: there was no link to give anyone. Now the blue footer button on the Thread is the
 * consent — one press makes the link and copies it — and this panel is what that press opens
 * onto: the link, a way to copy it again, replace it or turn it off, and, second and quieter,
 * the Discover offer, which opens in the same place rather than over it.
 *
 * Why `useThreadShareAction` is separate from the panel: a clipboard write has to start inside
 * the click that asked for it, or Safari refuses it. The host's Share button calls `share()` in
 * its own handler; the panel only shows what that started.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useShareStudyThread } from '../../hooks/mutations/useShareStudyThread';
import { useStudyThreadShare } from '../../hooks/queries/useStudyThreadShare';
import { ShareWithOthersForm } from './PrototypeShareWithOthersSheet';

/**
 * The public URL, built on this page's origin from the token — the server's `shareUrl` carries the
 * API's own origin, which in development (and behind any proxy) is not where the page lives. Same
 * normalization the note share popover makes.
 */
function threadShareUrl(shareToken: string | null | undefined): string | null {
  if (!shareToken || typeof window === 'undefined') return null;
  return `${window.location.origin}/shared/thread/${shareToken}`;
}

/** Strips the scheme for display; the copied value keeps it. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/** `execCommand('copy')` — the note popover's fallback, for where the async API is refused. */
function legacyCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function writeTextOrLegacy(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return Promise.resolve(legacyCopy(text));
  }
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => legacyCopy(text),
  );
}

/**
 * Copies text that may not exist yet. Must be called synchronously from a click handler.
 *
 * `ClipboardItem` with a promise is the only form Safari accepts after an `await` — the write is
 * claimed during the gesture and filled when the link arrives. Elsewhere, or when that is
 * refused, fall back to `writeText` and then to `execCommand` once the value is in hand.
 */
export function copyWhenReady(value: Promise<string>): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  ) {
    try {
      const item = new ClipboardItem({
        'text/plain': value.then((text) => new Blob([text], { type: 'text/plain' })),
      });
      return navigator.clipboard.write([item]).then(
        () => true,
        () => value.then(writeTextOrLegacy, () => false),
      );
    } catch {
      /* Older ClipboardItem without promise support — fall through. */
    }
  }
  return value.then(writeTextOrLegacy, () => false);
}

function errorText(error: unknown): string {
  if (error instanceof APIError || error instanceof Error) return error.message;
  return 'Could not make a link for this Thread.';
}

/**
 * The Thread's link state, and the one-press share the host's button runs. `noteId` is any note
 * in the Thread; the server answers for the whole of it.
 */
export function useThreadShareAction(noteId: string | undefined, spaceId: string | null | undefined, enabled = true) {
  const status = useStudyThreadShare(noteId, spaceId, enabled);
  const mutation = useShareStudyThread();

  /** Make the link if there is none, copy it, and say so. Call from the click itself. */
  const share = () => {
    if (!noteId) return;
    const existing = status.data?.isPublic ? threadShareUrl(status.data.shareToken) : null;
    const link = existing
      ? Promise.resolve(existing)
      : mutation.mutateAsync({ noteId, spaceId, action: 'enable' }).then((result) => {
          const url = threadShareUrl(result.shareToken);
          if (!url) throw new Error('Could not make a link for this Thread.');
          return url;
        });
    void copyWhenReady(link).then((copied) => {
      if (copied) toast.success('Link copied');
    });
    link.catch(() => {
      /* Shown in the panel, which reads the mutation's error. */
    });
  };

  return { status, mutation, share };
}

export default function PrototypeThreadSharePanel({
  noteId,
  spaceId,
  threadName,
  noteCount,
  discoverSourceId,
  action,
  onBack,
}: {
  noteId: string;
  spaceId: string | null | undefined;
  threadName: string;
  /** Shown on the preview card — what someone opening the link will find. */
  noteCount: number;
  /** The Thread's main note — how Discover finds a personal Thread. */
  discoverSourceId: string | null;
  action: ReturnType<typeof useThreadShareAction>;
  onBack: () => void;
}) {
  const { status, mutation, share } = action;
  const [view, setView] = useState<'link' | 'discover'>('link');
  const [confirmingRefresh, setConfirmingRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = status.data?.isPublic ? threadShareUrl(status.data.shareToken) : null;
  const creating = mutation.isPending && mutation.variables?.action === 'enable';
  const busy = mutation.isPending;
  const failed = !shareUrl && !busy && mutation.isError;

  const copy = () => {
    if (!shareUrl) return;
    void copyWhenReady(Promise.resolve(shareUrl)).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const refresh = () => {
    if (!confirmingRefresh) {
      setConfirmingRefresh(true);
      return;
    }
    setConfirmingRefresh(false);
    mutation.mutate(
      { noteId, spaceId, action: 'refresh' },
      {
        onSuccess: () => toast.success('New link made'),
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  const stop = () => {
    mutation.mutate(
      { noteId, spaceId, action: 'disable' },
      {
        onSuccess: () => {
          toast.success('Thread is private again');
          onBack();
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };

  if (view === 'discover' && discoverSourceId) {
    return (
      <div className="proto-thread-share proto-thread-share--discover">
        <ShareWithOthersForm
          target={{ kind: 'pack', id: discoverSourceId, name: threadName }}
          onDone={() => setView('link')}
          renderHeader={({ sent }) => (
            <div className="proto-study-thread-popover__header">
              <div className="proto-study-thread-popover__title-row">
                <button
                  type="button"
                  className="proto-side-panel__action-btn"
                  onClick={() => setView('link')}
                  aria-label="Back"
                  title="Back"
                >
                  <Icon name="caret-left" size={14} />
                </button>
                <span className="proto-study-thread-popover__title">{sent ? 'Sent' : 'Share with others'}</span>
              </div>
            </div>
          )}
        />
      </div>
    );
  }

  const noteCountLabel = `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;

  return (
    <div className="proto-thread-share">
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            onClick={onBack}
            aria-label="Back to Thread"
            title="Back"
          >
            <Icon name="caret-left" size={14} />
          </button>
          <span className="proto-study-thread-popover__title" role="heading" aria-level={2}>
            Share Thread
          </span>
        </div>
        <span
          className="proto-thread-share__status"
          aria-live="polite"
        >
          {shareUrl ? 'Shared by link' : creating || status.isLoading ? 'Making a link…' : 'Private'}
        </span>
      </div>

      <div className="proto-study-thread-popover__body proto-thread-share__body">
        {/* What someone opening the link gets: this Thread, by name, with its notes — and the
            link itself, on the card it opens. */}
        <div className="proto-thread-share__card">
          <div className="proto-thread-share__card-head">
            <span className="proto-thread-share__tile" aria-hidden>
              <Icon name="arrow-right-arrow-left" size={15} />
            </span>
            <div className="proto-thread-share__card-text">
              <p className="proto-thread-share__card-title">{threadName}</p>
              <p className="proto-thread-share__card-meta">{noteCountLabel} · Stays up to date</p>
            </div>
          </div>
          <div className={`proto-thread-share__link${shareUrl ? '' : ' proto-thread-share__link--pending'}`}>
            <Icon name="link" size={12} aria-hidden />
            <span className="proto-thread-share__link-text" title={shareUrl ?? undefined}>
              {shareUrl ? displayUrl(shareUrl) : creating || status.isLoading ? 'Making a link…' : 'No link yet'}
            </span>
            {shareUrl ? (
              <button type="button" className="proto-thread-share__copy" onClick={copy} aria-label="Copy link">
                <Icon name={copied ? 'check' : 'copy'} size={12} aria-hidden />
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </div>
        </div>

        <p className="proto-thread-share__fine">
          Anyone with the link can read these notes, including ones you connect later. Locked
          notes never show.
        </p>

        {failed ? (
          <div className="proto-share-popover__error" role="alert">
            {errorText(mutation.error)}
          </div>
        ) : null}

        {shareUrl ? (
          <div className="proto-thread-share__group" role="group" aria-label="Link">
            <a
              className="proto-thread-share__row"
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="arrow-up-right-from-square" size={13} aria-hidden />
              <span className="proto-thread-share__row-label">View public page</span>
            </a>
            <button
              type="button"
              className="proto-thread-share__row"
              onClick={refresh}
              onBlur={() => setConfirmingRefresh(false)}
              disabled={busy}
            >
              <Icon name="arrows-rotate" size={13} aria-hidden />
              {/* Replacing breaks the link everyone already has, so it asks once. */}
              <span className="proto-thread-share__row-label">
                {confirmingRefresh ? 'Replace it? The old link stops working' : 'Get a new link'}
              </span>
            </button>
            <button
              type="button"
              className="proto-thread-share__row proto-thread-share__row--danger"
              onClick={stop}
              disabled={busy}
            >
              <Icon name="eye-slash" size={13} aria-hidden />
              <span className="proto-thread-share__row-label">Stop sharing</span>
            </button>
          </div>
        ) : null}

        {/* A link is people you chose; Discover is everyone — so it comes second, only once
            there is a link, and opens here rather than over this. */}
        {shareUrl && discoverSourceId ? (
          <div className="proto-thread-share__group" role="group" aria-label="Discover">
            <button
              type="button"
              className="proto-thread-share__row proto-thread-share__row--tall"
              onClick={() => setView('discover')}
              disabled={busy}
            >
              <Icon name="compass" size={14} aria-hidden />
              <span className="proto-thread-share__row-text">
                <span className="proto-thread-share__row-label">Share with others on Harvous</span>
                <span className="proto-thread-share__row-hint">
                  Offer it in Discover so anyone can take a copy, after a quick review
                </span>
              </span>
              <Icon name="caret-right" size={11} aria-hidden className="proto-thread-share__row-caret" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        {shareUrl ? (
          <button type="button" className="proto-share-popover__primary proto-thread-share__button" onClick={copy} disabled={busy}>
            <Icon name={copied ? 'check' : 'copy'} size={13} aria-hidden />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        ) : (
          <button type="button" className="proto-share-popover__primary proto-thread-share__button" onClick={share} disabled={busy || status.isLoading}>
            <Icon name="share" size={13} aria-hidden />
            {creating ? 'Making link…' : failed ? 'Try again' : 'Share Thread'}
          </button>
        )}
      </div>
    </div>
  );
}
