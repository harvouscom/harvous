import React from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import OfflineModeInfoPanel from '../OfflineModeInfoPanel';
import { cn } from '@/lib/utils';

export interface OfflineModeInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pendingSyncCount: number;
}

/** Mobile-only: Vaul bottom sheet. Desktop uses `openOfflineHelpPanel` → DesktopPanelManager. */
export default function OfflineModeInfoDialog({ isOpen, onClose, pendingSyncCount }: OfflineModeInfoDialogProps) {
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
            <OfflineModeInfoPanel pendingSyncCount={pendingSyncCount} onClose={onClose} inBottomSheet />
          </div>
        </div>
      </DrawerContent>
    </Drawer.Root>
  );
}
