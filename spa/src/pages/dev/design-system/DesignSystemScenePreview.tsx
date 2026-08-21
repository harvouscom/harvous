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
import PrototypeDraftDestinationSheet from '../../prototype/PrototypeDraftDestinationSheet';
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
 */
function NoteAudienceBarScene() {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<string | null>('space_family');

  const options = [
    { spaceId: null, label: 'My Home', isHome: true },
    { spaceId: 'space_family', label: 'Family', isHome: false },
    { spaceId: 'space_romans', label: 'Romans Study Group', isHome: false },
  ];
  const label = options.find((o) => o.spaceId === destination)?.label ?? 'My Home';

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
        <div className="proto-draft-destination-anchor">
          <PrototypeNoteAudienceBar
            mode="hidden"
            draftDestinationLabel={`Saving to ${label}`}
            draftDestinationIsHome={destination === null}
            onOpenDestination={() => setOpen((v) => !v)}
          />
          <PrototypeDraftDestinationSheet
            open={open}
            options={options}
            currentSpaceId={destination}
            onChoose={(d) => setDestination(d.spaceId)}
            onDismiss={() => setOpen(false)}
          />
        </div>
        <p className="pds-list-title" style={{ marginTop: 18 }}>Title</p>
      </div>

      <p className="pds-caption" style={{ marginTop: 12, textAlign: 'center' }}>
        Tap the destination to retarget the draft. Below: the same slot, saved-note register.
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

/**
 * The three toolbar shape options, side by side, against the real tokens.
 *
 * A decision aid rather than a shipped pattern — see docs/future/TOOLBAR_SHAPE_LANGUAGE_OPTIONS.md.
 * Deliberately built from `.proto-toolbar-icon-btn` with only the properties under discussion
 * overridden inline, so what is on screen is the real control wearing each candidate shape rather
 * than a drawing of one. Delete this scene once the shape is settled.
 */
function ToolbarShapeScene() {
  type Glyph = React.ComponentProps<typeof Icon>['name'];
  const icons: Glyph[] = ['pen-to-square', 'book-open', 'magnifying-glass', 'ellipsis'];

  /*
   * Two axes, not one. Material says what a control sits on — glass floats over the page,
   * flat rests on a panel. Shape says what kind of control it is. Today's orb differs from the
   * sidebar tile on both at once, which is why the mismatch reads as arbitrary.
   */
  const tileShape: React.CSSProperties = { borderRadius: 'var(--pds-radius-row)' };
  const flatSurface: React.CSSProperties = {
    background: 'var(--pds-bg-control)',
    borderColor: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  };

  const Row = ({
    label,
    note,
    iconStyle,
    chipStyle,
  }: {
    label: string;
    note: string;
    iconStyle?: React.CSSProperties;
    chipStyle?: React.CSSProperties;
  }) => (
    <div style={{ marginBottom: 26 }}>
      <p className="pds-section-header" style={{ marginBottom: 2 }}>{label}</p>
      <p className="pds-caption" style={{ marginBottom: 10 }}>{note}</p>
      <div
        className="proto-glass-surface"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 'var(--pds-toolbar-h)',
          padding: '0 12px',
          borderRadius: 14,
          border: '0.5px solid var(--pds-border)',
        }}
      >
        {icons.map((name) => (
          <button key={name} type="button" className="proto-toolbar-icon-btn" style={iconStyle}>
            <Icon name={name} size={17} className="proto-toolbar-icon" />
          </button>
        ))}

        <span style={{ flex: 1 }} />

        {/* The two labelled controls — the reason this is a decision and not a find-replace. */}
        <span className="proto-toolbar-folder-chip" style={chipStyle}>
          <Icon name="book-open" size={12} aria-hidden />
          <span>Salvation</span>
        </span>
        <button type="button" className="proto-toolbar-space-switcher" style={chipStyle}>
          <span className="proto-toolbar-space-switcher__icon" aria-hidden>
            <Icon name="book-open-reader" size={13} />
          </span>
          <span className="proto-toolbar-space-switcher__label">My Home</span>
        </button>

        {/* The avatar. Round in every option — it is a face, not a control. */}
        <span className="proto-toolbar-icon-btn" aria-hidden>
          <span className="proto-profile-orb" />
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 760 }}>
      <Row
        label="A — today"
        note="Pill shape, glass surface. The sidebar's tiles are rounded squares on a flat surface, visible at the same time — so the two differ on shape and material at once."
      />
      <Row
        label="B — tiles, glass kept (recommended)"
        note="Shape moves to the sidebar's; material stays. The toolbar floats over the page and the glass is what says so, especially over an image wallpaper. Only the thing that was mismatched changes."
        iconStyle={tileShape}
      />
      <Row
        label="C — tiles, flat"
        note="Shape and material both move to the sidebar's. Fully consistent with the sidebar, but the toolbar stops reading as floating chrome and starts reading as a panel."
        iconStyle={{ ...tileShape, ...flatSurface }}
      />
      <Row
        label="D — flat circles"
        note="Material only: same shape, tile surface. Removes the material difference and leaves the shape difference — the inverse of B, and the weaker half."
        iconStyle={flatSurface}
      />
      <Row
        label="E — everything square"
        note="For comparison: the labelled chips squared off too. One rule, but a chip in a near-square is not a shape that wants a label in it."
        iconStyle={tileShape}
        chipStyle={tileShape}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 8,
          padding: '10px 12px',
          borderRadius: 10,
          background: 'var(--pds-bg-control)',
        }}
      >
        <span className="proto-sidebar-back-tile" aria-hidden>
          <Icon name="caret-left" size={14} />
        </span>
        <p className="pds-caption" style={{ margin: 0 }}>
          The sidebar tile being matched. Its 9px radius is a hardcoded literal with no token and no
          Swift counterpart; options above use `--pds-radius-row` (10px) instead.
        </p>
      </div>

      <p className="pds-caption" style={{ marginTop: 14 }}>
        Check each option in light, dark and image-wallpaper appearance. Flattening the toolbar
        matters most over a photo wallpaper, which is where the glass is doing the most work.
      </p>
    </div>
  );
}

