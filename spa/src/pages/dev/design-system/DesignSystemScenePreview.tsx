/**
 * Fixture previews for design-system foundation scenes.
 * Uses production tokens + primitives — edit linked files; HMR updates here.
 */
import { useState } from 'react';
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
import { AppearancePreviewTile } from '../../prototype/settings/AppearancePreviewTile';
import {
  BG_PRESETS,
  IMAGE_PRESETS_DARK,
  IMAGE_PRESETS_LIGHT,
  imagePresetUrl,
  presetDisplayLabel,
} from '../../../lib/prototype-background';
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
    default:
      return <p className="pds-caption">Unknown design-system scene.</p>;
  }
}
