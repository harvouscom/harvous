/**
 * Fixture previews for design-system foundation scenes.
 * Uses production tokens + primitives — edit linked files; HMR updates here.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import DeleteConfirmBar from '@/components/react/DeleteConfirmBar';
import Icon from '@/components/react/Icon';
import ProtoRowSelectCheckbox from '../../prototype/ProtoRowSelectCheckbox';
import {
  PrototypeListEmptyState,
  PrototypeListRow,
  PrototypePaneEmptyState,
  PrototypeSearchInput,
  PrototypeSectionHeader,
} from '../../prototype/design-system';
import ProtoPopoverShell from '../../prototype/ProtoPopoverShell';
import PrototypePaperStack from '../../prototype/PrototypePaperStack';
import type { PaperStackOrigin } from '../../../layouts/proto-shell-context';
import ProtoThreadTrailOrb from '../../prototype/ProtoThreadTrailOrb';
import PrototypeStudyFeedPart from '../../prototype/PrototypeStudyFeedPart';
import { buildStudyFeedDays, type StudyFeedItem } from '@/utils/study-feed-items';
import { AppearancePreviewTile } from '../../prototype/settings/AppearancePreviewTile';
import {
  BG_PRESETS,
  IMAGE_PRESETS_DARK,
  IMAGE_PRESETS_LIGHT,
  imagePresetUrl,
  presetDisplayLabel,
} from '../../../lib/prototype-background';
import PassageContextStrip, { primePassageContextCache } from '@/components/react/PassageContextStrip';
import PrototypeReaderInspectorPane from '../../prototype/PrototypeReaderInspectorPane';
import PrototypeNoteAudienceBar from '../../prototype/PrototypeNoteAudienceBar';
import PrototypeNoteDestinationSheet, {
  type NoteDestination,
} from '../../prototype/PrototypeNoteDestinationSheet';
import PrototypeTranslationRow, {
  type TranslationRowState,
} from '../../prototype/settings/PrototypeTranslationRow';
import type { FontChoice } from '../../../lib/proto-font-prefs';
import type { DesignSystemScene } from './sceneRegistry';

function Swatch({ label, varName }: { label: string; varName: string }) {
  return (
    <div className="pds-gallery-swatch">
      <span className="pds-gallery-swatch__chip" style={{ background: `var(${varName})` }} />
      <span className="pds-caption">{label}</span>
      <code className="pds-footnote">{varName}</code>
    </div>
  );
}

function TypographyScene() {
  return (
    <div className="pds-gallery-stack">
      <p className="pds-title-xl">Title XL — page header</p>
      <p className="pds-title">Title — section header</p>
      <p className="pds-compose-title">Compose title</p>
      <p className="pds-note-card-title">Note card title</p>
      <p className="pds-body">Body — study notes and supporting copy use the non-rounded face.</p>
      <p className="pds-list-title">List title</p>
      <p className="pds-list-preview">List preview excerpt sits quieter than the title.</p>
      <p className="pds-list-timestamp">2h ago</p>
      <p className="pds-caption">Caption / metadata</p>
      <p className="pds-footnote">Footnote</p>
      <PrototypeSectionHeader>Inspector section</PrototypeSectionHeader>
    </div>
  );
}

function ColorScene() {
  const lightImages = IMAGE_PRESETS_LIGHT.slice(0, 4);
  const darkImages = IMAGE_PRESETS_DARK.slice(0, 4);

  return (
    <div className="pds-gallery-stack">
      <PrototypeSectionHeader>Surfaces</PrototypeSectionHeader>
      <div className="pds-gallery-swatch-grid">
        <Swatch label="Page" varName="--pds-bg-page" />
        <Swatch label="Sidebar" varName="--pds-bg-sidebar" />
        <Swatch label="Popover" varName="--pds-bg-popover-solid" />
        <Swatch label="Accent" varName="--pds-accent" />
      </div>

      <PrototypeSectionHeader>Appearance colors</PrototypeSectionHeader>
      <div
        className="proto-appearance-carousel proto-appearance-carousel--colors pds-gallery-appearance-carousel"
        role="listbox"
        aria-label="Appearance color presets"
      >
        {BG_PRESETS.map((preset) => (
          <AppearancePreviewTile
            key={preset.id}
            label={presetDisplayLabel(preset, 'light')}
            selected={preset.id === 'paper'}
            canvasColor={preset.light === null ? 'var(--pds-canvas-default)' : preset.light}
            onClick={() => undefined}
          />
        ))}
      </div>

      <PrototypeSectionHeader>Appearance imagery</PrototypeSectionHeader>
      <div className="pds-gallery-image-strips">
        <div
          className="proto-appearance-carousel pds-gallery-appearance-carousel"
          role="listbox"
          aria-label="Light image presets"
        >
          {lightImages.map((preset) => (
            <AppearancePreviewTile
              key={preset.id}
              label={preset.label}
              selected={false}
              canvasImageUrl={imagePresetUrl(preset)}
              glassMode="image"
              onClick={() => undefined}
            />
          ))}
        </div>
        <div
          className="proto-appearance-carousel pds-gallery-appearance-carousel"
          role="listbox"
          aria-label="Dark image presets"
        >
          {darkImages.map((preset) => (
            <AppearancePreviewTile
              key={preset.id}
              label={preset.label}
              selected={false}
              canvasImageUrl={imagePresetUrl(preset)}
              glassMode="image"
              onClick={() => undefined}
            />
          ))}
        </div>
      </div>

      <PrototypeSectionHeader>Semantic status</PrototypeSectionHeader>
      <p className="pds-caption">
        Status hues tint toast icons and destructive copy — not pastel fill blocks. See Toasts for
        ephemeral feedback chrome.
      </p>
      <div className="pds-gallery-swatch-grid">
        <Swatch label="Info" varName="--pds-info" />
        <Swatch label="Warning" varName="--pds-warning" />
        <Swatch label="Destructive" varName="--pds-destructive" />
        <Swatch label="Success" varName="--pds-success" />
      </div>
    </div>
  );
}

function SpacingScene() {
  return (
    <div className="pds-gallery-stack">
      <PrototypeSectionHeader>Spacing scale</PrototypeSectionHeader>
      <div className="pds-gallery-space-row">
        {[1, 2, 3, 4, 5, 6, 8].map((n) => (
          <div key={n} className="pds-gallery-space-item">
            <div className="pds-gallery-space-bar" style={{ width: `var(--pds-space-${n})` }} />
            <code className="pds-footnote">space-{n}</code>
          </div>
        ))}
      </div>
      <PrototypeSectionHeader>Radius</PrototypeSectionHeader>
      <div className="pds-gallery-radius-row">
        {[
          ['input', '--pds-radius-input'],
          ['button', '--pds-radius-button'],
          ['card', '--pds-radius-card'],
          ['menu', '--pds-radius-menu'],
        ].map(([label, token]) => (
          <div key={label} className="pds-gallery-radius-card" style={{ borderRadius: `var(${token})` }}>
            <span className="pds-caption">{label}</span>
          </div>
        ))}
      </div>
      <PrototypeSectionHeader>Elevation</PrototypeSectionHeader>
      <div className="pds-gallery-elevation-row">
        <div className="pds-gallery-elevation-card" style={{ boxShadow: 'var(--pds-shadow-card)' }}>
          Card
        </div>
        <div className="pds-gallery-elevation-card" style={{ boxShadow: 'var(--pds-shadow-popover)' }}>
          Popover
        </div>
      </div>
    </div>
  );
}

function SectionHeaderScene() {
  return (
    <div className="pds-gallery-stack">
      <PrototypeSectionHeader variant="inspector">Inspector</PrototypeSectionHeader>
      <PrototypeSectionHeader variant="search">Search group</PrototypeSectionHeader>
      <PrototypeSectionHeader variant="list">List section</PrototypeSectionHeader>
    </div>
  );
}

/**
 * How a row offers to be selected.
 *
 * Three states, because the reveal differs by what the row already has. A row
 * with a leading kind icon hands that icon's place over — nothing moves. A row
 * without one steps aside while hovered. Selected is always visible: a checked
 * box that faded out would be a selection you could not see you had made.
 *
 * Rendered inert here — hovering a gallery fixture proves nothing about a real
 * list, and the states have to be visible side by side to be compared at all.
 */