/*
 * Floating surfaces — what a menu, bar or card looks like when it floats over the page.
 *
 * A decision aid, like `ToolbarShapeScene` above, and it exists because the toolbar decision
 * (Option B: tile shape, glass kept) only settled the bar itself. Everything that opens FROM
 * that bar is a separate set of surfaces that never agreed with each other, let alone with it —
 * `TOOLBAR_SHAPE_LANGUAGE_OPTIONS.md` §"The floating-menu half (#24)" says to align these once
 * the shape is chosen, and it now is.
 *
 * Specimens use the production classes rather than copies of their markup, so the "today"
 * column is whatever the CSS actually says today and cannot drift from it. The "proposed"
 * column is the same element with the two overrides the change would make permanent.
 *
 * Delete this scene once the shape is settled, along with `ds-20-toolbar-shape`.
 */
function FloatingSurfacesScene() {
  /* One radius for the surface itself, `--pds-radius-menu` (12px) — the value the shell's
     menu already uses, and the squarest of the ones in play, so the move is toward it rather
     than to a number nothing uses yet. */
  const surface: React.CSSProperties = { borderRadius: 'var(--pds-radius-menu)' };
  /*
   * A rounded rect wants less side padding than the pill it replaces, and the amount is not a
   * taste call: concentric corners need `inner radius = outer radius - gap`. The bar is 12 and
   * its tiles are 10, so the gap is 2. Today's 6px comes from the pill, where the buttons were
   * circles inside a capsule and had to be held off its end curve — a constraint a rounded rect
   * does not have. Keeping 6 here would leave the corners non-concentric AND the ends looking
   * padded, which is what they look like.
   */
  const barInset: React.CSSProperties = { paddingLeft: 2, paddingRight: 2 };
  /* ...and `--pds-radius-row` (10px) for icon targets inside it — the same tile the toolbar
     decision picked, so a button means the same shape wherever it is. */
  const tile: React.CSSProperties = { borderRadius: 'var(--pds-radius-row)' };

  const Pair = ({
    label,
    where,
    today,
    render,
  }: {
    label: string;
    where: string;
    today: string;
    render: (proposed: boolean) => React.ReactNode;
  }) => (
    <div style={{ marginBottom: 24 }}>
      <p className="pds-section-header" style={{ marginBottom: 2 }}>{label}</p>
      <p className="pds-caption" style={{ marginBottom: 10 }}>
        {where} · today: {today}
      </p>
      {/*
        * Each specimen shrink-wraps, because every one of these floats.
        *
        * A plain block cell stretched them to the column: the selection bar rendered 382px wide
        * around 157px of buttons, which reads as enormous end padding and is not a thing the
        * component does — in production it is `position: fixed` at the selection and sizes to
        * its content. The scene was inviting a judgement about padding that only its own layout
        * had created.
        */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{render(false)}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{render(true)}</div>
      </div>
    </div>
  );

  const menuItems = ['Highlight', 'Add a note', 'Copy verse'];

  return (
    <div style={{ maxWidth: 780 }}>
      <p className="pds-caption" style={{ marginBottom: 6 }}>
        Every surface that floats over the note or the reader, at its real radius. Six different
        answers to one question: 0 (docked format bar), 2 (margin card), 12 (shell menu, link
        prompt), 14 (link preview), 16/22 (delete confirm), 999 (selection bar). None of them
        disagree for a reason anyone recorded.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          margin: '14px 0 18px',
        }}
      >
        <p className="pds-section-header" style={{ margin: 0 }}>Today</p>
        <p className="pds-section-header" style={{ margin: 0 }}>
          Proposed — one surface radius, tile targets, glass kept
        </p>
      </div>

      <Pair
        label="Selection actions"
        where="Note and reader — the one surface the two already share (.pds-native-selection-bar)"
        today="capsule, glass · 6px side padding"
        render={(proposed) => (
          <div
            className="pds-native-selection-bar"
            style={proposed ? { ...surface, ...barInset } : undefined}
          >
            {(['pen', 'quote-left', 'link', 'ellipsis'] as const).map((name) => (
              <button
                key={name}
                type="button"
                className="pds-native-selection-bar__btn"
                style={proposed ? tile : undefined}
              >
                <Icon name={name} size={15} />
              </button>
            ))}
          </div>
        )}
      />

      <Pair
        label="Menu popover"
        where="Reader book/chapter pickers, every shell menu (.proto-menu__popover)"
        today="12px — already the target"
        render={(proposed) => (
          <div
            className="proto-menu__popover"
            style={{ position: 'static', minWidth: 0, animation: 'none', ...(proposed ? surface : {}) }}
          >
            {menuItems.map((item) => (
              <button key={item} type="button" className="proto-menu-item">
                <span className="proto-menu-item__label">{item}</span>
              </button>
            ))}
          </div>
        )}
      />

      <Pair
        label="Link preview card"
        where="Note — hover a link (.link-preview-card)"
        today="14px, hardcoded, own shadow"
        render={(proposed) => (
          <div className="link-preview-card" style={{ maxWidth: 260, ...(proposed ? surface : {}) }}>
            <div className="link-preview-card__body">
              <div className="link-preview-card__title">The Gospel Coalition</div>
              <div className="link-preview-card__excerpt">
                Union with Christ is the ground of assurance…
              </div>
            </div>
          </div>
        )}
      />

      <Pair
        label="Link prompt"
        where="Note — Cmd-K, or the toolbar link button (.url-link-prompt)"
        today="12px, hardcoded"
        render={(proposed) => (
          <div className="url-link-prompt" style={{ maxWidth: 260, ...(proposed ? surface : {}) }}>
            <div className="url-link-prompt__form">
              <input className="url-link-prompt__input" defaultValue="thegospelcoalition.org" readOnly />
            </div>
          </div>
        )}
      />

      <Pair
        label="Delete confirm"
        where="Note, reader, sidebar (.harvous-delete-confirm)"
        today="22px compact / 16px stacked — pill and card in the prototype route"
        render={(proposed) => (
          <ProtoPopoverShell
            className="harvous-delete-confirm harvous-delete-confirm--stacked"
            style={{ position: 'relative', maxWidth: 260, ...(proposed ? surface : {}) }}
          >
            <DeleteConfirmBar
              title="Delete this note?"
              description="This can’t be undone."
              onConfirm={() => undefined}
              onCancel={() => undefined}
            />
          </ProtoPopoverShell>
        )}
      />

      <div
        style={{
          marginTop: 8,
          padding: '12px 14px',
          borderRadius: 10,
          background: 'var(--pds-bg-control)',
        }}
      >
        <p className="pds-section-header" style={{ marginBottom: 6 }}>The two deliberate exceptions</p>
        <p className="pds-caption" style={{ margin: 0 }}>
          The reader&apos;s <code>.pds-reader__note-card</code> stays at 2px and the docked format bar
          stays at 0. Neither floats over the page — one is printed on the paper (its own comment
          argues the case: a real radius there reads as a widget dropped onto the page), the other is
          full-bleed chrome. This proposal is about surfaces that float, so neither moves.
        </p>
      </div>

      <p className="pds-caption" style={{ marginTop: 14 }}>
        Native parity: the selection bar mirrors macOS <code>SelectionActionBar</code>, which is a
        capsule. Squaring the web one without squaring that is exactly the identity drift the parity
        rules forbid — so this needs a <code>HarvousShape</code> member and the Swift change in the
        same decision, not after it.
      </p>
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

/** The shared specimen column. `render` draws whatever the variant puts in the gutter. */
function MarginSpecimen({
  title,
  note,
  render,
}: {
  title: string;
  note: string;
  render: (spans: MeasuredSpan[]) => React.ReactNode;
}) {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const [spans, setSpans] = useState<MeasuredSpan[]>([]);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    // Same measure the pane runs: first rect of the start verse to the last rect of the end
    // verse, so a range that begins mid-paragraph starts on the right line.
    const measure = () => {
      const base = column.getBoundingClientRect().top;
      setSpans(
        MARGIN_SPANS.flatMap((s) => {
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
            label: s.label,
            from: s.from,
            to: s.to,
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
    <div>
      <p className="pds-section-header" style={{ marginBottom: 2 }}>{title}</p>
      <p className="pds-caption" style={{ marginBottom: 10 }}>{note}</p>
      <div className="pds-reader pds-gallery-reader">
        <div className="pds-reader__scroll">
          <div className="pds-reader__column" ref={columnRef}>
            {render(spans)}
            <div role="listbox" aria-label="John 1 verses">
              {READER_VERSES.map((verse) => (
                <div className="pds-reader__block" role="none" key={verse.num}>
                  <p className="pds-reader-text" role="none">
                    <span className="pds-reader__verse" role="option" data-verse={verse.num} aria-selected={false}>
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
    </div>
  );
}

function MarginIndicatorScene() {
  return (
    <div style={{ maxWidth: 900 }}>
      <p className="pds-caption" style={{ marginBottom: 18 }}>
        Three notes over John 1, drawn four ways. One covers verse 1 alone, one covers 3–5, and a
        third — three notes on the same passage — covers 3–4. Watch what survives each treatment:
        the length of a span, and the fact that two of them overlap.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <MarginSpecimen
          title="A — bars (today)"
          note="Length is the span; the second lane is the overlap. Production classes, so this is live."
          render={(spans) => (
            <div className="pds-reader__margin" aria-hidden>
              {spans.map((s) => (
                <ReaderBar
                  key={s.key}
                  top={s.top}
                  height={s.height}
                  lane={s.lane}
                  heat={s.key === 'c' ? 3 : 1}
                  label={s.label}
                />
              ))}
            </div>
          )}
        />

        <MarginSpecimen
          title="C — dots (the design bars replaced)"
          note="A point marker can say something is here and nothing else. Both spans and the overlap are gone; verse 3 carries two dots that look like one busier verse."
          render={(spans) => (
            <div className="pds-reader__margin" aria-hidden>
              {spans.map((s) => (
                <span
                  key={s.key}
                  className="pds-gallery-margin-dot"
                  style={{ top: s.top + 7, right: s.lane * 9 }}
                />
              ))}
            </div>
          )}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <MarginSpecimen
          title="D — inline glyph"
          note="Reachable by keyboard for free, and that is its only advantage. It competes with the verse number the reader just finished keeping clean, and puts an editorial mark inside Scripture's own line."
          render={(spans) => (
            <div className="pds-reader__margin" aria-hidden>
              {spans.map((s) => (
                <span
                  key={s.key}
                  className="pds-gallery-margin-glyph"
                  style={{ top: s.top + 2, right: s.lane * 9 }}
                >
                  <Icon name="note-sticky" size={9} aria-hidden />
                </span>
              ))}
            </div>
          )}
        />

        <MarginSpecimen
          title="The merge defect (finding 2)"
          note="A fourth concurrent note folds into lane 3 and stretches that bar to the union of both spans. The outer bar here covers 1–5; no note cites 1–5. Length is the one thing the design promises, and this is where it lies."
          render={(spans) => {
            const stretched = spans.length
              ? { ...spans[0], height: (spans[2]?.top ?? 0) + (spans[2]?.height ?? 0) - spans[0].top }
              : null;
            return (
              <div className="pds-reader__margin" aria-hidden>
                {stretched ? (
                  <ReaderBar
                    top={stretched.top}
                    height={stretched.height}
                    lane={0}
                    heat={4}
                    label="Stretched to the union — John 1:1 and John 1:3-4"
                  />
                ) : null}
              </div>
            );
          }}
        />
      </div>

      <p className="pds-caption" style={{ marginTop: 16 }}>
        Not shown, because it is invisible by definition: the recommended change adds no pixels.
        A verse covered by a note gains a visually-hidden suffix so the chapter&apos;s listbox
        announces &ldquo;Verse 3, in three of your notes&rdquo; — the margin stays `aria-hidden`,
        which is correct, and the fact stops being sight-only.
      </p>
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
    case 'ds-20-toolbar-shape':
      return <ToolbarShapeScene />;
    case 'ds-21-floating-shape':
      return <FloatingSurfacesScene />;
    case 'ds-22-margin-indicators':
      return <MarginIndicatorScene />;
    default:
      return <p className="pds-caption">Unknown design-system scene.</p>;
  }
}
