import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import { prepareReadOnlyNoteBodyHtml } from '@/utils/note-read-only-html';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { toastError } from '../../lib/error-copy';
import { useNoteHistory, type NoteHistorySessionWire } from '../../hooks/queries/useNoteHistory';
import { useNoteHistoryVersion } from '../../hooks/queries/useNoteHistoryVersion';
import { restoreNoteVersion, useRestoreNoteVersion } from '../../hooks/mutations/useRestoreNoteVersion';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import ProtoPopoverShell from './ProtoPopoverShell';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { PLUS_BADGE_COPY } from './proto-review-copy';
import { NOTE_HISTORY_COPY as COPY } from './proto-note-history-copy';
import {
  formatNoteHistoryDay,
  formatNoteHistoryMoment,
  groupNoteHistoryByDay,
  noteHistorySessionTimeLabel,
} from './note-history-presentation';
import '../../styles/prototype-note-history.css';

export type PrototypeNoteHistorySheetProps = {
  open: boolean;
  noteId: string;
  onOpenChange: (open: boolean) => void;
};

function isLockedError(error: unknown): boolean {
  return error instanceof APIError && error.status === 403 && error.code === 'FEATURE_REQUIRED';
}

/*
 * A row is named by when, not by what: every version of a note carries the same title, so a
 * list of "Thus Far…" rows said nothing. The title only earns a line when it was different
 * then — that is the one thing about an old version the time alone can't tell you.
 */
function rowDetail(session: NoteHistorySessionWire, currentTitle: string): string | null {
  if (session.contentEncrypted) return COPY.encryptedRow;
  if (session.isCurrent) return null;
  const title = session.title?.trim() || '';
  if (!title || title === currentTitle) return null;
  return COPY.titledAs(title);
}

function NoteReadOnlyBody({ title, html }: { title: string | null; html: string }) {
  // A fresh object each render would re-apply innerHTML and drop any text selection.
  const markup = useMemo(() => ({ __html: safeRenderHtml(prepareReadOnlyNoteBodyHtml(html)) }), [html]);
  return (
    <article className="proto-note-history__body">
      {title?.trim() ? <h2 className="proto-note-history__body-title">{title}</h2> : null}
      <div
        className="card-full-editable__content-html proto-note-history__body-html"
        dangerouslySetInnerHTML={markup}
      />
    </article>
  );
}