function RowSelectScene() {
  return (
    <div className="pds-scene-stack">
      <ul className="proto-note-list" style={{ maxWidth: 320 }}>
        <li className="proto-note-row-item">
          <button type="button" className="proto-note-row__main">
            <div className="proto-note-row__title-line">
              <span className="proto-note-row__kind-icon" aria-hidden>
                <Icon name="highlighter" size={11} />
              </span>
              <span className="pds-list-title proto-note-row__title-text">At rest</span>
            </div>
            <div className="pds-list-preview proto-note-row__preview">
              <span className="pds-list-timestamp">The row keeps its own glyph</span>
            </div>
          </button>
        </li>
        <li className="proto-note-row-item proto-note-row-item--selectable">
          <ProtoRowSelectCheckbox selected={false} label="Offered" onToggle={() => {}} />
          <button type="button" className="proto-note-row__main">
            <div className="proto-note-row__title-line">
              <span className="proto-note-row__kind-icon" aria-hidden>
                <Icon name="highlighter" size={11} />
              </span>
              <span className="pds-list-title proto-note-row__title-text">Offered</span>
            </div>
            <div className="pds-list-preview proto-note-row__preview">
              <span className="pds-list-timestamp">The glyph hands its place over</span>
            </div>
          </button>
        </li>
        <li className="proto-note-row-item proto-note-row-item--selectable proto-note-row-item--selected">
          <ProtoRowSelectCheckbox selected label="Selected" onToggle={() => {}} />
          <button type="button" className="proto-note-row__main">
            <div className="proto-note-row__title-line">
              <span className="proto-note-row__kind-icon" aria-hidden>
                <Icon name="highlighter" size={11} />
              </span>
              <span className="pds-list-title proto-note-row__title-text">Selected</span>
            </div>
            <div className="pds-list-preview proto-note-row__preview">
              <span className="pds-list-timestamp">Always visible, never faded</span>
            </div>
          </button>
        </li>
      </ul>
    </div>
  );
}

function ListRowScene() {
  return (
    <ul className="proto-note-list pds-gallery-list">
      <PrototypeListRow title="Faith and works" preview="James 2 notes from Tuesday" timestamp="2h" active />
      <PrototypeListRow title="Romans overview" preview="Outline for small group" timestamp="Yesterday" />
      <PrototypeListRow
        title="Conversation variant"
        preview="Trailing timestamp layout"
        timestamp="Mon"
        variant="conversation"
      />
    </ul>
  );
}

function SearchScene() {
  const [value, setValue] = useState('Romans');
  return (
    <div className="pds-gallery-stack pds-gallery-stack--narrow">
      <PrototypeSearchInput value={value} onChange={setValue} placeholder="Search notes…" />
      <PrototypeSearchInput value="" onChange={() => undefined} placeholder="Empty field" />
    </div>
  );
}

function EmptyScene() {
  return (
    <div className="pds-gallery-empty-grid">
      <div className="pds-gallery-empty-panel">
        <PrototypeListEmptyState
          iconName="note-sticky"
          title="No notes yet"
          description="Create a note to start this space."
        />
      </div>
      <div className="pds-gallery-empty-panel pds-gallery-empty-panel--pane">
        <PrototypePaneEmptyState
          icon="note-sticky"
          title="Welcome home"
          description="Your notes and shared spaces live here."
        />
      </div>
    </div>
  );
}

function PopoverScene() {
  return (
    <div className="pds-gallery-stack pds-gallery-stack--narrow">
      <ProtoPopoverShell className="proto-menu" style={{ position: 'relative', zIndex: 'var(--pds-z-popover)' as unknown as number }}>
        <div role="menu">
          <button type="button" className="proto-menu-item" role="menuitem">
            Pin note
          </button>
          <button type="button" className="proto-menu-item" role="menuitem">
            Copy link
          </button>
          <button type="button" className="proto-menu-item proto-menu-item--destructive" role="menuitem">
            Delete
          </button>
        </div>
      </ProtoPopoverShell>
      <ProtoPopoverShell
        className="harvous-delete-confirm harvous-delete-confirm--stacked"
        style={{ position: 'relative', zIndex: 'var(--pds-z-popover)' as unknown as number, maxWidth: 300 }}
      >
        <DeleteConfirmBar
          title='Delete “Triple C”?'
          description="Restore within 30 days; notes stay in My Home."
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />
      </ProtoPopoverShell>
      <p className="pds-caption">
        Use <code>usePopoverDismiss</code> + <code>ProtoPopoverShell</code> for menus. Destructive confirms use{' '}
        <code>ProtoConfirmDialog</code> (stacked when <code>description</code> is set; no hairline dividers).
      </p>
    </div>
  );
}

