/**
 * Suggest a resource to your church.
 *
 * Deliberately small: a link and a sentence. Asking a congregant to categorise,
 * scope, or title something properly would be asking them to do a curator's job
 * before anyone has agreed the thing belongs — and the note is what a reviewer
 * actually reads, so it gets the room.
 *
 * The submission is attributed. The copy says so plainly rather than leaving it
 * to be discovered: someone should know their name goes with it before they
 * press the button, not after.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import {
  useMyLibrarySuggestions,
  useSuggestLibraryItem,
  useWithdrawLibrarySuggestion,
  type MyLibrarySuggestion,
} from '../../hooks/queries/useChurchLibrary';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

const MINE_STATUS_LABEL: Record<MyLibrarySuggestion['status'], string> = {
  open: 'Waiting',
  approved: 'Added to the library',
  declined: 'Not added',
};

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

export default function PrototypeSuggestResourceSheet({
  open,
  churchName,
  onOpenChange,
}: {
  open: boolean;
  churchName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const suggest = useSuggestLibraryItem();
  /*
    What you sent, and what became of it.

    The endpoint and this hook shipped with the suggestion box and had no
    caller, so a congregant sent a link into silence: no confirmation it was
    still waiting, and no word when it was added or turned down. The queue told
    staff everything and the person who asked nothing.
  */
  const mine = useMyLibrarySuggestions();
  const withdraw = useWithdrawLibrarySuggestion();

  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  /* Five is enough to answer "what happened to mine" without the sheet
     becoming a history page; the endpoint returns up to fifty. */
  const mineRows = (mine.data?.suggestions ?? []).slice(0, 5);

  const { asSheet: shouldUseSheetPresentation } = useSheetPresentation();
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.16,
      fallbackWidth: 380,
      fallbackHeight: 320,
    },
    [sent, error],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const close = () => {
    onOpenChange(false);
    /* Reset after the exit animation, so the form does not visibly empty
       itself on the way out. */
    window.setTimeout(() => {
      setUrl('');
      setNote('');
      setError(null);
      setSent(false);
    }, 250);
  };

  const submit = () => {
    if (!url.trim() || suggest.isPending) return;
    setError(null);
    suggest.mutate(
      { url: url.trim(), note: note.trim() || null },
      {
        onSuccess: () => setSent(true),
        onError: (err) =>
          setError(
            err instanceof APIError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Could not send this suggestion.',
          ),
      },
    );
  };

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">
            {sent ? 'Sent' : 'Suggest a resource'}
          </span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={close}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-service-editor">
        {sent ? (
          <p className="proto-caption proto-service-editor__starter-hint">
            {churchName
              ? `Sent to ${churchName}. If they add it, it turns up in your resources.`
              : 'Sent. If your church adds it, it turns up in your resources.'}
          </p>
        ) : (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-suggest-url"
            >
              Link
            </label>
            <input
              id="proto-suggest-url"
              type="url"
              className="proto-create-folder-sheet__name-input"
              value={url}
              placeholder="https://"
              autoComplete="off"
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
            />

            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-suggest-note"
            >
              <span>Why</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            <input
              id="proto-suggest-note"
              type="text"
              className="proto-create-folder-sheet__name-input"
              value={note}
              placeholder="What made you think of it"
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />

            {/* Said before the button, not after. */}
            <p className="proto-caption proto-service-editor__starter-hint">
              {churchName
                ? `Goes to ${churchName}'s staff with your name on it. They decide what the library keeps.`
                : 'Goes to your church staff with your name on it. They decide what the library keeps.'}
            </p>
          </>
        )}
      </div>

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Shown under the form and under the confirmation alike: the answer to
          "did that go anywhere" is the same question either way. */}
      {mineRows.length > 0 ? (
        <div className="proto-suggest-mine">
          <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
            What you have sent
          </p>
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            {mineRows.map((row) => (
              <div
                key={row.id}
                className="proto-church-tools__row proto-church-tools__row--status"
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name={row.status === 'approved' ? 'check' : 'inbox'} size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span
                    className="pds-list-title proto-church-tools__row-title proto-marquee"
                    title={row.title ?? row.url}
                  >
                    <span>{row.title ?? row.url}</span>
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                    {MINE_STATUS_LABEL[row.status]}
                    {relativeDay(row.reviewedAt ?? row.createdAt)
                      ? ` · ${relativeDay(row.reviewedAt ?? row.createdAt)}`
                      : ''}
                  </span>
                </span>
                {/* Only while it waits. Once staff have answered it, the row is
                    the church's record of what was asked and decided. */}
                {row.status === 'open' ? (
                  <button
                    type="button"
                    className="proto-sheet-quiet-action"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate({ suggestionId: row.id })}
                  >
                    Withdraw
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        {sent ? (
          <button type="button" className="proto-share-popover__primary" onClick={close}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="proto-share-popover__primary"
            disabled={!url.trim() || suggest.isPending}
            onClick={submit}
          >
            {suggest.isPending ? 'Sending…' : 'Send suggestion'}
          </button>
        )}
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={close}
          aria-label="Close suggestion form"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="Suggest a resource"
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-service-editor-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">
            {content}
          </div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={close}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
