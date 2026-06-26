import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useCreateFolderRegistryLabel } from '../../hooks/mutations/usePrototypeFolderRegistry';
import { useAddNotesToFolder } from '../../hooks/mutations/useAddNotesToFolder';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PrototypeAddNotesPicker, resolveSelectedNoteRows } from './PrototypeAddNotesSheet';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

export interface PrototypeCreateFolderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceNotes: SpaceNoteRow[];
  notesById: Map<string, SpaceNoteRow>;
  onCreated: (folderName: string) => void;
}

export default function PrototypeCreateFolderSheet({
  open,
  onOpenChange,
  spaceId,
  spaceNotes,
  notesById,
  onCreated,
}: PrototypeCreateFolderSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const createFolder = useCreateFolderRegistryLabel();
  const addNotes = useAddNotesToFolder();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
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
  const shouldUsePopover = open && !shouldUseSheetPresentation;

  const handleSubmit = async () => {
    const name = folderName.trim();
    if (!name) return;
    setActionError(null);
    try {
      await createFolder.mutateAsync({ spaceId, folderName: name });
      if (selectedIds.length > 0) {
        const rows = resolveSelectedNoteRows(selectedIds, notesById, spaceNotes);
        if (rows.length > 0) {
          await addNotes.mutateAsync({ rows, folderName: name, spaceId });
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

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 480;
    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 360;
    const viewportMargin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.max(viewportMargin, (vw - cardWidth) / 2),
      top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.12)),
    });
  }, [shouldUsePopover, selectedIds.length, folderName]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

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

  if (!open) return null;

  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label="New folder"
        className="proto-connect-note-popover proto-create-folder-popover"
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
        }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

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