function ButtonsScene() {
  return (
    <div className="pds-gallery-stack">
      <PrototypeSectionHeader>Settings filled</PrototypeSectionHeader>
      <p className="pds-caption">
        Settings / sheet CTAs — <code>.proto-settings-btn</code> (+ <code>--secondary</code>,{' '}
        <code>--destructive</code>).
      </p>
      <div className="pds-gallery-stack pds-gallery-stack--narrow">
        <button type="button" className="proto-settings-btn">
          Primary
        </button>
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
          Secondary (filled)
        </button>
        <button type="button" className="proto-settings-btn proto-settings-btn--destructive">
          Destructive
        </button>
        <button type="button" className="proto-settings-btn" disabled>
          Disabled
        </button>
      </div>

      <PrototypeSectionHeader>Settings segmented</PrototypeSectionHeader>
      <p className="pds-caption">
        Appearance scheme control — <code>.proto-appearance-segmented</code>.
      </p>
      <div className="proto-appearance-segmented pds-gallery-segmented" role="group" aria-label="Color scheme">
        <button type="button" className="proto-appearance-segmented__btn">
          Auto
        </button>
        <button type="button" className="proto-appearance-segmented__btn proto-appearance-segmented__btn--active">
          Light
        </button>
        <button type="button" className="proto-appearance-segmented__btn">
          Dark
        </button>
      </div>

      <PrototypeSectionHeader>Inspector</PrototypeSectionHeader>
      <p className="pds-caption">
        Info side panel — connect, delete, header icon, note ID.
      </p>
      <div className="pds-gallery-btn-row">
        <button type="button" className="proto-side-panel__action-btn" aria-label="Close">
          <Icon name="xmark" size={12} aria-hidden />
        </button>
        <button type="button" className="proto-inspector-connect-btn">
          <Icon name="plus" size={10} aria-hidden />
          Connect
        </button>
        <button type="button" className="proto-inspector-note-id-btn">
          note_abc123
        </button>
      </div>
      <div className="pds-gallery-stack pds-gallery-stack--narrow">
        <button type="button" className="proto-inspector-delete-btn">
          <Icon name="trash-can" size={12} aria-hidden />
          Delete note
        </button>
      </div>

      <PrototypeSectionHeader>Outline / compact</PrototypeSectionHeader>
      <p className="pds-caption">
        Compact bordered actions — <code>.proto-shared-people-row__action</code>,{' '}
        <code>.proto-share-popover__copy</code>.
      </p>
      <div className="pds-gallery-btn-row">
        <button type="button" className="proto-shared-people-row__action">
          Make admin
        </button>
        <button type="button" className="proto-shared-people-row__action proto-shared-people-row__action--destructive">
          Remove
        </button>
        <button type="button" className="proto-share-popover__copy">
          Copy
        </button>
      </div>

      <PrototypeSectionHeader>Text / link actions</PrototypeSectionHeader>
      <p className="pds-caption">
        Quiet text buttons — <code>.proto-share-popover__link-action</code>, <code>.proto-link-quiet</code>,{' '}
        <code>.proto-lock-pin-settings__text-btn</code>.
      </p>
      <div className="pds-gallery-btn-row pds-gallery-btn-row--text">
        <button type="button" className="proto-share-popover__link-action">
          Cancel
        </button>
        <button type="button" className="proto-share-popover__link-action proto-share-popover__link-action--danger">
          Stop sharing
        </button>
        <a href="#gallery" className="proto-link-quiet" onClick={(e) => e.preventDefault()}>
          Quiet link
        </a>
        <button type="button" className="proto-lock-pin-settings__text-btn">
          Forgot PIN?
        </button>
      </div>
    </div>
  );
}

function InputsScene() {
  const [search, setSearch] = useState('James');
  const [name, setName] = useState('Small group');
  const [inspectorTitle, setInspectorTitle] = useState('Romans overview');

  return (
    <div className="pds-gallery-stack pds-gallery-stack--narrow">
      <PrototypeSectionHeader>Search</PrototypeSectionHeader>
      <PrototypeSearchInput value={search} onChange={setSearch} placeholder="Search notes…" />

      <PrototypeSectionHeader>Plain text field</PrototypeSectionHeader>
      <p className="pds-caption">
        Create sheets, church, and account — shared{' '}
        <code>.proto-create-folder-sheet__name-input</code> / <code>.proto-settings-field__input</code>.
      </p>
      <label className="proto-settings-field">
        <span className="proto-settings-field__label">Name</span>
        <input
          type="text"
          className="proto-settings-field__input proto-create-folder-sheet__name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder, Thread, or church name"
        />
      </label>

      <PrototypeSectionHeader>Inspector field</PrototypeSectionHeader>
      <p className="pds-caption">
        Info side panel — <code>.proto-inspector-input</code>.
      </p>
      <label className="proto-create-folder-sheet__field-label">
        <span className="proto-inspector-section-title">Thread name</span>
        <input
          type="text"
          className="proto-inspector-input"
          value={inspectorTitle}
          onChange={(e) => setInspectorTitle(e.target.value)}
          placeholder="Title"
        />
      </label>
    </div>
  );
}

