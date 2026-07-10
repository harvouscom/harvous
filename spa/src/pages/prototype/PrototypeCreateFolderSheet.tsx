import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useCreateFolderRegistryLabel } from '../../hooks/mutations/usePrototypeFolderRegistry';
import {
  useAddNotesToFolder,
  type FolderMutationSpaceKind,
} from '../../hooks/mutations/useAddNotesToFolder';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { PrototypeAddNotesPicker, resolveSelectedNoteRows } from './PrototypeAddNotesSheet';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

export interface PrototypeCreateFolderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceKind: FolderMutationSpaceKind;
  spaceNotes: SpaceNoteRow[];
  notesById: Map<string, SpaceNoteRow>;
  onCreated: (folderName: string) => void;
}

export default function PrototypeCreateFolderSheet({
  open,
  onOpenChange,
  spaceId,
  spaceKind,
  spaceNotes,
  notesById,
  onCreated,
}: PrototypeCreateFolderSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const createFolder = useCreateFolderRegistryLabel();
  const addNotes = useAddNotesToFolder();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [folderName, setFolderName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFolderName('');
      setSelectedIds([]);
      setActionError(null);
    }
  }, [open]);

  const isPending = createFolder.isPending || addNotes.isPending;
  const canSubmit = folderName.trim().length > 0 && !isPending;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.12,
      fallbackWidth: 360,
      fallbackHeight: 480,
    },
    [selectedIds.length, folderName],
  );

  const handleSubmit = async () => {
    const name = folderName.trim();
    if (!name) return;
    setActionError(null);
    try {
      await createFolder.mutateAsync({ spaceId, folderName: name });
      if (selectedIds.length > 0) {
        const rows = resolveSelectedNoteRows(selectedIds, notesById, spaceNotes);
        if (rows.length > 0) {
          await addNotes.mutateAsync({
            rows,
            folderName: name,
            spaceId,
            spaceKind,
          });
        }
      }
      onOpenChange(false);
      onCreated(name);
      try {
        window.toast?.success('Folder created');
      } catch {
        /* ignore */
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create folder.');
    }
  };

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="folder" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">New folder</span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-create-folder-sheet__name-wrap">
        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label" htmlFor="proto-create-folder-name">
          Folder name
        </label>
        <input
          id="proto-create-folder-name"
          type="text"
          className="proto-create-folder-sheet__name-input"
          value={folderName}
          onChange={(e) => {
            setFolderName(e.target.value);
            setActionError(null);
          }}
          placeholder="e.g. Going through Genesis"
          autoFocus={open}
        />
      </div>

      <p className="proto-inspector-section-title proto-create-folder-sheet__notes-label">Add notes (optional)</p>

      <PrototypeAddNotesPicker
        key={open ? 'open' : 'closed'}
        spaceId={spaceId}
        spaceNotes={spaceNotes}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        showListScopeToggle
        defaultListScope="unsorted"
      />

      {actionError ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {isPending ? 'Creating…' : 'Create folder'}
        </button>
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close new folder dialog"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="New folder"
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-create-folder-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">{content}</div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