export default function PrototypeNoteHistorySheet({ open, noteId, onOpenChange }: PrototypeNoteHistorySheetProps) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopoverPortal = !asSheet && mounted;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRect, setConfirmRect] = useState<DOMRect | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const history = useNoteHistory(noteId, open);
  const restore = useRestoreNoteVersion();
  const fullHistory = useHasFeature('full_history');

  const sessions = useMemo(() => history.data?.pages.flatMap((page) => page.sessions) ?? [], [history.data]);
  const days = useMemo(() => groupNoteHistoryByDay(sessions), [sessions]);
  const pages = history.data?.pages;
  const locked = pages?.[pages.length - 1]?.locked ?? null;
  const selected = sessions.find((session) => session.id === selectedId) ?? null;
  const currentTitle = sessions.find((session) => session.isCurrent)?.title?.trim() || '';
  const version = useNoteHistoryVersion(noteId, selected && !selected.contentEncrypted ? selected.id : null);

  useEffect(() => {
    if (open) return;
    setSelectedId(null);
    setConfirmRect(null);
  }, [open]);

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.12,
      fallbackWidth: 720,
      fallbackHeight: 520,
    },
    [selectedId, sessions.length],
  );

  // The confirm is portaled outside the card, so a click on it must not read as outside.
  useDismissOnOutside(cardRef, () => onOpenChange(false), open && !asSheet && !restore.isPending && !confirmRect);

  const openUpgrade = () => {
    onOpenChange(false);
    navigate({ to: '/upgrade' });
  };

  const onConfirmRestore = () => {
    if (!selected) return;
    const target = selected;
    const previousId = sessions.find((session) => session.isCurrent)?.id ?? null;
    restore.mutate(
      { noteId, versionId: target.id },
      {
        onSuccess: () => {
          setConfirmRect(null);
          onOpenChange(false);
          toast.success(
            COPY.restored(formatNoteHistoryMoment(target.endedAt)),
            previousId
              ? {
                  action: {
                    label: COPY.undo,
                    onAction: () => {
                      restoreNoteVersion(queryClient, { noteId, versionId: previousId }).catch((error) =>
                        toastError(error, COPY.restoreError),
                      );
                    },
                  },
                }
              : undefined,
          );
        },
        onError: (error) => {
          setConfirmRect(null);
          if (error instanceof APIError && error.status === 409) {
            toast.error(COPY.conflict);
          } else if (isLockedError(error)) {
            void history.refetch();
          } else {
            toastError(error, COPY.restoreError);
          }
        },
      },
    );
  };

  const listBody = history.isPending ? (
    <div className="proto-note-history__skeleton" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="proto-note-history__skeleton-row" />
      ))}
    </div>
  ) : history.isError ? (
    <div className="proto-note-history__notice">
      <p>{COPY.loadError}</p>
      <button type="button" className="proto-note-history__text-btn" onClick={() => void history.refetch()}>
        {COPY.retry}
      </button>
    </div>
  ) : (
    <>
      {days.map((day) => (
        <section key={day.key} className="proto-note-history__day" aria-label={day.label}>
          <h3 className="proto-note-history__day-label">{day.label}</h3>
          {day.sessions.map((session) => {
            const detail = rowDetail(session, currentTitle);
            return (
              <button
                key={session.id}
                type="button"
                className="proto-note-history__row"
                data-current={session.isCurrent || undefined}
                aria-current={session.id === selectedId ? 'true' : undefined}
                aria-label={session.isCurrent ? `${COPY.current}, ${noteHistorySessionTimeLabel(session)}` : undefined}
                onClick={() => setSelectedId(session.id)}
              >
                <span className="proto-note-history__row-text">
                  <span className="proto-note-history__row-title">{noteHistorySessionTimeLabel(session)}</span>
                  {detail ? <span className="proto-note-history__row-meta">{detail}</span> : null}
                </span>
                {session.isCurrent ? (
                  <span className="proto-note-history__row-tag">{COPY.currentTag}</span>
                ) : asSheet ? (
                  <span className="proto-note-history__row-chevron" aria-hidden="true">
                    <Icon name="caret-right" size={12} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </section>
      ))}
      {sessions.length <= 1 && !locked ? (
        <div className="proto-note-history__empty">
          <Icon name="clock-rotate-left" size={16} />
          <p className="proto-note-history__empty-title">{COPY.empty}</p>
          <p className="proto-note-history__empty-detail">{COPY.emptyDetail}</p>
        </div>
      ) : null}
      {history.hasNextPage ? (
        <button
          type="button"
          className="proto-note-history__text-btn proto-note-history__more"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {COPY.loadMore}
        </button>
      ) : null}
      {locked && fullHistory.ready && !fullHistory.has ? (
        <div className="proto-note-history__locked">
          <PrototypeHomeRow
            icon="clock-rotate-left"
            title={COPY.lockedTitle}
            meta={[COPY.lockedMeta(formatNoteHistoryDay(locked.before))]}
            trailing={<span className="proto-menu-item__badge">{PLUS_BADGE_COPY}</span>}
            onClick={openUpgrade}
          />
        </div>
      ) : null}
    </>
  );

  const preview = !selected ? (
    <p className="proto-note-history__notice">{COPY.previewPrompt}</p>
  ) : selected.contentEncrypted ? (
    <p className="proto-note-history__notice">{COPY.encryptedPreview}</p>
  ) : version.isPending ? (
    <div className="proto-note-history__skeleton" aria-busy="true">
      <span className="proto-note-history__skeleton-row" />
      <span className="proto-note-history__skeleton-row" />
    </div>
  ) : version.isError ? (
    <p className="proto-note-history__notice">
      {isLockedError(version.error) && locked ? COPY.lockedMeta(formatNoteHistoryDay(locked.before)) : COPY.previewError}
    </p>
  ) : (
    <NoteReadOnlyBody title={version.data.version.title} html={version.data.version.content} />
  );

  const canRestore = Boolean(selected && !selected.isCurrent && !selected.contentEncrypted && version.isSuccess);

  const content = (
    <div className="proto-note-history" data-layout={asSheet ? 'stacked' : 'split'}>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          {asSheet && selected ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              onClick={() => setSelectedId(null)}
              aria-label={COPY.back}
              title={COPY.back}
            >
              <Icon name="caret-left" size={12} />
            </button>
          ) : null}
          <span className="proto-note-history__heading">
            <span className="proto-study-thread-popover__title">{COPY.title}</span>
            {/* The rows no longer repeat the note's name, so the header carries it once. */}
            {currentTitle && !(asSheet && selected) ? (
              <span className="proto-note-history__subtitle">{currentTitle}</span>
            ) : null}
          </span>
        </div>
        <div className="proto-note-history__header-actions">
          {canRestore ? (
            <button
              type="button"
              className="proto-note-history__restore"
              disabled={restore.isPending}
              onClick={(event) => setConfirmRect(event.currentTarget.getBoundingClientRect())}
            >
              {COPY.restore}
            </button>
          ) : null}
          <button
            type="button"
            className="proto-side-panel__action-btn"
            onClick={() => onOpenChange(false)}
            aria-label={COPY.close}
            title={COPY.close}
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>
      <div className="proto-note-history__panes">
        {!asSheet || !selected ? <div className="proto-note-history__list">{listBody}</div> : null}
        {!asSheet || selected ? <div className="proto-note-history__preview">{preview}</div> : null}
      </div>
      {confirmRect && selected ? (
        <ProtoConfirmDialog
          anchorRect={confirmRect}
          alignRight
          title={COPY.restoreConfirmTitle}
          description={COPY.restoreConfirmBody(formatNoteHistoryMoment(selected.endedAt))}
          confirmLabel={COPY.restore}
          cancelLabel={COPY.cancel}
          busy={restore.isPending}
          onConfirm={onConfirmRestore}
          onCancel={() => {
            if (!restore.isPending) setConfirmRect(null);
          }}
        />
      ) : null}
    </div>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={() => onOpenChange(false)} aria-label={COPY.close} />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={COPY.title}
          className={portaledDialogShellClassName('proto-connect-note-popover proto-note-history-popover', exiting)}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          {content}
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open || !asSheet) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-note-history-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