/** Static toast fixtures — production chrome is fixed/portaled; gallery pins them in-flow. */
function ToastsScene() {
  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        Ephemeral feedback uses floating toasts. Prototype: <code>showPrototypeFeedbackToast</code> /{' '}
        <code>PrototypeFeedbackToast</code>. Outside prototype: Sonner (<code>SpaToaster</code>). Sticky
        in-context chrome stays inline (read-only row, inspector error + Retry) — not banners.
      </p>

      <PrototypeSectionHeader>App update</PrototypeSectionHeader>
      <div className="pds-gallery-toast-stage">
        <div role="status" className="proto-update-toast pds-gallery-toast">
          <span className="proto-update-toast__label">Harvous was updated</span>
          <button type="button" className="proto-update-toast__action">
            Reload
          </button>
        </div>
      </div>

      <PrototypeSectionHeader>Feedback</PrototypeSectionHeader>
      <div className="pds-gallery-toast-stage">
        <div role="status" className="proto-update-toast proto-feedback-toast proto-feedback-toast--success pds-gallery-toast">
          <span className="proto-update-toast__label">Invite link copied</span>
          <button type="button" className="proto-side-panel__action-btn" aria-label="Dismiss">
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
        <div role="alert" className="proto-update-toast proto-feedback-toast proto-feedback-toast--error pds-gallery-toast">
          <Icon name="circle-exclamation" size={16} className="proto-feedback-toast__icon" aria-hidden />
          <span className="proto-update-toast__label">Couldn&apos;t save changes</span>
          <button type="button" className="proto-update-toast__action proto-update-toast__action--secondary">
            Get support
          </button>
          <button type="button" className="proto-side-panel__action-btn" aria-label="Dismiss">
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The trail, in the grouped-row card.
 *
 * Both variants side by side because they are the same pattern and the thing
 * worth checking is that they agree: the orb slot and the sequence badge share
 * one 20px column, the spine runs between orb bottoms and never behind one, and
 * the row bands and hairlines come from `proto-church-tools`.
 */
function ThreadTrailScene() {
  const card = 'proto-glass-surface proto-glass-surface--panel proto-church-tools proto-thread-trail__card';
  return (
    <div className="pds-gallery-stack">
      <div className="proto-thread-trail proto-thread-trail--carded">
        <div className={card}>
          <div className="proto-thread-trail__spine" role="list" aria-label="Connected notes trail">
            {[
              { title: 'Where it started', preview: 'Romans 8:28 — the first thread', focus: false },
              { title: 'Suffering and hope', preview: 'Tuesday, small group', focus: true },
              { title: 'What Paul does next', preview: 'Romans 9 outline', focus: false }
            ].map((row) => (
              <div
                key={row.title}
                className={`proto-thread-trail__step${row.focus ? ' proto-thread-trail__step--focus' : ''}`}
                role="listitem"
              >
                <ProtoThreadTrailOrb active={row.focus} />
                <div className="proto-thread-trail__step-body">
                  <button type="button" className="proto-thread-trail__step-main">
                    <div className="proto-thread-trail__title-line proto-note-row__title-line">
                      <span className="pds-list-title proto-note-row__title-text">{row.title}</span>
                      {row.focus ? <span className="proto-side-panel__current-badge">Current</span> : null}
                    </div>
                    <div className="pds-list-preview proto-note-row__preview">{row.preview}</div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="proto-thread-trail proto-thread-trail--carded">
        <div className={card}>
          <ul className="proto-shared-thread-note-list proto-thread-trail__spine" aria-label="Sequence Thread">
            {[
              { title: 'Step one: the call', state: '' },
              { title: 'Step two: the cost', state: ' proto-shared-thread-step--current' },
              { title: 'Step three: the promise', state: ' proto-shared-thread-step--ahead' }
            ].map((row, i) => (
              <li
                key={row.title}
                className={`proto-thread-trail__step proto-shared-thread-note-row proto-shared-thread-step${row.state}`}
              >
                <span className="proto-thread-trail__orb" aria-hidden>
                  <span className="proto-shared-thread-step__badge">{i + 1}</span>
                </span>
                <div className="proto-thread-trail__step-body">
                  <button type="button" className="proto-thread-trail__step-main">
                    <div className="proto-note-row__title-line">
                      <span className="pds-list-title proto-note-row__title-text">{row.title}</span>
                    </div>
                    <div className="proto-shared-thread-note-row__meta">
                      <span>Derek</span>
                      <span>2d</span>
                    </div>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** John 1 fixture — verse-per-entry, because a verse is the reader's selection unit. */
const READER_VERSES: { num: number; text: string; notes?: number; highlighted?: boolean }[] = [
  {
    num: 1,
    text: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
    notes: 1,
  },
  { num: 2, text: 'He was with God in the beginning.' },
  {
    num: 3,
    text: 'Through him all things were made; without him nothing was made that has been made.',
    notes: 3,
    highlighted: true,
  },
  { num: 4, text: 'In him was life, and that life was the light of all mankind.' },
  { num: 5, text: 'The light shines in the darkness, and the darkness has not overcome it.' },
];

/**
 * One margin bar. In production `top`/`height`/`lane` are measured from the verses a note
 * covers; here they are given, so the specimen can show spans and lanes side by side.
 */
function ReaderBar({
  top,
  height,
  lane = 0,
  heat = 1,
  label,
}: {
  top: number;
  height: number;
  lane?: number;
  heat?: number;
  label: string;
}) {
  return (
    <button
      type="button"
      className="pds-reader__bar"
      style={{ top, height, '--lane': lane } as CSSProperties}
      data-heat={heat}
      aria-label={label}
      title={label}
    >
      <span className="pds-reader__bar-line" />
    </button>
  );
}

function ReaderScene() {
  const [selected, setSelected] = useState<number | null>(4);
  // Roving tabindex: the chapter is ONE tab stop and arrows move between verses.
  // A focusable-per-verse model would put 31 tab stops in John 1 and 176 in
  // Psalm 119, which is why the verse is an option in a listbox, not a button.
  const [focusedVerse, setFocusedVerse] = useState(READER_VERSES[0].num);

  const moveFocus = (from: number, delta: number) => {
    const i = READER_VERSES.findIndex((v) => v.num === from);
    const next = READER_VERSES[Math.min(READER_VERSES.length - 1, Math.max(0, i + delta))];
    setFocusedVerse(next.num);
    document.querySelector<HTMLElement>(`[data-verse="${next.num}"]`)?.focus();
  };

  /*
   * The scene measures its bars the way the reader does, rather than hardcoding offsets.
   * A fixture with baked-in pixel tops would drift the moment the type scale moved, and a
   * gallery that quietly disagrees with production is worse than no gallery.
   */
  const columnRef = useRef<HTMLDivElement | null>(null);
  const [galleryBars, setGalleryBars] = useState<
    { key: string; top: number; height: number; lane: number; heat: number; label: string }[]
  >([]);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const measure = () => {
      const base = column.getBoundingClientRect().top;
      const spans = [
        { key: 'a', from: 1, to: 1, lane: 0, heat: 1, label: 'One note — John 1:1' },
        { key: 'b', from: 3, to: 5, lane: 0, heat: 1, label: 'One note — John 1:3-5' },
        { key: 'c', from: 3, to: 4, lane: 1, heat: 3, label: '3 notes — John 1:3-4' },
      ];
      setGalleryBars(
        spans.flatMap((s) => {
          const a = column.querySelector(`[data-verse="${s.from}"]`);
          const b = column.querySelector(`[data-verse="${s.to}"]`);
          if (!(a instanceof HTMLElement) || !(b instanceof HTMLElement)) return [];
          const first = a.getClientRects()[0];
          const rects = b.getClientRects();
          const last = rects[rects.length - 1];
          if (!first || !last) return [];
          return [{
            key: s.key,
            top: Math.round(first.top - base),
            height: Math.max(4, Math.round(last.bottom - first.top)),
            lane: s.lane,
            heat: s.heat,
            label: s.label,
          }];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pds-gallery-stack">
      <PrototypeSectionHeader>Reading canvas</PrototypeSectionHeader>
      <p className="pds-caption">
        Text role <code>.pds-reader-text</code>; size/leading come from{' '}
        <code>--pds-reader-font-size</code> so the inspector re-sets one variable. Geometry mirrors{' '}
        <code>HarvousReaderLayout</code>. Selection snaps to whole verses — click one, or tab into
        the chapter once and use ↑/↓ then Enter.
      </p>

      <div className="pds-reader pds-gallery-reader">
        <div className="pds-reader__scroll">
          <div className="pds-reader__column" ref={columnRef}>
            <div className="pds-reader__margin" aria-hidden>
              {galleryBars.map(({ key, ...bar }) => (
                <ReaderBar key={key} {...bar} />
              ))}
            </div>
            <div className="pds-reader__chapter-heading">
              <h2 className="pds-reader-chapter-title">John 1</h2>
              <p className="pds-reader__chapter-meta pds-caption">New International Version</p>
            </div>

            <div role="listbox" aria-label="John 1 verses">
              {READER_VERSES.map((verse) => (
                <div className="pds-reader__block" role="none" key={verse.num}>
                  <p className="pds-reader-text" role="none">
                    <span
                      className="pds-reader__verse"
                      role="option"
                      data-verse={verse.num}
                      aria-selected={selected === verse.num}
                      tabIndex={focusedVerse === verse.num ? 0 : -1}
                      data-selected={selected === verse.num ? 'true' : 'false'}
                      data-highlighted={verse.highlighted ? 'true' : 'false'}
                      onFocus={() => setFocusedVerse(verse.num)}
                      onClick={() => setSelected((n) => (n === verse.num ? null : verse.num))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected((n) => (n === verse.num ? null : verse.num));
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveFocus(verse.num, 1);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveFocus(verse.num, -1);
                        }
                      }}
                    >
                      <sup className="pds-reader-verse-num">{verse.num}</sup>
                      <span className="pds-reader__verse-text">{verse.text}</span>
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PrototypeSectionHeader>Margin notifiers</PrototypeSectionHeader>
      <p className="pds-caption">
        One bar per note, its length the verses that note covers — a single verse is a tick, a
        range is a rule. Overlapping notes take parallel lanes (three, then further notes merge
        into the innermost bar and deepen it). Colour comes from{' '}
        <code>--pds-reader-notifier-color</code>; intensity uses the same discrete steps as the
        church scripture heatmap. The gutter is reserved even when empty, so text never reflows
        when the first note lands.
      </p>
      <div className="pds-gallery-reader-markers">
        <div className="pds-gallery-reader-marker-item">
          <span className="pds-gallery-reader-bar-stage">
            <ReaderBar top={8} height={18} label="One verse" />
          </span>
          <span className="pds-footnote">One verse</span>
        </div>
        <div className="pds-gallery-reader-marker-item">
          <span className="pds-gallery-reader-bar-stage">
            <ReaderBar top={8} height={64} label="A range" />
          </span>
          <span className="pds-footnote">A range</span>
        </div>
        <div className="pds-gallery-reader-marker-item">
          <span className="pds-gallery-reader-bar-stage">
            <ReaderBar top={8} height={48} lane={0} label="First note" />
            <ReaderBar top={30} height={50} lane={1} label="Overlapping note" />
          </span>
          <span className="pds-footnote">Overlapping</span>
        </div>
        <div className="pds-gallery-reader-marker-item">
          <span className="pds-gallery-reader-bar-stage">
            <ReaderBar top={8} height={64} heat={4} label="Several notes merged" />
          </span>
          <span className="pds-footnote">Merged</span>
        </div>
      </div>

      <PrototypeSectionHeader>Reading states</PrototypeSectionHeader>
      <div className="pds-gallery-empty-grid">
        <div className="pds-gallery-empty-panel pds-gallery-empty-panel--pane">
          <PrototypePaneEmptyState
            icon="scroll"
            title="Pick up where you left off"
            description="Open a book to start reading."
          />
        </div>
        <div className="pds-gallery-empty-panel pds-gallery-empty-panel--pane">
          <PrototypePaneEmptyState
            icon="cloud"
            title="Not downloaded yet"
            description="This translation isn't available offline. Reconnect, or download it in Translations."
          />
        </div>
      </div>
      <p className="pds-caption">
        Loading a chapter shows the real passage arriving, not a skeleton — see the design system on
        placeholder loaders.
      </p>
    </div>
  );
}

function PaperStackScene() {
  const [open, setOpen] = useState(true);
  const [originKind, setOriginKind] = useState<'homeCard' | 'noteDock'>('homeCard');

  /**
   * The real component over canned origins — no network, no reader query. A hand-copied
   * fixture used to live here and had already drifted from production (it lost the resume
   * pill), which is the argument for rendering the thing itself.
   */
  const origin: PaperStackOrigin =
    originKind === 'homeCard'
      ? {
          kind: 'homeCard',
          cardKind: 'revisitNote',
          label: 'Worth another look',
          icon: 'arrow-rotate-left',
          returnTo: { to: '/' },
          base: {
            type: 'originCard',
            eyebrow: 'Worth another look',
            title: 'The vine and the branches',
            meta: '5d ago · Life in the Spirit',
            icon: 'arrow-rotate-left',
          },
        }
      : {
          kind: 'noteDock',
          label: 'The vine and the branches',
          icon: 'note-sticky',
          returnTo: { to: '/' },
          base: {
            type: 'originCard',
            title: 'The vine and the branches',
            meta: 'John 15:5 · NLT',
            icon: 'note-sticky',
          },
        };

  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        A sheet stacked over the paper it came from. Two papers and nothing else: the
        origin&apos;s top corners peek above the sheet and are the way back; flipped down, the
        sheet&apos;s own top edge peeks from the bottom and is the way back up. Neither paper
        unmounts, so position and draft both survive the move —{' '}
        <code>PROTO_PAPER_STACK_MS</code> ↔ <code>--pds-duration-paper-stack</code> going in,{' '}
        <code>PROTO_PAPER_STACK_EXIT_MS</code> ↔{' '}
        <code>--pds-duration-paper-stack-exit</code> coming out. A{' '}
        <code>noteDock</code> origin (the reader expanded out of a scripture dock) enters with the
        expansion morph instead of the slide.
      </p>

      <div className="pds-gallery-btn-row">
        <button
          type="button"
          className="proto-share-popover__copy"
          onClick={() => setOpen((s) => !s)}
          aria-pressed={open}
        >
          {open ? 'Flip the sheet down' : 'Bring the sheet back'}
        </button>
        <button
          type="button"
          className="proto-share-popover__copy"
          onClick={() => setOriginKind((k) => (k === 'homeCard' ? 'noteDock' : 'homeCard'))}
        >
          Origin: {originKind === 'homeCard' ? 'Home card' : 'note dock'}
        </button>
      </div>

      <div className="pds-gallery-reader-stack">
        <PrototypePaperStack
          key={originKind}
          stack={{ origin, noteId: 'gallery', noteTitle: 'The vine and the branches', open }}
          onFlipDown={() => setOpen(false)}
          onFlipUp={() => setOpen(true)}
          // The gallery keeps the paper: dismissing here would leave an empty frame with no
          // way to get the scene back short of a reload.
          onDismiss={() => setOpen(true)}
        >
          {/*
            * The real paper class, not a bespoke fixture surface.
            *
            * Every rule the stack applies to a sheet is keyed to `.proto-editor-paper` or
            * `.pds-reader__column` — the opaque fill that exists precisely so the layer behind
            * cannot read through, and the lighter tint once this layer is the one behind. A
            * stand-in with only its own class opted out of both, so the base's origin card
            * printed straight through this sheet and the two sets of text overlapped. The
            * scene was showing a defect the component does not have.
            */}
          <div className="proto-editor-paper">
            <div className="pds-gallery-reader-note">
              <p className="pds-compose-title">
                {originKind === 'homeCard' ? 'The vine and the branches' : 'John 15'}
              </p>
              <p className="pds-caption">
                {originKind === 'homeCard' ? 'John 15:5 · NLT' : 'New Living Translation'}
              </p>
              <p className="pds-body">
                {originKind === 'homeCard'
                  ? 'Apart from me you can do nothing — the whole chapter turns on that clause…'
                  : '“I am the true grapevine, and my Father is the gardener…”'}
              </p>
            </div>
          </div>
        </PrototypePaperStack>
      </div>
    </div>
  );
}

/**
 * The dock beside the reading surface, rendering the real `PassageContextStrip` over a
 * primed cache — the gallery has no session, and restating the strip's markup here would
 * drift from production the first time that component changed.
 */
const DOCK_REF = 'Romans 8:28';
const DOCK_TRANSLATION = 'NET';
primePassageContextCache(DOCK_REF, DOCK_TRANSLATION, {
  themes: [
    { topicId: 't1', slug: 'providence', label: 'Providence', relevance: 92 },
    { topicId: 't2', slug: 'suffering', label: 'Suffering', relevance: 78 },
  ],
  crossReferences: [
    { book: 'Ephesians', chapterStart: 1, chapterEnd: 1, verseStart: 11, verseEnd: 11, votes: 34 },
    { book: 'Genesis', chapterStart: 50, chapterEnd: 50, verseStart: 20, verseEnd: 20, votes: 28 },
  ],
  people: [{ id: 'p1', slug: 'paul', name: 'Paul' }],
  places: [{ id: 'pl1', slug: 'rome', name: 'Rome' }],
  relatedNotes: [
    { noteId: 'n1', title: 'Start of it', reason: 'Same passage' },
    { noteId: 'n2', title: 'No Condemnation', reason: 'Cross-reference' },
  ],
});

function ReaderDockScene() {
  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        <code>PassageContextStrip</code> — one strip, shown wherever a passage is: inside a
        note&rsquo;s scripture dock, and in the Bible reader. The reader has no dock of its own,
        because a scripture dock <em>is</em> a snippet view of the reader.
      </p>
      <p className="pds-caption">
        Cross-references and your own notes only. People, places and themes come back from
        the same endpoint but surface as dotted underlines on the passage text, not as lists
        here — a name is answered where you met it.
      </p>

      <div className="pds-gallery-reader-dock-stage">
        <div className="pds-reader-with-dock">
          <div className="pds-reader">
            <div className="pds-reader__scroll">
              <div className="pds-reader__column">
                <div className="pds-reader__chapter-heading">
                  <h2 className="pds-reader-chapter-title">Romans 8</h2>
                </div>
                <div className="pds-reader__block">
                  <p className="pds-reader-text">
                    <span className="pds-reader__verse" data-selected="true">
                      <sup className="pds-reader-verse-num">28</sup>
                      <span className="pds-reader__verse-text">
                        And we know that all things work together for good…
                      </span>
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <aside className="pds-gallery-context-strip">
            <PassageContextStrip
              reference={DOCK_REF}
              translation={DOCK_TRANSLATION}
              active
              showCrossRefs
              showRelatedNotes
              onOpenScripturePassage={() => undefined}
              onOpenEntity={() => undefined}
              onNavigateNote={() => undefined}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * Reader details in the shared inspector chrome. Live controls: the text-size segments and
 * the verse-number toggle write real reading preferences, which is the point — they set CSS
 * vars the reading canvas above reads, so the effect is visible in the same view.
 */
function ReaderInspectorScene() {
  const [translation, setTranslation] = useState('NET');
  const [fontOverride, setFontOverride] = useState<FontChoice | null>(null);
  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        Pane chrome, sections and rows are the note inspector's — only the controls are
        reader-specific. Text size writes <code>--pds-reader-font-size</code>, so the sample
        below reflows as you change it.
      </p>

      <div className="pds-gallery-reader-inspector-stage">
        <div className="pds-reader">
          <div className="pds-reader__scroll">
            <div className="pds-reader__column">
              <div className="pds-reader__block">
                <p className="pds-reader-text">
                  <span className="pds-reader__verse">
                    <sup className="pds-reader-verse-num">1</sup>
                    <span className="pds-reader__verse-text">
                      In the beginning was the Word, and the Word was with God.
                    </span>
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="proto-inspector-desktop pds-gallery-inspector-frame">
          <PrototypeReaderInspectorPane
            book="John"
            chapter={1}
            translation={translation}
            verseCount={51}
            onChangeTranslation={setTranslation}
            fontOverride={fontOverride}
            onChangeFontOverride={setFontOverride}
          />
        </div>
      </div>
    </div>
  );
}


/**
 * Every offline state a translation row can be in, at once.
 *
 * Built from the real `PrototypeTranslationRow`, which is presentational precisely so this
 * scene can exist: five states side by side, no profile, no network, no pack store. The
 * states are the point — a row that is *saving* used to look like a different and broken
 * kind of row, and that is only visible when you can see it next to the others.
 */
function TranslationRowScene() {
  const [selected, setSelected] = useState('NLT');
  const rows: Array<{ id: string; name: string; state: TranslationRowState }> = [
    { id: 'ESV', name: 'English Standard Version', state: { kind: 'available' } },
    { id: 'NLT', name: 'New Living Translation', state: { kind: 'saving', booksSaved: 49, booksTotal: 66 } },
    { id: 'NET', name: 'New English Translation', state: { kind: 'offline' } },
    { id: 'BSB', name: 'Berean Standard Bible', state: { kind: 'partial', booksSaved: 12, booksTotal: 66 } },
    /* Packs transfer one at a time, so a second press waits — shown beside the one saving,
       which is the pairing that matters: the two rows have to be tellable apart at a glance. */
    { id: 'CSB', name: 'Christian Standard Bible', state: { kind: 'queued' } },
    { id: 'KJV', name: 'King James Version', state: { kind: 'blocked' } },
  ];

  return (
    <div className="proto-theme" style={{ width: 420, maxWidth: '100%', margin: '0 auto' }}>
      <div
        className="proto-settings-list"
        style={{
          background: 'var(--pds-bg-page)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {rows.map((row) => (
          <PrototypeTranslationRow
            key={row.id}
            abbreviation={row.id}
            name={row.name}
            selected={row.id === selected}
            state={row.state}
            onChoose={() => setSelected(row.id)}
            onSave={() => {}}
            onStop={() => {}}
            onRemove={() => {}}
          />
        ))}
      </div>
    </div>
  );
}


/**
 * The note's audience bar, in the registers it actually has.
 *
 * Exists because the draft destination shipped as a *label* and nobody noticed for as long
 * as it existed: there was no scene, so the only way to see it was to open a real compose
 * session inside a real shared space. The control and its sheet are both presentational,
 * so both can simply be looked at here.
 *
 * The interesting state to look at is the multi-select one: My Home ticked and inert, one
 * or more shared spaces ticked beside it, and a blocked row that stays visible rather than
 * being filtered out of the list.
 */
function NoteAudienceBarScene() {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string[]>(['space_family']);

  const rows: NoteDestination[] = [
    { space: null, spaceId: null, title: 'My Home', isHome: true, state: 'added' },
    ...[
      { id: 'space_family', title: 'Family' },
      { id: 'space_romans', title: 'Romans Study Group' },
    ].map((space) => ({
      space: { ...space, color: 'paper' } as unknown as NoteDestination['space'],
      spaceId: space.id,
      title: space.title,
      isHome: false,
      state: (added.includes(space.id) ? 'added' : 'addable') as NoteDestination['state'],
    })),
    {
      space: { id: 'space_youth', title: 'Youth', color: 'paper' } as unknown as NoteDestination['space'],
      spaceId: 'space_youth',
      title: 'Youth (channel you follow)',
      isHome: false,
      state: 'blocked',
      reason: 'channel-read-only',
    },
  ];
  const addedTitles = rows.filter((row) => row.state === 'added').map((row) => row.title);
  const label = `In ${addedTitles.join(', ')}`;

  return (
    <div className="proto-theme" style={{ width: 460, maxWidth: '100%', margin: '0 auto' }}>
      <div
        className="proto-editor-paper"
        style={{
          background: 'var(--pds-paper)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 14,
          padding: '14px 16px 28px',
        }}
      >
        {/* The anchor box the note page wraps these two in. */}
        <div className="proto-note-destination-anchor">
          <PrototypeNoteAudienceBar
            mode="hidden"
            destinationLabel={label}
            draftDestinationIsHome={addedTitles.length === 1}
            onOpenDestination={() => setOpen((v) => !v)}
          />
          <PrototypeNoteDestinationSheet
            open={open}
            rows={rows}
            onToggle={(destination, next) =>
              setAdded((prev) =>
                next
                  ? [...prev, destination.spaceId ?? '']
                  : prev.filter((id) => id !== destination.spaceId),
              )
            }
          />
        </div>
        <p className="pds-list-title" style={{ marginTop: 18 }}>Title</p>
      </div>

      <p className="pds-caption" style={{ marginTop: 12, textAlign: 'center' }}>
        Tick as many spaces as the note belongs in. Below: the same slot, foreign-note register.
      </p>

      <div
        className="proto-editor-paper"
        style={{
          marginTop: 10,
          background: 'var(--pds-paper)',
          border: '0.5px solid var(--pds-border)',
          borderRadius: 14,
          padding: '14px 16px',
        }}
      >
        <PrototypeNoteAudienceBar
          mode="quiet"
          audienceLabel="Shared with Romans Study Group"
          onOpenAudience={() => {}}
        />
      </div>
    </div>
  );
}

/*
 * Margin indicators — what the reader uses to say "you have written about this".
 *
 * A decision aid for `docs/future/READER_MARGIN_INDICATORS.md` (D-5), and it exists because the
 * argument for bars over dots is entirely about *length*: a bar's extent is the note's span, and
 * two bars side by side are an overlap. That is impossible to judge from a description, and the
 * dot design was rejected once already without anyone seeing the two next to each other.
 *
 * Same three notes in every panel, over the same five verses, measured from the same rendered
 * text — so the only variable is how the margin draws them. The bars panel uses the production
 * classes; the others are specimens of designs that do not exist, which is the point.
 *
 * Delete this scene once D-5 is decided.
 */
const MARGIN_SPANS = [
  { key: 'a', from: 1, to: 1, lane: 0, label: 'One note — John 1:1' },
  { key: 'b', from: 3, to: 5, lane: 0, label: 'One note — John 1:3-5' },
  { key: 'c', from: 3, to: 4, lane: 1, label: '3 notes — John 1:3-4' },
];

type MeasuredSpan = { key: string; top: number; height: number; lane: number; label: string; from: number; to: number };

/*
 * Mark styling across the three surfaces — the decision aid for D-4
 * (docs/future/HIGHLIGHT_REFERENCE_STYLING_SPEC.md).
 *
 * A matrix rather than a list, because every disagreement in that doc is a comparison: the same
 * mark drawn two ways on two surfaces, or two different marks drawn the same way on one. Neither
 * is visible reading a spec table.
 *
 * Every cell is LIVE — each specimen sits inside the ancestor its real rule requires
 * (`.pds-reader-text`, `.proto-editor-surface .ProseMirror`,
 * `.scripture-pill-chrome__passage-html`) and carries the real attributes, so what renders is
 * whatever those three stylesheets currently say. Restating the marks here would have hidden the
 * very drift the scene exists to show.
 *
 * Delete this scene once D-4 is decided.
 */
const MARK_SAMPLE = 'the light shines in the darkness';

/*
 * Activity — one day, as a sheet on a stack.
 *
 * Fixture rather than live data on purpose: what is being judged is whether a day reads as a
 * page — the parts of it as sections, something written carrying more of the sheet than
 * somewhere merely visited — and that needs a day holding both. A real account's day is
 * whatever happened, which on most mornings is a chapter and nothing else.
 */
/**
 * How an answered Review question reads: the verdict on each part, and the goes it has.
 *
 * One grammar across every exercise — right is the accent gradient, wrong is the destructive
 * red, carried on the element's own edge rather than in a badge beside it. The dots are the
 * only progress indicator in the app; they exist because a bar for a two-or-three step count
 * reads as a task being set, which the onboarding dock found first.
 */
function ReviewVerdictsScene() {
  return (
    <div className="pds-stack" style={{ gap: 20, maxWidth: 520 }}>
      <div>
        <p className="pds-caption">Goes</p>
        <span className="proto-review-dock__goes" aria-label="Attempt 2 of 3">
          <span className="proto-review-dock__go" data-spent aria-hidden />
          <span className="proto-review-dock__go" data-current aria-hidden />
          <span className="proto-review-dock__go" aria-hidden />
        </span>
      </div>

      <div>
        <p className="pds-caption">Gaps, marked per gap</p>
        <p className="proto-challenge__cloze">
          {'I am the vine; you are the '}
          <input
            className="proto-review-dock__blank"
            data-answer="right"
            defaultValue="branches"
            style={{ width: '9ch' }}
            readOnly
          />
          {'. The one who remains in me bears much '}
          <input
            className="proto-review-dock__blank"
            data-answer="wrong"
            defaultValue="peace"
            style={{ width: '6ch' }}
            readOnly
          />
          {'.'}
        </p>
      </div>

      <div>
        <p className="pds-caption">Options</p>
        <div className="proto-review-dock__chips">
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
            data-correct
          >
            <kbd className="proto-kbd proto-kbd--compact proto-review-dock__choice-key" aria-hidden>
              A
            </kbd>
            <span className="proto-review-dock__choice-label">I am the vine; you are the branches.</span>
          </button>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact proto-review-dock__choice"
            data-missed
            disabled
          >
            <kbd className="proto-kbd proto-kbd--compact proto-review-dock__choice-key" aria-hidden>
              B
            </kbd>
            <span className="proto-review-dock__choice-label">The LORD is my shepherd.</span>
          </button>
        </div>
      </div>

      <div>
        <p className="pds-caption">What you wrote</p>
        <p className="proto-review-dock__verse proto-review-dock__verse--yours">
          <span data-answer="right">vine</span> and the <span data-answer="right">branches</span> and
          something about <span data-answer="right">fruit</span>
        </p>
      </div>

      <div>
        {/* One tapped thing, which may be marked either way — the reader watched this chip turn
            red a second ago, so the recap agrees with what they saw. */}
        <p className="pds-caption">What you picked</p>
        <p className="proto-review-dock__verse proto-review-dock__verse--yours proto-review-dock__verse--pick">
          <span data-answer="wrong">To all those loved by God in Rome…</span>
        </p>
      </div>

      <div>
        <p className="pds-caption">The order you put them in</p>
        <ol className="proto-review-dock__verse proto-review-dock__verse--yours proto-review-dock__echo-rows">
          <li data-answer="right">I am the vine</li>
          <li data-answer="wrong">bears much fruit</li>
          <li data-answer="wrong">you are the branches</li>
        </ol>
      </div>

      <div>
        {/* The shared-spaces author chip with a status glyph where the face goes. The glyph
            carries the state; the label never does. */}
        <p className="pds-caption">How well you hold it</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="proto-recall-chip" data-state="fragile">
            <span className="proto-recall-chip__mark" aria-hidden>
              <Icon name="seedling" size={10} />
            </span>
            Still learning
          </span>
          <span className="proto-recall-chip" data-state="durable">
            <span className="proto-recall-chip__mark" aria-hidden>
              <Icon name="check" size={10} />
            </span>
            You know this
          </span>
          <span className="proto-recall-chip" data-state="slipping">
            <span className="proto-recall-chip__mark" aria-hidden>
              <Icon name="clock-rotate-left" size={10} />
            </span>
            Slipping away
          </span>
        </div>
      </div>

      <div>
        {/* The question, recapped above its own answer: quieter than the ask it repeats. */}
        <p className="pds-caption">The question, recapped</p>
        <p className="proto-review-dock__prompt proto-review-dock__prompt--asked">
          Pick how John 15:5 begins.
        </p>
      </div>
    </div>
  );
}

function StudyFeedScene() {
  const dayStart = new Date(2026, 7, 25, 8, 0, 0);
  const at = (minutes: number) => new Date(dayStart.getTime() + minutes * 60_000).toISOString();

  const items: StudyFeedItem[] = [
    {
      id: 'fixture-reading',
      kind: 'passage-read',
      at: at(20),
      startAt: at(2),
      book: 'Romans',
      bookOrder: 44,
      chapters: [7, 8],
      translation: 'ESV',
      dwellBucket: 'study',
    },
    {
      id: 'fixture-highlight',
      kind: 'highlight-scripture',
      at: at(24),
      entryId: 'entry-fixture-1',
      accent: 'warmAmber',
      excerpt: 'There is now no condemnation',
      reference: 'Romans 8:1',
      translation: 'ESV',
    },
    {
      id: 'fixture-note',
      kind: 'note-created',
      at: at(38),
      noteId: 'note-fixture-1',
      title: 'No condemnation',
      snippet:
        'I keep reading this as a verdict I have to earn. Paul writes it as one already given — the trial is over, and I am still arguing the case.',
      scriptureRefs: ['Romans 8:1'],
    },
    {
      id: 'fixture-revisit',
      kind: 'note-revisited',
      at: at(400),
      noteId: 'note-fixture-2',
      title: 'What grace costs',
      folder: 'Romans',
      visitCount: 1,
    },
    {
      id: 'fixture-evening-read',
      kind: 'passage-read',
      at: at(700),
      book: 'Psalms',
      bookOrder: 18,
      chapters: [103],
      translation: 'ESV',
      dwellBucket: 'read',
    },
  ];

  const day = buildStudyFeedDays(items, new Date(2026, 7, 25, 21, 0, 0))[0];

  return (
    <div className="proto-theme">
      <div className="proto-feed" style={{ padding: 0 }}>
        <div className="proto-feed-stack">
          <div className="proto-feed-stack__edges">
            {[2, 1].map((depth) => (
              <button
                key={depth}
                type="button"
                className="proto-feed-stack__edge"
                style={{ '--edge-depth': depth } as CSSProperties}
              >
                <span className="proto-feed-stack__edge-label">
                  {depth === 1 ? 'Yesterday' : 'Sunday, August 23'}
                </span>
              </button>
            ))}
          </div>
          <article className="proto-feed-sheet">
            <header className="proto-feed-sheet__head">
              <div className="proto-feed-sheet__title">
                <h2 className="proto-feed-sheet__day">{day.label}</h2>
                <span className="proto-feed-sheet__date">{day.dateLabel}</span>
              </div>
            </header>
            <div className="proto-feed-sheet__body">
              {day.parts.map((group) => (
                <PrototypeStudyFeedPart key={group.part} group={group} onOpen={() => {}} />
              ))}
            </div>
            <footer className="proto-feed-sheet__foot">
              <button type="button" className="proto-feed-sheet__flip" disabled>
                <Icon name="caret-up" size={11} />
                <span>Newer</span>
              </button>
              <button type="button" className="proto-feed-sheet__flip">
                <span>Earlier</span>
                <Icon name="caret-down" size={11} />
              </button>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

export default function DesignSystemScenePreview({ scene }: { scene: DesignSystemScene }) {
  switch (scene.id) {
    case 'ds-01-typography':
      return <TypographyScene />;
    case 'ds-02-color':
      return <ColorScene />;
    case 'ds-03-spacing':
      return <SpacingScene />;
    case 'ds-04-section-header':
      return <SectionHeaderScene />;
    case 'ds-05-list-row':
      return <ListRowScene />;
    case 'ds-05b-row-select':
      return <RowSelectScene />;
    case 'ds-06-search':
      return <SearchScene />;
    case 'ds-08-empty':
      return <EmptyScene />;
    case 'ds-09-popover':
      return <PopoverScene />;
    case 'ds-10-buttons':
      return <ButtonsScene />;
    case 'ds-11-inputs':
      return <InputsScene />;
    case 'ds-12-toasts':
      return <ToastsScene />;
    case 'ds-13-thread-trail':
      return <ThreadTrailScene />;
    case 'ds-14-reader':
      return <ReaderScene />;
    case 'ds-15-paper-stack':
      return <PaperStackScene />;
    case 'ds-16-reader-dock':
      return <ReaderDockScene />;
    case 'ds-17-reader-inspector':
      return <ReaderInspectorScene />;
    case 'ds-18-translation-row':
      return <TranslationRowScene />;
    case 'ds-19-note-audience-bar':
      return <NoteAudienceBarScene />;
    case 'ds-20-study-feed':
      return <StudyFeedScene />;
    case 'ds-21-review-verdicts':
      return <ReviewVerdictsScene />;
    default:
      return <p className="pds-caption">Unknown design-system scene.</p>;
  }
}
