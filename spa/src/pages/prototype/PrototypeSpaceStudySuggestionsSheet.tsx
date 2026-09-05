/**
 * What's next — the room's suggestion box.
 *
 * One sheet, two halves. Whoever runs the room sees the queue first: what
 * members proposed, named, with the "why" — and two answers at equal weight,
 * because "not now" is an ordinary, frequent reply and making it the quiet
 * destructive-looking option would push leaders toward accepting things to
 * avoid the red button. Everyone sees the form and their own list.
 *
 * The form is deliberately small: what, and a sentence on why. Asking a member
 * to title or categorise properly would be asking them to do the leader's job
 * before anyone has agreed the thing belongs. The submission is attributed,
 * and the copy says so before the button rather than after.
 *
 * Accepting pins a Thread as the room's Current Thread — the server does that
 * in one transaction, and the queries that show the Current Thread refresh
 * from the review mutation, so the hub behind this sheet updates itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon, { type IconName } from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import {
  useMarkSpaceStudySuggestionsRead,
  useMySpaceStudySuggestions,
  useReviewSpaceStudySuggestion,
  useSpaceStudySuggestionQueue,
  useSuggestSpaceStudy,
  useWithdrawSpaceStudySuggestion,
  type MySpaceStudySuggestion,
  type SpaceStudySuggestionForReview,
  type SpaceStudySuggestionKind,
  type SuggestSpaceStudyInput,
} from '../../hooks/queries/useSpaceStudySuggestions';
import { useSpaceGroupThreads } from '../../hooks/queries/useSpaceGroupThreads';
import { useSpaceNotes } from '../../hooks/queries/useSpace';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

/** The kinds a member can pick from, in the order they are offered. */
const FORM_KINDS: Array<{ kind: SpaceStudySuggestionKind; label: string; icon: IconName }> = [
  { kind: 'scripture', label: 'Passage', icon: 'book-open' },
  { kind: 'text', label: 'Idea', icon: 'inbox' },
  { kind: 'note', label: 'Note', icon: 'file-lines' },
  { kind: 'thread', label: 'Thread', icon: 'scroll' },
];

