import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { haptics } from '@/utils/haptics';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { toastError } from '../../lib/error-copy';
import { useNoteHistory, type NoteHistorySessionWire } from '../../hooks/queries/useNoteHistory';
import { useNoteHistoryVersion } from '../../hooks/queries/useNoteHistoryVersion';
import { restoreNoteVersion, useRestoreNoteVersion } from '../../hooks/mutations/useRestoreNoteVersion';
import { useProfile } from '../../hooks/queries/useProfile';
import { useHasFeature } from '../../hooks/useHasFeature';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import ProtoPopoverShell from './ProtoPopoverShell';
import PrototypeHomeRow from './PrototypeHomeRow';
import ProtoReadOnlyNotePaper from './ProtoReadOnlyNotePaper';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { PLUS_BADGE_COPY } from './proto-review-copy';
import { NOTE_HISTORY_COPY as COPY } from './proto-note-history-copy';
import {
  formatNoteHistoryDay,
  formatNoteHistoryMoment,
  groupNoteHistoryByDay,
  noteHistoryDayLabel,
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

export default function PrototypeNoteHistorySheet({ open, noteId, onOpenChange }: PrototypeNoteHistorySheetProps) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopoverPortal = !asSheet && mounted;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRect, setConfirmRect] = useState<DOMRect | null>(null);
  // State, not a ref: in the phone drawer the strip mounts after this component's effects run.
  const [chipsEl, setChipsEl] = useState<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const history = useNoteHistory(noteId, open);
  const restore = useRestoreNoteVersion();
  const fullHistory = useHasFeature('full_history');
  const defaultTranslation = useProfile().data?.defaultTranslation ?? null;

  const sessions = useMemo(() => history.data?.pages.flatMap((page) => page.sessions) ?? [], [history.data]);
  const days = useMemo(() => groupNoteHistoryByDay(sessions), [sessions]);
  const pages = history.data?.pages;
  const locked = pages?.[pages.length - 1]?.locked ?? null;
  const showUpsell = Boolean(locked && fullHistory.ready && !fullHistory.has);
  // History opens on the note as it is now; picking a version swaps the page beside it.
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const selectedIndex = selected ? sessions.indexOf(selected) : -1;
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
      topVhFraction: 0.1,
      fallbackWidth: 860,
      fallbackHeight: 640,
    },
    [sessions.length > 0],
  );

  // Centre the chosen chip in the strip; scrollLeft only, so nothing else on the page moves.
  const selectedSessionId = selected?.id;
  useEffect(() => {
    if (!chipsEl || !selectedSessionId) return;
    const chip = chipsEl.querySelector<HTMLElement>(`[data-session-id="${selectedSessionId}"]`);
    if (chip) chipsEl.scrollLeft = chip.offsetLeft - (chipsEl.clientWidth - chip.offsetWidth) / 2;
  }, [chipsEl, selectedSessionId]);

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
          haptics.success();
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

  const loadError = (
    <div className="proto-note-history__notice">
      <p>{COPY.loadError}</p>
      <button type="button" className="proto-note-history__text-btn" onClick={() => void history.refetch()}>
        {COPY.retry}
      </button>
    </div>
  );

  // Desktop: a timeline of sessions down the left, grouped by day. The dot is the selection.
  const timeline = history.isPending ? (
    <div className="proto-note-history__skeleton" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="proto-note-history__skeleton-row" />
      ))}
    </div>
  ) : history.isError ? (
    loadError
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
                aria-current={session.id === selected?.id ? 'true' : undefined}
                aria-label={session.isCurrent ? `${COPY.current}, ${noteHistorySessionTimeLabel(session)}` : undefined}
                onClick={() => setSelectedId(session.id)}
              >
                <span className="proto-note-history__row-text">
                  <span className="proto-note-history__row-title">{noteHistorySessionTimeLabel(session)}</span>
                  {detail ? <span className="proto-note-history__row-meta">{detail}</span> : null}
                </span>
                {session.isCurrent ? <span className="proto-note-history__row-tag">{COPY.currentTag}</span> : null}
              </button>
            );
          })}
        </section>
      ))}
      {sessions.length <= 1 && !locked ? (
        <div className="proto-note-history__empty">
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
      {showUpsell && locked ? (
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

  // Phone: the same sessions as a strip, oldest on the left so time reads the way it scrolls.
  // Older pages and the Plus upsell lead the strip, since there is no list to hold them.
  const strip =
    sessions.length > 0 ? (
      <div className="proto-note-history__scrubber">
        <button
          type="button"
          className="proto-side-panel__action-btn"
          disabled={selectedIndex < 0 || selectedIndex >= sessions.length - 1}
          onClick={() => setSelectedId(sessions[selectedIndex + 1].id)}
          aria-label="Older version"
          title="Older version"
        >
          <Icon name="caret-left" size={12} />
        </button>
        <div className="proto-note-history__chips" ref={setChipsEl}>
          {showUpsell ? (
            <button type="button" className="proto-note-history__chip" onClick={openUpgrade}>
              {COPY.lockedTitle}
              <span className="proto-menu-item__badge">{PLUS_BADGE_COPY}</span>
            </button>
          ) : history.hasNextPage ? (
            <button
              type="button"
              className="proto-note-history__chip"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {COPY.loadMore}
            </button>
          ) : null}
          {[...sessions].reverse().map((session, index, oldestFirst) => {
            const day = noteHistoryDayLabel(new Date(session.endedAt));
            const startsDay = index === 0 || noteHistoryDayLabel(new Date(oldestFirst[index - 1].endedAt)) !== day;
            const isSelected = session.id === selected?.id;
            return (
              <Fragment key={session.id}>
                {/* A day is a divider in the strip, not part of the first chip after it. */}
                {startsDay ? <span className="proto-note-history__chip-day">{day}</span> : null}
                <button
                  type="button"
                  data-session-id={session.id}
                  className={isSelected ? 'proto-note-history__chip proto-ink-on-accent' : 'proto-note-history__chip'}
                  aria-pressed={isSelected}
                  aria-label={`${day}, ${noteHistorySessionTimeLabel(session)}${session.isCurrent ? `, ${COPY.current}` : ''}`}
                  onClick={() => setSelectedId(session.id)}
                >
                  {session.isCurrent
                    ? COPY.currentTag
                    : new Date(session.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </button>
              </Fragment>
            );
          })}
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          disabled={selectedIndex <= 0}
          onClick={() => setSelectedId(sessions[selectedIndex - 1].id)}
          aria-label="Newer version"
          title="Newer version"
        >
          <Icon name="caret-right" size={12} />
        </button>
      </div>
    ) : null;

  const preview = !selected ? (
    history.isError ? (
      asSheet ? loadError : null
    ) : (
      <div className="proto-note-history__skeleton" aria-busy="true">
        <span className="proto-note-history__skeleton-row" />
        <span className="proto-note-history__skeleton-row" />
      </div>
    )
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
    // Older versions can hold references as plain words; they show as pills here and are
    // stored, and restored, exactly as they were.
    <ProtoReadOnlyNotePaper
      className="proto-note-history__paper"
      title={version.data.version.title}
      html={version.data.version.content}
      displayPills={{ noteId, fallbackTranslation: defaultTranslation }}
    />
  );

  const canRestore = Boolean(selected && !selected.isCurrent && !selected.contentEncrypted && version.isSuccess);
  const restoreButton = canRestore ? (
    <button
      type="button"
      className="proto-note-history__restore"
      disabled={restore.isPending}
      onClick={(event) => setConfirmRect(event.currentTarget.getBoundingClientRect())}
    >
      {COPY.restore}
    </button>
  ) : null;

  const content = (
    <div className="proto-note-history" data-layout={asSheet ? 'stacked' : 'split'}>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">{COPY.title}</span>
        </div>
        <div className="proto-note-history__header-actions">
          {/* On a phone Restore sits under the page, within reach; here it heads the window. */}
          {asSheet ? null : restoreButton}
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
      {asSheet ? strip : null}
      <div className="proto-note-history__panes">
        {asSheet ? null : <div className="proto-note-history__list">{timeline}</div>}
        <div className="proto-note-history__preview">
          <div className="proto-note-history__preview-scroll">{preview}</div>
          {asSheet && selected && (restoreButton || sessions.length <= 1) ? (
            <div className="proto-note-history__footer">
              {restoreButton ? (
                <>
                  <span className="proto-note-history__footer-when">
                    {noteHistoryDayLabel(new Date(selected.endedAt))}
                    <span className="proto-note-history__footer-time">{noteHistorySessionTimeLabel(selected)}</span>
                  </span>
                  {restoreButton}
                </>
              ) : (
                <span className="proto-note-history__footer-empty">{COPY.empty}</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {confirmRect && selected ? (
        <ProtoConfirmDialog
          anchorRect={confirmRect}
          alignRight
          preferAbove={asSheet}
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
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-note-history-popover',
            exiting,
          )}
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
