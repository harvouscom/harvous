/**
 * Browse / apply note templates — same dialog chrome as Add Notes:
 * scope chips outside the gray card; search + list inside.
 * Chip tabs: All → Included → Saved → {space} (Church/org later).
 * Saved / space rows: ⋮ Edit / Delete (edit closes browse → inspector panel).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { getBuiltInTemplates } from '@/data/note-templates';
import { toast } from '@/utils/toast';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { APIError } from '../../lib/api';
import { useDeleteNoteTemplate } from '../../hooks/mutations/useDeleteNoteTemplate';
import {
  useNoteTemplates,
  type ApplyableNoteTemplate,
} from '../../hooks/queries/useNoteTemplates';
import {
  useProtoAnchoredPopoverPosition,
  type ProtoAnchoredPopoverStrategy,
} from './useProtoAnchoredPopoverPosition';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { PrototypeListEmptyState, PrototypeListNoMatchEmptyState } from './design-system';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import {
  NOTE_TEMPLATE_ICON_NAME,
  resolveNoteTemplateIconColor,
} from '@/utils/note-template-icon';

export type EditableNoteTemplate = ApplyableNoteTemplate & {
  description?: string | null;
  spaceId?: string | null;
  section: 'personal' | 'space';
};

type BrowseTemplateRow = ApplyableNoteTemplate & {
  description?: string;
  estimatedMinutes?: string;
  level?: string;
  createdAt?: string | null;
  spaceId?: string | null;
};

type TemplateScopeTab = 'all' | 'builtIn' | 'personal' | 'space';

export interface PrototypeBrowseTemplatesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId?: string | null;
  /** Shared/public space display name for the space-templates tab. */
  spaceTitle?: string | null;
  /** When true, show the space-owner templates tab. */
  showSpaceSection?: boolean;
  /** Owner/leader may edit/delete space templates (and see Edit on those rows). */
  canManageSpaceTemplates?: boolean;
  onApply: (template: ApplyableNoteTemplate) => void;
  /** Opens inspector edit panel for a personal/space template. */
  onEdit?: (template: EditableNoteTemplate) => void;
  /** `main-column-top-right` for inspector flows; default `anchor` for trigger-relative. */
  placement?: ProtoAnchoredPopoverStrategy;
  anchorEl?: HTMLElement | null;
  anchorRect?: DOMRect | null;
}

function templateScopeOptions(
  spaceLabel: string,
  showSpaceTab: boolean,
): ProtoChipOption<TemplateScopeTab>[] {
  const options: ProtoChipOption<TemplateScopeTab>[] = [
    { id: 'all', label: 'All' },
    { id: 'builtIn', label: 'Included' },
    { id: 'personal', label: 'Saved' },
  ];
  if (showSpaceTab) {
    options.push({ id: 'space', label: spaceLabel });
  }
  return options;
}

