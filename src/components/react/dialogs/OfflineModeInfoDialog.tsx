import React, { useId } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { formatBadgeCount } from '@/utils/badge-count';
import Icon from '../Icon';
import SquareButton from '../SquareButton';
import { cn } from '@/lib/utils';

export interface OfflineModeInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pendingSyncCount: number;
}

const BULLETS = [
  'You can create new notes and keep editing them while offline.',
  'Most navigation and other actions are paused until you are back online.',
  "When you reconnect, Harvous syncs queued changes automatically.",
] as const;

export default function OfflineModeInfoDialog({ isOpen, onClose, pendingSyncCount }: OfflineModeInfoDialogProps) {
  const titleId = useId();
  const syncStatusId = useId();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      shouldScaleBackground={false}
      noBodyStyles={true}
    >
      <DrawerContent
        overlayClassName="offline-help-drawer-overlay"
        className={cn(
          'rounded-t-3xl border-0 bg-[var(--color-light-paper)] p-0 outline-none',
          'bottom-sheet-content offline-help-drawer',
        )}
        data-offline-help-dialog
        style={{ padding: 0, outline: 'none', border: 'none', borderWidth: 0 }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Drawer.Title className="sr-only">Currently offline</Drawer.Title>
        <Drawer.Description className="sr-only">What you can do while offline and sync status</Drawer.Description>

        <div className="bottom-sheet__inner flex-fill flex-stack" data-vaul-no-drag style={{ gap: 0 }}>
          <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
            <div className="panel-wrapper panel-wrapper--bottom-sheet">
              <div className="flex-fill flex-stack" style={{ gap: 0 }}>
                <div className="panel panel--bottom-sheet">
                  <div className="panel__header offline-help-panel__header">
                    <div className="panel__title offline-help-panel__title">
                      <p id={titleId}>Currently offline</p>
                    </div>
                  </div>

                  <div className="panel__body panel__body--bottom-sheet">
                    <div className="panel__content panel__content--bottom-sheet">
                      <ul className="offline-help-dialog__list">
                        {BULLETS.map((text) => (
                          <li key={text} className="offline-help-dialog__bullet">
                            <span className="offline-help-dialog__bullet-icon" aria-hidden>
                              <Icon name="check" size={14} />
                            </span>
                            <span>{text}</span>
                          </li>
                        ))}
                      </ul>

                      <div
                        id={syncStatusId}
                        className="panel__footer offline-help-dialog__sync-footer"
                        role="status"
                        aria-live="polite"
                      >
                        {pendingSyncCount > 0 ? (
                          <>
                            <p>
                              <strong style={{ color: 'var(--color-deep-grey)', fontWeight: 600 }}>
                                {formatBadgeCount(pendingSyncCount)}
                              </strong>{' '}
                              {pendingSyncCount === 1 ? 'change is' : 'changes are'} queued to sync.
                            </p>
                            <p>They will upload when you are back online.</p>
                          </>
                        ) : (
                          <>
                            <p style={{ color: 'var(--color-deep-grey)', fontWeight: 600 }}>All caught up</p>
                            <p>Nothing is waiting to sync right now.</p>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        className="space-button relative mb-3 h-[64px] w-full cursor-pointer rounded-3xl transition-[scale,shadow] duration-300 flex-center"
                        style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                        onClick={handleRefresh}
                      >
                        <span
                          className="inline-flex items-center gap-2 font-sans text-[18px] font-semibold"
                          style={{ color: 'var(--color-deep-grey)' }}
                        >
                          <Icon name="arrows-rotate" size={20} />
                          Refresh page
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel__footer--buttons">
                  <SquareButton variant="Back" onClick={onClose} inBottomSheet />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer.Root>
  );
}
