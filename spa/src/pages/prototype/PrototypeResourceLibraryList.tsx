/**
 * Resources sidebar list — the viewer's personal resource library.
 *
 * The other list modes either show things you authored (notes, folders,
 * threads) or indexes derived from note content (highlights, scripture). This
 * one is a catalog you curate on purpose, so it carries its own add affordance
 * rather than relying on the compose button.
 *
 * Personal-only today, including inside a shared space. Church-owned libraries
 * merge into this same list later (docs/future/RESOURCE_LIBRARY.md §5.1).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState, { PrototypeListNoMatchEmptyState } from './PrototypeListEmptyState';
import PrototypeSidebarRowMenuPopover from './PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import {
  formatResourceFileBytes,
  resourceFileLabel,
  resourceSourceLabel,
} from '@/utils/resource-source-label';
import {
  useLibrary,
  useLibraryLinkPreview,
  useCreateLibraryItem,
  useUploadLibraryItem,
  useArchiveLibraryItem,
  openLibraryFileItem,
  type LibraryItem,
} from '../../hooks/queries/useLibrary';

function ResourceRow({
  item,
  onOpen,
  onArchive,
  isArchiving,
}: {
  item: LibraryItem;
  onOpen: () => void;
  onArchive: () => void;
  isArchiving: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const isFile = item.kind === 'file';
  const subtitle = isFile
    ? resourceFileLabel(item.fileMime, item.fileBytes, item.fileName)
    : resourceSourceLabel(item.sourceDomain, item.sourceSiteName);

  return (
    <li
      ref={rowRef}
      className="proto-note-row-item"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button
        type="button"
        className="proto-note-row__main"
        onClick={onOpen}
        aria-label={`Resource: ${item.title}`}
      >
        <div className="proto-note-row__title-line">
          {/* One icon for every resource — link or file. The subtitle already
              says which ("PDF · 2.1 MB" vs a domain); a second signal for the
              same fact just makes the list noisier. */}
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name="newspaper" size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{item.title}</span>
        </div>
        {subtitle || item.description ? (
          <div className="pds-list-preview proto-note-row__preview">
            {subtitle ? <span className="pds-list-timestamp">{subtitle}</span> : null}
            {subtitle && item.description ? '  ' : null}
            {item.description ? <span>{item.description}</span> : null}
          </div>
        ) : null}
      </button>
      <div
        className={`proto-menu proto-note-row__menu${menuOpen ? ' proto-note-row__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-note-row__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Resource actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} />
        </button>
        <PrototypeSidebarRowMenuPopover
          open={menuOpen}
          rowRef={rowRef}
          triggerRootRef={menuRootRef}
          onDismiss={() => setMenuOpen(false)}
          aria-label="Resource actions"
        >
          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                if (isFile) {
                  void openLibraryFileItem(item.id);
                } else if (item.sourceUrl) {
                  window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="arrow-up-right-from-square" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">{isFile ? 'Open file' : 'Open link'}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item proto-menu-item--destructive"
              disabled={isArchiving}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onArchive();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">Remove resource</span>
            </button>
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div>
    </li>
  );
}

/** Types the file input offers — mirrors the server allowlist in library-file-upload.ts. */
const FILE_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,' +
  'application/pdf,text/plain,text/markdown,image/*,audio/mpeg,audio/mp4';

type AddStage =
  /** Quiet default: one button, no input competing with the search field above. */
  | { step: 'idle' }
  /** Choosing a source — link and file shown as alternatives, not a sequence. */
  | { step: 'choose' }
  /** Naming it before it lands, so the list stays readable. */
  | { step: 'confirm' };

/**
 * Add a resource: a link or a file.
 *
 * Shaped around the fact that the two sources are **alternatives**, not steps.
 * An earlier pass put a URL field, a paperclip, and an Add button in one row,
 * which read as a three-step pipeline and stacked a second input-shaped pill
 * under the search field. Instead:
 *
 *   idle    → a single "Add resource" button; the sidebar stays quiet
 *   choose  → link field and file button as visible alternatives, with "or"
 *   confirm → one title field and Save, identical for both sources
 *
 * Dropping a file anywhere on the list jumps straight to confirm, so the common
 * case skips the menu entirely.
 */
function AddResourceForm({
  onSaved,
  droppedFile,
  onDroppedFileConsumed,
}: {
  onSaved: () => void;
  /** File dropped on the list — adopted as if it had been picked here. */
  droppedFile?: File | null;
  onDroppedFileConsumed?: () => void;
}) {
  const [stage, setStage] = useState<AddStage>({ step: 'idle' });
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const preview = useLibraryLinkPreview();
  const create = useCreateLibraryItem();
  const upload = useUploadLibraryItem();
  const [pendingMeta, setPendingMeta] = useState<{
    siteName: string | null;
    image: string | null;
    description: string;
  } | null>(null);

  const busy = preview.isPending || create.isPending || upload.isPending;

  const reset = () => {
    setStage({ step: 'idle' });
    setUrl('');
    setFile(null);
    setTitle('');
    setPendingMeta(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const adoptFile = useCallback((picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    setUrl('');
    setPendingMeta(null);
    // Filename minus extension is usually the right title to start from.
    setTitle(picked.name.replace(/\.[^.]+$/, ''));
    setError(null);
    setStage({ step: 'confirm' });
  }, []);

  useEffect(() => {
    if (!droppedFile) return;
    adoptFile(droppedFile);
    onDroppedFileConsumed?.();
  }, [droppedFile, adoptFile, onDroppedFileConsumed]);

  const runPreview = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const meta = await preview.mutateAsync(trimmed);
      setTitle(meta.title || '');
      setPendingMeta({
        siteName: meta.siteName ?? null,
        image: meta.image || null,
        description: meta.description || '',
      });
      setStage({ step: 'confirm' });
    } catch {
      // Unreachable page: let them save it anyway with a hand-typed title.
      setStage({ step: 'confirm' });
      setError('Could not read that page. You can still save it with your own title.');
    }
  };

  const save = async () => {
    setError(null);
    try {
      if (file) {
        await upload.mutateAsync({ file, title: title.trim() || undefined });
      } else {
        const trimmed = url.trim();
        if (!trimmed) return;
        await create.mutateAsync({
          url: trimmed,
          title: title.trim() || undefined,
          description: pendingMeta?.description || undefined,
          siteName: pendingMeta?.siteName ?? undefined,
          image: pendingMeta?.image ?? undefined,
        });
      }
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that resource.');
    }
  };

  if (stage.step === 'idle') {
    return (
      <div className="proto-resource-add">
        <button
          type="button"
          className="proto-resource-add__open"
          onClick={() => {
            setStage({ step: 'choose' });
            requestAnimationFrame(() => urlInputRef.current?.focus());
          }}
        >
          <Icon name="plus" size={11} aria-hidden />
          <span>Add resource</span>
        </button>
      </div>
    );
  }

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={FILE_ACCEPT}
      style={{ display: 'none' }}
      onChange={(e) => adoptFile(e.target.files?.[0] ?? null)}
    />
  );

  if (stage.step === 'choose') {
    return (
      <div className="proto-resource-add proto-resource-add--open">
        <div className="proto-resource-add__row">
          <input
            ref={urlInputRef}
            type="url"
            className="proto-resource-add__input"
            placeholder="Paste a link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runPreview();
              }
              if (e.key === 'Escape') reset();
            }}
          />
          <button
            type="button"
            className="proto-resource-add__submit"
            disabled={busy || !url.trim()}
            onClick={() => void runPreview()}
          >
            {preview.isPending ? 'Reading…' : 'Next'}
          </button>
        </div>

        <div className="proto-resource-add__or" aria-hidden>
          <span>or</span>
        </div>

        <button
          type="button"
          className="proto-resource-add__file-pick"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="paperclip" size={12} aria-hidden />
          <span>Choose a file</span>
        </button>
        <p className="proto-resource-add__hint">
          PDF, doc, image, or audio — up to 50MB. You can also drop one on the list.
        </p>
        {hiddenFileInput}

        <button type="button" className="proto-resource-add__cancel" onClick={reset}>
          Cancel
        </button>
        {error ? <p className="proto-resource-add__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="proto-resource-add proto-resource-add--open">
      <div className="proto-resource-add__source" title={file ? file.name : url}>
        <Icon name="newspaper" size={11} aria-hidden />
        <span className="proto-resource-add__source-text">
          {file ? file.name : resourceSourceLabel(hostOf(url)) || url}
        </span>
        {file ? (
          <span className="proto-resource-add__file-size">
            {formatResourceFileBytes(file.size)}
          </span>
        ) : null}
      </div>
      <input
        type="text"
        className="proto-resource-add__input proto-resource-add__input--title"
        placeholder="Title"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') reset();
        }}
      />
      <div className="proto-resource-add__actions">
        <button type="button" className="proto-resource-add__cancel" onClick={reset}>
          Cancel
        </button>
        <button
          type="button"
          className="proto-resource-add__submit"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {hiddenFileInput}
      {error ? <p className="proto-resource-add__error">{error}</p> : null}
    </div>
  );
}

/** Host of a possibly-incomplete URL, for the confirm-step source line. */
function hostOf(raw: string): string {
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return '';
  }
}

export default function PrototypeResourceLibraryList({
  query,
  onOpenResource,
}: {
  /** Sidebar search text — filters by title, site name, and domain. */
  query: string;
  onOpenResource: (item: LibraryItem) => void;
}) {
  const libraryQuery = useLibrary();
  const archive = useArchiveLibraryItem();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Nested dragenter/dragleave fire constantly; count them instead of toggling. */
  const dragDepth = useRef(0);

  const items = libraryQuery.data?.items ?? [];
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) =>
      [item.title, item.sourceSiteName, item.sourceDomain, item.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(trimmedQuery)),
    );
  }, [items, trimmedQuery]);

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files');

  return (
    <div
      className={`proto-resource-drop${dragOver ? ' proto-resource-drop--active' : ''}`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) setDroppedFile(file);
      }}
    >
      {dragOver ? (
        <div className="proto-resource-drop__overlay" role="status">
          <Icon name="paperclip" size={18} aria-hidden />
          <span>Drop to add a resource</span>
        </div>
      ) : null}
      <AddResourceForm
        onSaved={() => libraryQuery.refetch()}
        droppedFile={droppedFile}
        onDroppedFileConsumed={() => setDroppedFile(null)}
      />
      {libraryQuery.isLoading ? (
        <ProtoSpaceLoading label="Loading resources" />
      ) : libraryQuery.isError ? (
        <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
          Could not load your resources.
        </p>
      ) : filtered.length === 0 ? (
        trimmedQuery ? (
          <PrototypeListNoMatchEmptyState title="No resources match" />
        ) : (
          <PrototypeListEmptyState
            iconName="newspaper"
            title="No Resources"
            description="What you reach for while you study — a commentary link, a talk, a PDF handout. Add one to start your library."
          />
        )
      ) : (
        <ul className="proto-note-list">
          {filtered.map((item) => (
            <ResourceRow
              key={item.id}
              item={item}
              onOpen={() => onOpenResource(item)}
              isArchiving={archive.isPending && archivingId === item.id}
              onArchive={() => {
                setArchivingId(item.id);
                void archive.mutateAsync(item.id).finally(() => setArchivingId(null));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
