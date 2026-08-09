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
import { useProtoShell } from '../../layouts/proto-shell-context';
import { extendNoteSelectionRange, toggleNoteSelection } from '../../lib/note-selection';
import {
  useChurchLibraryUnion,
  type ChurchLibraryItem,
} from '../../hooks/queries/useChurchLibrary';
import PrototypeSuggestResourceSheet from './PrototypeSuggestResourceSheet';
import {
  useSpaceLibrary,
  useSpaceLibraryActions,
  type SpaceLibraryItem,
} from '../../hooks/queries/useSpaceLibrary';
import PrototypeListEmptyState, { PrototypeListNoMatchEmptyState } from './PrototypeListEmptyState';
import PrototypeSidebarRowMenuPopover from './PrototypeSidebarRowMenuPopover';
import ProtoChipBar from './components/ProtoChipBar';
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
  selectable = false,
  selectMode = false,
  selected = false,
  onToggleSelected,
  onSelectRangeTo,
}: {
  item: LibraryItem;
  onOpen: () => void;
  onArchive: () => void;
  isArchiving: boolean;
  /*
    Only personal rows. A church's or a room's shelf is not this reader's to
    clear, so those rows get no checkbox at all rather than a checkbox whose
    every action would be refused.
  */
  selectable?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onSelectRangeTo?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const isFile = item.kind === 'file';
  /* What it is, then whose shelf it's on — the second line carries the source so
     the list needs no section headings to explain itself.
     `null` bytes so a file says "PDF" without its weight: how big it is only
     matters once you've decided to open it. */
  const subtitle = [
    isFile
      ? resourceFileLabel(item.fileMime, null, item.fileName)
      : resourceSourceLabel(item.sourceDomain, item.sourceSiteName),
    'My Library',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <li
      ref={rowRef}
      className={[
        'proto-note-row-item',
        selectMode ? 'proto-note-row-item--selectable' : '',
        selected ? 'proto-note-row-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {selectable ? (
        <button
          type="button"
          className="proto-note-row__select"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? `Deselect ${item.title}` : `Select ${item.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey && onSelectRangeTo) onSelectRangeTo();
            else onToggleSelected?.();
          }}
        >
          {selected ? (
            <span className="proto-accent-check-orb proto-accent-check-orb--selected">
              <Icon name="check" size={11} />
            </span>
          ) : (
            <span className="proto-select-orb-idle" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        className="proto-note-row__main"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return onToggleSelected?.();
          if (e.shiftKey && onSelectRangeTo) return onSelectRangeTo();
          /* Opening a resource leaves the app, so a standing selection must
             retarget the click — otherwise building a set of five sends you to
             five other sites. */
          if (selectMode) return onToggleSelected?.();
          onOpen();
        }}
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
        {/* No description preview. A resource is a thing you go and open, so its
            own blurb is noise on the way there — the line says what it is and
            where it lives, and nothing else. */}
        {subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">
            <span className="pds-list-timestamp">{subtitle}</span>
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
 *
 * Exported because a room's shelf asks for exactly this form with a different
 * destination. Only the two saves differ; the staging, the link preview, the
 * error copy and the drop handling are the same decisions either way, and a
 * second copy of them would be a second place for them to drift.
 */
export function AddResourceForm({
  onSaved,
  droppedFile,
  onDroppedFileConsumed,
  destination,
}: {
  onSaved: () => void;
  /** File dropped on the list — adopted as if it had been picked here. */
  droppedFile?: File | null;
  onDroppedFileConsumed?: () => void;
  /** Where a save lands. Defaults to the viewer's own library. */
  destination?: {
    saveLink: (input: {
      url: string;
      title?: string;
      description?: string;
      siteName?: string;
      image?: string;
    }) => Promise<unknown>;
    saveFile: (input: { file: File; title?: string }) => Promise<unknown>;
    busy: boolean;
  };
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

  const busy =
    preview.isPending || (destination ? destination.busy : create.isPending || upload.isPending);

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
        const input = { file, title: title.trim() || undefined };
        await (destination ? destination.saveFile(input) : upload.mutateAsync(input));
      } else {
        const trimmed = url.trim();
        if (!trimmed) return;
        const input = {
          url: trimmed,
          title: title.trim() || undefined,
          description: pendingMeta?.description || undefined,
          siteName: pendingMeta?.siteName ?? undefined,
          image: pendingMeta?.image ?? undefined,
        };
        await (destination ? destination.saveLink(input) : create.mutateAsync(input));
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
        {/* Cancel is a dismiss on the panel it closes, not a button competing in
            the column of things you came here to press. Full-width and last, it
            sat exactly where the eye lands after "Choose a file" — the one place
            a "no thanks" should never be. */}
        <div className="proto-resource-add__head">
          <span className="proto-resource-add__head-title">Add a resource</span>
          <button
            type="button"
            className="proto-resource-add__dismiss"
            onClick={reset}
            aria-label="Cancel adding a resource"
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>

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

/**
 * A church resource, read-only.
 *
 * Same row anatomy as a personal one, minus the kebab: these belong to the
 * church, and a member "removing" one would either be a lie — it returns on
 * the next refetch — or a right they do not have. Opening is the interaction.
 */
type ResourceSourceTab = 'all' | 'yours' | 'church';

/** One row in the merged list, tagged so it can be rendered by the right component. */
type MergedResourceRow =
  | { key: string; source: 'mine'; item: LibraryItem }
  | { key: string; source: 'church'; item: ChurchLibraryItem };

function ChurchResourceRow({
  item,
  churchName,
  onOpen,
}: {
  item: ChurchLibraryItem;
  churchName: string | null;
  onOpen: () => void;
}) {
  /* What it is, then whose shelf. The church is named here rather than in a
     heading — a row that says where it came from travels with the item, so the
     list reads the same whether it's filtered or not. */
  const subtitle = [
    item.kind === 'file'
      ? resourceFileLabel(item.fileMime, null, item.fileName)
      : resourceSourceLabel(item.sourceDomain, item.sourceSiteName),
    churchName ?? 'Church Library',
  ]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <li className="proto-note-row-item">
      <button
        type="button"
        className="proto-note-row__main"
        onClick={onOpen}
        aria-label={`Church resource: ${item.title}`}
      >
        <div className="proto-note-row__title-line">
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name="newspaper" size={11} />
          </span>
          <span
            className="pds-list-title proto-note-row__title-text proto-marquee"
            title={item.title}
          >
            <span>{item.title}</span>
          </span>
        </div>
        {/* Description dropped for the same reason as the personal row. "Leaders"
            stays: it explains why an item is visible to this reader and not to
            the person beside them, which nothing else on the row says. */}
        {subtitle || item.access === 'leaders' ? (
          <div className="pds-list-preview proto-note-row__preview">
            {subtitle ? <span className="pds-list-timestamp">{subtitle}</span> : null}
            {item.access === 'leaders' ? (
              <span className="pds-list-timestamp">{subtitle ? '  ·  Leaders' : 'Leaders'}</span>
            ) : null}
          </div>
        ) : null}
      </button>
    </li>
  );
}

/**
 * This room's shelf, in the list view's own row anatomy.
 *
 * The scope bar above already asked "this space or My Home", so this answers
 * only the first — no source chips, because a room's shelf has one source and a
 * filter with a single option is furniture. The other scope keeps the All / My
 * Library / Church Library chips, which is the same question one level down.
 */
function SpaceShelfList({
  items,
  query,
  isPending,
  isError,
  canManage,
}: {
  items: SpaceLibraryItem[];
  query: string;
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
}) {
  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) return items;
    return items.filter((item) =>
      [item.title, item.sourceSiteName, item.sourceDomain, item.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(trimmed)),
    );
  }, [items, trimmed]);

  if (isPending) return <ProtoSpaceLoading label="Loading resources" />;
  if (isError) {
    return (
      <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
        Could not load this space&apos;s resources.
      </p>
    );
  }

  if (filtered.length === 0) {
    return trimmed ? (
      <PrototypeListNoMatchEmptyState title="No resources match" />
    ) : (
      <PrototypeListEmptyState
        iconName="newspaper"
        title="Nothing on the shelf yet"
        description={
          canManage
            ? 'Add a link or a file and everyone in this space will see it here.'
            : 'Resources added for this space will show up here.'
        }
      />
    );
  }

  return (
    <ul className="proto-note-list">
      {filtered.map((item) => (
        <SpaceResourceRow
          key={item.id}
          item={item}
          onOpen={() => {
            if (item.kind === 'file') void openLibraryFileItem(item.id);
            else if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener');
          }}
        />
      ))}
    </ul>
  );
}

/** A space-shelf row. Same anatomy as the church one, minus the church's name. */
function SpaceResourceRow({
  item,
  onOpen,
}: {
  item: SpaceLibraryItem;
  onOpen: () => void;
}) {
  const subtitle = [
    item.kind === 'file'
      ? resourceFileLabel(item.fileMime, null, item.fileName)
      : resourceSourceLabel(item.sourceDomain, item.sourceSiteName),
    item.pinned ? 'Pinned' : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <li className="proto-note-row-item">
      <button
        type="button"
        className="proto-note-row__main"
        onClick={onOpen}
        aria-label={`Space resource: ${item.title}`}
      >
        <div className="proto-note-row__title-line">
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name="newspaper" size={11} />
          </span>
          <span
            className="pds-list-title proto-note-row__title-text proto-marquee"
            title={item.title}
          >
            <span>{item.title}</span>
          </span>
        </div>
        {subtitle ? (
          <div className="pds-list-preview proto-note-row__preview">
            <span className="pds-list-timestamp">{subtitle}</span>
          </div>
        ) : null}
      </button>
    </li>
  );
}

export default function PrototypeResourceLibraryList({
  query,
  onOpenResource,
  spaceId = null,
}: {
  /** Sidebar search text — filters by title, site name, and domain. */
  query: string;
  onOpenResource: (item: LibraryItem) => void;
  /**
   * Set when the list is scoped to a shared space ("This space"). The personal
   * and church shelves are what "My Home" means, so they are a different scope
   * rather than a section of this one.
   */
  spaceId?: string | null;
}) {
  const libraryQuery = useLibrary();
  /*
    The church's shelf is a section of this list, not a second list. A member's
    resources are "what I can reach for" — where a thing came from is a label
    on the row, not a place they should have to go and look.
  */
  const churchQuery = useChurchLibraryUnion();
  /* The room's own shelf, when scoped to it. Both hooks are called
     unconditionally and no-op without a space id. */
  const spaceQuery = useSpaceLibrary(spaceId, { enabled: Boolean(spaceId) });
  const spaceActions = useSpaceLibraryActions(spaceId);
  const spaceCanManage = spaceQuery.data?.canManage ?? false;
  const archive = useArchiveLibraryItem();
  /*
    Selecting resources. Personal rows only — the ids here are library item ids,
    and the kind on the shell's selection is what keeps them from being read as
    note ids by the note list's own bar.
  */
  const { sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection } = useProtoShell();
  const resourceSelectionActive =
    sidebarSelectionKind === 'resource' && sidebarSelectedIds.length > 0;
  const selectedResourceIds = useMemo(
    () => new Set(resourceSelectionActive ? sidebarSelectedIds : []),
    [resourceSelectionActive, sidebarSelectedIds],
  );
  const selectionAnchorRef = useRef<string | null>(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
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

  const churchItems = churchQuery.data?.items ?? [];
  const churchName = churchQuery.data?.church?.name ?? null;
  const filteredChurch = useMemo(() => {
    if (!trimmedQuery) return churchItems;
    return churchItems.filter((item) =>
      [item.title, item.sourceSiteName, item.sourceDomain, item.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(trimmedQuery)),
    );
  }, [churchItems, trimmedQuery]);

  /* Only worth splitting when there is a second shelf to tell it apart from. */
  const showSections = filteredChurch.length > 0;

  const [sourceTab, setSourceTab] = useState<ResourceSourceTab>('all');
  /* Not the church's own name: "New Hope Assembly of God Church" is longer than
     the sidebar and pushes the other two chips off the edge. Whose shelf it is
     answers the question the tab exists for, and it stays the same width for
     every church. */
  const sourceTabs = useMemo(
    () => [
      { id: 'all' as const, label: 'All' },
      { id: 'yours' as const, label: 'My Library' },
      { id: 'church' as const, label: 'Church Library' },
    ],
    [],
  );
  const showYours = !showSections || sourceTab === 'all' || sourceTab === 'yours';
  const showChurch = sourceTab === 'all' || sourceTab === 'church';

  /**
   * One list, newest first — not a personal block stacked on a church block.
   * Two adjacent `<ul>`s read as sections even with the headings gone, which is
   * the opposite of what the per-row source label is for: the label frees the
   * list to sort by recency like every other list in the app.
   */
  const mergedRows = useMemo(() => {
    const at = (value: string | Date | null | undefined) =>
      value ? new Date(value).getTime() || 0 : 0;
    const rows: MergedResourceRow[] = [];
    if (showYours) {
      for (const item of filtered) rows.push({ key: `mine:${item.id}`, source: 'mine', item });
    }
    if (showChurch) {
      for (const item of filteredChurch) {
        rows.push({ key: `church:${item.id}`, source: 'church', item });
      }
    }
    return rows.sort(
      (a, b) =>
        at(b.item.updatedAt ?? b.item.createdAt) - at(a.item.updatedAt ?? a.item.createdAt),
    );
  }, [filtered, filteredChurch, showYours, showChurch]);

  /** In list order, personal rows only — what a range means here. */
  const selectableResourceIds = useMemo(
    () => mergedRows.filter((r) => r.source === 'mine').map((r) => r.item.id),
    [mergedRows],
  );
  const toggleResourceSelected = useCallback(
    (id: string) => {
      selectionAnchorRef.current = id;
      const base = sidebarSelectionKind === 'resource' ? sidebarSelectedIds : [];
      setSidebarSelection('resource', toggleNoteSelection(base, id));
    },
    [sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection],
  );
  const selectResourceRangeTo = useCallback(
    (id: string) => {
      const base = sidebarSelectionKind === 'resource' ? sidebarSelectedIds : [];
      setSidebarSelection(
        'resource',
        extendNoteSelectionRange({
          selected: base,
          orderedIds: selectableResourceIds,
          anchorId: selectionAnchorRef.current,
          targetId: id,
        }),
      );
      selectionAnchorRef.current = id;
    },
    [sidebarSelectionKind, sidebarSelectedIds, selectableResourceIds, setSidebarSelection],
  );

  /**
   * Removing a batch. "Remove" rather than "Delete": archiving takes an item off
   * your shelf without destroying anything, which is what the row's own menu
   * already calls it.
   */
  const onBulkRemoveResources = useCallback(async () => {
    setBulkRemoving(true);
    try {
      for (const id of sidebarSelectedIds) await archive.mutateAsync(id);
    } catch {
      /* The ones that archived stay archived; the shelf refetches either way. */
    } finally {
      setBulkRemoving(false);
      setSidebarSelection('resource', []);
    }
  }, [sidebarSelectedIds, archive, setSidebarSelection]);

  const resourceBulkBar = resourceSelectionActive ? (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
        disabled={bulkRemoving}
        title="Take these off your shelf"
        onClick={() => void onBulkRemoveResources()}
      >
        <Icon name="trash-can" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">{bulkRemoving ? 'Removing…' : 'Remove'}</span>
      </button>
    </div>
  ) : null;

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
      {spaceId ? (
        <SpaceShelfList
          items={spaceQuery.data?.items ?? []}
          query={query}
          isPending={spaceQuery.isPending}
          isError={spaceQuery.isError}
          canManage={spaceCanManage}
        />
      ) : libraryQuery.isLoading ? (
        <ProtoSpaceLoading label="Loading resources" />
      ) : libraryQuery.isError ? (
        <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
          Could not load your resources.
        </p>
      ) : filtered.length === 0 && filteredChurch.length === 0 ? (
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
        <>
          {/* Chips instead of stacked section headings, matching the church
              surfaces. "All" leads and stays the default so the list still
              answers "what can I reach for" in one view — the reason these were
              one list to begin with; the other two are for when you know which
              shelf you want. */}
          {showSections ? (
            <ProtoChipBar
              ariaLabel="Which resources"
              options={sourceTabs}
              selectedId={sourceTab}
              onSelect={setSourceTab}
            />
          ) : null}

          {/* One list, newest first. No headings: every row names its own shelf
              on its second line, and that label travels with the item — a heading
              only holds while the list is grouped, and stops being true the
              moment you filter or search. */}
          <ul className="proto-note-list">
            {mergedRows.map((row) =>
              row.source === 'mine' ? (
                <ResourceRow
                  key={row.key}
                  item={row.item}
                  selectable
                  selectMode={resourceSelectionActive}
                  selected={selectedResourceIds.has(row.item.id)}
                  onToggleSelected={() => toggleResourceSelected(row.item.id)}
                  onSelectRangeTo={() => selectResourceRangeTo(row.item.id)}
                  onOpen={() => onOpenResource(row.item)}
                  isArchiving={archive.isPending && archivingId === row.item.id}
                  onArchive={() => {
                    setArchivingId(row.item.id);
                    void archive.mutateAsync(row.item.id).finally(() => setArchivingId(null));
                  }}
                />
              ) : (
                <ChurchResourceRow
                  key={row.key}
                  item={row.item}
                  churchName={churchName}
                  onOpen={() => {
                    /* A church file lives in a private bucket with no sourceUrl,
                       so opening it means minting a signed URL — without this the
                       row was inert. */
                    if (row.item.kind === 'file') void openLibraryFileItem(row.item.id);
                    else if (row.item.sourceUrl) {
                      window.open(row.item.sourceUrl, '_blank', 'noopener');
                    }
                  }}
                />
              ),
            )}
          </ul>

          {/* Only on the church's own tab. On "All" it read as an action for the
              whole list, which it isn't — and it sat under personal rows it has
              nothing to do with. A card, because here it's the invitation at the
              end of that shelf rather than a row you might mistake for one. */}
          {sourceTab === 'church' && churchQuery.data?.church ? (
            <button
              type="button"
              className="proto-resource-suggest-card"
              onClick={() => setSuggestOpen(true)}
            >
              <span className="proto-resource-suggest-card__title">Missing something?</span>
              <span className="proto-resource-suggest-card__body">
                Suggest a resource for {churchName ?? 'your church'} to add.
              </span>
            </button>
          ) : null}
        </>
      )}

      {/* The list's own action, pinned to the bottom — the same footer the
          expanded planner and the sheets use, so "the primary thing you can do
          here" is always in the same place and always the gradient button.
          At the top it was a full-width control you had to scroll past to reach
          what you came to read. */}
      {/* While a selection stands its actions take the footer's place — adding a
          resource is not what you are in the middle of. */}
      {resourceBulkBar}
      {!resourceBulkBar && (!spaceId || spaceCanManage) ? (
        <div className="proto-resource-footer">
          <AddResourceForm
            onSaved={() => (spaceId ? undefined : void libraryQuery.refetch())}
            droppedFile={droppedFile}
            onDroppedFileConsumed={() => setDroppedFile(null)}
            destination={
              spaceId
                ? {
                    busy: spaceActions.isPending,
                    saveLink: (input) => spaceActions.mutateAsync({ kind: 'link', ...input }),
                    saveFile: (input) => spaceActions.mutateAsync({ kind: 'upload', ...input }),
                  }
                : undefined
            }
          />
        </div>
      ) : null}

      <PrototypeSuggestResourceSheet
        open={suggestOpen}
        churchName={churchName}
        onOpenChange={setSuggestOpen}
      />
    </div>
  );
}