function TemplateListRow({
  template,
  showActions,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onApply,
  onEdit,
  onRequestDelete,
}: {
  template: BrowseTemplateRow;
  showActions: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onApply: (template: BrowseTemplateRow) => void;
  onEdit: (template: BrowseTemplateRow) => void;
  onRequestDelete: (template: BrowseTemplateRow, anchorRect: DOMRect) => void;
}) {
  const description = template.description?.trim() || '';
  const iconColor = resolveNoteTemplateIconColor(template.id, template.iconColor);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (menuRootRef.current?.contains(target)) return;
      onCloseMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMenu();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <li
      className={`proto-browse-templates-sheet__item${
        menuOpen ? ' proto-browse-templates-sheet__item--menu-open' : ''
      }`}
    >
      <button
        type="button"
        className={`proto-browse-templates-sheet__item-btn${
          description ? '' : ' proto-browse-templates-sheet__item-btn--no-desc'
        }${showActions ? ' proto-browse-templates-sheet__item-btn--has-menu' : ''}`}
        onClick={() => onApply(template)}
        aria-label={`Apply ${template.name}`}
      >
        <span className="proto-browse-templates-sheet__item-icon" aria-hidden>
          <ProtoSpaceMenuIcon
            color={iconColor}
            iconName={NOTE_TEMPLATE_ICON_NAME}
            size={28}
            radius={8}
            glyphSize={13}
          />
        </span>
        <span className="proto-browse-templates-sheet__item-main">
          <div className="proto-browse-templates-sheet__item-top">
            <span className="proto-browse-templates-sheet__item-name">{template.name}</span>
          </div>
          {description ? (
            <p className="proto-browse-templates-sheet__item-desc">{description}</p>
          ) : null}
        </span>
      </button>
      {showActions ? (
        <div
          className={`proto-menu proto-browse-templates-sheet__item-menu${
            menuOpen ? ' proto-browse-templates-sheet__item-menu--open' : ''
          }`}
          ref={menuRootRef}
        >
          <button
            type="button"
            className="proto-browse-templates-sheet__item-menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Actions for ${template.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleMenu();
            }}
          >
            <Icon name="ellipsis-vertical" size={14} />
          </button>
          {menuOpen ? (
            <div
              className="proto-menu__popover proto-menu__popover--right proto-menu__popover--list-view proto-browse-templates-sheet__row-menu-popover"
              role="menu"
              aria-label={`${template.name} actions`}
            >
              <div className="proto-menu-section" role="group">
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(template);
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="pen-to-square" size={PROTO_TOOLBAR_ICON_SIZE} />
                  </span>
                  <span className="proto-menu-item__label">Edit</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item proto-menu-item--destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(template, e.currentTarget.getBoundingClientRect());
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                  </span>
                  <span className="proto-menu-item__label">Delete</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function PrototypeBrowseTemplatesSheet({
  open,
  onOpenChange,
  spaceId = null,
  spaceTitle = null,
  showSpaceSection = false,
  canManageSpaceTemplates = false,
  onApply,
  onEdit,
  placement = 'main-column-top-right',
  anchorEl = null,
  anchorRect = null,
}: PrototypeBrowseTemplatesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const listSpaceId = spaceId?.trim() || null;
  const { data, isLoading, isError } = useNoteTemplates(listSpaceId, open);
  const deleteTemplate = useDeleteNoteTemplate();
  const [scopeTab, setScopeTab] = useState<TemplateScopeTab>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    anchorRect: DOMRect;
  } | null>(null);
  const { input: searchInput, setInput: setSearchInput, debounced: debouncedSearch } =
    useDebouncedSearchState(200);

  useEffect(() => {
    if (open) {
      setScopeTab('all');
      setSearchInput('');
      setOpenMenuId(null);
      setDeleteTarget(null);
    }
  }, [open, setSearchInput]);

  useEffect(() => {
    if (scopeTab === 'space' && !showSpaceSection) setScopeTab('all');
  }, [scopeTab, showSpaceSection]);

  const sections = useMemo(() => {
    const builtInFallback = getBuiltInTemplates();
    const builtInById = new Map(builtInFallback.map((t) => [t.id, t]));
    const builtInSource: BrowseTemplateRow[] = data?.builtIn?.length
      ? data.builtIn.map((t) => {
          const local = builtInById.get(t.id);
          return {
            id: t.id,
            name: t.name,
            title: t.title ?? '',
            content: t.content,
            noteType: t.noteType || 'default',
            section: 'builtIn' as const,
            iconColor: t.iconColor ?? local?.iconColor ?? null,
            description: t.description ?? local?.description,
            estimatedMinutes: t.estimatedMinutes ?? local?.estimatedMinutes,
            level: t.level ?? local?.level,
          };
        })
      : builtInFallback.map((t) => ({
          id: t.id,
          name: t.name,
          title: t.titleTemplate ?? '',
          content: t.content,
          noteType: t.noteType || 'default',
          section: 'builtIn' as const,
          iconColor: t.iconColor,
          description: t.description,
          estimatedMinutes: t.estimatedMinutes,
          level: t.level,
        }));
    const personal: BrowseTemplateRow[] = (data?.personal ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title ?? '',
      content: t.content,
      noteType: t.noteType || 'default',
      section: 'personal',
      iconColor: t.iconColor ?? null,
      description: t.description ?? undefined,
      createdAt: toIso(t.createdAt),
      spaceId: null,
    }));
    const space: BrowseTemplateRow[] = (data?.space ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title ?? '',
      content: t.content,
      noteType: t.noteType || 'default',
      section: 'space',
      iconColor: t.iconColor ?? null,
      description: t.description ?? undefined,
      createdAt: toIso(t.createdAt),
      spaceId: t.spaceId ?? listSpaceId,
    }));
    return { builtIn: builtInSource, personal, space };
  }, [data, listSpaceId]);

  const itemCount =
    sections.builtIn.length + sections.personal.length + sections.space.length;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    { anchorEl, anchorRect },
    { enabled: showPopoverPortal, strategy: placement },
    // Omit scopeTab — tab switches only swap list body; remeasure would thrash layout.
    [itemCount, isLoading, isError, showSpaceSection],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !deleteTarget, {
    ignoreSelector: '.harvous-delete-confirm, .proto-browse-templates-sheet__row-menu-popover',
  });

  const handleApply = (template: BrowseTemplateRow) => {
    const {
      description: _d,
      estimatedMinutes: _m,
      level: _l,
      createdAt: _c,
      spaceId: _s,
      ...applyable
    } = template;
    onApply(applyable);
    onOpenChange(false);
  };

  const handleEdit = (template: BrowseTemplateRow) => {
    if (!onEdit || (template.section !== 'personal' && template.section !== 'space')) return;
    setOpenMenuId(null);
    onEdit({
      id: template.id,
      name: template.name,
      title: template.title,
      content: template.content,
      noteType: template.noteType,
      section: template.section,
      iconColor: template.iconColor ?? null,
      description: template.description ?? null,
      spaceId: template.spaceId ?? null,
    });
  };

  const handleRequestDelete = (template: BrowseTemplateRow, rect: DOMRect) => {
    setOpenMenuId(null);
    setDeleteTarget({ id: template.id, name: template.name, anchorRect: rect });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate.mutateAsync(deleteTarget.id);
      toast.success('Template deleted');
      setDeleteTarget(null);
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not delete template';
      toast.error(msg);
    }
  };

  const rowCanShowActions = (template: BrowseTemplateRow) => {
    if (!onEdit) return false;
    if (template.section === 'personal') return true;
    if (template.section === 'space') return canManageSpaceTemplates;
    return false;
  };

  const spaceTabLabel = truncateChipLabel(spaceTitle?.trim() || 'Space', 12);
  const spaceCaption = spaceTitle?.trim() || 'This space';
  const searchTrim = debouncedSearch.trim().toLowerCase();

  const activeItems = useMemo(() => {
    const source =
      scopeTab === 'all'
        ? [
            ...sections.builtIn,
            ...sections.personal,
            ...(showSpaceSection ? sections.space : []),
          ]
        : scopeTab === 'personal'
          ? sections.personal
          : scopeTab === 'space'
            ? sections.space
            : sections.builtIn;
    if (!searchTrim) return source;
    return source.filter((t) => templateMatchesSearch(t, searchTrim));
  }, [scopeTab, sections, searchTrim, showSpaceSection]);

  const categoryEmpty = categoryEmptyCopy(scopeTab, spaceCaption);

  const showApiErrorHint = isError && !data;
  const showNoMatch = searchTrim.length > 0 && activeItems.length === 0;
  const showCategoryEmpty = !searchTrim && activeItems.length === 0;

  const tabPanelLabel =
    scopeTab === 'all'
      ? 'All templates'
      : scopeTab === 'personal'
        ? 'Saved'
        : scopeTab === 'space'
          ? spaceTabLabel
          : 'Included';

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="list-check" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">Templates</span>
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

      <div className="proto-add-notes-sheet__picker">
        <div className="proto-sidebar-search-scope proto-add-notes-sheet__scope">
          <ProtoChipBar
            ariaLabel="Filter templates"
            options={templateScopeOptions(spaceTabLabel, showSpaceSection)}
            selectedId={scopeTab}
            onSelect={setScopeTab}
          />
        </div>
        <div className="proto-add-notes-sheet__scoped-list">
          <div className="proto-sidebar-search proto-add-notes-sheet__search-in-panel">
            <PrototypeSearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search"
              ariaLabel="Search templates"
            />
          </div>
          <div
            className="proto-add-notes-sheet__scoped-list-body"
            role="tabpanel"
            aria-label={tabPanelLabel}
          >
            {isLoading && !data ? (
              <ProtoSpaceLoading label="Loading templates" />
            ) : (
              <>
                {showApiErrorHint ? (
                  <p className="proto-inspector-muted proto-connect-note-sheet__status">
                    Couldn’t reach saved templates — showing included ones.
                  </p>
                ) : null}
                {activeItems.length > 0 ? (
                  <ul className="proto-browse-templates-sheet__list">
                    {activeItems.map((t) => {
                      const rowKey = `${t.section}-${t.id}`;
                      return (
                        <TemplateListRow
                          key={rowKey}
                          template={t}
                          showActions={rowCanShowActions(t)}
                          menuOpen={openMenuId === rowKey}
                          onToggleMenu={() =>
                            setOpenMenuId((cur) => (cur === rowKey ? null : rowKey))
                          }
                          onCloseMenu={() => setOpenMenuId(null)}
                          onApply={handleApply}
                          onEdit={handleEdit}
                          onRequestDelete={handleRequestDelete}
                        />
                      );
                    })}
                  </ul>
                ) : showNoMatch ? (
                  <div className="proto-browse-templates-sheet__empty">
                    <PrototypeListNoMatchEmptyState title="No matching templates" />
                  </div>
                ) : showCategoryEmpty ? (
                  <div className="proto-browse-templates-sheet__empty">
                    <PrototypeListEmptyState
                      iconName={categoryEmpty.iconName}
                      title={categoryEmpty.title}
                      description={categoryEmpty.description}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const deleteConfirm =
    deleteTarget && typeof document !== 'undefined' ? (
      <ProtoConfirmDialog
        anchorRect={deleteTarget.anchorRect}
        title={`Delete “${deleteTarget.name}”?`}
        confirmLabel="Delete"
        busy={deleteTemplate.isPending}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteTemplate.isPending) setDeleteTarget(null);
        }}
      />
    ) : null;

  if (showPopoverPortal && typeof document !== 'undefined') {
    return (
      <>
        {createPortal(
          <>
            <ProtoDialogBackdrop
              exiting={exiting}
              onDismiss={() => onOpenChange(false)}
              aria-label="Close templates dialog"
            />
            <ProtoPopoverShell
              ref={cardRef}
              role="dialog"
              aria-label="Templates"
              className={portaledDialogShellClassName('proto-connect-note-popover', exiting)}
              style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                zIndex: 6000,
              }}
            >
              <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-add-notes-sheet proto-browse-templates-sheet">
                {content}
              </div>
            </ProtoPopoverShell>
          </>,
          document.body,
        )}
        {deleteConfirm}
      </>
    );
  }

  if (!open) return null;

  return (
    <>
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          onOverlayClick={() => onOpenChange(false)}
          overlayClassName="proto-connect-note-sheet-overlay"
          className="proto-connect-note-sheet proto-add-notes-sheet proto-browse-templates-sheet"
        >
          {content}
        </DrawerContent>
      </Drawer.Root>
      {deleteConfirm}
    </>
  );
}

function truncateChipLabel(label: string, max: number): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  try {
    return value.toISOString();
  } catch {
    return null;
  }
}

function templateMatchesSearch(template: BrowseTemplateRow, queryLower: string): boolean {
  if (!queryLower) return true;
  const haystack = [
    template.name,
    template.description ?? '',
    template.title,
    template.estimatedMinutes ?? '',
    template.level ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(queryLower);
}

function categoryEmptyCopy(
  scopeTab: TemplateScopeTab,
  spaceCaption: string,
): { iconName: string; title: string; description: string } {
  switch (scopeTab) {
    case 'personal':
      return {
        iconName: 'list-check',
        title: 'No saved templates',
        description: 'Save a note as a template to reuse it later.',
      };
    case 'space':
      return {
        iconName: 'list-check',
        title: 'No space templates',
        description: `Nothing shared in ${spaceCaption} yet.`,
      };
    case 'builtIn':
      return {
        iconName: 'list-check',
        title: 'No included templates',
        description: 'Included study methods will appear here.',
      };
    case 'all':
    default:
      return {
        iconName: 'list-check',
        title: 'No templates yet',
        description: 'Save a note as a template, or start from an included method.',
      };
  }
}
