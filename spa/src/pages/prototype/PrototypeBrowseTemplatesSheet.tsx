/**
 * Browse / apply note templates — Connect-note dialog/sheet shell + Add Notes list chrome.
 * Search first; chip tabs filter: All → Included → Saved → {space} (Church/org later).
 * List scrolls in `.proto-add-notes-sheet__scoped-list-body` (same as Add Notes).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { getBuiltInTemplates } from '@/data/note-templates';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  useNoteTemplates,
  type ApplyableNoteTemplate,
} from '../../hooks/queries/useNoteTemplates';
import {
  useProtoAnchoredPopoverPosition,
  type ProtoAnchoredPopoverStrategy,
} from './useProtoAnchoredPopoverPosition';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import { PrototypeListEmptyState, PrototypeListNoMatchEmptyState } from './design-system';

type BrowseTemplateRow = ApplyableNoteTemplate & {
  description?: string;
  estimatedMinutes?: string;
  level?: string;
  createdAt?: string | null;
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
  onApply: (template: ApplyableNoteTemplate) => void;
  /** `main-column-top-right` for inspector flows; default `anchor` for trigger-relative. */
  placement?: ProtoAnchoredPopoverStrategy;
  anchorEl?: HTMLElement | null;
  anchorRect?: DOMRect | null;
}

function TemplatesScopeChipBar({
  selectedId,
  onSelect,
  spaceLabel,
  showSpaceTab,
}: {
  selectedId: TemplateScopeTab;
  onSelect: (id: TemplateScopeTab) => void;
  spaceLabel: string;
  showSpaceTab: boolean;
}) {
  const options: { id: TemplateScopeTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'builtIn', label: 'Included' },
    { id: 'personal', label: 'Saved' },
  ];
  if (showSpaceTab) {
    options.push({ id: 'space', label: spaceLabel });
  }
  return (
    <div className="proto-sidebar-search-scope proto-add-notes-sheet__scope">
      <div className="proto-chip-bar" role="tablist" aria-label="Filter templates">
        {options.map((opt) => {
          const selected = selectedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateListRow({
  template,
  spaceCaption,
  onApply,
}: {
  template: BrowseTemplateRow;
  spaceCaption: string;
  onApply: (template: BrowseTemplateRow) => void;
}) {
  const caption = categoryCaption(template.section, spaceCaption);
  const description = rowPreview(template, spaceCaption);

  return (
    <li className="proto-browse-templates-sheet__item">
      <button
        type="button"
        className="proto-browse-templates-sheet__item-btn"
        onClick={() => onApply(template)}
        aria-label={`Apply ${template.name}, ${caption}`}
      >
        <div className="proto-browse-templates-sheet__item-top">
          <span className="proto-browse-templates-sheet__item-name">{template.name}</span>
          <span className="proto-home-tag-chip proto-browse-templates-sheet__item-cat">
            {caption}
          </span>
        </div>
        {description ? (
          <p className="proto-browse-templates-sheet__item-desc">{description}</p>
        ) : null}
      </button>
    </li>
  );
}

export default function PrototypeBrowseTemplatesSheet({
  open,
  onOpenChange,
  spaceId = null,
  spaceTitle = null,
  showSpaceSection = false,
  onApply,
  placement = 'main-column-top-right',
  anchorEl = null,
  anchorRect = null,
}: PrototypeBrowseTemplatesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const listSpaceId = spaceId?.trim() || null;
  const { data, isLoading, isError } = useNoteTemplates(listSpaceId, open);
  const [scopeTab, setScopeTab] = useState<TemplateScopeTab>('all');
  const { input: searchInput, setInput: setSearchInput, debounced: debouncedSearch } =
    useDebouncedSearchState(200);

  useEffect(() => {
    if (open) {
      setScopeTab('all');
      setSearchInput('');
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
      createdAt: toIso(t.createdAt),
    }));
    const space: BrowseTemplateRow[] = (data?.space ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title ?? '',
      content: t.content,
      noteType: t.noteType || 'default',
      section: 'space',
      createdAt: toIso(t.createdAt),
    }));
    return { builtIn: builtInSource, personal, space };
  }, [data]);

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

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const handleApply = (template: BrowseTemplateRow) => {
    const { description: _d, estimatedMinutes: _m, level: _l, createdAt: _c, ...applyable } =
      template;
    onApply(applyable);
    onOpenChange(false);
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

      <div className="proto-add-notes-sheet__scoped-list">
        {/* Same chrome as Add Notes: fixed search/chips, list scrolls in scoped-list-body. */}
        <div className="proto-connect-note-sheet__search-wrap proto-add-notes-sheet__search-in-panel">
          <PrototypeSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search templates…"
          />
        </div>
        <TemplatesScopeChipBar
          selectedId={scopeTab}
          onSelect={setScopeTab}
          spaceLabel={spaceTabLabel}
          showSpaceTab={showSpaceSection}
        />
        <div
          className="proto-add-notes-sheet__scoped-list-body"
          role="tabpanel"
          aria-label={tabPanelLabel}
        >
          {isLoading && !data ? (
            <p className="proto-inspector-muted proto-connect-note-sheet__status">Loading…</p>
          ) : (
            <>
              {showApiErrorHint ? (
                <p className="proto-inspector-muted proto-connect-note-sheet__status">
                  Couldn’t reach saved templates — showing included ones.
                </p>
              ) : null}
              {activeItems.length > 0 ? (
                <ul className="proto-browse-templates-sheet__list">
                  {activeItems.map((t) => (
                    <TemplateListRow
                      key={`${t.section}-${t.id}`}
                      template={t}
                      spaceCaption={spaceCaption}
                      onApply={handleApply}
                    />
                  ))}
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
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
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
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-add-notes-sheet proto-browse-templates-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
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

function categoryCaption(section: BrowseTemplateRow['section'], spaceCaption: string): string {
  switch (section) {
    case 'personal':
      return 'Saved';
    case 'space':
      return truncateChipLabel(spaceCaption, 14);
    case 'builtIn':
    default:
      return 'Included';
    // Future: org / Church → 'Church'
  }
}

function rowPreview(template: BrowseTemplateRow, spaceCaption: string): string {
  const description = template.description?.trim();
  if (description) return description;
  if (template.section === 'personal') return 'Your template';
  if (template.section === 'space') return spaceCaption;
  return 'Study method template';
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