const KIND_ICON: Record<SpaceStudySuggestionKind, IconName> = {
  scripture: 'book-open',
  text: 'inbox',
  note: 'file-lines',
  thread: 'scroll',
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

/** What a suggestion is, in one line. */
export function suggestionHeadline(row: Pick<MySpaceStudySuggestion, 'kind' | 'refTitle' | 'scriptureReference' | 'body'>): string {
  if (row.kind === 'scripture') return row.scriptureReference ?? 'A passage';
  if (row.kind === 'thread') return row.refTitle ?? 'A Thread';
  if (row.kind === 'note') return row.refTitle?.trim() || 'A note';
  return row.body?.split('\n')[0]?.trim() || 'An idea';
}

const STATUS_LABEL: Record<MySpaceStudySuggestion['status'], string> = {
  open: 'Waiting',
  accepted: 'Became the next study',
  declined: 'Not this time',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof APIError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function PrototypeSpaceStudySuggestionsSheet({
  open,
  onOpenChange,
  spaceId,
  spaceTitle,
  canReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceTitle: string;
  /** The server's verdict, read off the queue query by the hub. */
  canReview: boolean;
}) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const queue = useSpaceStudySuggestionQueue(spaceId, { enabled: open && canReview });
  const mine = useMySpaceStudySuggestions(spaceId, { enabled: open });
  const review = useReviewSpaceStudySuggestion(spaceId);
  const suggest = useSuggestSpaceStudy(spaceId);
  const withdraw = useWithdrawSpaceStudySuggestion(spaceId);
  const markRead = useMarkSpaceStudySuggestionsRead(spaceId);

  /* Pickers for the two kinds that point at something. Members already have
     both lists cached from the hub; a leader's Thread list is the room's. */
  const threadsQuery = useSpaceGroupThreads(open ? spaceId : undefined);
  const notesQuery = useSpaceNotes(open ? spaceId : '', 20);
  const threads = useMemo(
    () => (threadsQuery.data ?? []).filter((thread) => !thread.isPinned),
    [threadsQuery.data],
  );
  const notes = useMemo(
    () => notesQuery.data?.pages.flatMap((page) => page.notes) ?? [],
    [notesQuery.data?.pages],
  );

  const [kind, setKind] = useState<SpaceStudySuggestionKind>('scripture');
  const [reference, setReference] = useState('');
  const [refId, setRefId] = useState('');
  const [why, setWhy] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  /* The leader has looked. Once per opening, and only when something was new —
     the unread count is a promise that a person saw it, not that a query ran. */
  const markedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      markedRef.current = false;
      return;
    }
    if (markedRef.current || !canReview) return;
    const rows = queue.data?.suggestions ?? [];
    if (rows.some((row) => !row.leaderReadAt)) {
      markedRef.current = true;
      markRead.mutate();
    }
  }, [open, canReview, queue.data?.suggestions, markRead]);

  const { asSheet: shouldUseSheetPresentation } = useSheetPresentation();
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.12,
      fallbackWidth: 440,
      fallbackHeight: 480,
    },
    [sent, formError, kind, queue.data?.suggestions?.length, mine.data?.suggestions?.length],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const close = () => {
    onOpenChange(false);
    window.setTimeout(() => {
      setKind('scripture');
      setReference('');
      setRefId('');
      setWhy('');
      setFormError(null);
      setSent(false);
      setQueueError(null);
    }, 250);
  };

  const availableKinds = FORM_KINDS.filter((entry) => {
    if (entry.kind === 'thread') return threads.length > 0;
    if (entry.kind === 'note') return notes.length > 0;
    return true;
  });

  const canSubmit =
    !suggest.isPending &&
    (kind === 'scripture'
      ? reference.trim().length > 0
      : kind === 'text'
        ? why.trim().length > 0
        : refId.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    setFormError(null);
    const trimmedWhy = why.trim() || null;
    const input: SuggestSpaceStudyInput =
      kind === 'scripture'
        ? { kind, scriptureReference: reference.trim(), body: trimmedWhy }
        : kind === 'text'
          ? { kind, body: why.trim() }
          : { kind, refId, body: trimmedWhy };
    suggest.mutate(input, {
      onSuccess: () => {
        setSent(true);
        setReference('');
        setRefId('');
        setWhy('');
      },
      onError: (err) => setFormError(errorMessage(err, 'Could not send this suggestion.')),
    });
  };

  const act = (row: SpaceStudySuggestionForReview, action: 'accept' | 'decline') => {
    setPendingId(row.id);
    setQueueError(null);
    review.mutate(
      { suggestionId: row.id, action },
      {
        /* ALREADY_REVIEWED surfaces verbatim — "someone else got here first"
           is the useful thing to know when two leaders open the queue. */
        onError: (err) => setQueueError(errorMessage(err, 'Could not review this.')),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const queueRows = queue.data?.suggestions ?? [];
  const mineRows = mine.data?.suggestions ?? [];

  const queueSection = canReview ? (
    <section className="proto-space-suggestions__section" aria-label="Waiting for you">
      <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">Waiting for you</p>
      {queueError ? (
        <p className="proto-connect-note-sheet__error proto-planner__error" role="alert">
          {queueError}
        </p>
      ) : null}
      {queue.isLoading ? (
        <ProtoSpaceLoading label="Loading suggestions" />
      ) : queueRows.length === 0 ? (
        <PrototypeListEmptyState
          iconName="inbox"
          title="Nothing waiting"
          description="When someone in the room suggests what to study next, it turns up here."
        />
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {queueRows.map((row) => {
            const busy = pendingId === row.id;
            return (
              <div
                key={row.id}
                className="proto-church-tools__row proto-church-tools__row--status proto-library-suggestion"
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name={KIND_ICON[row.kind]} size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span
                    className="pds-list-title proto-church-tools__row-title proto-marquee"
                    title={suggestionHeadline(row)}
                  >
                    <span>{suggestionHeadline(row)}</span>
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                    {row.suggestedByName}
                    {relativeDay(row.createdAt) ? ` · ${relativeDay(row.createdAt)}` : ''}
                    {!row.leaderReadAt ? ' · new' : ''}
                  </span>
                  {/* The "why" — for an idea it is the whole suggestion, so it
                      is already the headline and is not repeated. */}
                  {row.kind !== 'text' && row.body ? (
                    <span className="proto-caption proto-library-suggestion__note">“{row.body}”</span>
                  ) : null}
                </span>
                <span className="proto-library-suggestion__actions">
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                    disabled={busy}
                    onClick={() => act(row, 'accept')}
                  >
                    <span className="proto-glass-action__label">{busy ? '…' : 'Make it our next study'}</span>
                  </button>
                  <button
                    type="button"
                    className="proto-sheet-quiet-action"
                    disabled={busy}
                    onClick={() => act(row, 'decline')}
                  >
                    Not now
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  ) : null;

  const formSection = (
    <section className="proto-space-suggestions__section proto-service-editor" aria-label="Suggest">
      {sent ? (
        <>
          <p className="proto-caption proto-service-editor__starter-hint">
            Sent to whoever runs {spaceTitle}. You will see here what becomes of it.
          </p>
          <button
            type="button"
            className="proto-sheet-quiet-action"
            onClick={() => setSent(false)}
          >
            Suggest another
          </button>
        </>
      ) : (
        <>
          <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">
            Suggest what we study next
          </p>
          <div className="proto-chip-bar proto-space-suggestions__kinds" role="radiogroup" aria-label="What kind">
            {availableKinds.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                role="radio"
                aria-checked={kind === entry.kind}
                className={`proto-chip${kind === entry.kind ? ' proto-chip--selected' : ''}`}
                onClick={() => {
                  setKind(entry.kind);
                  setRefId('');
                  setFormError(null);
                }}
              >
                <Icon name={entry.icon} size={11} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          {kind === 'scripture' ? (
            <>
              <label
                className="proto-inspector-section-title proto-create-folder-sheet__field-label"
                htmlFor="proto-suggest-study-reference"
              >
                Passage
              </label>
              <input
                id="proto-suggest-study-reference"
                type="text"
                className="proto-create-folder-sheet__name-input"
                value={reference}
                placeholder="Romans 8, Psalm 23, the Sermon on the Mount"
                maxLength={120}
                autoComplete="off"
                onChange={(e) => {
                  setReference(e.target.value);
                  setFormError(null);
                }}
              />
            </>
          ) : null}

          {kind === 'note' || kind === 'thread' ? (
            <>
              <label
                className="proto-inspector-section-title proto-create-folder-sheet__field-label"
                htmlFor="proto-suggest-study-ref"
              >
                {kind === 'note' ? 'Which note' : 'Which Thread'}
              </label>
              <select
                id="proto-suggest-study-ref"
                className="proto-create-folder-sheet__name-input"
                value={refId}
                onChange={(e) => {
                  setRefId(e.target.value);
                  setFormError(null);
                }}
              >
                <option value="">Pick one</option>
                {kind === 'note'
                  ? notes.map((note) => (
                      <option key={note.id} value={note.id}>
                        {stripServerAutoUntitledNoteTitleForDisplay(note.title ?? '') || 'Untitled note'}
                      </option>
                    ))
                  : threads.map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.title}
                      </option>
                    ))}
              </select>
            </>
          ) : null}

          <label
            className="proto-inspector-section-title proto-create-folder-sheet__field-label"
            htmlFor="proto-suggest-study-why"
          >
            <span>{kind === 'text' ? 'What do you have in mind' : 'Why'}</span>
            {kind !== 'text' ? <span className="proto-service-editor__optional">optional</span> : null}
          </label>
          <input
            id="proto-suggest-study-why"
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={why}
            placeholder={kind === 'text' ? 'Something on grief. The parables. Prayer.' : 'What made you think of it'}
            maxLength={500}
            onChange={(e) => {
              setWhy(e.target.value);
              setFormError(null);
            }}
          />

          {/* Said before the button, not after. */}
          <p className="proto-caption proto-service-editor__starter-hint">
            Goes to whoever runs this room, with your name on it. They choose what becomes the next study.
          </p>

          {formError ? (
            <p className="proto-connect-note-sheet__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
            <button
              type="button"
              className="proto-share-popover__primary"
              disabled={!canSubmit}
              onClick={submit}
            >
              {suggest.isPending ? 'Sending…' : 'Send suggestion'}
            </button>
          </div>
        </>
      )}
    </section>
  );

  const mineSection =
    mineRows.length > 0 ? (
      <section className="proto-space-suggestions__section" aria-label="Yours">
        <p className="proto-inspector-section-title proto-create-folder-sheet__field-label">Yours</p>
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {mineRows.map((row) => (
            <div key={row.id} className="proto-church-tools__row proto-church-tools__row--status">
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name={KIND_ICON[row.kind]} size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={suggestionHeadline(row)}>
                  <span>{suggestionHeadline(row)}</span>
                </span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {STATUS_LABEL[row.status]}
                  {relativeDay(row.createdAt) ? ` · ${relativeDay(row.createdAt)}` : ''}
                </span>
              </span>
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
      </section>
    ) : null;

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">What's next</span>
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
      <div className="proto-space-suggestions__body">
        {queueSection}
        {formSection}
        {mineSection}
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={close} aria-label="Close suggestions" />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="What's next"
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-service-editor-popover proto-space-suggestions-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet proto-space-suggestions">
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
        className="proto-connect-note-sheet proto-create-folder-sheet proto-space-suggestions"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
